import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const json = (body, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });

async function handle(request) {
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

    const {
      data: { user },
      error: authError,
    } = await db.auth.getUser(token);

    if (authError || !user) {
      return json({ error: "다시 로그인해주세요." }, 401);
    }

    let body = {};

    if (request.method !== "GET") {
      const raw = await request.text();

      if (raw.length > 50000) {
        return json({ error: "입력 내용이 너무 큽니다." }, 400);
      }

      try {
        body = JSON.parse(raw);
      } catch {
        return json({ error: "입력 형식을 확인해주세요." }, 400);
      }
    }

    if (!body || Array.isArray(body) || typeof body !== "object") {
      return json({ error: "입력 형식을 확인해주세요." }, 400);
    }

    const { data, error } = await db.rpc("manage_trade_clients", {
      p_user: user.id,
      p_action: request.method === "GET" ? "get" : body.action,
      p_body: body,
    });

    if (error) {
      console.error("trade clients", error.code);

      const message =
        error.code === "23505"
          ? "이미 등록된 업체명입니다."
          : error.code === "PGRST202"
            ? "거래처 SQL을 먼저 적용해주세요."
            : ["42501", "40001", "22023"].includes(error.code)
              ? error.message
              : "거래처 처리에 실패했습니다. 입력값과 연결을 확인해주세요.";

      const status =
        error.code === "42501"
          ? 403
          : error.code === "40001"
            ? 409
            : error.code?.startsWith("22") ||
                error.code?.startsWith("23")
              ? 400
              : 500;

      return json({ error: message }, status);
    }

    return json(data);
  } catch {
    return json(
      { error: "거래처 처리 중 연결 오류가 발생했습니다." },
      500
    );
  }
}

export const GET = handle;
export const POST = handle;
