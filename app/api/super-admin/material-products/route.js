import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function createServiceClient() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Supabase 서버 환경변수가 설정되지 않았습니다.",
    );
  }

  return createClient(
    supabaseUrl,
    serviceRoleKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}

function getAccessToken(request) {
  const authorization =
    request.headers.get("authorization") || "";

  if (!authorization.startsWith("Bearer ")) {
    return "";
  }

  return authorization.slice(7).trim();
}

async function requireSuperAdmin(request) {
  const accessToken = getAccessToken(request);

  if (!accessToken) {
    return {
      ok: false,
      status: 401,
      error: "로그인이 필요합니다.",
    };
  }

  const supabase = createServiceClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(accessToken);

  if (userError || !user) {
    return {
      ok: false,
      status: 401,
      error: "로그인 정보가 올바르지 않습니다.",
    };
  }

  const {
    data: superAdmin,
    error: adminError,
  } = await supabase
    .from("super_admins")
    .select("user_id, is_active")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (adminError) {
    console.error(
      "슈퍼관리자 확인 오류:",
      adminError,
    );

    return {
      ok: false,
      status: 500,
      error:
        "슈퍼관리자 권한을 확인하지 못했습니다.",
    };
  }

  if (!superAdmin) {
    return {
      ok: false,
      status: 403,
      error:
        "슈퍼관리자만 사용할 수 있습니다.",
    };
  }

  return {
    ok: true,
    user,
    supabase,
  };
}

function cleanText(value, maxLength = 200) {
  return String(value || "")
    .trim()
    .slice(0, maxLength);
}

function normalizeIds(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [
    ...new Set(
      value
        .filter(
          (item) =>
            typeof item === "string" ||
            typeof item === "number",
        )
        .map((item) => item),
    ),
  ].slice(0, 500);
}

function normalizePrice(value) {
  const numberValue = Number(value);

  if (
    !Number.isFinite(numberValue) ||
    numberValue < 0
  ) {
    throw new Error(
      "판매단가는 0 이상의 숫자여야 합니다.",
    );
  }

  return Math.round(numberValue);
}

function normalizePositiveNumber(
  value,
  fieldName,
) {
  const numberValue = Number(value);

  if (
    !Number.isFinite(numberValue) ||
    numberValue <= 0
  ) {
    throw new Error(
      `${fieldName}은 0보다 큰 숫자여야 합니다.`,
    );
  }

  return (
    Math.round(numberValue * 100) / 100
  );
}

function normalizeChanges(requestedChanges) {
  if (
    !requestedChanges ||
    typeof requestedChanges !== "object" ||
    Array.isArray(requestedChanges)
  ) {
    throw new Error(
      "변경할 내용을 입력해주세요.",
    );
  }

  const changes = {};

  if (
    Object.prototype.hasOwnProperty.call(
      requestedChanges,
      "is_order_available",
    )
  ) {
    changes.is_order_available =
      requestedChanges.is_order_available === true;
  }

  if (
    Object.prototype.hasOwnProperty.call(
      requestedChanges,
      "dealer_price_per_m",
    )
  ) {
    changes.dealer_price_per_m =
      normalizePrice(
        requestedChanges.dealer_price_per_m,
      );
  }

  if (
    Object.prototype.hasOwnProperty.call(
      requestedChanges,
      "price_vat_included",
    )
  ) {
    changes.price_vat_included =
      requestedChanges.price_vat_included ===
      true;
  }

  if (
    Object.prototype.hasOwnProperty.call(
      requestedChanges,
      "stock_status",
    )
  ) {
    if (
      !["in_stock", "sold_out"].includes(
        requestedChanges.stock_status,
      )
    ) {
      throw new Error(
        "재고 상태가 올바르지 않습니다.",
      );
    }

    changes.stock_status =
      requestedChanges.stock_status;
  }

  if (
    Object.prototype.hasOwnProperty.call(
      requestedChanges,
      "minimum_order_m",
    )
  ) {
    changes.minimum_order_m =
      normalizePositiveNumber(
        requestedChanges.minimum_order_m,
        "최소 주문량",
      );
  }

  if (
    Object.prototype.hasOwnProperty.call(
      requestedChanges,
      "order_unit_m",
    )
  ) {
    changes.order_unit_m =
      normalizePositiveNumber(
        requestedChanges.order_unit_m,
        "주문 단위",
      );
  }

  if (Object.keys(changes).length === 0) {
    throw new Error(
      "변경할 항목이 없습니다.",
    );
  }

  changes.order_price_updated_at =
    new Date().toISOString();

  return changes;
}

export async function GET(request) {
  try {
    const auth =
      await requireSuperAdmin(request);

    if (!auth.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: auth.error,
        },
        {
          status: auth.status,
        },
      );
    }

    const { searchParams } =
      new URL(request.url);

    const brand =
      cleanText(
        searchParams.get("brand"),
        100,
      ) || "현대보닥";

    const search = cleanText(
      searchParams.get("search"),
      100,
    )
      .replaceAll(",", " ")
      .replaceAll("%", "");

    const saleFilter =
      searchParams.get("saleFilter") || "all";

    const stockFilter =
      searchParams.get("stockFilter") || "all";

    const requestedPage = Number(
      searchParams.get("page") || 1,
    );

    const requestedLimit = Number(
      searchParams.get("limit") || 50,
    );

    const page =
      Number.isInteger(requestedPage) &&
      requestedPage > 0
        ? requestedPage
        : 1;

    const limit =
      Number.isInteger(requestedLimit) &&
      requestedLimit > 0
        ? Math.min(requestedLimit, 100)
        : 50;

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = auth.supabase
      .from("film_products")
      .select("*", {
        count: "exact",
      })
      .eq("brand", brand);

    if (search) {
      query = query.or(
        [
          `product_code.ilike.%${search}%`,
          `product_name.ilike.%${search}%`,
          `color_description.ilike.%${search}%`,
        ].join(","),
      );
    }

    if (saleFilter === "available") {
      query = query.eq(
        "is_order_available",
        true,
      );
    }

    if (saleFilter === "unavailable") {
      query = query.eq(
        "is_order_available",
        false,
      );
    }

    if (stockFilter === "in_stock") {
      query = query.eq(
        "stock_status",
        "in_stock",
      );
    }

    if (stockFilter === "sold_out") {
      query = query.eq(
        "stock_status",
        "sold_out",
      );
    }

    const {
      data: products,
      error: productsError,
      count,
    } = await query
      .order("product_code", {
        ascending: true,
      })
      .range(from, to);

    if (productsError) {
      console.error(
        "제품 목록 조회 오류:",
        productsError,
      );

      return NextResponse.json(
        {
          ok: false,
          error:
            "제품 목록을 불러오지 못했습니다.",
          detail: productsError.message,
        },
        {
          status: 500,
        },
      );
    }

    const {
      data: brandRows,
      error: brandError,
    } = await auth.supabase
      .from("film_products")
      .select("brand")
      .not(
        "dealer_price_per_m",
        "is",
        null,
      )
      .order("brand", {
        ascending: true,
      });

    if (brandError) {
      console.error(
        "브랜드 목록 조회 오류:",
        brandError,
      );
    }

    const brands = [
      ...new Set(
        (brandRows || [])
          .map((row) => row.brand)
          .filter(Boolean),
      ),
    ];

    const {
      data: statsRows,
      error: statsError,
    } = await auth.supabase
      .from("film_products")
      .select(
        [
          "is_order_available",
          "stock_status",
          "dealer_price_per_m",
        ].join(","),
      )
      .eq("brand", brand);

    if (statsError) {
      console.error(
        "제품 통계 조회 오류:",
        statsError,
      );
    }

    const rows = statsRows || [];

    return NextResponse.json({
      ok: true,
      products: products || [],
      brands,

      stats: {
        total: rows.length,

        available: rows.filter(
          (row) =>
            row.is_order_available === true,
        ).length,

        unavailable: rows.filter(
          (row) =>
            row.is_order_available !== true,
        ).length,

        inStock: rows.filter(
          (row) =>
            row.stock_status === "in_stock",
        ).length,

        soldOut: rows.filter(
          (row) =>
            row.stock_status === "sold_out",
        ).length,

        priceMissing: rows.filter(
          (row) =>
            row.dealer_price_per_m === null ||
            row.dealer_price_per_m ===
              undefined,
        ).length,
      },

      pagination: {
        page,
        limit,
        total: count || 0,

        totalPages: Math.max(
          1,
          Math.ceil((count || 0) / limit),
        ),
      },
    });
  } catch (error) {
    console.error(
      "자재 판매관리 조회 오류:",
      error,
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          error?.message ||
          "제품 목록을 불러오지 못했습니다.",
      },
      {
        status: 500,
      },
    );
  }
}

export async function PATCH(request) {
  try {
    const auth =
      await requireSuperAdmin(request);

    if (!auth.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: auth.error,
        },
        {
          status: auth.status,
        },
      );
    }

    const body = await request.json();

    const scope =
      body?.scope === "brand"
        ? "brand"
        : "selected";

    const brand = cleanText(
      body?.brand,
      100,
    );

    const productIds = normalizeIds(
      body?.productIds,
    );

    const changes = normalizeChanges(
      body?.changes,
    );

    let targetQuery = auth.supabase
      .from("film_products")
      .select(
        "id, brand, product_code, dealer_price_per_m",
      );

    if (scope === "brand") {
      if (!brand) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "전체 적용할 브랜드를 선택해주세요.",
          },
          {
            status: 400,
          },
        );
      }

      targetQuery =
        targetQuery.eq("brand", brand);
    } else {
      if (productIds.length === 0) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "변경할 제품을 선택해주세요.",
          },
          {
            status: 400,
          },
        );
      }

      targetQuery =
        targetQuery.in("id", productIds);
    }

    const {
      data: targetProducts,
      error: targetError,
    } = await targetQuery;

    if (targetError) {
      console.error(
        "변경 대상 조회 오류:",
        targetError,
      );

      return NextResponse.json(
        {
          ok: false,
          error:
            "변경할 제품을 확인하지 못했습니다.",
          detail: targetError.message,
        },
        {
          status: 500,
        },
      );
    }

    if (!targetProducts?.length) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "변경할 제품을 찾을 수 없습니다.",
        },
        {
          status: 404,
        },
      );
    }

    if (
      changes.is_order_available === true &&
      !Object.prototype.hasOwnProperty.call(
        changes,
        "dealer_price_per_m",
      )
    ) {
      const missingPrice =
        targetProducts.find(
          (product) =>
            !Number(
              product.dealer_price_per_m,
            ) ||
            Number(
              product.dealer_price_per_m,
            ) <= 0,
        );

      if (missingPrice) {
        return NextResponse.json(
          {
            ok: false,
            error:
              `${missingPrice.product_code} 제품의 ` +
              "판매단가가 등록되지 않았습니다.",
          },
          {
            status: 400,
          },
        );
      }
    }

    const targetIds = targetProducts.map(
      (product) => product.id,
    );

    const {
      data: updatedProducts,
      error: updateError,
    } = await auth.supabase
      .from("film_products")
      .update(changes)
      .in("id", targetIds)
      .select(
        [
          "id",
          "brand",
          "product_code",
          "is_order_available",
          "stock_status",
          "dealer_price_per_m",
          "minimum_order_m",
          "order_unit_m",
        ].join(","),
      );

    if (updateError) {
      console.error(
        "제품 판매설정 변경 오류:",
        updateError,
      );

      return NextResponse.json(
        {
          ok: false,
          error:
            "판매설정을 저장하지 못했습니다.",
          detail: updateError.message,
        },
        {
          status: 500,
        },
      );
    }

    const updatedCount =
      updatedProducts?.length || 0;

    if (
      updatedCount !== targetProducts.length
    ) {
      console.error(
        "제품 변경 건수 불일치:",
        {
          expected: targetProducts.length,
          updated: updatedCount,
        },
      );

      return NextResponse.json(
        {
          ok: false,
          error:
            `저장 결과를 확인하지 못했습니다. ` +
            `대상 ${targetProducts.length}개, ` +
            `변경 ${updatedCount}개`,
        },
        {
          status: 500,
        },
      );
    }

    return NextResponse.json({
      ok: true,

      message:
        `${updatedCount}개 제품의 ` +
        "설정을 저장했습니다.",

      updatedCount,
      scope,
      brand:
        scope === "brand"
          ? brand
          : targetProducts[0]?.brand || null,

      products: updatedProducts,
    });
  } catch (error) {
    console.error(
      "자재 판매관리 저장 오류:",
      error,
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          error?.message ||
          "판매설정을 저장하지 못했습니다.",
      },
      {
        status: 400,
      },
    );
  }
}
