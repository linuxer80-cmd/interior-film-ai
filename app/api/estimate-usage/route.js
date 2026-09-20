import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const body = await request.json();

    const {
      company_slug,
      session_id,
      category,
      sub_category,
      photo_count,
      estimate_min,
      estimate_max,
      estimate_average,
      photo_paths,
    } = body || {};

    const normalizedCompanySlug =
      String(company_slug || "")
        .trim()
        .toLowerCase();

    if (!normalizedCompanySlug) {
      return NextResponse.json(
        {
          success: false,
          error: "company_slug가 없습니다.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !/^[a-z0-9-]+$/.test(
        normalizedCompanySlug
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "올바르지 않은 회사 주소입니다.",
        },
        {
          status: 400,
        }
      );
    }

    if (!session_id) {
      return NextResponse.json(
        {
          success: false,
          error: "session_id가 없습니다.",
        },
        {
          status: 400,
        }
      );
    }

    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL;

    const serviceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl) {
      return NextResponse.json(
        {
          success: false,
          error:
            "NEXT_PUBLIC_SUPABASE_URL 환경변수가 없습니다.",
        },
        {
          status: 500,
        }
      );
    }

    if (!serviceRoleKey) {
      return NextResponse.json(
        {
          success: false,
          error:
            "SUPABASE_SERVICE_ROLE_KEY 환경변수가 없습니다.",
        },
        {
          status: 500,
        }
      );
    }

    const supabase = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    const {
      data: company,
      error: companyError,
    } = await supabase
      .from("companies")
      .select("id, slug")
      .eq(
        "slug",
        normalizedCompanySlug
      )
      .eq("is_active", true)
      .maybeSingle();

    if (companyError) {
      console.error(
        "COMPANY LOOKUP ERROR:",
        companyError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "회사 정보를 확인하지 못했습니다.",
        },
        {
          status: 500,
        }
      );
    }

    if (!company?.id) {
      return NextResponse.json(
        {
          success: false,
          error:
            "사용할 수 없는 회사 주소입니다.",
        },
        {
          status: 404,
        }
      );
    }

    const safePhotoPaths =
      Array.isArray(photo_paths)
        ? photo_paths
            .map((path) =>
              String(path || "").trim()
            )
            .filter(Boolean)
        : [];

    const safePhotoCount =
      Number.isFinite(Number(photo_count))
        ? Number(photo_count)
        : safePhotoPaths.length;

    const safeEstimateMin =
      estimate_min === null ||
      estimate_min === undefined ||
      estimate_min === ""
        ? null
        : Number(estimate_min);

    const safeEstimateMax =
      estimate_max === null ||
      estimate_max === undefined ||
      estimate_max === ""
        ? null
        : Number(estimate_max);

    const safeEstimateAverage =
      estimate_average === null ||
      estimate_average === undefined ||
      estimate_average === ""
        ? null
        : Number(estimate_average);

    const insertData = {
      company_id: company.id,

      session_id: String(session_id),

      category:
        category
          ? String(category)
          : null,

      sub_category:
        sub_category
          ? String(sub_category)
          : null,

      photo_count:
        safePhotoCount,

      estimate_min:
        Number.isFinite(safeEstimateMin)
          ? safeEstimateMin
          : null,

      estimate_max:
        Number.isFinite(safeEstimateMax)
          ? safeEstimateMax
          : null,

      estimate_average:
        Number.isFinite(safeEstimateAverage)
          ? safeEstimateAverage
          : null,

      converted_to_lead: false,

      photo_paths:
        safePhotoPaths,
    };

    const {
      data,
      error,
    } = await supabase
      .from("estimate_usage")
      .insert(insertData)
      .select(
        `
        id,
        company_id,
        session_id,
        category,
        sub_category,
        photo_count,
        estimate_min,
        estimate_max,
        estimate_average,
        converted_to_lead,
        photo_paths,
        created_at
        `
      )
      .single();

    if (error) {
      console.error(
        "estimate_usage INSERT ERROR:",
        error
      );

      return NextResponse.json(
        {
          success: false,
          error:
            error.message ||
            "자동견적 로그 저장 실패",
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json({
      success: true,
      usage_id: data.id,
      data,
    });
  } catch (error) {
    console.error(
      "ESTIMATE USAGE API ERROR:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error?.message ||
          "자동견적 로그 저장 중 오류가 발생했습니다.",
      },
      {
        status: 500,
      }
    );
  }
      }
