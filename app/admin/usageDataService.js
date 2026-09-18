function getKoreanDateRange() {
  const now = new Date();

  const formatter = new Intl.DateTimeFormat(
    "en-CA",
    {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    },
  );

  const parts = formatter.formatToParts(now);

  const year = parts.find(
    (part) => part.type === "year",
  )?.value;

  const month = parts.find(
    (part) => part.type === "month",
  )?.value;

  const day = parts.find(
    (part) => part.type === "day",
  )?.value;

  const todayStart = new Date(
    `${year}-${month}-${day}T00:00:00+09:00`,
  );

  const sevenDaysStart = new Date(
    todayStart.getTime() -
      6 * 24 * 60 * 60 * 1000,
  );

  return {
    todayStart: todayStart.toISOString(),
    sevenDaysStart:
      sevenDaysStart.toISOString(),
  };
}

function throwResultError(
  result,
  name,
) {
  if (result?.error) {
    throw new Error(
      `${name} 조회 실패: ${
        result.error.message ||
        "데이터베이스 권한을 확인해주세요."
      }`,
    );
  }
}

export async function fetchUsageDashboard(
  supabase,
) {
  const {
    todayStart,
    sevenDaysStart,
  } = getKoreanDateRange();

  const [
    recentResult,
    sessionResult,
    totalResult,
    todayResult,
    sevenDaysResult,
    convertedResult,
    leadResult,
  ] = await Promise.all([
    supabase
      .from("estimate_usage")
      .select(
        `
          id,
          session_id,
          category,
          sub_category,
          photo_count,
          photo_paths,
          estimate_min,
          estimate_max,
          estimate_average,
          converted_to_lead,
          created_at
        `,
      )
      .order("created_at", {
        ascending: false,
      })
      .limit(30),

    supabase
      .from("estimate_usage")
      .select("session_id")
      .not("session_id", "is", null)
      .limit(5000),

    supabase
      .from("estimate_usage")
      .select("id", {
        count: "exact",
        head: true,
      }),

    supabase
      .from("estimate_usage")
      .select("id", {
        count: "exact",
        head: true,
      })
      .gte("created_at", todayStart),

    supabase
      .from("estimate_usage")
      .select("id", {
        count: "exact",
        head: true,
      })
      .gte(
        "created_at",
        sevenDaysStart,
      ),

    supabase
      .from("estimate_usage")
      .select("id", {
        count: "exact",
        head: true,
      })
      .eq(
        "converted_to_lead",
        true,
      ),

    supabase
      .from("customer_leads")
      .select("id", {
        count: "exact",
        head: true,
      }),
  ]);

  throwResultError(
    recentResult,
    "최근 자동견적",
  );

  throwResultError(
    sessionResult,
    "세션",
  );

  throwResultError(
    totalResult,
    "전체 자동견적",
  );

  throwResultError(
    todayResult,
    "오늘 자동견적",
  );

  throwResultError(
    sevenDaysResult,
    "최근 7일 자동견적",
  );

  throwResultError(
    convertedResult,
    "상담 전환",
  );

  throwResultError(
    leadResult,
    "고객 상담",
  );

  const recent = Array.isArray(
    recentResult.data,
  )
    ? recentResult.data
    : [];

  const sessionIds = new Set();

  for (
    const row of
      sessionResult.data || []
  ) {
    const sessionId = String(
      row?.session_id || "",
    ).trim();

    if (sessionId) {
      sessionIds.add(sessionId);
    }
  }

  const total =
    totalResult.count || 0;

  const converted =
    convertedResult.count || 0;

  const conversion =
    total > 0
      ? Math.round(
          (converted / total) * 1000,
        ) / 10
      : 0;

  return {
    stats: {
      today:
        todayResult.count || 0,
      sevenDays:
        sevenDaysResult.count || 0,
      total,
      sessions: sessionIds.size,
      leads: leadResult.count || 0,
      converted,
      conversion,
    },

    recent,
  };
}
