import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      Vary: "Authorization",
    },
  });

const uuid = value =>
  typeof value === "string" &&
  /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);

const pick = (row, keys) =>
  Object.fromEntries(
    keys
      .filter(key =>
        Object.prototype.hasOwnProperty.call(row, key)
      )
      .map(key => [key, row[key]])
  );

// 시공자에게 허용한 필드만 전달합니다.
// 금액 필드가 DB 응답에 추가되어도 자동으로 노출되지 않습니다.
function workerStock(value) {
  const rows = (name, keys) =>
    (Array.isArray(value?.[name]) ? value[name] : [])
      .map(row => pick(row, keys));

  return {
    owner: false,
    canEdit: value?.canEdit === true,
    canIssue: (value?.canIssue ?? value?.canEdit) === true,
    canReturnRoll:
      (value?.canReturnRoll ?? value?.canEdit) === true,
    locked: value?.locked !== false,

    materials: rows("materials", [
      "id",
      "brand",
      "code",
      "name",
      "unit",
      "issued",
      "returned",
      "returnUpdatedAt",
      "used",
    ]),

    rolls: rows("rolls", [
      "id",
      "label",
      "brand",
      "product_code",
      "location",
      "remaining",
      "status",
      "revision",
      "site_name",
      "created_at",
    ]),

    trips: rows("trips", [
      "id",
      "roll_id",
      "site_id",
      "material_id",
      "issued",
      "returned",
      "issued_at",
      "returned_at",
      "label",
      "brand",
      "product_code",
      "revision",
    ]),

    events: [],
  };
}

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

    const { data, error } = await db.auth.getUser(token);

    if (error || !data.user) {
      return json({ error: "다시 로그인해주세요." }, 401);
    }

    let body;

    try {
      body =
        request.method === "GET"
          ? {
              action: "get",
              siteId: new URL(request.url)
                .searchParams.get("siteId"),
            }
          : await request.json();
    } catch {
      return json(
        { error: "입력 형식을 확인해주세요." },
        400
      );
    }

    if (
      !body ||
      JSON.stringify(body).length > 12000 ||
      ![
        "get",
        "receive",
        "issue",
        "return",
        "supplier_return",
      ].includes(body.action) ||
      (body.siteId && !uuid(body.siteId))
    ) {
      return json(
        { error: "현장과 요청 내용을 확인해주세요." },
        400
      );
    }

    if (
      body.action !== "get" &&
      (
        !uuid(body.requestId) ||
        (
          body.action !== "receive" &&
          !uuid(body.rollId)
        )
      )
    ) {
      return json(
        { error: "롤과 저장 요청을 확인해주세요." },
        400
      );
    }

    if (
      ["issue", "return"].includes(body.action) &&
      (
        !uuid(body.siteId) ||
        (
          body.action === "issue" &&
          !uuid(body.materialId)
        )
      )
    ) {
      return json(
        { error: "현장과 사용 필름을 확인해주세요." },
        400
      );
    }

    // 사용자 ID는 요청 본문을 신뢰하지 않고
    // 검증된 로그인 계정에서 가져옵니다.
    const result = await db.rpc("film_stock", {
      p_user: data.user.id,
      p_site: body.siteId || null,
      p_action: body.action,
      p_body: body,
    });

    if (result.error) {
      const code = result.error.code || "";

      if (code === "23505") {
        return json(
          {
            error:
              "이미 등록된 롤 이름입니다. 다른 번호를 입력해주세요.",
          },
          409
        );
      }

      if (
        ["42501", "40001", "P0001"].includes(code) ||
        /^22/.test(code)
      ) {
        return json(
          { error: result.error.message },
          code === "42501"
            ? 403
            : code === "40001"
              ? 409
              : 400
        );
      }

      throw result.error;
    }

    // owner는 DB 함수가 해당 회사의 관리자 여부를
    // 확인하여 반환하는 값입니다.
    return json(
      result.data?.owner === true
        ? result.data
        : workerStock(result.data)
    );
  } catch (error) {
    console.error(
      "film-stock",
      error.code || error.message
    );

    return json(
      {
        error:
          "재고를 처리하지 못했습니다. SQL 적용 여부와 연결을 확인해주세요.",
      },
      500
    );
  }
}

export const GET = handle;
export const POST = handle;
