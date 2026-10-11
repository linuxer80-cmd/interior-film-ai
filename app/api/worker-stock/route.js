import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const reply = (body, status = 200) => Response.json(body, {
  status,
  headers: {
    "Cache-Control": "private, no-store",
    Vary: "Authorization",
  },
});

export async function GET(request) {
  try {
    const token = request.headers
      .get("authorization")
      ?.match(/^Bearer (.+)$/i)?.[1];

    if (!token) {
      return reply({ error: "로그인이 필요합니다." }, 401);
    }

    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    const auth = await db.auth.getUser(token);

    if (auth.error || !auth.data.user) {
      return reply({ error: "다시 로그인해주세요." }, 401);
    }

    const membership = await db
      .from("workers")
      .select("company_id")
      .eq("user_id", auth.data.user.id)
      .eq("is_active", true);

    if (membership.error) throw membership.error;

    const ids = [
      ...new Set(
        (membership.data || [])
          .map(w => w.company_id)
          .filter(Boolean)
      ),
    ];

    if (!ids.length) {
      return reply(
        { error: "활성 시공자 등록이 필요합니다." },
        403
      );
    }

    const companies = await db
      .from("companies")
      .select("id,company_name")
      .in("id", ids)
      .eq("is_active", true)
      .order("id");

    if (companies.error) throw companies.error;

    if (!companies.data.length) {
      return reply(
        { error: "활성 소속 업체가 없습니다." },
        403
      );
    }

    const requested = new URL(request.url)
      .searchParams.get("companyId");

    const companyId = requested || companies.data[0].id;

    if (!companies.data.some(c => c.id === companyId)) {
      return reply(
        { error: "소속 업체의 재고만 확인할 수 있습니다." },
        403
      );
    }

    // 가격 테이블과 자유 입력 메모는 조회하지 않습니다.
    const rolls = [];

    for (let start = 0; ; start += 500) {
      const result = await db
        .from("film_stock_rolls")
        .select("id,brand,product_code,remaining,location")
        .eq("company_id", companyId)
        .eq("status", "available")
        .gt("remaining", 0)
        .order("id")
        .range(start, start + 499);

      if (result.error) throw result.error;

      rolls.push(...result.data);

      if (result.data.length < 500) break;
    }

    return reply({
      companies: companies.data,
      companyId,
      rolls,
    });
  } catch (error) {
    console.error("worker-stock", error.code || "request failed");

    return reply(
      { error: "재고를 불러오지 못했습니다. 다시 시도해주세요." },
      500
    );
  }
}
