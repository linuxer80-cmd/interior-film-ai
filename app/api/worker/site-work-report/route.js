import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 60;

/* =========================================================
   Supabase Admin Client
========================================================= */

function getAdminClient() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL 환경변수가 없습니다."
    );
  }

  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY 환경변수가 없습니다."
    );
  }

  return createClient(
    supabaseUrl,
    serviceRoleKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}

/* =========================================================
   공통 유틸
========================================================= */

function cleanText(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const text = String(value).trim();

  return text || null;
}

function getBearerToken(request) {
  const authorization =
    request.headers.get("authorization") || "";

  if (
    !authorization
      .toLowerCase()
      .startsWith("bearer ")
  ) {
    return null;
  }

  return authorization.slice(7).trim();
}

/* =========================================================
   시공자 + 현장 접근권한 확인

   1. 로그인 사용자 확인
   2. workers.user_id 확인
   3. 활성 시공자 확인
   4. 같은 회사 현장인지 확인
   5. site_workers 배정 여부 확인
========================================================= */

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

  const {
    data: userData,
    error: userError,
  } = await supabase.auth.getUser(
    accessToken
  );

  if (
    userError ||
    !userData?.user
  ) {
    return {
      success: false,
      status: 401,
      error:
        "로그인 정보를 확인할 수 없습니다.",
    };
  }

  const user = userData.user;

  /* -------------------------------------------------------
     시공자 조회
  ------------------------------------------------------- */

  const {
    data: worker,
    error: workerError,
  } = await supabase
    .from("workers")
    .select(
      `
        id,
        company_id,
        name,
        phone,
        user_id,
        is_active
      `
    )
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (workerError) {
    return {
      success: false,
      status: 500,
      error:
        workerError.message ||
        "시공자 정보를 확인하지 못했습니다.",
    };
  }

  if (!worker?.id) {
    return {
      success: false,
      status: 403,
      error:
        "등록된 활성 시공자 계정이 아닙니다.",
    };
  }

  /* -------------------------------------------------------
     현장 조회
  ------------------------------------------------------- */

  const {
    data: site,
    error: siteError,
  } = await supabase
    .from("sites")
    .select(
      `
        id,
        company_id,
        site_name,
        customer_name,
        status
      `
    )
    .eq("id", siteId)
    .eq("company_id", worker.company_id)
    .maybeSingle();

  if (siteError) {
    return {
      success: false,
      status: 500,
      error:
        siteError.message ||
        "현장 정보를 확인하지 못했습니다.",
    };
  }

  if (!site?.id) {
    return {
      success: false,
      status: 404,
      error:
        "현장을 찾을 수 없습니다.",
    };
  }

  /* -------------------------------------------------------
     현장 배정 확인
  ------------------------------------------------------- */

  const {
    data: assignment,
    error: assignmentError,
  } = await supabase
    .from("site_workers")
    .select(
      `
        id,
        company_id,
        site_id,
        worker_id,
        role
      `
    )
    .eq("company_id", worker.company_id)
    .eq("site_id", siteId)
    .eq("worker_id", worker.id)
    .maybeSingle();

  if (assignmentError) {
    return {
      success: false,
      status: 500,
      error:
        assignmentError.message ||
        "현장 배정정보를 확인하지 못했습니다.",
    };
  }

  if (!assignment?.id) {
    return {
      success: false,
      status: 403,
      error:
        "본인에게 배정된 현장만 이용할 수 있습니다.",
    };
  }

  return {
    success: true,
    user,
    worker,
    site,
    assignment,
  };
}

/* =========================================================
   기존 완료보고 조회
========================================================= */

async function getExistingReport({
  supabase,
  companyId,
  siteId,
}) {
  const {
    data,
    error,
  } = await supabase
    .from("work_reports")
    .select(
      `
        id,
        company_id,
        site_id,
        worker_id,
        work_region,
        work_summary,
        memo,
        completed_at,
        created_at,
        updated_at,
        review_status,
        reviewed_at,
        approved_amount,
        review_memo
      `
    )
    .eq("company_id", companyId)
    .eq("site_id", siteId)
    .order("updated_at", {
      ascending: false,
    })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

// The database commits the report, actual materials and expenses together.
// This function is callable only by the server's service role; all identities
// come from verifyWorkerSiteAccess, never the request body.
async function submitWorkReport({ supabase, worker, user, siteId, workRegion, workSummary, memo, materials, expenses }) {
  const { data, error } = await supabase.rpc("submit_worker_work_report", {
    p_company_id: worker.company_id,
    p_site_id: siteId,
    p_worker_id: worker.id,
    p_user_id: user.id,
    p_work_region: workRegion,
    p_work_summary: workSummary,
    p_memo: memo,
    p_materials: materials,
    p_expenses: expenses,
  });
  if (error) throw error;
  return data;
}

/* =========================================================
   GET
   현재 현장의 완료보고 상태 조회

   시공자 화면에서:
   - report 없음 → 완료보고 폼 표시
   - pending → 관리자 검수 대기
   - approved → 관리자 승인 완료
   - rejected → 보완 필요
========================================================= */

export async function GET(request) {
  try {
    const url =
      new URL(request.url);

    const siteId =
      cleanText(
        url.searchParams.get("siteId")
      );

    if (!siteId) {
      return NextResponse.json(
        {
          success: false,
          error:
            "siteId가 필요합니다.",
        },
        {
          status: 400,
        }
      );
    }

    const accessToken =
      getBearerToken(request);

    const supabase =
      getAdminClient();

    const access =
      await verifyWorkerSiteAccess({
        supabase,
        accessToken,
        siteId,
      });

    if (!access.success) {
      return NextResponse.json(
        {
          success: false,
          error: access.error,
        },
        {
          status: access.status,
        }
      );
    }

    const {
      worker,
      site,
      assignment,
    } = access;

    const report =
      await getExistingReport({
        supabase,
        companyId: worker.company_id,
        siteId,
      });

    return NextResponse.json({
      success: true,

      siteId,

      role:
        assignment.role,

      siteStatus:
        site.status,

      hasReport:
        Boolean(report?.id),

      report: report
        ? {
            id: report.id,

            worker_id:
              report.worker_id,

            work_region:
              report.work_region,

            work_summary:
              report.work_summary,

            memo:
              report.memo,

            completed_at:
              report.completed_at,

            created_at:
              report.created_at,

            updated_at:
              report.updated_at,

            review_status:
              report.review_status ||
              "pending",

            reviewed_at:
              report.reviewed_at,

            approved_amount:
              report.approved_amount,

            review_memo:
              report.review_memo,
          }
        : null,
    });
  } catch (error) {
    console.error(
      "시공자 완료보고 조회 오류:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error?.message ||
          "완료보고 상태를 확인하지 못했습니다.",
      },
      {
        status: 500,
      }
    );
  }
}

/* =========================================================
   POST
   책임 팀장 완료보고 저장
========================================================= */

export async function POST(request) {
  try {
    const accessToken =
      getBearerToken(request);

    if (!accessToken) {
      return NextResponse.json(
        {
          success: false,
          error:
            "로그인이 필요합니다.",
        },
        {
          status: 401,
        }
      );
    }

    const body =
      await request.json();

    const siteId =
      cleanText(body?.siteId);

    const workRegion =
      cleanText(body?.work_region);

    const workSummary =
      cleanText(body?.work_summary);

    const memo =
      cleanText(body?.memo);

    const materials =
      Array.isArray(body?.materials)
        ? body.materials
        : [];

    const expenses =
      Array.isArray(body?.expenses)
        ? body.expenses
        : [];

    /* -------------------------------------------------------
       필수값 확인
    ------------------------------------------------------- */

    if (!siteId) {
      return NextResponse.json(
        {
          success: false,
          error:
            "현장 정보가 없습니다.",
        },
        {
          status: 400,
        }
      );
    }

    if (!workSummary) {
      return NextResponse.json(
        {
          success: false,
          error:
            "실제 시공 내용을 입력해주세요.",
        },
        {
          status: 400,
        }
      );
    }

    const supabase =
      getAdminClient();

    /* -------------------------------------------------------
       시공자 + 현장 권한 확인
    ------------------------------------------------------- */

    const access =
      await verifyWorkerSiteAccess({
        supabase,
        accessToken,
        siteId,
      });

    if (!access.success) {
      return NextResponse.json(
        {
          success: false,
          error: access.error,
        },
        {
          status: access.status,
        }
      );
    }

    const {
      user,
      worker,
      site,
      assignment,
    } = access;

    /* -------------------------------------------------------
       완료보고는 책임 팀장만 제출 가능
    ------------------------------------------------------- */

    const { data: dailyLeader, error: leaderError } = await supabase
      .from("site_daily_assignments")
      .select("id")
      .eq("company_id", worker.company_id)
      .eq("site_id", siteId)
      .eq("worker_id", worker.id)
      .eq("role", "leader")
      .limit(1);
    if (leaderError && leaderError.code !== "42P01") throw leaderError;

    if (assignment.role !== "leader" && !dailyLeader?.length) {
      return NextResponse.json(
        {
          success: false,
          error:
            "완료보고는 이 현장의 책임 팀장만 제출할 수 있습니다.",
        },
        {
          status: 403,
        }
      );
    }

    /* -------------------------------------------------------
       취소 현장 차단
    ------------------------------------------------------- */

    if (
      site.status === "cancelled"
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "취소된 현장에는 완료보고를 제출할 수 없습니다.",
        },
        {
          status: 409,
        }
      );
    }

    // A manager may finish a site before its report is submitted.
    // Report state below still blocks duplicate/past-approved submissions.

    /* -------------------------------------------------------
       기존 완료보고 확인

       pending:
       이미 제출 → 재제출 금지

       approved:
       관리자 승인 완료 → 재제출 금지

       rejected:
       보완 제출 허용
    ------------------------------------------------------- */

    const existingReport =
      await getExistingReport({
        supabase,
        companyId:
          worker.company_id,
        siteId,
      });

    if (
      existingReport?.id &&
      existingReport.review_status ===
        "pending"
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "이미 완료보고를 제출했습니다. 관리자 검수를 기다려주세요.",
          review_status: "pending",
        },
        {
          status: 409,
        }
      );
    }

    if (
      existingReport?.id &&
      existingReport.review_status ===
        "approved"
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "이미 관리자 승인이 완료된 현장입니다.",
          review_status: "approved",
        },
        {
          status: 409,
        }
      );
    }

    // Photos are uploaded before this call. A failure rolls back every report
    // and cost change, so a retry never encounters a half-submitted report.
    const report = await submitWorkReport({
      supabase, worker, user, siteId, workRegion, workSummary, memo, materials, expenses,
    });

    /* -------------------------------------------------------
       중요

       여기서는 sites.status를 completed로 변경하지 않는다.

       또한:
       work_items
       work_photos
       embedding
       AI 분석

       을 생성하지 않는다.

       관리자 검수 + 실제 시공금액 입력 + 승인 후
       별도 단계에서 AI 견적자료로 등록한다.
    ------------------------------------------------------- */

    return NextResponse.json({
      success: true,

      reportId:
        report.reportId,

      review_status:
        "pending",

      ai_registered:
        false,

      role:
        assignment.role,

      materialCount: report.materialCount,
      expenseCount: report.expenseCount,

      message:
        "완료보고가 저장되었습니다. 관리자 검수를 기다려주세요.",
    });
  } catch (error) {
    console.error(
      "시공자 완료보고 저장 오류:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error?.message ||
          "완료보고 저장 중 오류가 발생했습니다.",
      },
      {
        status: error?.code === "P0001" ? 409 : error?.code === "42501" ? 403 : /^22|^23/.test(error?.code || "") ? 400 : 500,
      }
    );
  }
     }
