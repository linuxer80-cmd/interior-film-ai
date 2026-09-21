import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}

function normalizeSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function isValidSlug(value) {
  return /^[a-z0-9-]+$/.test(value);
}

function cleanStoragePath(value) {
  const raw = String(value || "").trim();

  if (!raw) {
    return "";
  }

  // 혹시 전체 URL이 들어온 경우
  // /work-photos/ 뒤의 실제 object path만 추출
  const marker = "/work-photos/";

  if (raw.includes(marker)) {
    return raw.split(marker)[1].split("?")[0];
  }

  return raw.replace(/^\/+/, "");
}

export async function POST(request) {
  try {
    const body = await request.json();

    const companySlug = normalizeSlug(
      body?.company_slug
    );

    const storagePath = cleanStoragePath(
      body?.path
    );

    if (
      !companySlug ||
      !isValidSlug(companySlug)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "올바른 업체 정보가 필요합니다.",
        },
        {
          status: 400,
        }
      );
    }

    if (!storagePath) {
      return NextResponse.json(
        {
          success: false,
          error: "사진 경로가 없습니다.",
        },
        {
          status: 400,
        }
      );
    }

    const supabase = createServiceClient();

    /*
     * 1. URL의 slug로 실제 업체 확인
     */
    const {
      data: company,
      error: companyError,
    } = await supabase
      .from("companies")
      .select("id, slug, is_active")
      .eq("slug", companySlug)
      .eq("is_active", true)
      .maybeSingle();

    if (companyError) {
      throw companyError;
    }

    if (!company?.id) {
      return NextResponse.json(
        {
          success: false,
          error: "사용할 수 없는 업체입니다.",
        },
        {
          status: 404,
        }
      );
    }

    /*
     * 기존 시공사진 경로는 다음 형태를 지원합니다.
     *
     * history/{work_item_id}/파일
     * history/{project_id}/파일
     * history/{company_id}/파일
     *
     * 다른 업체 사진에는 Signed URL을 발급하지 않습니다.
     */

    const parts = storagePath.split("/");

    if (
      parts[0] !== "history" ||
      !parts[1]
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "허용되지 않은 사진 경로입니다.",
        },
        {
          status: 403,
        }
      );
    }

    const ownerKey = parts[1];

    let allowed = false;

    /*
     * 신규 구조
     * history/{company_id}/...
     */
    if (ownerKey === company.id) {
      allowed = true;
    }

    /*
     * 기존 구조
     * history/{work_item_id}/...
     */
    if (!allowed) {
      const {
        data: workItem,
        error: workItemError,
      } = await supabase
        .from("work_items")
        .select("id")
        .eq("id", ownerKey)
        .eq("company_id", company.id)
        .maybeSingle();

      if (workItemError) {
        throw workItemError;
      }

      if (workItem?.id) {
        allowed = true;
      }
    }

    /*
     * 기존 구조
     * history/{project_id}/...
     */
    if (!allowed) {
      const {
        data: project,
        error: projectError,
      } = await supabase
        .from("projects")
        .select("id")
        .eq("id", ownerKey)
        .eq("company_id", company.id)
        .maybeSingle();

      if (projectError) {
        throw projectError;
      }

      if (project?.id) {
        allowed = true;
      }
    }

    if (!allowed) {
      return NextResponse.json(
        {
          success: false,
          error:
            "이 업체에서 사용할 수 없는 사진입니다.",
        },
        {
          status: 403,
        }
      );
    }

    /*
     * 2. 서버의 Service Role로만
     *    1시간 Signed URL 발급
     */
    const {
      data: signedData,
      error: signedError,
    } = await supabase.storage
      .from("work-photos")
      .createSignedUrl(
        storagePath,
        60 * 60
      );

    if (signedError) {
      throw signedError;
    }

    if (!signedData?.signedUrl) {
      throw new Error(
        "사진 URL을 만들지 못했습니다."
      );
    }

    return NextResponse.json({
      success: true,
      signed_url: signedData.signedUrl,
    });
  } catch (error) {
    console.error(
      "similar-photo error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error?.message ||
          "유사 시공사진을 불러오지 못했습니다.",
      },
      {
        status: 500,
      }
    );
  }
}
