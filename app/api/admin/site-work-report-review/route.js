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

  return authorization.slice(7).trim();
}

/* =========================================================
   관리자 인증 + 업체 확인

   profiles:
   - id = auth.users.id
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
      error: "로그인이 필요합니다.",
      status: 401,
    };
  }

  const {
    data: userData,
    error: userError,
  } = await supabase.auth.getUser(accessToken);

  if (
    userError ||
    !userData?.user?.id
  ) {
    return {
      error: "로그인 정보를 확인할 수 없습니다.",
      status: 401,
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
      error:
        "관리자 정보를 확인하지 못했습니다.",
      status: 500,
    };
  }

  if (!profile) {
    return {
      error:
        "업체 관리자 정보가 없습니다.",
      status: 403,
    };
  }

  if (profile.is_active === false) {
    return {
      error:
        "비활성화된 관리자 계정입니다.",
      status: 403,
    };
  }

  if (!profile.company_id) {
    return {
      error:
        "관리자 업체 정보가 연결되어 있지 않습니다.",
      status: 403,
    };
  }

  /*
   * 현재 앱에서 관리자 role 명칭이
   * 여러 형태일 가능성을 고려합니다.
   *
   * profile이 있고 company_id가 있으며
   * 활성 계정인 것을 우선 확인합니다.
   *
   * 실제 데이터의 role 값이 확정되면
   * 이후 더 엄격하게 제한할 수 있습니다.
   */

  return {
    user,
    profile,
  };
}

/* =========================================================
   Private Storage Signed URL
========================================================= */

async function createSignedPhoto(
  supabase,
  photo
) {
  if (!photo) {
    return null;
  }

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
      error
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
    const url = new URL(request.url);

    const siteId =
      url.searchParams.get("siteId")?.trim();

    if (!siteId) {
      return NextResponse.json(
        {
          success: false,
          error: "siteId가 필요합니다.",
        },
        {
          status: 400,
        }
      );
    }

    const supabase =
      getAdminClient();

    const accessToken =
      getBearerToken(request);

    /* =====================================================
       1. 관리자 인증
    ===================================================== */

    const authResult =
      await verifyAdmin(
        supabase,
        accessToken
      );

    if (authResult.error) {
      return NextResponse.json(
        {
          success: false,
          error: authResult.error,
        },
        {
          status: authResult.status,
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
       2. 현장 확인

       반드시 관리자 자신의 company_id와
       현장의 company_id가 같아야 합니다.
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
      .eq("id", siteId)
      .eq("company_id", companyId)
      .maybeSingle();

    if (siteError) {
      console.error(
        "검수 현장 조회 오류:",
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
            "현장을 찾을 수 없거나 접근 권한이 없습니다.",
        },
        {
          status: 404,
        }
      );
    }

    /* =====================================================
       3. 완료보고 조회

       한 현장에 저장된 완료보고를 조회합니다.
    ===================================================== */

    const {
      data: report,
      error: reportError,
    } = await supabase
      .from("work_reports")
      .select("*")
      .eq("company_id", companyId)
      .eq("site_id", siteId)
      .maybeSingle();

    if (reportError) {
      console.error(
        "완료보고 조회 오류:",
        reportError
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

    /*
     * 아직 시공자가 완료보고를 제출하지 않은 경우
     */

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
      });
    }

    /* =====================================================
       4. 보고서 작성 시공자

       worker_id가 null일 수도 있으므로
       별도 조회합니다.
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
        worker = workerData || null;
      }
    }

    /* =====================================================
       5. 실제 사용 자재

       planned 제외
       actual만 조회합니다.
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
        "실제 사용 자재 조회 오류:",
        materialError
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
       6. 현장 경비
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
        "현장 경비 조회 오류:",
        expenseError
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
       7. 시공 전 / 완료 사진

       request 사진은 제외합니다.
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
        "완료보고 사진 조회 오류:",
        photoError
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
       8. Signed URL 생성
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

    const beforePhotos =
      signedPhotos.filter(
        (photo) =>
          photo?.photo_type ===
          "before"
      );

    const afterPhotos =
      signedPhotos.filter(
        (photo) =>
          photo?.photo_type ===
          "after"
      );

    /* =====================================================
       9. 결과
    ===================================================== */

    return NextResponse.json({
      success: true,
      hasReport: true,

      site,

      report,

      worker,

      materials:
        materials || [],

      expenses:
        expenses || [],

      beforePhotos,
      afterPhotos,

      review: {
        status:
          report.review_status ||
          "pending",

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
        canReview: true,
        canApprove:
          report.review_status !==
          "approved",
      },

      requestedBy:
        user.id,
    });
  } catch (error) {
    console.error(
      "관리자 완료보고 검수 조회 API 오류:",
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
