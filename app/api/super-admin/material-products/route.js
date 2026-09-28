import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function createServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase 서버 환경변수가 설정되지 않았습니다.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function getAccessToken(request) {
  const authorization = request.headers.get("authorization") || "";

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

  const { data: superAdmin, error: adminError } = await supabase
    .from("super_admins")
    .select("user_id, is_active")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (adminError) {
    console.error("슈퍼관리자 확인 오류:", adminError);

    return {
      ok: false,
      status: 500,
      error: "슈퍼관리자 권한을 확인하지 못했습니다.",
    };
  }

  if (!superAdmin) {
    return {
      ok: false,
      status: 403,
      error: "슈퍼관리자만 사용할 수 있습니다.",
    };
  }

  return {
    ok: true,
    user,
    supabase,
  };
}

function normalizePositiveNumber(value, fieldName) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue) || numberValue <= 0) {
    throw new Error(`${fieldName}은 0보다 큰 숫자여야 합니다.`);
  }

  return numberValue;
}

function normalizePrice(value) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue) || numberValue < 0) {
    throw new Error("판매단가는 0 이상의 숫자여야 합니다.");
  }

  return Math.round(numberValue);
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
            typeof item === "number"
        )
        .map((item) => item),
    ),
  ].slice(0, 500);
}

/**
 * GET
 *
 * 슈퍼관리자 판매관리 화면에서 사용할 제품 목록 조회
 *
 * 예:
 * /api/super-admin/material-products?brand=현대보닥
 * /api/super-admin/material-products?brand=현대보닥&search=GS115
 * /api/super-admin/material-products?brand=현대보닥&page=1&limit=50
 */
export async function GET(request) {
  try {
    const auth = await requireSuperAdmin(request);

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

    const { searchParams } = new URL(request.url);

    const brand = (
      searchParams.get("brand") || "현대보닥"
    ).trim();

    const search = (
      searchParams.get("search") || ""
    ).trim();

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
      Number.isInteger(requestedPage) && requestedPage > 0
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
      const safeSearch = search
        .replaceAll(",", " ")
        .replaceAll("%", "")
        .trim();

      if (safeSearch) {
        query = query.or(
          [
            `product_code.ilike.%${safeSearch}%`,
            `product_name.ilike.%${safeSearch}%`,
            `color_description.ilike.%${safeSearch}%`,
          ].join(","),
        );
      }
    }

    if (saleFilter === "available") {
      query = query.eq("is_order_available", true);
    }

    if (saleFilter === "unavailable") {
      query = query.eq("is_order_available", false);
    }

    if (stockFilter === "in_stock") {
      query = query.eq("stock_status", "in_stock");
    }

    if (stockFilter === "sold_out") {
      query = query.eq("stock_status", "sold_out");
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
      console.error("제품 목록 조회 오류:", productsError);

      return NextResponse.json(
        {
          ok: false,
          error: "제품 목록을 불러오지 못했습니다.",
          detail: productsError.message,
        },
        {
          status: 500,
        },
      );
    }

    const { data: brandRows, error: brandError } =
      await auth.supabase
        .from("film_products")
        .select("brand")
        .not("dealer_price_per_m", "is", null)
        .order("brand", {
          ascending: true,
        });

    if (brandError) {
      console.error("브랜드 목록 조회 오류:", brandError);
    }

    const brands = [
      ...new Set(
        (brandRows || [])
          .map((row) => row.brand)
          .filter(Boolean),
      ),
    ];

    const { data: allBrandProducts, error: statsError } =
      await auth.supabase
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
      console.error("제품 통계 조회 오류:", statsError);
    }

    const brandProducts = allBrandProducts || [];

    const stats = {
      total: brandProducts.length,

      available: brandProducts.filter(
        (product) =>
          product.is_order_available === true,
      ).length,

      unavailable: brandProducts.filter(
        (product) =>
          product.is_order_available !== true,
      ).length,

      inStock: brandProducts.filter(
        (product) =>
          product.stock_status === "in_stock",
      ).length,

      soldOut: brandProducts.filter(
        (product) =>
          product.stock_status === "sold_out",
      ).length,

      priceMissing: brandProducts.filter(
        (product) =>
          product.dealer_price_per_m === null ||
          product.dealer_price_per_m === undefined,
      ).length,
    };

    return NextResponse.json({
      ok: true,
      products: products || [],
      brands,
      stats,
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
    console.error("자재 판매관리 조회 오류:", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error?.message ||
          "자재 판매관리 정보를 불러오지 못했습니다.",
      },
      {
        status: 500,
      },
    );
  }
}

/**
 * PATCH
 *
 * 선택 제품의 판매 여부, 판매단가, 재고,
 * 최소 주문량과 주문 단위를 일괄 변경
 *
 * 요청 예:
 * {
 *   "productIds": [1, 2, 3],
 *   "changes": {
 *     "is_order_available": true,
 *     "dealer_price_per_m": 7000,
 *     "stock_status": "in_stock",
 *     "minimum_order_m": 1,
 *     "order_unit_m": 1,
 *     "price_vat_included": false
 *   }
 * }
 */
export async function PATCH(request) {
  try {
    const auth = await requireSuperAdmin(request);

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

    const productIds = normalizeIds(body?.productIds);
    const requestedChanges = body?.changes;

    if (productIds.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "변경할 제품을 선택해주세요.",
        },
        {
          status: 400,
        },
      );
    }

    if (
      !requestedChanges ||
      typeof requestedChanges !== "object" ||
      Array.isArray(requestedChanges)
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "변경할 내용을 입력해주세요.",
        },
        {
          status: 400,
        },
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
      changes.dealer_price_per_m = normalizePrice(
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
        requestedChanges.price_vat_included === true;
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
        return NextResponse.json(
          {
            ok: false,
            error: "재고 상태가 올바르지 않습니다.",
          },
          {
            status: 400,
          },
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
      return NextResponse.json(
        {
          ok: false,
          error: "변경할 항목이 없습니다.",
        },
        {
          status: 400,
        },
      );
    }

    if (
      changes.is_order_available === true &&
      Object.prototype.hasOwnProperty.call(
        changes,
        "dealer_price_per_m",
      ) &&
      changes.dealer_price_per_m <= 0
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "판매 가능한 제품의 판매단가는 0원보다 커야 합니다.",
        },
        {
          status: 400,
        },
      );
    }

    changes.order_price_updated_at = new Date().toISOString();

    const {
      data: existingProducts,
      error: existingError,
    } = await auth.supabase
      .from("film_products")
      .select(
        "id, brand, product_code, dealer_price_per_m",
      )
      .in("id", productIds);

    if (existingError) {
      console.error("변경 대상 조회 오류:", existingError);

      return NextResponse.json(
        {
          ok: false,
          error: "변경할 제품을 확인하지 못했습니다.",
        },
        {
          status: 500,
        },
      );
    }

    if (
      !existingProducts ||
      existingProducts.length !== productIds.length
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "선택한 제품 중 존재하지 않는 제품이 있습니다.",
        },
        {
          status: 400,
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
      const missingPriceProduct =
        existingProducts.find(
          (product) =>
            !Number(product.dealer_price_per_m) ||
            Number(product.dealer_price_per_m) <= 0,
        );

      if (missingPriceProduct) {
        return NextResponse.json(
          {
            ok: false,
            error:
              `${missingPriceProduct.product_code} 제품의 ` +
              "판매단가가 등록되지 않았습니다.",
          },
          {
            status: 400,
          },
        );
      }
    }

    const { data: updatedProducts, error: updateError } =
      await auth.supabase
        .from("film_products")
        .update(changes)
        .in("id", productIds)
        .select("*");

    if (updateError) {
      console.error("제품 판매설정 변경 오류:", updateError);

      return NextResponse.json(
        {
          ok: false,
          error: "판매설정을 저장하지 못했습니다.",
          detail: updateError.message,
        },
        {
          status: 500,
        },
      );
    }

    return NextResponse.json({
      ok: true,
      message: `${updatedProducts?.length || 0}개 제품의 설정을 저장했습니다.`,
      products: updatedProducts || [],
    });
  } catch (error) {
    console.error("자재 판매관리 저장 오류:", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error?.message ||
          "판매설정을 저장하지 못했습니다.",
      },
      {
        status: 500,
      },
    );
  }
}
