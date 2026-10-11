import { createClient } from "@supabase/supabase-js";
import { GET as getProfit } from "../profit/route";

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

const fail = (message, status) =>
  Object.assign(new Error(message), { status });

const uuid =
  /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

const categories = new Set([
  "film",
  "labor",
  "expense",
  "supplies",
]);

async function authorize(request, siteId) {
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer (.+)$/i)?.[1];

  if (!token) {
    throw fail("관리자 로그인이 필요합니다.", 401);
  }

  if (!uuid.test(siteId || "")) {
    throw fail("현장을 확인해주세요.", 400);
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
    data: auth,
    error,
  } = await db.auth.getUser(token);

  if (error || !auth.user) {
    throw fail("다시 로그인해주세요.", 401);
  }

  const profile = await db
    .from("profiles")
    .select("company_id,role,is_active")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (profile.error) {
    throw profile.error;
  }

  if (
    profile.data?.role !== "owner" ||
    profile.data.is_active !== true ||
    !profile.data.company_id
  ) {
    throw fail("관리자 권한이 필요합니다.", 403);
  }

  const companyId = profile.data.company_id;

  const company = await db
    .from("companies")
    .select("is_active")
    .eq("id", companyId)
    .maybeSingle();

  if (company.error) {
    throw company.error;
  }

  if (company.data?.is_active !== true) {
    throw fail("업체 사용 상태를 확인해주세요.", 403);
  }

  const site = await db
    .from("sites")
    .select(
      "id,site_name,customer_name,address,status",
    )
    .eq("company_id", companyId)
    .eq("id", siteId)
    .maybeSingle();

  if (site.error) {
    throw site.error;
  }

  if (!site.data) {
    throw fail("현장을 찾을 수 없습니다.", 404);
  }

  if (site.data.status !== "completed") {
    throw fail(
      "시공 완료 현장에서 작성할 수 있습니다.",
      409,
    );
  }

  return {
    db,
    companyId,
    userId: auth.user.id,
    site: site.data,
  };
}

/*
 * DB:
 *   document = { items: [...], note: "..." }
 *   revision = 수정 버전
 *
 * 화면:
 *   { items, note, version, updated_at }
 */
function toSaved(row) {
  if (!row) return null;

  if (
    !row.document ||
    !Array.isArray(row.document.items) ||
    typeof row.document.note !== "string" ||
    !Number.isSafeInteger(row.revision) ||
    row.revision < 1
  ) {
    throw fail(
      "저장된 견적서 형식이 다릅니다. 기존 데이터를 확인해주세요.",
      409,
    );
  }

  return {
    items: row.document.items,
    note: row.document.note,
    version: row.revision,
    updated_at: row.updated_at,
  };
}

function handleError(error) {
  console.error(
    "completion estimate",
    error.code || error.message,
  );

  const message = [
    "42P01",
    "PGRST205",
  ].includes(error.code)
    ? "완료 견적서 테이블을 찾을 수 없습니다. DB 연결을 확인해주세요."
    : error.status
      ? error.message
      : "완료 견적서를 처리하지 못했습니다. 다시 시도해주세요.";

  return json(
    { error: message },
    error.status || 500,
  );
}

export async function GET(request) {
  try {
    const siteId = new URL(
      request.url,
    ).searchParams.get("siteId");

    const {
      db,
      companyId,
      site,
    } = await authorize(request, siteId);

    const saved = await db
      .from("site_completion_estimates")
      .select("document,revision,updated_at")
      .eq("company_id", companyId)
      .eq("site_id", siteId)
      .maybeSingle();

    if (saved.error) {
      throw saved.error;
    }

    const savedDocument = toSaved(saved.data);

    /*
     * 기존 수익관리 API의 비용 계산을 재사용합니다.
     * 인건비·팀장수당·승인된 연장비용의 계산 기준을
     * 수익관리 화면과 동일하게 유지합니다.
     */
    const url = new URL(
      "/api/admin/profit",
      request.url,
    );

    url.searchParams.set("siteId", siteId);

    const response = await getProfit(
      new Request(url, {
        headers: request.headers,
      }),
    );

    const profit = await response.json();

    if (!response.ok) {
      if (saved.data) {
        return json({
          site,
          saved: savedDocument,
          automatic: null,
          warning:
            "최신 실제 비용을 불러오지 못했습니다. 저장된 견적서를 표시합니다.",
        });
      }

      throw fail(
        profit.error || "실제 비용 조회 실패",
        response.status,
      );
    }

    if (
      !profit.sites?.some(
        (row) => row.id === siteId,
      )
    ) {
      throw fail(
        "현장을 찾을 수 없습니다.",
        404,
      );
    }

    const breakdown = profit.breakdown;

    const items = [
      ...breakdown.material.map((row) => ({
        category:
          row.quantity == null
            ? "supplies"
            : "film",

        name: [
          row.quantity == null
            ? ""
            : row.brand,
          row.product,
        ]
          .filter(Boolean)
          .join(" · "),

        quantity: row.quantity ?? 1,
        unit: row.unit || "식",
        amount: Math.round(row.amount),
      })),

      ...breakdown.labor.map((row) => ({
        category: "labor",
        name: `${row.name} · ${row.description}`,
        quantity: 1,
        unit: "식",
        amount: Math.round(row.amount),
      })),

      ...breakdown.expense.map((row) => ({
        category: "expense",
        name: `${row.category} · ${row.description}`,
        quantity: 1,
        unit: "식",
        amount: Math.round(row.amount),
      })),
    ];

    const pending =
      profit.sites.find(
        (row) => row.id === siteId,
      )?.laborPending || 0;

    return json({
      site,
      saved: savedDocument,

      automatic: {
        items,
        note: "",
        version: 0,
      },

      warning: pending
        ? `일당이 확인되지 않은 배정 ${pending}건이 있습니다. 인건비를 확인해주세요.`
        : "",
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request) {
  try {
    const body = await request
      .json()
      .catch(() => {
        throw fail(
          "입력 형식을 확인해주세요.",
          400,
        );
      });

    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body)
    ) {
      throw fail(
        "입력 형식을 확인해주세요.",
        400,
      );
    }

    const {
      db,
      companyId,
      userId,
    } = await authorize(request, body.siteId);

    if (
      !Number.isSafeInteger(body.version) ||
      body.version < 0 ||
      body.version > 2000000000 ||
      !Array.isArray(body.items) ||
      body.items.length > 300 ||
      typeof body.note !== "string" ||
      body.note.length > 3000
    ) {
      throw fail(
        "견적서 입력값을 확인해주세요. 항목은 최대 300개입니다.",
        400,
      );
    }

    const items = body.items.map((item) => {
      if (
        !item ||
        !categories.has(item.category) ||
        typeof item.name !== "string" ||
        !item.name.trim() ||
        item.name.length > 500 ||
        typeof item.unit !== "string" ||
        item.unit.length > 20 ||
        typeof item.quantity !== "number" ||
        !Number.isFinite(item.quantity) ||
        item.quantity < 0 ||
        item.quantity > 1000000 ||
        !Number.isSafeInteger(item.amount) ||
        item.amount < 0 ||
        item.amount > 1000000000
      ) {
        throw fail(
          "항목명·수량·금액을 확인해주세요. 금액은 0 이상의 정수입니다.",
          400,
        );
      }

      return {
        category: item.category,
        name: item.name.trim(),
        quantity: item.quantity,
        unit: item.unit.trim(),
        amount: item.amount,
      };
    });

    const value = {
      document: {
        items,
        note: body.note.trim(),
      },
      updated_by: userId,
      updated_at: new Date().toISOString(),
      revision: body.version + 1,
    };

    const table = db.from(
      "site_completion_estimates",
    );

    /*
     * 처음 저장: INSERT
     * 수정 저장: 읽었던 revision과 같을 때만 UPDATE
     */
    const result =
      body.version === 0
        ? await table
            .insert({
              ...value,
              site_id: body.siteId,
              company_id: companyId,
            })
            .select(
              "document,revision,updated_at",
            )
            .single()
        : await table
            .update(value)
            .eq("site_id", body.siteId)
            .eq("company_id", companyId)
            .eq("revision", body.version)
            .select(
              "document,revision,updated_at",
            )
            .maybeSingle();

    if (
      result.error?.code === "23505" ||
      (!result.error && !result.data)
    ) {
      throw fail(
        "다른 화면에서 먼저 저장했습니다. 저장본을 다시 불러온 후 수정해주세요.",
        409,
      );
    }

    if (result.error) {
      throw result.error;
    }

    return json({
      saved: toSaved(result.data),
    });
  } catch (error) {
    return handleError(error);
  }
        }
