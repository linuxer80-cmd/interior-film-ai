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

function toNumberOrNull(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return null;
  }

  return number;
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

/* =========================================================
   완료보고 저장

   현장당 기존 report가 있으면 update,
   없으면 insert.

   하지만 POST 진입 전에
   pending / approved 중복 제출을 차단한다.
========================================================= */

async function saveWorkReport({
  supabase,
  companyId,
  siteId,
  workerId,
  userId,
  workRegion,
  workSummary,
  memo,
}) {
  const now =
    new Date().toISOString();

  const {
    data: existing,
    error: existingError,
  } = await supabase
    .from("work_reports")
    .select("id")
    .eq("company_id", companyId)
    .eq("site_id", siteId)
    .limit(1)
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  const payload = {
    company_id: companyId,
    site_id: siteId,
    worker_id: workerId,
    work_region:
      cleanText(workRegion),
    work_summary:
      cleanText(workSummary),
    memo:
      cleanText(memo),
    completed_at: now,
    created_by: userId,
    updated_at: now,

    // 시공자 제출 직후는 항상 관리자 검수대기
    review_status: "pending",

    // 이전 검수값 초기화
    reviewed_at: null,
    reviewed_by: null,
    approved_amount: null,
    review_memo: null,
  };

  if (existing?.id) {
    const {
      data,
      error,
    } = await supabase
      .from("work_reports")
      .update(payload)
      .eq("id", existing.id)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  const {
    data,
    error,
  } = await supabase
    .from("work_reports")
    .insert({
      ...payload,
      created_at: now,
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

/* =========================================================
   기존 actual 자재 삭제

   보고서 저장 전에 기존 actual 자재를 정리해서
   같은 현장에 중복 자재가 쌓이지 않도록 한다.
========================================================= */

async function clearActualMaterials({
  supabase,
  companyId,
  siteId,
}) {
  const {
    error,
  } = await supabase
    .from("site_materials")
    .delete()
    .eq("company_id", companyId)
    .eq("site_id", siteId)
    .eq("material_type", "actual");

  if (error) {
    throw error;
  }
}

/* =========================================================
   실제 사용 자재 저장
========================================================= */

async function saveMaterials({
  supabase,
  companyId,
  siteId,
  userId,
  materials,
}) {
  if (
    !Array.isArray(materials) ||
    materials.length === 0
  ) {
    return 0;
  }

  const now =
    new Date().toISOString();

  const rows = materials
    .map((item) => {
      const quantity =
        toNumberOrNull(item?.quantity);

      const unitPrice =
        toNumberOrNull(item?.unit_price);

      let totalPrice = null;

      if (
        quantity !== null &&
        unitPrice !== null
      ) {
        totalPrice =
          quantity * unitPrice;
      }

      return {
        company_id: companyId,
        site_id: siteId,

        film_product_id:
          item?.film_product_id || null,

        brand:
          cleanText(item?.brand),

        product_code:
          cleanText(item?.product_code),

        product_name:
          cleanText(item?.product_name),

        quantity,
        unit:
          cleanText(item?.unit),

        unit_price: unitPrice,
        total_price: totalPrice,

        memo:
          cleanText(item?.memo),

        created_by: userId,

        created_at: now,
        updated_at: now,

        material_type: "actual",
      };
    })
    .filter((item) => {
      return (
        item.brand ||
        item.product_code ||
        item.product_name ||
        item.quantity !== null ||
        item.memo
      );
    });

  if (rows.length === 0) {
    return 0;
  }

  const {
    error,
  } = await supabase
    .from("site_materials")
    .insert(rows);

  if (error) {
    throw error;
  }

  return rows.length;
}

/* =========================================================
   기존 경비 삭제
========================================================= */

async function clearExpenses({
  supabase,
  companyId,
  siteId,
}) {
  const {
    error,
  } = await supabase
    .from("site_expenses")
    .delete()
    .eq("company_id", companyId)
    .eq("site_id", siteId);

  if (error) {
    throw error;
  }
}

/* =========================================================
   경비 저장
========================================================= */

async function saveExpenses({
  supabase,
  companyId,
  siteId,
  workerId,
  userId,
  expenses,
}) {
  if (
    !Array.isArray(expenses) ||
    expenses.length === 0
  ) {
    return 0;
  }

  const now =
    new Date().toISOString();

  const allowedTypes = new Set([
    "parking",
    "meal",
    "fuel",
    "toll",
    "material",
    "other",
  ]);

  const rows = expenses
    .map((item) => {
      const amount =
        toNumberOrNull(item?.amount);

      const rawType =
        cleanText(item?.expense_type);

      const expenseType =
        allowedTypes.has(rawType)
          ? rawType
          : "other";

      return {
        company_id: companyId,
        site_id: siteId,
        worker_id: workerId,

        expense_type: expenseType,

        amount,

        description:
          cleanText(item?.description),

        expense_date:
          cleanText(item?.expense_date),

        created_by: userId,

        created_at: now,
        updated_at: now,
      };
    })
    .filter((item) => {
      return (
        item.amount !== null ||
        item.description
      );
    });

  if (rows.length === 0) {
    return 0;
  }

  const {
    error,
  } = await supabase
    .from("site_expenses")
    .insert(rows);

  if (error) {
    throw error;
  }

  return rows.length;
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

    if (
      assignment.role !== "leader"
    ) {
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

    /* -------------------------------------------------------
       기존 completed 현장 차단
    ------------------------------------------------------- */

    if (
      site.status === "completed"
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "이미 시공 완료 처리된 현장입니다.",
        },
        {
          status: 409,
        }
      );
    }

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

    /* -------------------------------------------------------
       완료보고 저장
    ------------------------------------------------------- */

    const report =
      await saveWorkReport({
        supabase,

        companyId:
          worker.company_id,

        siteId,

        workerId:
          worker.id,

        userId:
          user.id,

        workRegion,
        workSummary,
        memo,
      });

    /* -------------------------------------------------------
       실제 사용 자재 저장

       rejected 후 재제출인 경우에도
       기존 actual 자재를 지우고 새 값으로 저장
    ------------------------------------------------------- */

    await clearActualMaterials({
      supabase,

      companyId:
        worker.company_id,

      siteId,
    });

    const materialCount =
      await saveMaterials({
        supabase,

        companyId:
          worker.company_id,

        siteId,

        userId:
          user.id,

        materials,
      });

    /* -------------------------------------------------------
       경비 저장
    ------------------------------------------------------- */

    await clearExpenses({
      supabase,

      companyId:
        worker.company_id,

      siteId,
    });

    const expenseCount =
      await saveExpenses({
        supabase,

        companyId:
          worker.company_id,

        siteId,

        workerId:
          worker.id,

        userId:
          user.id,

        expenses,
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
        report.id,

      review_status:
        "pending",

      ai_registered:
        false,

      role:
        assignment.role,

      materialCount,
      expenseCount,

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
        status: 500,
      }
    );
  }
     }
