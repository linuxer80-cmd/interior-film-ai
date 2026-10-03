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
    }
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
      .slice(0, 10)
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
  currentAllowance
) {
  const dates = assignmentDays(site);
  const allowed = new Set(dates);

  // 날짜별 배정이 있으면 그 배정만 사용합니다.
  // 날짜별 배정이 없는 이전 현장은 현장 배정과 시공일을 사용합니다.
  const rows = daily.length
    ? daily
    : (site.site_workers || []).flatMap((row) =>
        dates.map((work_date) => ({ ...row, work_date }))
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
      (rate) => rate.worker_id === row.worker_id
    );

    const rate = history.find(
      (rate) => rate.effective_from <= row.date
    );

    const base = rateValue(
      rate?.daily_wage ??
        (history.length ? null : person.daily_wage)
    );

    const companyRate = companyRates.find(
      (rate) => rate.effective_from <= row.date
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
                  (history.length ? null : person.leader_allowance)
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
    (a, b) => (b.name || "").length - (a.name || "").length
  );

  for (const item of expenses) {
    if (item.description?.startsWith(REPORT_LABOR)) {
      let detail = null;

      try {
        detail = JSON.parse(
          item.description.slice(REPORT_LABOR.length)
        );
      } catch {}

      reports.push({
        workerId: detail?.workerId || null,
        name: detail?.name || "시공자 미분류",
        description: detail
          ? `완료보고 ${detail.days}일 × 일당 ${money(
              detail.dailyWage
            ).toLocaleString("ko-KR")}원 + 팀장수당 ${money(
              detail.allowance
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
        (person) =>
          person.name &&
          (description === person.name ||
            description.startsWith(`${person.name} `))
      );

      manual.push({
        workerId: person?.id || null,
        name: person?.name || "현장 인건비 직접 입력",
        description,
        amount: money(item.amount),
      });
    }
  }

  // 시공자를 특정하지 않은 수기 금액은 현장 전체 합계입니다.
  if (manual.some((row) => !row.workerId)) return manual;

  const manualIds = new Set(manual.map((row) => row.workerId));

  const reportRows = reports.filter(
    (row) => !manualIds.has(row.workerId)
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
            (row.pending
              ? ` · 단가 확인 필요 ${row.pending}일`
              : ""),
        }));

  return [...manual, ...reportRows, ...automatic];
}

export async function GET(request) {
  try {
    const auth = await admin(request);

    if (auth.error) {
      return json({ error: auth.error }, auth.status);
    }

    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from") || "";
    const to = searchParams.get("to") || "";

    const fromTime = Date.parse(`${from}T00:00:00Z`);
    const toTime = Date.parse(`${to}T00:00:00Z`);

    if (
      !validDate(from) ||
      !validDate(to) ||
      fromTime > toTime ||
      toTime - fromTime > 366 * 86400000
    ) {
      return json(
        { error: "기간은 최대 1년으로 지정해주세요." },
        400
      );
    }

    const { db, companyId } = auth;

    const sites = await allRows(
      db
        .from("sites")
        .select(
          "id,site_name,customer_name,schedule_start,schedule_end,work_dates,contract_amount,status,site_workers(company_id,role,worker_id,workers(id,company_id,name,daily_wage,leader_allowance))"
        )
        .eq("company_id", companyId)
        .neq("status", "cancelled")
        .gte("schedule_start", `${from}T00:00:00+09:00`)
        .lt(
          "schedule_start",
          new Date(toTime + 86400000).toISOString().slice(0, 10) +
            "T00:00:00+09:00"
        )
        .order("schedule_start")
        .order("id")
    );

    const materials = [];
    const expenses = [];
    const daily = [];

    for (let index = 0; index < sites.length; index += 100) {
      const ids = sites
        .slice(index, index + 100)
        .map((site) => site.id);

      const results = await Promise.all([
        allRows(
          db
            .from("site_materials")
            .select(
              "id,site_id,brand,product_code,product_name,quantity,unit,unit_price,total_price"
            )
            .eq("company_id", companyId)
            .eq("material_type", "actual")
            .in("site_id", ids)
            .order("id")
        ),
        allRows(
          db
            .from("site_expenses")
            .select(
              "id,site_id,expense_type,amount,description,expense_date"
            )
            .eq("company_id", companyId)
            .in("site_id", ids)
            .order("id")
        ),
        allRows(
          db
            .from("site_daily_assignments")
            .select("id,site_id,worker_id,work_date,role")
            .eq("company_id", companyId)
            .in("site_id", ids)
            .order("id")
        ),
      ]);

      materials.push(...results[0]);
      expenses.push(...results[1]);
      daily.push(...results[2]);
    }

    const workerIds = [
      ...new Set([
        ...daily.map((row) => row.worker_id),
        ...sites.flatMap((site) =>
          (site.site_workers || [])
            .filter((row) => row.company_id === companyId)
            .map((row) => row.worker_id)
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
            .order("id")
        ),
        allRows(
          db
            .from("worker_pay_rates")
            .select(
              "id,worker_id,effective_from,daily_wage,leader_allowance"
            )
            .eq("company_id", companyId)
            .in("worker_id", ids)
            .order("effective_from", { ascending: false })
            .order("id")
        ),
      ]);

      workers.forEach((worker) => people.set(worker.id, worker));
      rates.push(...history);
    }

    rates.sort((a, b) =>
      b.effective_from.localeCompare(a.effective_from)
    );

    const [companyRates, current] = await Promise.all([
      allRows(
        db
          .from("company_leader_allowance_rates")
          .select("company_id,effective_from,amount")
          .eq("company_id", companyId)
          .order("effective_from", { ascending: false })
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
        (item) => item.site_id === site.id
      );

      const automated = assignedLabor(
        site,
        daily.filter((row) => row.site_id === site.id),
        people,
        rates,
        companyRates,
        current.data
      );

      const laborRows = resolveLabor(
        site,
        automated,
        siteExpenses,
        people
      );

      const labor = laborRows.reduce(
        (sum, row) => sum + row.amount,
        0
      );

      breakdown.labor.push(
        ...laborRows.map((row) => ({
          ...row,
          siteId: site.id,
          siteName,
        }))
      );

      let material = 0;
      let expense = 0;
      const entries = [];

      for (const item of materials.filter(
        (item) => item.site_id === site.id
      )) {
        const amount = money(
          item.total_price ??
            money(item.quantity) * money(item.unit_price)
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
          item.description?.startsWith(REPORT_LABOR) ||
          item.description?.startsWith(
            `${PREFIX}${TYPES.labor}:`
          );

        const category = isLabor
          ? "labor"
          : item.expense_type === "material" ||
              item.description?.startsWith(
                `${PREFIX}${TYPES.material}:`
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
              item.expense_type &&
              item.expense_type !== "other"
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
              (row) => row.company_id === companyId
            ),
            ...daily.filter(
              (row) => row.site_id === site.id
            ),
          ]
            .filter((row) => people.has(row.worker_id))
            .map((row) => [
              row.worker_id,
              {
                role: row.role,
                worker_id: row.worker_id,
                workers: people.get(row.worker_id),
              },
            ])
        ).values(),
      ];

      const revenue = money(site.contract_amount);

      return {
        ...site,
        site_workers,
        revenue,
        labor,
        material,
        expense,
        profit: revenue - labor - material - expense,
        entries,
        missingContract:
          site.contract_amount == null ||
          site.contract_amount === "",
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
      }
    );

    return json({ sites: result, totals, breakdown });
  } catch (error) {
    console.error("profit GET", error);

    return json(
      { error: "수익 자료를 불러오지 못했습니다." },
      500
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
        400
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
      return json(
        { error: "현장을 찾을 수 없습니다." },
        404
      );
    }

    if (site.status === "cancelled") {
      return json(
        { error: "취소된 현장에는 비용을 추가할 수 없습니다." },
        409
      );
    }

    const { error } = await db.from("site_expenses").insert({
      company_id: companyId,
      site_id: site.id,
      expense_type:
        body.type === "material" ? "material" : "other",
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
      500
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
        400
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
      500
    );
  }
                 }
