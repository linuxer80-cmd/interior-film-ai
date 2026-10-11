import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const TYPES = {
  labor: "인건비",
  material: "자재비",
  expense: "경비",
};

const PREFIX = "수익관리/";
const REPORT_LABOR = "완료보고/인건비:";

const EXPENSE_LABELS = {
  parking: "주차비",
  meal: "식대",
  fuel: "유류비",
  toll: "통행료",
  other: "기타 경비",
};

const json = (body, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });

const money = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
};

const validDate = (value) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

async function admin(request) {
  const token = (request.headers.get("authorization") || "")
    .match(/^Bearer (.+)$/i)?.[1];

  if (!token) {
    return { error: "로그인이 필요합니다.", status: 401 };
  }

  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return { error: "서버 설정을 확인해주세요.", status: 503 };
  }

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );

  const {
    data: { user },
    error,
  } = await db.auth.getUser(token);

  if (error || !user) {
    return { error: "로그인이 만료되었습니다.", status: 401 };
  }

  const { data: profile, error: profileError } = await db
    .from("profiles")
    .select("company_id,role,is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) throw profileError;

  if (
    !profile?.company_id ||
    profile.role !== "owner" ||
    profile.is_active === false
  ) {
    return { error: "관리자 권한이 필요합니다.", status: 403 };
  }

  const { data: company, error: companyError } = await db
    .from("companies")
    .select("id,is_active")
    .eq("id", profile.company_id)
    .maybeSingle();

  if (companyError) throw companyError;

  if (!company || company.is_active === false) {
    return { error: "업체를 확인할 수 없습니다.", status: 403 };
  }

  return {
    db,
    companyId: profile.company_id,
    userId: user.id,
  };
}

async function allRows(query) {
  const rows = [];

  for (let offset = 0; offset < 10000; offset += 500) {
    const { data, error } = await query.range(offset, offset + 499);

    if (error) throw error;

    rows.push(...(data || []));

    if (!data || data.length < 500) return rows;
  }

  throw new Error("조회 결과가 너무 많습니다. 기간을 줄여주세요.");
}

function day(value) {
  if (!value) return null;

  if (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return validDate(value) ? value : null;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? null
    : new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(date);
}

function assignmentDays(site) {
  if (Array.isArray(site.work_dates)) {
    return [...new Set(site.work_dates.filter(validDate))].sort();
  }

  const first = day(site.schedule_start);
  const last = day(site.schedule_end) || first;

  if (!first || !last || last < first) return [];

  const count =
    Math.round((Date.parse(last) - Date.parse(first)) / 86400000) + 1;

  if (count > 3660) {
    throw new Error("현장 시공기간이 너무 깁니다.");
  }

  return Array.from({ length: count }, (_, index) =>
    new Date(Date.parse(first) + index * 86400000)
      .toISOString()
      .slice(0, 10),
  );
}

function rateValue(value) {
  if (value == null || value === "") return null;

  const number = Number(value);

  return Number.isFinite(number) && number >= 0 ? number : null;
}

function assignedLabor(
  site,
  daily,
  people,
  rates,
  companyRates,
  currentAllowance,
) {
  const dates = assignmentDays(site);
  const allowed = new Set(dates);

  const rows = daily.length
    ? daily
    : (site.site_workers || []).flatMap((row) =>
        dates.map((work_date) => ({ ...row, work_date })),
      );

  const unique = new Map();

  for (const row of rows) {
    const date = day(row.work_date);
    const person = people.get(row.worker_id);

    if (
      !date ||
      !person ||
      (Array.isArray(site.work_dates) && !allowed.has(date))
    ) {
      continue;
    }

    const key = `${row.worker_id}:${date}`;

    if (!unique.has(key) || row.role === "leader") {
      unique.set(key, { ...row, date });
    }
  }

  const groups = new Map();

  for (const row of unique.values()) {
    const person = people.get(row.worker_id);

    const history = rates.filter(
      (rate) => rate.worker_id === row.worker_id,
    );

    const rate = history.find(
      (item) => item.effective_from <= row.date,
    );

    const base = rateValue(
      rate?.daily_wage ?? (history.length ? null : person.daily_wage),
    );

    const companyRate = companyRates.find(
      (item) => item.effective_from <= row.date,
    );

    const hasCompanyAllowance =
      companyRates.length > 0 || !!currentAllowance;

    const allowance =
      row.role === "leader"
        ? rateValue(
            hasCompanyAllowance
              ? companyRate?.amount ??
                  (currentAllowance?.effective_from <= row.date
                    ? currentAllowance.amount
                    : null)
              : rate?.leader_allowance ??
                  (history.length ? null : person.leader_allowance),
          )
        : 0;

    const group = groups.get(row.worker_id) || {
      workerId: row.worker_id,
      name: person.name || "시공자",
      days: 0,
      leaderDays: 0,
      memberDays: 0,
      base: 0,
      allowance: 0,
      pending: 0,
      amount: 0,
    };

    group.days += 1;
    group[row.role === "leader" ? "leaderDays" : "memberDays"] += 1;

    if (base == null || allowance == null) {
      group.pending += 1;
    } else {
      group.base += base;
      group.allowance += allowance;
      group.amount += base + allowance;
    }

    groups.set(row.worker_id, group);
  }

  return [...groups.values()];
}

function resolveLabor(site, automated, expenses, people) {
  const manual = [];
  const reports = [];

  const names = [...people.values()].sort(
    (a, b) => (b.name || "").length - (a.name || "").length,
  );

  for (const item of expenses) {
    if (item.description?.startsWith(REPORT_LABOR)) {
      let detail = null;

      try {
        detail = JSON.parse(
          item.description.slice(REPORT_LABOR.length),
        );
      } catch {}

      reports.push({
        workerId: detail?.workerId || null,
        name: detail?.name || "시공자 미분류",
        description: detail
          ? `완료보고 ${detail.days}일 × 일당 ${money(
              detail.dailyWage,
            ).toLocaleString("ko-KR")}원 + 팀장수당 ${money(
              detail.allowance,
            ).toLocaleString("ko-KR")}원`
          : "완료보고 인건비",
        amount: money(item.amount),
      });
    } else if (
      item.description?.startsWith(`${PREFIX}${TYPES.labor}:`)
    ) {
      const description = item.description
        .slice(item.description.indexOf(":") + 1)
        .trim();

      const person = names.find(
        (entry) =>
          entry.name &&
          (description === entry.name ||
            description.startsWith(`${entry.name} `)),
      );

      manual.push({
        workerId: person?.id || null,
        name: person?.name || "현장 인건비 직접 입력",
        description,
        amount: money(item.amount),
      });
    }
  }

  if (manual.some((row) => !row.workerId)) return manual;

  const manualIds = new Set(manual.map((row) => row.workerId));

  const reportRows = reports.filter(
    (row) => !manualIds.has(row.workerId),
  );

  const covered = new Set([
    ...manualIds,
    ...reportRows.map((row) => row.workerId),
  ]);

  const automatic = reportRows.some((row) => !row.workerId)
    ? []
    : automated
        .filter((row) => !covered.has(row.workerId))
        .map((row) => ({
          workerId: row.workerId,
          name: row.name,
          amount: row.amount,
          description:
            `자동 계산 · 팀장 ${row.leaderDays}일 / 팀원 ${row.memberDays}일` +
            ` · 일당 합계 ${row.base.toLocaleString("ko-KR")}원` +
            ` + 팀장수당 ${row.allowance.toLocaleString("ko-KR")}원` +
            (row.pending ? ` · 단가 확인 필요 ${row.pending}일` : ""),
        }));

  return [...manual, ...reportRows, ...automatic];
}

/*
 * 계약금액이 있으면 기존 계약금액을 사용합니다.
 * 계약금액이 없거나 0원이면 최신 보고서의 승인금액을 사용합니다.
 * 승인된 0원은 유효한 확정금액으로 처리합니다.
 * 검수 대기/보완 요청 보고서의 금액은 반영하지 않습니다.
 */
function resolveRevenue(site, report) {
  const contract = rateValue(site.contract_amount);

  const approved =
    report?.review_status === "approved"
      ? rateValue(report.approved_amount)
      : null;

  if (contract !== null && contract > 0) {
    return {
      revenue: contract,
      missingContract: false,
      revenueSource: "contract",
    };
  }

  if (approved !== null) {
    return {
      revenue: approved,
      missingContract: false,
      revenueSource: "approved_report",
    };
  }

  return {
    revenue: contract ?? 0,
    missingContract: contract === null,
    revenueSource: contract === null ? "missing" : "contract",
  };
}

export async function GET(request) {
  try {
    const auth = await admin(request);

    if (auth.error) {
      return json({ error: auth.error }, auth.status);
    }

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get("siteId");

    if (
      siteId &&
      !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(
        siteId,
      )
    ) {
      return json({ error: "현장을 확인해주세요." }, 400);
    }

    const from = searchParams.get("from") || "";
    const to = searchParams.get("to") || "";
    const fromTime = Date.parse(`${from}T00:00:00Z`);
    const toTime = Date.parse(`${to}T00:00:00Z`);

    if (
      !siteId &&
      (!validDate(from) ||
        !validDate(to) ||
        fromTime > toTime ||
        toTime - fromTime > 366 * 86400000)
    ) {
      return json(
        { error: "기간은 최대 1년으로 지정해주세요." },
        400,
      );
    }

    const { db, companyId } = auth;

    let siteQuery = db
      .from("sites")
      .select(
        "id,site_name,customer_name,schedule_start,schedule_end,work_dates,contract_amount,status,site_workers(company_id,role,worker_id,workers(id,company_id,name,daily_wage,leader_allowance))",
      )
      .eq("company_id", companyId)
      .neq("status", "cancelled");

    if (siteId) {
      siteQuery = siteQuery.eq("id", siteId);
    } else {
      siteQuery = siteQuery
        .gte("schedule_start", `${from}T00:00:00+09:00`)
        .lt(
          "schedule_start",
          new Date(toTime + 86400000).toISOString().slice(0, 10) +
            "T00:00:00+09:00",
        );
    }

    const sites = await allRows(
      siteQuery.order("schedule_start").order("id"),
    );

    const materials = [];
    const expenses = [];
    const daily = [];
    const reports = [];

    for (let index = 0; index < sites.length; index += 100) {
      const ids = sites
        .slice(index, index + 100)
        .map((site) => site.id);

      const results = await Promise.all([
        allRows(
          db
            .from("site_materials")
            .select(
              "id,site_id,brand,product_code,product_name,quantity,unit,unit_price,total_price",
            )
            .eq("company_id", companyId)
            .eq("material_type", "actual")
            .in("site_id", ids)
            .order("id"),
        ),
        allRows(
          db
            .from("site_expenses")
            .select(
              "id,site_id,expense_type,amount,description,expense_date",
            )
            .eq("company_id", companyId)
            .in("site_id", ids)
            .order("id"),
        ),
        allRows(
          db
            .from("site_daily_assignments")
            .select("id,site_id,worker_id,work_date,role")
            .eq("company_id", companyId)
            .in("site_id", ids)
            .order("id"),
        ),
        allRows(
          db
            .from("work_reports")
            .select(
              "id,site_id,review_status,approved_amount,updated_at",
            )
            .eq("company_id", companyId)
            .in("site_id", ids)
            .order("updated_at", { ascending: false })
            .order("id"),
        ),
      ]);

      materials.push(...results[0]);
      expenses.push(...results[1]);
      daily.push(...results[2]);
      reports.push(...results[3]);
    }

    /*
     * 검수 API와 동일하게 updated_at 기준 최신 보고서를 선택합니다.
     * 승인 상태로 먼저 필터링하지 않아 과거 승인금액이 잘못
     * 반영되는 것을 방지합니다.
     */
    const latestReports = new Map();

    for (const report of reports) {
      if (!latestReports.has(report.site_id)) {
        latestReports.set(report.site_id, report);
      }
    }

    const workerIds = [
      ...new Set([
        ...daily.map((row) => row.worker_id),
        ...sites.flatMap((site) =>
          (site.site_workers || [])
            .filter((row) => row.company_id === companyId)
            .map((row) => row.worker_id),
        ),
      ]),
    ];

    const people = new Map();
    const rates = [];

    for (let index = 0; index < workerIds.length; index += 100) {
      const ids = workerIds.slice(index, index + 100);

      const [workers, history] = await Promise.all([
        allRows(
          db
            .from("workers")
            .select("id,name,daily_wage,leader_allowance")
            .eq("company_id", companyId)
            .in("id", ids)
            .order("id"),
        ),
        allRows(
          db
            .from("worker_pay_rates")
            .select(
              "id,worker_id,effective_from,daily_wage,leader_allowance",
            )
            .eq("company_id", companyId)
            .in("worker_id", ids)
            .order("effective_from", { ascending: false })
            .order("id"),
        ),
      ]);

      workers.forEach((worker) => people.set(worker.id, worker));
      rates.push(...history);
    }

    rates.sort((a, b) =>
      b.effective_from.localeCompare(a.effective_from),
    );

    const [companyRates, current] = await Promise.all([
      allRows(
        db
          .from("company_leader_allowance_rates")
          .select("company_id,effective_from,amount")
          .eq("company_id", companyId)
          .order("effective_from", { ascending: false }),
      ),
      db
        .from("company_leader_allowances")
        .select("amount,effective_from")
        .eq("company_id", companyId)
        .maybeSingle(),
    ]);

    if (current.error) throw current.error;

    const breakdown = {
      labor: [],
      material: [],
      expense: [],
    };

    const result = sites.map((site) => {
      const siteName =
        site.site_name || site.customer_name || "이름 없는 현장";

      const siteExpenses = expenses.filter(
        (item) => item.site_id === site.id,
      );

      const automated = assignedLabor(
        site,
        daily.filter((row) => row.site_id === site.id),
        people,
        rates,
        companyRates,
        current.data,
      );

      const laborRows = resolveLabor(
        site,
        automated,
        siteExpenses,
        people,
      );

      for (const entry of siteExpenses) {
        if (!entry.description?.startsWith("출퇴근/연장:")) {
          continue;
        }

        let detail;

        try {
          detail = JSON.parse(
            entry.description.slice("출퇴근/연장:".length),
          );
        } catch {
          continue;
        }

        laborRows.push({
          workerId: detail.workerId,
          name: detail.name || "시공자",
          amount: money(entry.amount),
          description: `출퇴근 승인 연장 ${detail.minutes}분`,
        });
      }

      const labor = laborRows.reduce(
        (sum, row) => sum + row.amount,
        0,
      );

      breakdown.labor.push(
        ...laborRows.map((row) => ({
          ...row,
          siteId: site.id,
          siteName,
        })),
      );

      let material = 0;
      let expense = 0;
      const entries = [];

      for (const item of materials.filter(
        (row) => row.site_id === site.id,
      )) {
        const amount = money(
          item.total_price ??
            money(item.quantity) * money(item.unit_price),
        );

        material += amount;

        breakdown.material.push({
          siteId: site.id,
          siteName,
          brand: item.brand?.trim() || "브랜드 미입력",
          product:
            [item.product_code, item.product_name]
              .filter(Boolean)
              .join(" · ") || "제품 미입력",
          quantity: money(item.quantity),
          unit: item.unit || "m",
          amount,
        });
      }

      for (const item of siteExpenses) {
        const isLabor =
          item.description?.startsWith("출퇴근/연장:") ||
          item.description?.startsWith(REPORT_LABOR) ||
          item.description?.startsWith(`${PREFIX}${TYPES.labor}:`);

        const category = isLabor
          ? "labor"
          : item.expense_type === "material" ||
              item.description?.startsWith(
                `${PREFIX}${TYPES.material}:`,
              )
            ? "material"
            : "expense";

        const detail = item.description?.startsWith(PREFIX)
          ? item.description
              .slice(item.description.indexOf(":") + 1)
              .trim()
          : item.description?.trim() || "내용 미입력";

        if (category === "material") {
          material += money(item.amount);

          breakdown.material.push({
            siteId: site.id,
            siteName,
            brand: "브랜드 미입력",
            product: detail,
            quantity: null,
            unit: "",
            amount: money(item.amount),
          });
        } else if (category === "expense") {
          expense += money(item.amount);

          breakdown.expense.push({
            siteId: site.id,
            siteName,
            category:
              item.expense_type && item.expense_type !== "other"
                ? EXPENSE_LABELS[item.expense_type] ||
                  item.expense_type
                : detail.split(":")[0].trim(),
            description: detail,
            amount: money(item.amount),
          });
        }

        if (item.description?.startsWith(PREFIX)) {
          entries.push({
            ...item,
            description: detail,
            category,
          });
        }
      }

      const site_workers = [
        ...new Map(
          [
            ...(site.site_workers || []).filter(
              (row) => row.company_id === companyId,
            ),
            ...daily.filter((row) => row.site_id === site.id),
          ]
            .filter((row) => people.has(row.worker_id))
            .map((row) => [
              row.worker_id,
              {
                role: row.role,
                worker_id: row.worker_id,
                workers: people.get(row.worker_id),
              },
            ]),
        ).values(),
      ];

      const revenueInfo = resolveRevenue(
        site,
        latestReports.get(site.id),
      );

      const { revenue } = revenueInfo;

      return {
        ...site,
        site_workers,
        revenue,
        labor,
        material,
        expense,
        profit: revenue - labor - material - expense,
        entries,
        laborPending: automated.reduce(
          (sum, row) => sum + row.pending,
          0,
        ),
        missingContract: revenueInfo.missingContract,
        revenueSource: revenueInfo.revenueSource,
      };
    });

    const totals = result.reduce(
      (sum, item) => {
        for (const key of [
          "revenue",
          "labor",
          "material",
          "expense",
          "profit",
        ]) {
          sum[key] += item[key];
        }

        return sum;
      },
      {
        revenue: 0,
        labor: 0,
        material: 0,
        expense: 0,
        profit: 0,
      },
    );

    return json({
      sites: result,
      totals,
      breakdown,
    });
  } catch (error) {
    console.error("profit GET", error);

    return json(
      { error: "수익 자료를 불러오지 못했습니다." },
      500,
    );
  }
}

export async function POST(request) {
  try {
    const auth = await admin(request);

    if (auth.error) {
      return json({ error: auth.error }, auth.status);
    }

    const body = await request.json().catch(() => ({}));
    const type = TYPES[body.type];
    const amount = Number(body.amount);

    const description =
      typeof body.description === "string"
        ? body.description.trim().slice(0, 120)
        : "";

    if (
      !type ||
      !body.siteId ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      amount > 1000000000 ||
      !description
    ) {
      return json(
        { error: "구분, 현장, 금액, 내용을 확인해주세요." },
        400,
      );
    }

    const { db, companyId, userId } = auth;

    const { data: site, error: siteError } = await db
      .from("sites")
      .select("id,status")
      .eq("id", body.siteId)
      .eq("company_id", companyId)
      .maybeSingle();

    if (siteError) throw siteError;

    if (!site) {
      return json({ error: "현장을 찾을 수 없습니다." }, 404);
    }

    if (site.status === "cancelled") {
      return json(
        { error: "취소된 현장에는 비용을 추가할 수 없습니다." },
        409,
      );
    }

    const { error } = await db.from("site_expenses").insert({
      company_id: companyId,
      site_id: site.id,
      expense_type: body.type === "material" ? "material" : "other",
      amount,
      description: `${PREFIX}${type}: ${description}`,
      expense_date: new Date().toISOString().slice(0, 10),
      created_by: userId,
    });

    if (error) throw error;

    return json({ success: true });
  } catch (error) {
    console.error("profit POST", error);

    return json(
      { error: "비용을 저장하지 못했습니다." },
      500,
    );
  }
}

export async function DELETE(request) {
  try {
    const auth = await admin(request);

    if (auth.error) {
      return json({ error: auth.error }, auth.status);
    }

    const { id } = await request.json().catch(() => ({}));

    if (!id) {
      return json(
        { error: "삭제할 내역을 선택해주세요." },
        400,
      );
    }

    const { error } = await auth.db
      .from("site_expenses")
      .delete()
      .eq("id", id)
      .eq("company_id", auth.companyId)
      .like("description", `${PREFIX}%`);

    if (error) throw error;

    return json({ success: true });
  } catch (error) {
    console.error("profit DELETE", error);

    return json(
      { error: "비용 내역을 삭제하지 못했습니다." },
      500,
    );
  }
}
