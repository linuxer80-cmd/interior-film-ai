import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 60;

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL 환경변수가 없습니다.");
  }
  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY 환경변수가 없습니다.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function cleanText(value) {
  if (value === null || value === undefined) return null;
  return String(value).trim() || null;
}

function getBearerToken(request) {
  const authorization =
    request.headers.get("authorization") || "";

  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  return authorization.slice(7).trim();
}

async function verifyWorkerSiteAccess({
  supabase,
  accessToken,
  siteId,
}) {
  if (!accessToken) {
    return {
      success: false,
      status: 401,
      error: "로그인이 필요합니다.",
    };
  }

  const { data: userData, error: userError } =
    await supabase.auth.getUser(accessToken);

  if (userError || !userData?.user) {
    return {
      success: false,
      status: 401,
      error: "로그인 정보를 확인할 수 없습니다.",
    };
  }

  const user = userData.user;

  const { data: assigned, error: assignmentError } = await supabase.rpc("site_operation_workers", { p_site: siteId });
  if (assignmentError) return { success: false, status: 500, error: "현장 배정정보를 확인하지 못했습니다." };
  const person = (assigned || []).find((item) => item.user_id === user.id);
  if (!person) return { success: false, status: 403, error: "본인에게 배정된 현장만 이용할 수 있습니다." };
  const { data: site, error: siteError } = await supabase.from("sites").select("id,company_id,site_name,customer_name,status").eq("id", siteId).maybeSingle();
  if (siteError || !site) return { success: false, status: 404, error: "현장을 찾을 수 없습니다." };
  const canSubmit = person.role === "leader" || !(assigned || []).some((item) => item.role === "leader");
  return { success: true, user, worker: { id: person.worker_id, company_id: site.company_id }, site, assignment: { role: person.role }, canSubmit };

}

const REPORT_LABOR = "완료보고/인건비:";

const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
  }).format(new Date());

async function laborWorkers(supabase, companyId, siteId) {
  const { data, error } = await supabase
    .from("site_workers")
    .select("worker_id,workers(id,company_id,name,daily_wage)")
    .eq("company_id", companyId)
    .eq("site_id", siteId);

  if (error) throw error;

  return [
    ...new Map(
      (data || [])
        .filter((row) => row.workers?.company_id === companyId)
        .map((row) => [
          row.worker_id,
          {
            id: row.worker_id,
            name: row.workers.name,
            daily_wage: row.workers.daily_wage,
          },
        ]),
    ).values(),
  ];
}

function normalizeLabor(rows, workers) {
  if (!Array.isArray(rows) || rows.length > 100) {
    throw new Error("인건비 입력 형식을 확인해주세요.");
  }

  const people = new Map(
    workers.map((person) => [person.id, person]),
  );
  const seen = new Set();

  return rows.map((row) => {
    const person = people.get(row.worker_id);
    const days = Number(row.days);
    const dailyWage = Number(row.daily_wage);
    const allowance = Number(row.allowance);

    if (
      !person ||
      seen.has(person.id) ||
      row.days == null ||
      row.days === "" ||
      row.daily_wage == null ||
      row.daily_wage === "" ||
      row.allowance == null ||
      row.allowance === "" ||
      !Number.isFinite(days) ||
      days <= 0 ||
      days > 366 ||
      !Number.isSafeInteger(dailyWage) ||
      dailyWage < 0 ||
      dailyWage > 100000000 ||
      !Number.isSafeInteger(allowance) ||
      allowance < 0 ||
      allowance > 1000000000
    ) {
      throw new Error(
        "시공자, 근무일수, 일당, 팀장수당을 확인해주세요. 같은 시공자는 한 번만 입력하세요.",
      );
    }

    seen.add(person.id);

    const amount = Math.round(days * dailyWage + allowance);

    if (
      !Number.isSafeInteger(amount) ||
      amount > 1000000000
    ) {
      throw new Error("인건비 금액을 확인해주세요.");
    }

    return {
      expense_type: "other",
      amount,
      expense_date: today(),
      description:
        REPORT_LABOR +
        JSON.stringify({
          workerId: person.id,
          name: person.name,
          days,
          dailyWage,
          allowance,
        }),
    };
  });
}

async function getExistingReport({
  supabase,
  companyId,
  siteId,
}) {
  const { data, error } = await supabase
    .from("work_reports")
    .select(
      "id,company_id,site_id,worker_id,work_region,work_summary,memo,completed_at,created_at,updated_at,review_status,reviewed_at,approved_amount,review_memo",
    )
    .eq("company_id", companyId)
    .eq("site_id", siteId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function submitWorkReport({
  supabase,
  worker,
  user,
  siteId,
  workRegion,
  workSummary,
  memo,
  materials,
  expenses,
}) {
  const { data, error } = await supabase.rpc(
    "submit_worker_work_report",
    {
      p_company_id: worker.company_id,
      p_site_id: siteId,
      p_worker_id: worker.id,
      p_user_id: user.id,
      p_work_region: workRegion,
      p_work_summary: workSummary,
      p_memo: memo,
      p_materials: materials,
      p_expenses: expenses,
    },
  );

  if (error) throw error;
  return data;
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const siteId = cleanText(url.searchParams.get("siteId"));

    if (!siteId) {
      return NextResponse.json(
        { success: false, error: "siteId가 필요합니다." },
        { status: 400 },
      );
    }

    const accessToken = getBearerToken(request);
    const supabase = getAdminClient();

    const access = await verifyWorkerSiteAccess({
      supabase,
      accessToken,
      siteId,
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status },
      );
    }

    const { worker, site, assignment } = access;

    const report = await getExistingReport({
      supabase,
      companyId: worker.company_id,
      siteId,
    });

    const { data: leaders, error: leaderError } = await supabase
      .from("site_daily_assignments")
      .select("id")
      .eq("company_id", worker.company_id)
      .eq("site_id", siteId)
      .eq("worker_id", worker.id)
      .eq("role", "leader")
      .limit(1);

    if (leaderError && leaderError.code !== "42P01") {
      throw leaderError;
    }

    const canManageCosts = access.canSubmit;

    return NextResponse.json(
      {
        success: true,
        canSubmit: access.canSubmit,
        laborWorkers: canManageCosts
          ? await laborWorkers(supabase, worker.company_id, siteId)
          : [],
        siteId,
        role: assignment.role,
        siteStatus: site.status,
        hasReport: Boolean(report?.id),
        report: report
          ? {
              id: report.id,
              worker_id: report.worker_id,
              work_region: report.work_region,
              work_summary: report.work_summary,
              memo: report.memo,
              completed_at: report.completed_at,
              created_at: report.created_at,
              updated_at: report.updated_at,
              review_status: report.review_status || "pending",
              reviewed_at: report.reviewed_at,
              approved_amount: report.approved_amount,
              review_memo: report.review_memo,
            }
          : null,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("시공자 완료보고 조회 오류:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error?.message || "완료보고 상태를 확인하지 못했습니다.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  try {
    const accessToken = getBearerToken(request);

    if (!accessToken) {
      return NextResponse.json(
        { success: false, error: "로그인이 필요합니다." },
        { status: 401 },
      );
    }

    const body = await request.json();
    const siteId = cleanText(body?.siteId);
    const workRegion = cleanText(body?.work_region);
    const workSummary = cleanText(body?.work_summary);
    const memo = cleanText(body?.memo);
    const materials = Array.isArray(body?.materials)
      ? body.materials
      : [];
    const expenses = Array.isArray(body?.expenses)
      ? body.expenses
      : [];

    if (!siteId) {
      return NextResponse.json(
        { success: false, error: "현장 정보가 없습니다." },
        { status: 400 },
      );
    }

    if (!workSummary) {
      return NextResponse.json(
        {
          success: false,
          error: "실제 시공 내용을 입력해주세요.",
        },
        { status: 400 },
      );
    }

    const supabase = getAdminClient();

    const access = await verifyWorkerSiteAccess({
      supabase,
      accessToken,
      siteId,
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status },
      );
    }

    const { user, worker, site, assignment } = access;

    const { data: dailyLeader, error: leaderError } =
      await supabase
        .from("site_daily_assignments")
        .select("id")
        .eq("company_id", worker.company_id)
        .eq("site_id", siteId)
        .eq("worker_id", worker.id)
        .eq("role", "leader")
        .limit(1);

    if (leaderError && leaderError.code !== "42P01") {
      throw leaderError;
    }

    if (!access.canSubmit) {
      return NextResponse.json(
        {
          success: false,
          error:
            "완료보고는 이 현장의 책임 팀장만 제출할 수 있습니다.",
        },
        { status: 403 },
      );
    }

    if (site.status === "cancelled") {
      return NextResponse.json(
        {
          success: false,
          error: "취소된 현장에는 완료보고를 제출할 수 없습니다.",
        },
        { status: 409 },
      );
    }

    const existingReport = await getExistingReport({
      supabase,
      companyId: worker.company_id,
      siteId,
    });

    if (
      existingReport?.id &&
      existingReport.review_status === "pending"
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "이미 완료보고를 제출했습니다. 관리자 검수를 기다려주세요.",
          review_status: "pending",
        },
        { status: 409 },
      );
    }

    if (
      existingReport?.id &&
      existingReport.review_status === "approved"
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "이미 관리자 승인이 완료된 현장입니다.",
          review_status: "approved",
        },
        { status: 409 },
      );
    }

    const people = await laborWorkers(
      supabase,
      worker.company_id,
      siteId,
    );

    let laborExpenses;

    try {
      laborExpenses = normalizeLabor(body.labor || [], people);

      if (
        expenses.some((item) =>
          /^(수익관리\/|완료보고\/)/.test(
            String(item.description || "").trim(),
          ),
        )
      ) {
        throw new Error(
          "경비 내용에 예약된 비용 구분을 사용할 수 없습니다.",
        );
      }
    } catch (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 },
      );
    }

    const report = await submitWorkReport({
      supabase,
      worker,
      user,
      siteId,
      workRegion,
      workSummary,
      memo,
      materials,
      expenses: [...expenses, ...laborExpenses],
    });

    return NextResponse.json({
      success: true,
      reportId: report.reportId,
      review_status: "pending",
      ai_registered: false,
      role: assignment.role,
      materialCount: report.materialCount,
      expenseCount: report.expenseCount,
      message: "완료보고가 저장되었습니다. 관리자 검수를 기다려주세요.",
    });
  } catch (error) {
    console.error("시공자 완료보고 저장 오류:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error?.message || "완료보고 저장 중 오류가 발생했습니다.",
      },
      {
        status:
          error?.code === "P0001"
            ? 409
            : error?.code === "42501"
              ? 403
              : /^22|^23/.test(error?.code || "")
                ? 400
                : 500,
      },
    );
  }
}
