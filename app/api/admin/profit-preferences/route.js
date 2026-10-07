import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const json = (body, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });

export async function POST(request) {
  try {
    const token = request.headers
      .get("authorization")
      ?.match(/^Bearer (.+)$/i)?.[1];

    if (!token) {
      return json({ error: "로그인이 필요합니다." }, 401);
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
      return json({ error: "다시 로그인해주세요." }, 401);
    }

    const body = await request.json();

    if (
      !body ||
      !["get", "import", "toggle"].includes(body.action) ||
      (body.action === "import" &&
        (!Array.isArray(body.ids) || body.ids.length > 1000))
    ) {
      return json({ error: "입력 형식을 확인해주세요." }, 400);
    }

    const result = await db.rpc("profit_preferences", {
      p_user: auth.data.user.id,
      p_body: body,
    });

    if (result.error) throw result.error;

    return json(result.data);
  } catch (error) {
    return json(
      { error: error.message || "제외 설정 저장 실패" },
      error.code === "42501" ? 403 : 400
    );
  }
}
