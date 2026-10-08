import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const json = (value, status = 200) => Response.json(value, {
  status,
  headers: { "Cache-Control": "private, no-store" },
});

const uuid = value =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

async function handle(request) {
  try {
    const token = request.headers
      .get("authorization")
      ?.match(/^Bearer (.+)$/i)?.[1];

    if (!token) {
      return json({ error: "관리자 로그인이 필요합니다." }, 401);
    }

    if (
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.SUPABASE_SERVICE_ROLE_KEY
    ) {
      return json({ error: "서버 설정을 확인해주세요." }, 503);
    }

    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );

    const {
      data: { user },
      error: authError,
    } = await db.auth.getUser(token);

    if (authError || !user) {
      return json({ error: "로그인이 만료되었습니다." }, 401);
    }

    let body;

    if (request.method === "GET") {
      body = Object.fromEntries(new URL(request.url).searchParams);
    } else {
      const raw = await request.text();

      if (raw.length > 10000) {
        return json({ error: "입력 내용이 너무 깁니다." }, 400);
      }

      try {
        body = JSON.parse(raw);
      } catch {
        return json({ error: "입력 형식이 올바르지 않습니다." }, 400);
      }
    }

    if (!body || Array.isArray(body) || typeof body !== "object") {
      return json({ error: "입력 형식을 확인해주세요." }, 400);
    }

    const action = request.method === "GET"
      ? (body.siteId ? "get" : "list")
      : body.action;

    const allowed = request.method === "GET"
      ? ["get", "list"]
      : ["initialize", "add", "void", "due"];

    if (!allowed.includes(action)) {
      return json({ error: "지원하지 않는 요청입니다." }, 400);
    }

    if (action !== "list" && !uuid(body.siteId)) {
      return json({ error: "현장을 확인해주세요." }, 400);
    }

    const { data, error } = await db.rpc("manage_site_receivables", {
      p_user: user.id,
      p_site: action === "list" ? null : body.siteId,
      p_action: action,
      p_body: body,
    });

    if (error) {
      if (["PGRST202", "42P01", "42883"].includes(error.code)) {
        return json({
          error: "미수금 관리 SQL을 먼저 실행해주세요.",
        }, 503);
      }

      if (error.code === "42501") {
        return json({
          error: "본인 업체 관리자만 이용할 수 있습니다.",
        }, 403);
      }

      if (error.code === "40001") {
        return json({ error: error.message }, 409);
      }

      if (error.code?.startsWith("22") || error.code === "23514") {
        return json({
          error: error.code === "22023"
            ? error.message
            : "금액과 날짜 등 입력값을 확인해주세요.",
        }, 400);
      }

      console.error("receivables", error.code);

      return json({
        error: "입금 내역을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.",
      }, 500);
    }

    return json(data);
  } catch {
    return json({
      error: "요청을 처리하지 못했습니다. 다시 시도해주세요.",
    }, 500);
  }
}

export const GET = handle;
export const POST = handle;
