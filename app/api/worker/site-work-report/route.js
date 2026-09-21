import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 60;

/* =========================================================
   Supabase Admin
========================================================= */

function createAdminClient() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL 환경변수가 없습니다.",
    );
  }

  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY 환경변수가 없습니다.",
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
    },
  );
}

/* =========================================================
   공용
========================================================= */

function cleanText(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const text =
    String(value).trim();

  return text || null;
}

function toNumberOrNull(value) {
  if (
    value === "" ||
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}

/* =========================================================
   Bearer Token
========================================================= */

function getAccessToken(request) {
  const authorization =
    request.headers.get(
      "authorization",
    ) || "";

  if (
    !authorization
      .toLowerCase()
      .startsWith("bearer ")
  ) {
    return null;
  }

  return authorization
    .slice(7)
    .trim();
}

/* =========================================================
   Worker 권한 확인

   반드시:

   auth user
      ↓
   workers.user_id
      ↓
   site_workers.worker_id
      ↓
   sites.company_id

   를 모두 확인합니다.

   여기서는 현장 배정 여부까지만 확인합니다.
   완료보고 작성 권한(leader)은 POST에서 별도로 확인합니다.
========================================================= */

async function verifyWorkerSiteAccess({
  supabase,
  accessToken,
  siteId,
}) {
  if (!accessToken) {
    throw new Error(
      "로그인이 필요합니다.",
    );
  }

  /* ---------------------------------------------------------
     1. 로그인 사용자
  --------------------------------------------------------- */

  const {
    data: userData,
    error: userError,
  } =
    await supabase.auth.getUser(
      accessToken,
    );

  if (
    userError ||
    !userData?.user
  ) {
    throw new Error(
      "로그인 정보를 확인할 수 없습니다.",
    );
  }

  const user =
    userData.user;

  /* ---------------------------------------------------------
     2. 시공자 계정
  --------------------------------------------------------- */

  const {
    data: worker,
    error: workerError,
  } =
    await supabase
      .from("workers")
      .select(
        `
          id,
          company_id,
          name,
          phone,
          user_id,
          is_active
        `,
      )
      .eq(
        "user_id",
        user.id,
      )
      .eq(
        "is_active",
        true,
      )
      .maybeSingle();

  if (workerError) {
    throw workerError;
  }

  if (!worker) {
    throw new Error(
      "등록된 시공자 계정을 찾을 수 없습니다.",
    );
  }

  /* ---------------------------------------------------------
     3. 해당 현장

     로그인 시공자의 company_id와
     현장의 company_id가 반드시 같아야 합니다.
  --------------------------------------------------------- */

  const {
    data: site,
    error: siteError,
  } =
    await supabase
      .from("sites")
      .select(
        `
          id,
          company_id,
          site_name,
          customer_name,
          status
        `,
      )
      .eq(
        "id",
        siteId,
      )
      .eq(
        "company_id",
        worker.company_id,
      )
      .maybeSingle();

  if (siteError) {
    throw siteError;
  }

  if (!site) {
    throw new Error(
      "현장을 찾을 수 없습니다.",
    );
  }

  /* ---------------------------------------------------------
     4. 현장 배정 확인
  --------------------------------------------------------- */

  const {
    data: assignment,
    error: assignmentError,
  } =
    await supabase
      .from("site_workers")
      .select(
        `
          id,
          role,
          worker_id,
          site_id,
          company_id
        `,
      )
      .eq(
        "site_id",
        site.id,
      )
      .eq(
        "worker_id",
        worker.id,
      )
      .eq(
        "company_id",
        worker.company_id,
      )
      .maybeSingle();

  if (assignmentError) {
    throw assignmentError;
  }

  if (!assignment) {
    throw new Error(
      "이 현장에 배정된 시공자가 아닙니다.",
    );
  }

  return {
    user,
    worker,
    site,
    assignment,
  };
}

/* =========================================================
   완료보고 저장
========================================================= */

async function saveWorkReport({
  supabase,
  companyId,
  siteId,
  userId,
  workRegion,
  workSummary,
  memo,
}) {
  const {
    data: existing,
    error: existingError,
  } =
    await supabase
      .from("work_reports")
      .select("id")
      .eq(
        "company_id",
        companyId,
      )
      .eq(
        "site_id",
        siteId,
      )
      .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  const completedAt =
    new Date().toISOString();

  /*
   * 기존 보고서가 있으면 수정합니다.
   *
   * 아직 이 completed_at은
   * "현장 최종 승인"이나
   * "AI 견적자료 등록"을 의미하지 않습니다.
   *
   * 시공자 완료보고 작성 시각으로 사용합니다.
   */

  if (existing?.id) {
    const {
      error,
    } =
      await supabase
        .from("work_reports")
        .update({
          work_region:
            cleanText(
              workRegion,
            ),

          work_summary:
            cleanText(
              workSummary,
            ),

          memo:
            cleanText(memo),

          completed_at:
            completedAt,
        })
        .eq(
          "id",
          existing.id,
        )
        .eq(
          "company_id",
          companyId,
        );

    if (error) {
      throw error;
    }

    return existing.id;
  }

  /*
   * 기존 보고서가 없으면 신규 생성합니다.
   */

  const {
    data,
    error,
  } =
    await supabase
      .from("work_reports")
      .insert({
        company_id:
          companyId,

        site_id:
          siteId,

        work_region:
          cleanText(
            workRegion,
          ),

        work_summary:
          cleanText(
            workSummary,
          ),

        memo:
          cleanText(memo),

        completed_at:
          completedAt,

        created_by:
          userId,
      })
      .select("id")
      .single();

  if (error) {
    throw error;
  }

  return data.id;
}

/* =========================================================
   기존 actual 자재 제거

   완료보고를 다시 저장할 경우
   같은 실제 사용 자재가 중복 등록되지 않도록
   기존 actual 자료를 먼저 제거합니다.
========================================================= */

async function clearActualMaterials({
  supabase,
  companyId,
  siteId,
}) {
  const {
    error,
  } =
    await supabase
      .from("site_materials")
      .delete()
      .eq(
        "company_id",
        companyId,
      )
      .eq(
        "site_id",
        siteId,
      )
      .eq(
        "material_type",
        "actual",
      );

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
    return [];
  }

  const rows =
    materials
      .filter(
        (item) =>
          cleanText(
            item?.product_code,
          ) ||
          cleanText(
            item?.product_name,
          ),
      )
      .map((item) => {
        const quantity =
          toNumberOrNull(
            item.quantity,
          ) ?? 0;

        const unitPrice =
          toNumberOrNull(
            item.unit_price,
          );

        const totalPrice =
          unitPrice === null
            ? null
            : quantity *
              unitPrice;

        return {
          company_id:
            companyId,

          site_id:
            siteId,

          material_type:
            "actual",

          film_product_id:
            item.film_product_id ||
            null,

          brand:
            cleanText(
              item.brand,
            ),

          product_code:
            cleanText(
              item.product_code,
            ),

          product_name:
            cleanText(
              item.product_name,
            ),

          quantity,

          unit:
            cleanText(
              item.unit,
            ) || "m",

          unit_price:
            unitPrice,

          total_price:
            totalPrice,

          memo:
            cleanText(
              item.memo,
            ),

          created_by:
            userId,
        };
      });

  if (rows.length === 0) {
    return [];
  }

  const {
    data,
    error,
  } =
    await supabase
      .from("site_materials")
      .insert(rows)
      .select();

  if (error) {
    throw error;
  }

  return data || [];
}

/* =========================================================
   기존 경비 제거

   완료보고 재저장 시 중복 방지
========================================================= */

async function clearExpenses({
  supabase,
  companyId,
  siteId,
}) {
  const {
    error,
  } =
    await supabase
      .from("site_expenses")
      .delete()
      .eq(
        "company_id",
        companyId,
      )
      .eq(
        "site_id",
        siteId,
      );

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
  userId,
  expenses,
}) {
  if (
    !Array.isArray(expenses) ||
    expenses.length === 0
  ) {
    return [];
  }

  const rows =
    expenses
      .filter(
        (item) =>
          Number(
            item?.amount || 0,
          ) > 0,
      )
      .map((item) => ({
        company_id:
          companyId,

        site_id:
          siteId,

        expense_type:
          item.expense_type ||
          "other",

        amount:
          Number(
            item.amount || 0,
          ),

        description:
          cleanText(
            item.description,
          ),

        expense_date:
          item.expense_date ||
          new Date()
            .toISOString()
            .slice(0, 10),

        created_by:
          userId,
      }));

  if (rows.length === 0) {
    return [];
  }

  const {
    data,
    error,
  } =
    await supabase
      .from("site_expenses")
      .insert(rows)
      .select();

  if (error) {
    throw error;
  }

  return data || [];
}

/* =========================================================
   POST
========================================================= */

export async function POST(
  request,
) {
  try {
    const supabase =
      createAdminClient();

    /* -------------------------------------------------------
       Token
    ------------------------------------------------------- */

    const accessToken =
      getAccessToken(
        request,
      );

    if (!accessToken) {
      return NextResponse.json(
        {
          success: false,
          error:
            "로그인이 필요합니다.",
        },
        {
          status: 401,
        },
      );
    }

    /* -------------------------------------------------------
       Body
    ------------------------------------------------------- */

    let body;

    try {
      body =
        await request.json();
    } catch {
      return NextResponse.json(
        {
          success: false,
          error:
            "요청 데이터를 확인할 수 없습니다.",
        },
        {
          status: 400,
        },
      );
    }

    const siteId =
      cleanText(
        body?.siteId,
      );

    const workRegion =
      cleanText(
        body?.work_region,
      );

    const workSummary =
      cleanText(
        body?.work_summary,
      );

    const memo =
      cleanText(
        body?.memo,
      );

    const materials =
      Array.isArray(
        body?.materials,
      )
        ? body.materials
        : [];

    const expenses =
      Array.isArray(
        body?.expenses,
      )
        ? body.expenses
        : [];

    /* -------------------------------------------------------
       필수값
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
        },
      );
    }

    if (!workSummary) {
      return NextResponse.json(
        {
          success: false,
          error:
            "시공 내용을 입력해주세요.",
        },
        {
          status: 400,
        },
      );
    }

    /* -------------------------------------------------------
       시공자 + 현장 배정 검증
    ------------------------------------------------------- */

    const {
      user,
      worker,
      site,
      assignment,
    } =
      await verifyWorkerSiteAccess({
        supabase,
        accessToken,
        siteId,
      });

    const companyId =
      worker.company_id;

    /* -------------------------------------------------------
       책임 팀장 권한 확인

       중요:
       화면에서 버튼을 숨기는 것만으로는 보안이 되지 않습니다.

       API 자체에서 assignment.role === "leader" 를
       반드시 확인합니다.

       따라서 일반 시공자가 개발자도구나 직접 API 요청으로
       완료보고를 저장하려고 해도 서버에서 차단됩니다.
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
        },
      );
    }

    /* -------------------------------------------------------
       취소된 현장 방지
    ------------------------------------------------------- */

    if (
      site.status ===
      "cancelled"
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "취소된 현장은 완료보고를 저장할 수 없습니다.",
        },
        {
          status: 409,
        },
      );
    }

    /* -------------------------------------------------------
       이미 완료 처리된 현장 방지

       관리자 검수 흐름을 붙이기 전까지
       완료된 현장을 시공자가 다시 덮어쓰지 못하게 합니다.
    ------------------------------------------------------- */

    if (
      site.status ===
      "completed"
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "이미 완료 처리된 현장입니다.",
        },
        {
          status: 409,
        },
      );
    }

    /* -------------------------------------------------------
       1. 완료보고 저장
    ------------------------------------------------------- */

    const reportId =
      await saveWorkReport({
        supabase,

        companyId,

        siteId,

        userId:
          user.id,

        workRegion,

        workSummary,

        memo,
      });

    /* -------------------------------------------------------
       2. 기존 actual 자재 제거
    ------------------------------------------------------- */

    await clearActualMaterials({
      supabase,
      companyId,
      siteId,
    });

    /* -------------------------------------------------------
       3. actual 자재 저장
    ------------------------------------------------------- */

    const savedMaterials =
      await saveMaterials({
        supabase,

        companyId,

        siteId,

        userId:
          user.id,

        materials,
      });

    /* -------------------------------------------------------
       4. 기존 경비 제거
    ------------------------------------------------------- */

    await clearExpenses({
      supabase,
      companyId,
      siteId,
    });

    /* -------------------------------------------------------
       5. 경비 저장
    ------------------------------------------------------- */

    const savedExpenses =
      await saveExpenses({
        supabase,

        companyId,

        siteId,

        userId:
          user.id,

        expenses,
      });

    /* -------------------------------------------------------
       중요

       여기서는 sites.status = completed 로
       변경하지 않습니다.

       또한 아래 AI 견적용 데이터도 생성하지 않습니다.

       - work_items
       - work_photos
       - embedding
       - AI 이미지 분석

       현재 저장되는 것은:

       - work_reports
       - site_materials (actual)
       - site_expenses

       뿐입니다.

       시공 완료사진은 별도의
       /api/worker/site-photos
       API에서 site_photos(after)에 저장됩니다.

       이후:

       책임 팀장 완료보고
          ↓
       관리자 검수 대기
          ↓
       관리자 실제 견적금액 입력
          ↓
       관리자 승인
          ↓
       그때 AI 견적자료 등록

       순서로 처리합니다.
    ------------------------------------------------------- */

    return NextResponse.json(
      {
        success: true,

        report_id:
          reportId,

        site_id:
          site.id,

        worker: {
          id:
            worker.id,

          name:
            worker.name,

          role:
            assignment.role,
        },

        saved: {
          materials:
            savedMaterials.length,

          expenses:
            savedExpenses.length,
        },

        review_status:
          "pending_admin_review",

        ai_registered:
          false,

        message:
          "완료보고가 저장되었습니다. 관리자 검수를 기다려주세요.",
      },
      {
        status: 200,
      },
    );
  } catch (error) {
    console.error(
      "Worker site work report API error:",
      error,
    );

    const message =
      error?.message ||
      "완료보고 저장 중 오류가 발생했습니다.";

    let status = 500;

    if (
      message ===
        "로그인이 필요합니다." ||
      message ===
        "로그인 정보를 확인할 수 없습니다."
    ) {
      status = 401;
    } else if (
      message ===
        "등록된 시공자 계정을 찾을 수 없습니다." ||
      message ===
        "이 현장에 배정된 시공자가 아닙니다." ||
      message ===
        "현장을 찾을 수 없습니다."
    ) {
      status = 403;
    }

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      {
        status,
      },
    );
  }
           }
