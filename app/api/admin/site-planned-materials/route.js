import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const json = (body, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });

const uuid = (value) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

async function handle(request) {
  try {
    const token = (request.headers.get("authorization") || "")
      .match(/^Bearer (.+)$/i)?.[1];

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
      }
    );

    const {
      data: { user },
      error: authError,
    } = await db.auth.getUser(token);

    if (authError || !user) {
      return json({ error: "로그인이 만료되었습니다." }, 401);
    }

    const { data: profile, error: profileError } = await db
      .from("profiles")
      .select("company_id,role,is_active")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) throw profileError;

    if (
      !profile?.company_id ||
      profile.role !== "owner" ||
      profile.is_active === false
    ) {
      return json({ error: "관리자 권한이 필요합니다." }, 403);
    }

    const { data: company, error: companyError } = await db
      .from("companies")
      .select("id,is_active")
      .eq("id", profile.company_id)
      .maybeSingle();

    if (companyError) throw companyError;

    if (!company || company.is_active === false) {
      return json({ error: "업체를 확인할 수 없습니다." }, 403);
    }

    let body;

    try {
      body =
        request.method === "GET"
          ? {
              siteId: new URL(request.url).searchParams.get("siteId"),
            }
          : await request.json();
    } catch {
      return json({ error: "입력 형식을 확인해주세요." }, 400);
    }

    if (
      !uuid(body?.siteId) ||
      (request.method !== "GET" && !uuid(body?.id))
    ) {
      return json({ error: "현장과 자재를 확인해주세요." }, 400);
    }

    const { data: site, error: siteError } = await db
      .from("sites")
      .select("id,status")
      .eq("id", body.siteId)
      .eq("company_id", profile.company_id)
      .maybeSingle();

    if (siteError) throw siteError;

    if (!site) {
      return json({ error: "현장을 찾을 수 없습니다." }, 404);
    }

    const columns = [
      "id",
      "brand",
      "product_code",
      "product_name",
      "quantity",
      "unit",
      "unit_price",
      "total_price",
      "memo",
      "created_at",
    ].join(",");

    if (request.method === "GET") {
      const { data, error } = await db
        .from("site_materials")
        .select(columns)
        .eq("company_id", profile.company_id)
        .eq("site_id", site.id)
        .eq("material_type", "planned")
        .order("created_at", { ascending: true });

      if (error) throw error;

      return json({
        materials: data || [],
        canWrite: site.status !== "cancelled",
      });
    }

    if (site.status === "cancelled") {
      return json(
        { error: "취소된 현장의 자재는 변경할 수 없습니다." },
        409
      );
    }

    let values;

    if (request.method !== "DELETE") {
      const text = (key, limit) =>
        typeof body[key] === "string"
          ? body[key].trim().slice(0, limit)
          : "";

      const quantity = 0;

      const unitPrice =
        body.unit_price === "" || body.unit_price == null
          ? null
          : Number(body.unit_price);

      if (
        !(text("product_code", 100) || text("product_name", 200)) ||
        (
          unitPrice !== null &&
          (
            !["string", "number"].includes(typeof body.unit_price) ||
            !Number.isFinite(unitPrice) ||
            unitPrice < 0 ||
            unitPrice > 100000000 ||
            !Number.isSafeInteger(Math.round(quantity * unitPrice))
          )
        )
      ) {
        return json(
          { error: "제품명 또는 코드와 원가 단가를 확인해주세요." },
          400
        );
      }

      values = {
        brand: text("brand", 100),
        product_code: text("product_code", 100),
        product_name: text("product_name", 200),
        quantity,
        unit: text("unit", 20) || "m",
        unit_price: unitPrice,
        total_price:
          unitPrice === null ? null : Math.round(quantity * unitPrice),
        memo: text("memo", 1000),
        updated_at: new Date().toISOString(),
      };

      let previous = null;

      if (request.method === "PATCH") {
        const result = await db
          .from("site_materials")
          .select("brand,product_code,product_name,unit,film_product_id")
          .eq("id", body.id)
          .eq("site_id", site.id)
          .eq("company_id", profile.company_id)
          .eq("material_type", "planned")
          .maybeSingle();

        if (result.error) throw result.error;

        if (!result.data) {
          return json({ error: "자재를 찾을 수 없습니다." }, 404);
        }

        previous = result.data;

        // 과거에 저장된 예정 수량·금액은 보존합니다.
        delete values.quantity;
        delete values.total_price;

        for (const key of [
          "brand",
          "product_code",
          "product_name",
          "unit",
        ]) {
          if (String(previous[key] ?? "").trim() === values[key]) {
            values[key] = previous[key];
          }
        }
      }

      values.film_product_id = null;

      if (
        previous &&
        (previous.brand || "") === (values.brand || "") &&
        (previous.product_code || "") === (values.product_code || "")
      ) {
        values.film_product_id = previous.film_product_id;
      } else if (values.brand && values.product_code) {
        const result = await db
          .from("film_products")
          .select("id")
          .eq("brand", values.brand)
          .eq("product_code", values.product_code)
          .limit(2);

        if (result.error) throw result.error;

        if (result.data?.length === 1) {
          values.film_product_id = result.data[0].id;
        }
      }
    }

    let query;

    if (request.method === "POST") {
      query = db.from("site_materials").insert({
        id: body.id,
        ...values,
        company_id: profile.company_id,
        site_id: site.id,
        material_type: "planned",
        created_by: user.id,
      });
    } else {
      query =
        request.method === "PATCH"
          ? db.from("site_materials").update(values)
          : db.from("site_materials").delete();

      query = query
        .eq("id", body.id)
        .eq("site_id", site.id)
        .eq("company_id", profile.company_id)
        .eq("material_type", "planned");
    }

    const { data, error } = await query.select("id").maybeSingle();

    if (error?.code === "23505") {
      return json(
        {
          error: "이미 등록된 요청입니다. 목록을 새로고침해 확인해주세요.",
        },
        409
      );
    }

    if (error) throw error;

    if (!data) {
      return json(
        {
          error: "자재가 삭제되었거나 찾을 수 없습니다. 새로고침해주세요.",
        },
        404
      );
    }

    return json({ success: true });
  } catch (error) {
    console.error("관리자 예정 자재 저장 실패:", error);

    if (error?.code === "P0001" || error?.code === "23514") {
      return json({ error: error.message }, 409);
    }

    return json(
      {
        error: "자재를 저장하지 못했습니다. 잠시 후 다시 시도해주세요.",
      },
      500
    );
  }
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
