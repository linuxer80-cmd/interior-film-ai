import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const reply = (body, status = 200) =>
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

    const {
      data: { user },
      error: authError,
    } = await db.auth.getUser(token);

    if (authError || !user) {
      return reply({ error: "다시 로그인해주세요." }, 401);
    }

    let body;

    try {
      body = await request.json();
    } catch {
      return reply({ error: "입력 형식 오류" }, 400);
    }

    if (
      !/^[0-9a-f-]{36}$/i.test(body?.materialId || "") ||
      !["get", "apply"].includes(body?.action)
    ) {
      return reply(
        { error: "자재와 요청을 확인해주세요." },
        400
      );
    }

    const { data, error } = await db.rpc(
      "material_purchase_cost",
      {
        p_user: user.id,
        p_material: body.materialId,
        p_body: body,
      }
    );

    if (error) {
      const message =
        error.code === "PGRST202"
          ? "입고단가 연결 SQL을 먼저 실행해주세요."
          : ["42501", "40001", "22023"].includes(error.code)
            ? error.message
            : "단가 조회·적용에 실패했습니다.";

      const status =
        error.code === "42501"
          ? 403
          : error.code === "40001"
            ? 409
            : error.code === "22023"
              ? 400
              : 500;

      return reply({ error: message }, status);
    }

    return reply(data);
  } catch {
    return reply(
      {
        error:
          "연결 오류입니다. 새로 조회해 적용 여부를 확인해주세요.",
      },
      500
    );
  }
}
