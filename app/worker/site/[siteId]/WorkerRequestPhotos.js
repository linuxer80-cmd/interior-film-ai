import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET_NAME = "work-photos";
const SIGNED_URL_SECONDS = 1800;

/* =========================================================
   서버 관리자 Supabase
========================================================= */

function createAdminClient() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Supabase 서버 환경 변수가 설정되지 않았습니다."
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

function getAccessToken(request) {
  const authorization =
    request.headers.get("authorization") || "";

  if (!authorization.startsWith("Bearer ")) {
    return "";
  }

  return authorization.slice(7).trim();
}

/* =========================================================
   GET
========================================================= */

export async function GET(request) {
  try {
    const supabase = createAdminClient();

    /* =====================================================
       1. 로그인 토큰 확인
    ===================================================== */

    const accessToken = getAccessToken(request);

    if (!accessToken) {
      return NextResponse.json(
        {
          success: false,
          error: "시공자 로그인이 필요합니다.",
        },
        {
          status: 401,
        }
      );
    }

    /* =====================================================
       2. 로그인 사용자 확인
    ===================================================== */

    const {
      data: userData,
      error: userError,
    } = await supabase.auth.getUser(accessToken);

    if (userError || !userData?.user) {
      return NextResponse.json(
        {
          success: false,
          error:
            "시공자 로그인 정보를 확인할 수 없습니다.",
        },
        {
          status: 401,
        }
      );
    }

    const user = userData.user;

    /* =====================================================
       3. siteId 확인
    ===================================================== */

    const url = new URL(request.url);

    const siteId =
      url.searchParams.get("siteId")?.trim();

    if (!siteId) {
      return NextResponse.json(
        {
          success: false,
          error: "현장 ID가 없습니다.",
        },
        {
          status: 400,
        }
      );
    }

    /* =====================================================
       4. 로그인 계정에 연결된 활성 시공자 확인
    ===================================================== */

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
          is_active
        `
      )
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (workerError) {
      throw workerError;
    }

    if (!worker?.id || !worker?.company_id) {
      return NextResponse.json(
        {
          success: false,
          error:
            "사용 가능한 시공자 계정을 찾을 수 없습니다.",
        },
        {
          status: 403,
        }
      );
    }

    /* =====================================================
       5. 해당 현장에 실제 배정됐는지 확인

       worker_id + company_id + site_id를 모두 확인합니다.
    ===================================================== */

    const {
      data: assignment,
      error: assignmentError,
    } = await supabase
      .from("site_workers")
      .select("site_id, worker_id, company_id, role")
      .eq("site_id", siteId)
      .eq("worker_id", worker.id)
      .eq("company_id", worker.company_id)
      .maybeSingle();

    if (assignmentError) {
      throw assignmentError;
    }

    if (!assignment?.site_id) {
      return NextResponse.json(
        {
          success: false,
          error:
            "이 현장에 배정된 시공자가 아닙니다.",
        },
        {
          status: 403,
        }
      );
    }

    /* =====================================================
       6. 현장 자체도 같은 회사인지 확인
    ===================================================== */

    const {
      data: site,
      error: siteError,
    } = await supabase
      .from("sites")
      .select("id, company_id")
      .eq("id", siteId)
      .eq("company_id", worker.company_id)
      .maybeSingle();

    if (siteError) {
      throw siteError;
    }

    if (!site?.id) {
      return NextResponse.json(
        {
          success: false,
          error:
            "현장 정보를 확인할 수 없습니다.",
        },
        {
          status: 403,
        }
      );
    }

    /* =====================================================
       7. 고객 요청사진 조회

       site_photos에서
       해당 회사 + 해당 현장 사진만 조회합니다.
    ===================================================== */

    const {
      data: photoRows,
      error: photoError,
    } = await supabase
      .from("site_photos")
      .select(
        `
          id,
          storage_path,
          photo_type,
          description,
          created_at
        `
      )
      .eq("company_id", worker.company_id)
      .eq("site_id", siteId)
      .eq("photo_type", "request")
      .order("created_at", {
        ascending: true,
      });

    if (photoError) {
      throw photoError;
    }

    if (!photoRows?.length) {
      return NextResponse.json({
        success: true,
        photos: [],
      });
    }

    /* =====================================================
       8. 서버에서 Signed URL 생성

       Service Role은 서버에서만 사용합니다.
       브라우저에는 Service Role Key가 전달되지 않습니다.
    ===================================================== */

    const photos = await Promise.all(
      photoRows.map(async (photo) => {
        if (!photo.storage_path) {
          return {
            photo_id: photo.id,
            storage_path: null,
            description:
              photo.description || null,
            photo_type:
              photo.photo_type || "request",
            created_at:
              photo.created_at || null,
            signed_url: null,
          };
        }

        try {
          const {
            data: signedData,
            error: signedError,
          } = await supabase.storage
            .from(BUCKET_NAME)
            .createSignedUrl(
              photo.storage_path,
              SIGNED_URL_SECONDS
            );

          if (signedError) {
            console.error(
              "시공자 요청사진 Signed URL 오류:",
              photo.id,
              photo.storage_path,
              signedError
            );

            return {
              photo_id: photo.id,
              storage_path:
                photo.storage_path,
              description:
                photo.description || null,
              photo_type:
                photo.photo_type || "request",
              created_at:
                photo.created_at || null,
              signed_url: null,
            };
          }

          return {
            photo_id: photo.id,
            storage_path:
              photo.storage_path,
            description:
              photo.description || null,
            photo_type:
              photo.photo_type || "request",
            created_at:
              photo.created_at || null,
            signed_url:
              signedData?.signedUrl || null,
          };
        } catch (error) {
          console.error(
            "시공자 요청사진 URL 처리 오류:",
            photo.id,
            error
          );

          return {
            photo_id: photo.id,
            storage_path:
              photo.storage_path,
            description:
              photo.description || null,
            photo_type:
              photo.photo_type || "request",
            created_at:
              photo.created_at || null,
            signed_url: null,
          };
        }
      })
    );

    /* =====================================================
       9. 응답
    ===================================================== */

    return NextResponse.json({
      success: true,
      photos,
    });
  } catch (error) {
    console.error(
      "시공자 요청사진 API 오류:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error?.message ||
          "고객 요청사진을 불러오지 못했습니다.",
      },
      {
        status: 500,
      }
    );
  }
}
