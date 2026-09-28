import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function createUserClient(accessToken) {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    throw new Error(
      "Supabase 공개 환경변수가 설정되지 않았습니다.",
    );
  }

  return createClient(supabaseUrl, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

function getAccessToken(request) {
  const authorization =
    request.headers.get("authorization") || "";

  if (!authorization.startsWith("Bearer ")) {
    return "";
  }

  return authorization.slice(7).trim();
}

async function requireCompanyAdmin(request) {
  const accessToken = getAccessToken(request);

  if (!accessToken) {
    return {
      ok: false,
      status: 401,
      error: "로그인이 필요합니다.",
    };
  }

  const serviceClient = createServiceClient();

  const {
    data: { user },
    error: userError,
  } = await serviceClient.auth.getUser(accessToken);

  if (userError || !user) {
    return {
      ok: false,
      status: 401,
      error: "로그인 정보가 올바르지 않습니다.",
    };
  }

  const userClient = createUserClient(accessToken);

  const {
    data: companyRows,
    error: companyError,
  } = await userClient.rpc("get_my_company");

  if (companyError) {
    console.error(
      "업체 확인 오류:",
      companyError,
    );

    return {
      ok: false,
      status: 403,
      error:
        "관리자 업체 정보를 확인하지 못했습니다.",
    };
  }

  const company = Array.isArray(companyRows)
    ? companyRows[0]
    : companyRows;

  if (!company?.company_id) {
    return {
      ok: false,
      status: 403,
      error:
        "업체에 연결된 관리자 계정이 아닙니다.",
    };
  }

  if (company.is_active === false) {
    return {
      ok: false,
      status: 403,
      error: "현재 사용이 중지된 업체입니다.",
    };
  }

  return {
    ok: true,
    user,
    company,
    supabase: serviceClient,
  };
}

export async function GET(request) {
  try {
    const auth =
      await requireCompanyAdmin(request);

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

    const brand = (
      searchParams.get("brand") || ""
    ).trim();

    const category = (
      searchParams.get("category") || ""
    ).trim();

    const search = (
      searchParams.get("search") || ""
    )
      .replaceAll(",", " ")
      .replaceAll("%", "")
      .trim();

    const requestedPage = Number(
      searchParams.get("page") || 1,
    );

    const requestedLimit = Number(
      searchParams.get("limit") || 40,
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
        : 40;

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let productsQuery = auth.supabase
      .from("film_products")
      .select("*", {
        count: "exact",
      })
      .eq("is_order_available", true)
      .eq("stock_status", "in_stock")
      .not("dealer_price_per_m", "is", null)
      .gt("dealer_price_per_m", 0);

    if (brand) {
      productsQuery =
        productsQuery.eq("brand", brand);
    }

    if (category) {
      productsQuery = productsQuery.or(
        [
          `category.eq.${category}`,
          `pattern_group.eq.${category}`,
          `texture.eq.${category}`,
        ].join(","),
      );
    }

    if (search) {
      productsQuery = productsQuery.or(
        [
          `product_code.ilike.%${search}%`,
          `product_name.ilike.%${search}%`,
          `color_description.ilike.%${search}%`,
          `color_family.ilike.%${search}%`,
        ].join(","),
      );
    }

    const {
      data: products,
      error: productsError,
      count,
    } = await productsQuery
      .order("brand", {
        ascending: true,
      })
      .order("product_code", {
        ascending: true,
      })
      .range(from, to);

    if (productsError) {
      console.error(
        "주문 가능 제품 조회 오류:",
        productsError,
      );

      return NextResponse.json(
        {
          ok: false,
          error:
            "주문 가능한 필름을 불러오지 못했습니다.",
          detail: productsError.message,
        },
        {
          status: 500,
        },
      );
    }

    const {
      data: availableRows,
      error: availableError,
    } = await auth.supabase
      .from("film_products")
      .select(
        [
          "brand",
          "category",
          "pattern_group",
          "texture",
        ].join(","),
      )
      .eq("is_order_available", true)
      .eq("stock_status", "in_stock")
      .not("dealer_price_per_m", "is", null)
      .gt("dealer_price_per_m", 0);

    if (availableError) {
      console.error(
        "주문 필터 조회 오류:",
        availableError,
      );
    }

    const filterRows = availableRows || [];

    const brands = [
      ...new Set(
        filterRows
          .map((row) => row.brand)
          .filter(Boolean),
      ),
    ].sort((a, b) =>
      a.localeCompare(b, "ko"),
    );

    const categories = [
      ...new Set(
        filterRows
          .flatMap((row) => [
            row.category,
            row.pattern_group,
            row.texture,
          ])
          .filter(Boolean),
      ),
    ].sort((a, b) =>
      a.localeCompare(b, "ko"),
    );

    return NextResponse.json({
      ok: true,

      company: {
        id: auth.company.company_id,
        name:
          auth.company.company_name || "",
        slug:
          auth.company.company_slug || "",
      },

      products: products || [],
      brands,
      categories,

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
      "관리자 자재제품 API 오류:",
      error,
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          error?.message ||
          "주문 가능한 필름을 불러오지 못했습니다.",
      },
      {
        status: 500,
      },
    );
  }
}
