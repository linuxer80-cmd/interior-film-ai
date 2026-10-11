import { resolveWorkerSite } from "../../../../lib/workerSiteAccess.mjs";
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

    const { worker } = await resolveWorkerSite(supabase, user.id, siteId);

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
        status: error.status || 500,
      }
    );
  }
          }
