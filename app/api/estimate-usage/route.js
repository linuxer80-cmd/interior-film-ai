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

function toNullableText(value) {
  const text = String(value || "").trim();

  return text || null;
}

function toNullableNumber(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number)
    ? Math.round(number)
    : null;
}

/* ==========================================
   자동견적 사용기록 저장
========================================== */

export async function POST(request) {
  try {
    const body = await request.json();

    const sessionId = toNullableText(
      body.session_id
    );

    if (!sessionId) {
      return NextResponse.json(
        {
          success: false,
          error:
            "사용자 세션 정보가 없습니다.",
        },
        {
          status: 400,
        }
      );
    }

    const photoCount = Math.max(
      0,
      Math.min(
        10,
        Number.parseInt(
          body.photo_count,
          10
        ) || 0
      )
    );

    const payload = {
      session_id: sessionId,
      category: toNullableText(
        body.category
      ),
      sub_category: toNullableText(
        body.sub_category
      ),
      photo_count: photoCount,
      estimate_min: toNullableNumber(
        body.estimate_min
      ),
      estimate_max: toNullableNumber(
        body.estimate_max
      ),
      estimate_average:
        toNullableNumber(
          body.estimate_average
        ),
      converted_to_lead: false,
    };

    const supabase =
      createAdminClient();

    const { data, error } =
      await supabase
        .from("estimate_usage")
        .insert(payload)
        .select(
          `
          id,
          session_id,
          category,
          sub_category,
          photo_count,
          estimate_min,
          estimate_max,
          estimate_average,
          converted_to_lead,
          created_at
          `
        )
        .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      id: data.id,
      usage: data,
    });
  } catch (error) {
    console.error(
      "자동견적 사용기록 오류:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error?.message ||
          "자동견적 사용기록 저장에 실패했습니다.",
      },
      {
        status: 500,
      }
    );
  }
}

/* ==========================================
   관리자용 자동견적 통계
========================================== */

export async function GET(request) {
  try {
    const supabase =
      createAdminClient();

    /*
      관리자 로그인 확인

      관리자 페이지에서 요청할 때
      Authorization: Bearer 사용자토큰
      형식으로 전달합니다.
    */

    const authorization =
      request.headers.get(
        "authorization"
      ) || "";

    const accessToken =
      authorization.startsWith(
        "Bearer "
      )
        ? authorization.slice(7).trim()
        : "";

    if (!accessToken) {
      return NextResponse.json(
        {
          success: false,
          error:
            "관리자 로그인이 필요합니다.",
        },
        {
          status: 401,
        }
      );
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
      return NextResponse.json(
        {
          success: false,
          error:
            "관리자 로그인 정보를 확인할 수 없습니다.",
        },
        {
          status: 401,
        }
      );
    }

    const url = new URL(request.url);

    const requestedDays = Number(
      url.searchParams.get("days") ||
        30
    );

    const days = Math.min(
      365,
      Math.max(
        1,
        Number.isFinite(requestedDays)
          ? Math.round(requestedDays)
          : 30
      )
    );

    const since = new Date();

    since.setUTCDate(
      since.getUTCDate() - days
    );

    const { data, error } =
      await supabase
        .from("estimate_usage")
        .select(
          `
          id,
          session_id,
          category,
          sub_category,
          photo_count,
          estimate_min,
          estimate_max,
          estimate_average,
          converted_to_lead,
          created_at
          `
        )
        .gte(
          "created_at",
          since.toISOString()
        )
        .order("created_at", {
          ascending: false,
        })
        .limit(5000);

    if (error) {
      throw error;
    }

    const rows = data || [];

    const totalUses = rows.length;

    const convertedCount =
      rows.filter(
        (item) =>
          item.converted_to_lead ===
          true
      ).length;

    const uniqueSessions =
      new Set(
        rows
          .map(
            (item) =>
              item.session_id
          )
          .filter(Boolean)
      ).size;

    const totalPhotos =
      rows.reduce(
        (sum, item) =>
          sum +
          Number(
            item.photo_count || 0
          ),
        0
      );

    const conversionRate =
      totalUses > 0
        ? Number(
            (
              (convertedCount /
                totalUses) *
              100
            ).toFixed(1)
          )
        : 0;

    const categoryMap = new Map();

    for (const row of rows) {
      const categories = String(
        row.category || "분류 없음"
      )
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

      for (const category of categories) {
        categoryMap.set(
          category,
          (categoryMap.get(category) ||
            0) + 1
        );
      }
    }

    const popularCategories = [
      ...categoryMap.entries(),
    ]
      .map(
        ([category, count]) => ({
          category,
          count,
        })
      )
      .sort(
        (a, b) =>
          b.count - a.count
      )
      .slice(0, 10);

    return NextResponse.json({
      success: true,
      days,
      total_uses: totalUses,
      converted_count:
        convertedCount,
      conversion_rate:
        conversionRate,
      unique_sessions:
        uniqueSessions,
      total_photos:
        totalPhotos,
      popular_categories:
        popularCategories,
      recent: rows.slice(0, 20),
    });
  } catch (error) {
    console.error(
      "자동견적 통계 오류:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error?.message ||
          "자동견적 통계를 불러오지 못했습니다.",
      },
      {
        status: 500,
      }
    );
  }
  }
