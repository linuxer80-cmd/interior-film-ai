import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 60;

const PHOTO_BUCKET = "work-photos";
const SIGNED_URL_SECONDS = 1800;

/* =========================================================
   Supabase Service Role
========================================================= */

function getAdminClient() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Supabase 환경변수가 설정되지 않았습니다."
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
   Bearer Token
========================================================= */

function getBearerToken(request) {
  const authorization =
    request.headers.get("authorization") || "";

  if (!authorization.startsWith("Bearer ")) {
    return null;
  }

  const token = authorization
    .slice(7)
    .trim();

  return token || null;
}

/* =========================================================
   관리자 인증

   profiles
   - id
   - company_id
   - role
   - is_active
========================================================= */

async function verifyAdmin(
  supabase,
  accessToken
) {
  if (!accessToken) {
    return {
      ok: false,
      status: 401,
      error: "관리자 로그인이 필요합니다.",
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
    !userData?.user?.id
  ) {
    console.error(
      "관리자 auth 확인 오류:",
      userError
    );

    return {
      ok: false,
      status: 401,
      error:
        "관리자 로그인 정보를 확인할 수 없습니다.",
    };
  }

  const user = userData.user;

  const {
    data: profile,
    error: profileError,
  } = await supabase
    .from("profiles")
    .select(
      `
        id,
        company_id,
        role,
        is_active
      `
    )
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    console.error(
      "관리자 profile 조회 오류:",
      profileError
    );

    return {
      ok: false,
      status: 500,
      error:
        "관리자 업체 정보를 확인하지 못했습니다.",
    };
  }

  if (!profile) {
    return {
      ok: false,
      status: 403,
      error:
        "관리자 업체 가입 정보가 없습니다.",
    };
  }

  if (profile.is_active === false) {
    return {
      ok: false,
      status: 403,
      error:
        "비활성화된 관리자 계정입니다.",
    };
  }

  if (!profile.company_id) {
    return {
      ok: false,
      status: 403,
      error:
        "관리자 계정에 업체가 연결되어 있지 않습니다.",
    };
  }

  return {
    ok: true,
    user,
    profile,
  };
}

/* =========================================================
   Signed URL
========================================================= */

async function createSignedPhoto(
  supabase,
  photo
) {
  if (!photo) {
    return null;
  }

  /*
   * storage_path가 없는 예전 데이터는
   * photo_url이 있으면 그대로 사용합니다.
   */

  if (!photo.storage_path) {
    return {
      ...photo,
      signed_url:
        photo.photo_url || "",
    };
  }

  const {
    data,
    error,
  } = await supabase.storage
    .from(PHOTO_BUCKET)
    .createSignedUrl(
      photo.storage_path,
      SIGNED_URL_SECONDS
    );

  if (error) {
    console.error(
      "완료보고 사진 signed URL 오류:",
      {
        photoId: photo.id,
        storagePath:
          photo.storage_path,
        error,
      }
    );

    return {
      ...photo,
      signed_url: "",
    };
  }

  return {
    ...photo,
    signed_url:
      data?.signedUrl || "",
  };
}

/* =========================================================
   GET
========================================================= */

export async function GET(request) {
  try {
    /* =====================================================
       1. siteId
    ===================================================== */

    const url =
      new URL(request.url);

    const siteId =
      url.searchParams
        .get("siteId")
        ?.trim();

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

    /* =====================================================
       2. Supabase
    ===================================================== */

    const supabase =
      getAdminClient();

    /* =====================================================
       3. 관리자 인증
    ===================================================== */

    const accessToken =
      getBearerToken(request);

    const authResult =
      await verifyAdmin(
        supabase,
        accessToken
      );

    if (!authResult.ok) {
      return NextResponse.json(
        {
          success: false,
          error:
            authResult.error,
        },
        {
          status:
            authResult.status ||
            403,
        }
      );
    }

    const {
      user,
      profile,
    } = authResult;

    const companyId =
      profile.company_id;

    /* =====================================================
       4. 현장 확인

       관리자 회사와 동일한 현장만 허용
    ===================================================== */

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
          customer_phone,
          address,
          region,
          work_type,
          work_description,
          status
        `
      )
      .eq(
        "id",
        siteId
      )
      .eq(
        "company_id",
        companyId
      )
      .maybeSingle();

    if (siteError) {
      console.error(
        "관리자 검수 현장 조회 오류:",
        siteError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "현장 정보를 불러오지 못했습니다.",
        },
        {
          status: 500,
        }
      );
    }

    if (!site) {
      return NextResponse.json(
        {
          success: false,
          error:
            "현장을 찾을 수 없거나 이 업체의 현장이 아닙니다.",
        },
        {
          status: 404,
        }
      );
    }

    /* =====================================================
       5. 완료보고 조회

       중요:
       maybeSingle()을 사용하지 않습니다.

       혹시 과거 데이터에서 같은 site_id로
       여러 보고서가 존재하더라도
       최신 updated_at 기준 1건을 사용합니다.
    ===================================================== */

    const {
      data: reportRows,
      error: reportError,
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
          created_by,
          created_at,
          updated_at,
          review_status,
          reviewed_at,
          reviewed_by,
          approved_amount,
          review_memo,
          ai_registered_at,
          ai_work_item_id
        `
      )
      .eq(
        "company_id",
        companyId
      )
      .eq(
        "site_id",
        siteId
      )
      .order(
        "updated_at",
        {
          ascending: false,
        }
      )
      .limit(1);

    if (reportError) {
      console.error(
        "관리자 완료보고 조회 오류:",
        {
          siteId,
          companyId,
          error: reportError,
        }
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "완료보고를 불러오지 못했습니다.",
        },
        {
          status: 500,
        }
      );
    }

    const report =
      Array.isArray(reportRows) &&
      reportRows.length > 0
        ? reportRows[0]
        : null;

    /* =====================================================
       6. 보고서 없음
    ===================================================== */

    if (!report) {
      return NextResponse.json({
        success: true,

        hasReport: false,

        site,

        report: null,

        worker: null,

        materials: [],
        expenses: [],

        beforePhotos: [],
        afterPhotos: [],

        review: null,

        permissions: {
          canReview: false,
          canApprove: false,
        },
      });
    }

    /* =====================================================
       7. 제출 시공자

       현재 테스트 데이터 중 일부는
       worker_id가 NULL일 수 있습니다.

       worker_id가 없어도 완료보고 자체는
       정상적으로 관리자에게 표시합니다.
    ===================================================== */

    let worker = null;

    if (report.worker_id) {
      const {
        data: workerData,
        error: workerError,
      } = await supabase
        .from("workers")
        .select(
          `
            id,
            name,
            phone
          `
        )
        .eq(
          "id",
          report.worker_id
        )
        .eq(
          "company_id",
          companyId
        )
        .maybeSingle();

      if (workerError) {
        console.error(
          "완료보고 시공자 조회 오류:",
          workerError
        );
      } else {
        worker =
          workerData || null;
      }
    }

    /* =====================================================
       8. 실제 사용 자재

       planned 제외
       actual만 조회
    ===================================================== */

    const {
      data: materials,
      error: materialError,
    } = await supabase
      .from("site_materials")
      .select(
        `
          id,
          material_type,
          film_product_id,
          brand,
          product_code,
          product_name,
          quantity,
          unit,
          unit_price,
          total_price,
          memo,
          created_at
        `
      )
      .eq(
        "company_id",
        companyId
      )
      .eq(
        "site_id",
        siteId
      )
      .eq(
        "material_type",
        "actual"
      )
      .order(
        "created_at",
        {
          ascending: true,
        }
      );

    if (materialError) {
      console.error(
        "관리자 실제 사용 자재 조회 오류:",
        {
          siteId,
          error: materialError,
        }
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "실제 사용 자재를 불러오지 못했습니다.",
        },
        {
          status: 500,
        }
      );
    }

    /* =====================================================
       9. 현장 경비
    ===================================================== */

    const {
      data: expenses,
      error: expenseError,
    } = await supabase
      .from("site_expenses")
      .select("*")
      .eq(
        "company_id",
        companyId
      )
      .eq(
        "site_id",
        siteId
      )
      .order(
        "created_at",
        {
          ascending: true,
        }
      );

    if (expenseError) {
      console.error(
        "관리자 현장 경비 조회 오류:",
        {
          siteId,
          error: expenseError,
        }
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "현장 경비를 불러오지 못했습니다.",
        },
        {
          status: 500,
        }
      );
    }

    /* =====================================================
       10. 시공 전 / 완료 사진

       request 사진은 기존 관리자 상세화면에서
       별도로 표시하므로 제외합니다.

       before = 실제 시공 전
       after  = 실제 시공 완료
    ===================================================== */

    const {
      data: photoData,
      error: photoError,
    } = await supabase
      .from("site_photos")
      .select(
        `
          id,
          photo_type,
          storage_path,
          photo_url,
          description,
          created_at
        `
      )
      .eq(
        "company_id",
        companyId
      )
      .eq(
        "site_id",
        siteId
      )
      .in(
        "photo_type",
        [
          "before",
          "after",
        ]
      )
      .order(
        "created_at",
        {
          ascending: true,
        }
      );

    if (photoError) {
      console.error(
        "관리자 완료보고 사진 조회 오류:",
        {
          siteId,
          error: photoError,
        }
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "시공사진을 불러오지 못했습니다.",
        },
        {
          status: 500,
        }
      );
    }

    /* =====================================================
       11. Private Storage Signed URL
    ===================================================== */

    const signedPhotos =
      await Promise.all(
        (photoData || []).map(
          (photo) =>
            createSignedPhoto(
              supabase,
              photo
            )
        )
      );

    const validPhotos =
      signedPhotos.filter(Boolean);

    const beforePhotos =
      validPhotos.filter(
        (photo) =>
          photo.photo_type ===
          "before"
      );

    const afterPhotos =
      validPhotos.filter(
        (photo) =>
          photo.photo_type ===
          "after"
      );

    /* =====================================================
       12. 검수 상태

       기존 데이터 보호를 위해
       값이 없으면 pending으로 처리
    ===================================================== */

    const reviewStatus =
      report.review_status ||
      "pending";

    /* =====================================================
       13. 응답
    ===================================================== */

    return NextResponse.json({
      success: true,

      hasReport: true,

      site,

      report,

      /*
       * worker_id가 NULL이면 worker는 null입니다.
       * 이것 때문에 보고서 표시를 막지 않습니다.
       */
      worker,

      materials:
        materials || [],

      expenses:
        expenses || [],

      beforePhotos,
      afterPhotos,

      review: {
        status:
          reviewStatus,

        reviewedAt:
          report.reviewed_at ||
          null,

        reviewedBy:
          report.reviewed_by ||
          null,

        approvedAmount:
          report.approved_amount ??
          null,

        memo:
          report.review_memo ||
          null,
      },

      permissions: {
        canReview:
          reviewStatus ===
            "pending" ||
          reviewStatus ===
            "rejected",

        canApprove:
          reviewStatus ===
          "pending",
      },

      debug: {
        siteId,
        companyId,
        reportId:
          report.id,
        workerId:
          report.worker_id ||
          null,
        reviewStatus,
      },

      requestedBy:
        user.id,
    });
  } catch (error) {
    console.error(
      "관리자 완료보고 검수 API 오류:",
      error
    );

    return NextResponse.json(
      {
        success: false,

        error:
          error?.message ||
          "완료보고 검수 정보를 불러오지 못했습니다.",
      },
      {
        status: 500,
      }
    );
  }
}
