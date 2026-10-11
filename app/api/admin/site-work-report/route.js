import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 60;

const json = (body, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
    },
  });

const uuid = (value) =>
  typeof value === "string" &&
  /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(
    value
  );

const numeric = (value) =>
  ["string", "number"].includes(typeof value) &&
  String(value).trim() !== "" &&
  Number.isFinite(Number(value));

const text = (value, max) =>
  typeof value === "string"
    ? value.trim().slice(0, max)
    : "";

export async function POST(request) {
  try {
    const token = (
      request.headers.get("authorization") || ""
    ).match(/^Bearer (.+)$/i)?.[1];

    if (!token) {
      return json(
        { error: "로그인이 필요합니다." },
        401
      );
    }

    let body;

    try {
      body = await request.json();
    } catch {
      return json(
        { error: "입력 형식을 확인해주세요." },
        400
      );
    }

    if (
      !uuid(body?.siteId) ||
      !uuid(body?.requestId) ||
      !text(body.work_summary, 10000)
    ) {
      return json(
        { error: "현장과 시공 내용을 확인해주세요." },
        400
      );
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
      data: auth,
      error: authError,
    } = await db.auth.getUser(token);

    if (authError || !auth.user) {
      return json(
        { error: "다시 로그인해주세요." },
        401
      );
    }

    const {
      data: profile,
      error,
    } = await db
      .from("profiles")
      .select("company_id,role,is_active")
      .eq("id", auth.user.id)
      .maybeSingle();

    if (error) throw error;

    if (
      !profile?.company_id ||
      profile.role !== "owner" ||
      profile.is_active === false
    ) {
      return json(
        { error: "관리자 권한이 필요합니다." },
        403
      );
    }

    const state = await db.rpc("site_operations", {
      p_user: auth.user.id,
      p_site: body.siteId,
      p_action: "get",
      p_body: {},
    });

    if (state.error) {
      return json(
        { error: "접근 가능한 현장이 아닙니다." },
        403
      );
    }

    const tracked = state.data.materials.some(
      (material) => Number(material.issued) > 0
    );

    const materials = tracked
      ? []
      : body.materials || [];

    const expenses = body.expenses || [];

    if (
      !Array.isArray(materials) ||
      !Array.isArray(expenses) ||
      materials.length > 100 ||
      expenses.length > 100
    ) {
      return json(
        {
          error:
            "자재와 경비는 각각 100개까지 입력해주세요.",
        },
        400
      );
    }

    for (const material of materials) {
      if (
        !material ||
        !(
          text(material.product_code, 100) ||
          text(material.product_name, 200)
        ) ||
        !numeric(material.quantity) ||
        Number(material.quantity) <= 0 ||
        Number(material.quantity) > 1000000 ||
        !numeric(material.unit_price) ||
        Number(material.unit_price) < 0 ||
        Number(material.unit_price) > 100000000
      ) {
        return json(
          {
            error:
              "자재명·사용량·원가 단가를 확인해주세요. 무상은 0원을 입력하세요.",
          },
          400
        );
      }
    }

    for (const expense of expenses) {
      if (
        !expense ||
        !numeric(expense.amount) ||
        !Number.isSafeInteger(Number(expense.amount)) ||
        Number(expense.amount) <= 0 ||
        Number(expense.amount) > 100000000 ||
        ![
          "parking",
          "meal",
          "fuel",
          "toll",
          "material",
          "other",
        ].includes(expense.expense_type) ||
        /^(수익관리\/|완료보고\/)/.test(
          text(expense.description, 1000)
        )
      ) {
        return json(
          {
            error:
              "경비 구분·금액·내용을 확인해주세요.",
          },
          400
        );
      }
    }

    const result = await db.rpc(
      "submit_admin_work_report",
      {
        p_company_id: profile.company_id,
        p_site_id: body.siteId,
        p_request_id: body.requestId,
        p_user_id: auth.user.id,
        p_work_region: text(body.work_region, 200),
        p_work_summary: text(body.work_summary, 10000),
        p_memo: text(body.memo, 5000),

        p_materials: materials.map((material) => ({
          brand: text(material.brand, 100),
          product_code: text(
            material.product_code,
            100
          ),
          product_name: text(
            material.product_name,
            200
          ),
          quantity: Number(material.quantity),
          unit: text(material.unit, 20) || "m",
          unit_price: Number(material.unit_price),
          memo: text(material.memo, 1000),
        })),

        p_expenses: expenses.map((expense) => ({
          expense_type: expense.expense_type,
          amount: Number(expense.amount),
          description: text(
            expense.description,
            1000
          ),
          expense_date: expense.expense_date || null,
        })),
      }
    );

    if (result.error) {
      if (
        result.error.code === "42501" ||
        result.error.code === "P0001" ||
        /^22|^23/.test(result.error.code || "")
      ) {
        return json(
          { error: result.error.message },
          result.error.code === "42501" ? 403 : 409
        );
      }

      throw result.error;
    }

    return json({
      success: true,
      ...result.data,
    });
  } catch (error) {
    console.error(
      "관리자 완료보고 저장 실패",
      error
    );

    return json(
      {
        error:
          "완료보고를 저장하지 못했습니다. 잠시 후 다시 시도해주세요.",
      },
      500
    );
  }
}
