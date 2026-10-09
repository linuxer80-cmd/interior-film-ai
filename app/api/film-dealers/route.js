import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const reply = (data, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      Vary: "Authorization",
    },
  });

async function handle(request) {
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

    const { data, error } = await db.auth.getUser(token);

    if (error || !data.user) {
      return reply({ error: "다시 로그인해주세요." }, 401);
    }

    let body;

    if (request.method === "GET") {
      body = { action: "get" };
    } else {
      const raw = await request.text();

      if (raw.length > 12000) {
        return reply({ error: "입력 내용이 너무 깁니다." }, 400);
      }

      try {
        body = JSON.parse(raw);
      } catch {
        return reply({ error: "입력 형식을 확인해주세요." }, 400);
      }
    }

    if (
      !body ||
      ![
        "get",
        "search",
        "dealer",
        "price",
        "receive",
        "supplier_return",
        "register_product",
      ].includes(body.action)
    ) {
      return reply({ error: "지원하지 않는 요청입니다." }, 400);
    }

    const result =
      body.action === "register_product"
        ? await db.rpc("register_dealer_film", {
            p_user: data.user.id,
            p_body: body,
          })
        : await db.rpc("film_dealers", {
            p_user: data.user.id,
            p_action: body.action,
            p_body: body,
          });

    if (result.error) {
      const code = result.error.code || "";

      if (code === "23505") {
        return reply({ error: "이미 등록된 이름입니다." }, 409);
      }

      if (
        ["42501", "40001", "P0001"].includes(code) ||
        code.startsWith("22")
      ) {
        return reply(
          { error: result.error.message },
          code === "42501" ? 403 : code === "40001" ? 409 : 400
        );
      }

      throw result.error;
    }

    return reply(result.data);
  } catch (error) {
    console.error("film-dealers", error.code || "request failed");

    return reply(
      {
        error:
          "처리하지 못했습니다. 대리점 SQL 적용 여부와 연결을 확인해주세요.",
      },
      500
    );
  }
}

export const GET = handle;
export const POST = handle;
