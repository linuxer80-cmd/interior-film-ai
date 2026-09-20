import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function cleanSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

export async function GET(request) {
  try {
    const { searchParams } =
      new URL(request.url);

    const slug =
      cleanSlug(
        searchParams.get("slug")
      );

    if (!slug) {
      return NextResponse.json(
        {
          success: false,
          error: "업체 주소가 없습니다.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !/^[a-z0-9-]+$/.test(slug)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "올바르지 않은 업체 주소입니다.",
        },
        {
          status: 400,
        }
      );
    }

    const supabase =
      createAdminClient();

    const {
      data: company,
      error: companyError,
    } = await supabase
      .from("companies")
      .select(
        `
        id,
        company_name,
        slug,
        representative_name,
        phone,
        logo_url,
        subscription_plan,
        is_active
        `
      )
      .eq("slug", slug)
      .eq("is_active", true)
      .maybeSingle();

    if (companyError) {
      console.error(
        "PUBLIC COMPANY 조회 오류:",
        companyError
      );

      throw companyError;
    }

    if (!company) {
      return NextResponse.json(
        {
          success: false,
          error:
            "사용 가능한 업체를 찾을 수 없습니다.",
        },
        {
          status: 404,
        }
      );
    }

    const {
      data: settings,
      error: settingsError,
    } = await supabase
      .from("company_settings")
      .select(
        `
        estimate_enabled,
        ai_estimate_enabled,
        virtual_install_enabled,
        film_samples_enabled,
        minimum_estimate,
        similarity_threshold,
        estimate_title,
        estimate_description,
        customer_phone,
        contact_url
        `
      )
      .eq("company_id", company.id)
      .maybeSingle();

    if (settingsError) {
      console.error(
        "PUBLIC COMPANY SETTINGS 조회 오류:",
        settingsError
      );

      throw settingsError;
    }

    return NextResponse.json({
      success: true,

      company: {
        id: company.id,
        company_name:
          company.company_name,
        slug: company.slug,
        representative_name:
          company.representative_name,
        phone:
          company.phone,
        logo_url:
          company.logo_url,
      },

      settings: settings || {
        estimate_enabled: true,
        ai_estimate_enabled: true,
        virtual_install_enabled: true,
        film_samples_enabled: true,
        minimum_estimate: 0,
        similarity_threshold: 0.65,
        estimate_title:
          "AI 인테리어필름 견적",
        estimate_description:
          "시공할 곳의 사진을 올려주시면 예상견적을 확인할 수 있습니다.",
        customer_phone: null,
        contact_url: null,
      },
    });
  } catch (error) {
    console.error(
      "PUBLIC COMPANY API ERROR:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error?.message ||
          "업체 정보를 불러오지 못했습니다.",
      },
      {
        status: 500,
      }
    );
  }
}
