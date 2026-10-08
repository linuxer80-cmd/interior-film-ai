import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const json = (body, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });

const uuid = (value) =>
  typeof value === "string" &&
  /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);

async function handle(request) {
  try {
    const token = (request.headers.get("authorization") || "")
      .match(/^Bearer (.+)$/i)?.[1];

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

    const { data, error } = await db.auth.getUser(token);

    if (error || !data.user) {
      return json({ error: "다시 로그인해주세요." }, 401);
    }

    let body;

    try {
      body =
        request.method === "GET"
          ? {
              siteId: new URL(request.url).searchParams.get("siteId"),
              action: "get",
            }
          : await request.json();
    } catch {
      return json({ error: "입력 형식을 확인해주세요." }, 400);
    }

    if (
      !uuid(body?.siteId) ||
      ![
        "get",
        "latest",
        "confirm",
        "issue",
        "void",
        "return",
        "settle",
        "outgoing",
      ].includes(body.action)
    ) {
      return json({ error: "현장과 요청을 확인해주세요." }, 400);
    }

    if (body.action === "confirm" && !uuid(body.eventId)) {
      return json({ error: "알림을 확인해주세요." }, 400);
    }

    if (
      ["issue", "void", "return", "settle", "outgoing"].includes(body.action) &&
      !uuid(body.materialId)
    ) {
      return json({ error: "자재를 확인해주세요." }, 400);
    }

    if (
      ["issue", "settle", "outgoing"].includes(body.action) &&
      !uuid(body.requestId)
    ) {
      return json({ error: "등록 요청을 확인해주세요." }, 400);
    }

    if (body.action === "void" && !uuid(body.issueId)) {
      return json({ error: "반출 기록을 확인해주세요." }, 400);
    }

    if (
      ["issue", "return"].includes(body.action) &&
      (
        !["string", "number"].includes(typeof body.quantity) ||
        !String(body.quantity).trim() ||
        !Number.isFinite(Number(body.quantity))
      )
    ) {
      return json(
        {
          error: "수량을 입력해주세요. 남은 자재가 없으면 0을 입력하세요.",
        },
        400
      );
    }

    if (body.action === "settle") {
      const numeric = (value) =>
        ["string", "number"].includes(typeof value) &&
        String(value).trim() !== "" &&
        Number.isFinite(Number(value));

      if (
        ![
          body.outgoing,
          body.returned,
          body.expectedIssued,
        ].every(numeric) ||
        Number(body.outgoing) < 0 ||
        Number(body.outgoing) > 1000000 ||
        Number(body.returned) < 0 ||
        Number(body.returned) > Number(body.outgoing)
      ) {
        return json(
          {
            error:
              "반출·반입량을 모두 입력해주세요. 반입량은 반출량 이하여야 합니다.",
          },
          400
        );
      }
    }

    if (body.action === "outgoing") {
      const numeric = (value) =>
        ["string", "number"].includes(typeof value) &&
        String(value).trim() !== "" &&
        Number.isFinite(Number(value));

      if (
        !numeric(body.outgoing) ||
        !numeric(body.expectedIssued) ||
        Number(body.outgoing) < 0 ||
        Number(body.outgoing) > 1000000 ||
        Number(body.expectedIssued) < 0
      ) {
        return json(
          {
            error: "총 반출량은 0 이상 1,000,000 이하로 입력해주세요.",
          },
          400
        );
      }
    }

    const args = {
      p_user: data.user.id,
      p_site: body.siteId,
      p_body: body,
    };

    if (body.action !== "outgoing") {
      args.p_action = body.action;
    }

    const result = await db.rpc(
      body.action === "outgoing"
        ? "save_site_material_outgoing"
        : "site_operations",
      args
    );

    if (result.error) {
      const code = result.error.code || "";

      if (
        code === "42501" ||
        code === "P0001" ||
        code === "40001" ||
        /^22/.test(code)
      ) {
        return json(
          { error: result.error.message },
          code === "42501" ? 403 : code === "40001" ? 409 : 400
        );
      }

      throw result.error;
    }

    return json(result.data);
  } catch (error) {
    console.error("현장 자재·확인 처리 실패", error);

    return json(
      {
        error: "처리하지 못했습니다. 잠시 후 새로고침해주세요.",
      },
      500
    );
  }
}

export const GET = handle;
export const POST = handle;
