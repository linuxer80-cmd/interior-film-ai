import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * =========================================================
 * 서버용 Supabase
 * =========================================================
 */

function getSupabaseAdmin() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (
    !supabaseUrl ||
    !serviceRoleKey
  ) {
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

/*
 * =========================================================
 * 선택 통계 조회
 * =========================================================
 */

export async function GET() {
  try {
    const supabase =
      getSupabaseAdmin();

    const {
      data,
      error,
    } = await supabase
      .from(
        "film_selection_stats"
      )
      .select(
        [
          "product_key",
          "selection_count",
          "last_selected_at",
        ].join(",")
      )
      .order(
        "selection_count",
        {
          ascending: false,
        }
      )
      .order(
        "last_selected_at",
        {
          ascending: false,
        }
      );

    if (error) {
      console.error(
        "필름 선택 통계 조회 오류:",
        error
      );

      return NextResponse.json(
        {
          error:
            "필름 선택 통계를 불러오지 못했습니다.",
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json(
      {
        success: true,
        stats: data || [],
      },
      {
        headers: {
          "Cache-Control":
            "no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    console.error(
      "필름 통계 API 오류:",
      error
    );

    return NextResponse.json(
      {
        error:
          error?.message ||
          "필름 통계 조회 중 오류가 발생했습니다.",
      },
      {
        status: 500,
      }
    );
  }
}

/*
 * =========================================================
 * 필름 선택 횟수 증가
 * =========================================================
 */

export async function POST(
  request
) {
  try {
    const body =
      await request
        .json()
        .catch(
          () => ({})
        );

    const productKey =
      String(
        body?.productKey || ""
      ).trim();

    if (!productKey) {
      return NextResponse.json(
        {
          error:
            "제품 고유값이 없습니다.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      productKey.length > 300
    ) {
      return NextResponse.json(
        {
          error:
            "제품 고유값이 너무 깁니다.",
        },
        {
          status: 400,
        }
      );
    }

    const supabase =
      getSupabaseAdmin();

    const {
      data,
      error,
    } = await supabase.rpc(
      "increment_film_selection",
      {
        p_product_key:
          productKey,
      }
    );

    if (error) {
      console.error(
        "필름 선택 횟수 저장 오류:",
        error
      );

      return NextResponse.json(
        {
          error:
            "필름 선택 기록을 저장하지 못했습니다.",
        },
        {
          status: 500,
        }
      );
    }

    const updated =
      Array.isArray(data)
        ? data[0] || null
        : data || null;

    return NextResponse.json({
      success: true,
      stat: updated,
    });
  } catch (error) {
    console.error(
      "필름 선택 기록 API 오류:",
      error
    );

    return NextResponse.json(
      {
        error:
          error?.message ||
          "필름 선택 기록 중 오류가 발생했습니다.",
      },
      {
        status: 500,
      }
    );
  }
}
