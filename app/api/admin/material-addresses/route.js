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

function cleanText(value, maxLength = 200) {
  return String(value || "")
    .trim()
    .slice(0, maxLength);
}

function normalizePhone(value) {
  return cleanText(value, 30).replace(
    /[^0-9+\- ]/g,
    "",
  );
}

function validateAddress(input) {
  const address = {
    address_name:
      cleanText(input?.address_name, 50) ||
      "배송지",

    recipient_name: cleanText(
      input?.recipient_name,
      50,
    ),

    recipient_phone: normalizePhone(
      input?.recipient_phone,
    ),

    postal_code: cleanText(
      input?.postal_code,
      20,
    ),

    address_line1: cleanText(
      input?.address_line1,
      300,
    ),

    address_line2: cleanText(
      input?.address_line2,
      300,
    ),

    delivery_note: cleanText(
      input?.delivery_note,
      300,
    ),

    is_default: input?.is_default === true,
  };

  if (!address.recipient_name) {
    throw new Error("받는 분 이름을 입력해주세요.");
  }

  if (!address.recipient_phone) {
    throw new Error("받는 분 연락처를 입력해주세요.");
  }

  if (!address.address_line1) {
    throw new Error("배송 주소를 입력해주세요.");
  }

  return address;
}

async function clearDefaultAddress(
  supabase,
  companyId,
  exceptId = null,
) {
  let query = supabase
    .from("material_shipping_addresses")
    .update({
      is_default: false,
      updated_at: new Date().toISOString(),
    })
    .eq("company_id", companyId)
    .eq("is_default", true);

  if (exceptId) {
    query = query.neq("id", exceptId);
  }

  const { error } = await query;

  if (error) {
    throw new Error(
      "기본 배송지를 변경하지 못했습니다.",
    );
  }
}

/**
 * GET
 * 로그인한 업체의 배송지 목록
 */
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

    const { data, error } = await auth.supabase
      .from("material_shipping_addresses")
      .select("*")
      .eq(
        "company_id",
        auth.company.company_id,
      )
      .eq("is_active", true)
      .order("is_default", {
        ascending: false,
      })
      .order("created_at", {
        ascending: false,
      });

    if (error) {
      console.error(
        "배송지 목록 조회 오류:",
        error,
      );

      return NextResponse.json(
        {
          ok: false,
          error:
            "배송지 목록을 불러오지 못했습니다.",
          detail: error.message,
        },
        {
          status: 500,
        },
      );
    }

    return NextResponse.json({
      ok: true,
      addresses: data || [],
      company: {
        id: auth.company.company_id,
        name:
          auth.company.company_name || "",
      },
    });
  } catch (error) {
    console.error("배송지 GET 오류:", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error?.message ||
          "배송지 목록을 불러오지 못했습니다.",
      },
      {
        status: 500,
      },
    );
  }
}

/**
 * POST
 * 새 배송지 등록
 */
export async function POST(request) {
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

    const body = await request.json();
    const address = validateAddress(body);

    const { count, error: countError } =
      await auth.supabase
        .from("material_shipping_addresses")
        .select("id", {
          count: "exact",
          head: true,
        })
        .eq(
          "company_id",
          auth.company.company_id,
        )
        .eq("is_active", true);

    if (countError) {
      console.error(
        "배송지 개수 확인 오류:",
        countError,
      );
    }

    const shouldBeDefault =
      address.is_default || Number(count || 0) === 0;

    if (shouldBeDefault) {
      await clearDefaultAddress(
        auth.supabase,
        auth.company.company_id,
      );
    }

    const { data, error } = await auth.supabase
      .from("material_shipping_addresses")
      .insert({
        company_id:
          auth.company.company_id,

        created_by: auth.user.id,

        ...address,

        is_default: shouldBeDefault,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (error) {
      console.error("배송지 등록 오류:", error);

      return NextResponse.json(
        {
          ok: false,
          error: "배송지를 등록하지 못했습니다.",
          detail: error.message,
        },
        {
          status: 500,
        },
      );
    }

    return NextResponse.json({
      ok: true,
      message: "배송지를 등록했습니다.",
      address: data,
    });
  } catch (error) {
    console.error("배송지 POST 오류:", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error?.message ||
          "배송지를 등록하지 못했습니다.",
      },
      {
        status: 400,
      },
    );
  }
}

/**
 * PATCH
 * 배송지 수정 또는 기본 배송지 설정
 *
 * 요청 예:
 * {
 *   "id": "배송지 UUID",
 *   "recipient_name": "홍길동",
 *   "recipient_phone": "010-0000-0000",
 *   "address_line1": "주소",
 *   "is_default": true
 * }
 */
export async function PATCH(request) {
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

    const body = await request.json();
    const addressId = cleanText(body?.id, 100);

    if (!addressId) {
      return NextResponse.json(
        {
          ok: false,
          error: "수정할 배송지가 없습니다.",
        },
        {
          status: 400,
        },
      );
    }

    const { data: existing, error: existingError } =
      await auth.supabase
        .from("material_shipping_addresses")
        .select("*")
        .eq("id", addressId)
        .eq(
          "company_id",
          auth.company.company_id,
        )
        .eq("is_active", true)
        .maybeSingle();

    if (existingError) {
      console.error(
        "배송지 확인 오류:",
        existingError,
      );
    }

    if (!existing) {
      return NextResponse.json(
        {
          ok: false,
          error: "배송지를 찾을 수 없습니다.",
        },
        {
          status: 404,
        },
      );
    }

    const mergedAddress = validateAddress({
      ...existing,
      ...body,
    });

    if (mergedAddress.is_default) {
      await clearDefaultAddress(
        auth.supabase,
        auth.company.company_id,
        addressId,
      );
    }

    const { data, error } = await auth.supabase
      .from("material_shipping_addresses")
      .update({
        ...mergedAddress,
        updated_at: new Date().toISOString(),
      })
      .eq("id", addressId)
      .eq(
        "company_id",
        auth.company.company_id,
      )
      .select("*")
      .single();

    if (error) {
      console.error("배송지 수정 오류:", error);

      return NextResponse.json(
        {
          ok: false,
          error: "배송지를 수정하지 못했습니다.",
          detail: error.message,
        },
        {
          status: 500,
        },
      );
    }

    return NextResponse.json({
      ok: true,
      message: "배송지를 수정했습니다.",
      address: data,
    });
  } catch (error) {
    console.error("배송지 PATCH 오류:", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error?.message ||
          "배송지를 수정하지 못했습니다.",
      },
      {
        status: 400,
      },
    );
  }
}

/**
 * DELETE
 * 실제 삭제 대신 비활성화하여 주문기록 보호
 *
 * /api/admin/material-addresses?id=배송지UUID
 */
export async function DELETE(request) {
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

    const addressId = cleanText(
      searchParams.get("id"),
      100,
    );

    if (!addressId) {
      return NextResponse.json(
        {
          ok: false,
          error: "삭제할 배송지가 없습니다.",
        },
        {
          status: 400,
        },
      );
    }

    const { data: existing, error: existingError } =
      await auth.supabase
        .from("material_shipping_addresses")
        .select("id, is_default")
        .eq("id", addressId)
        .eq(
          "company_id",
          auth.company.company_id,
        )
        .eq("is_active", true)
        .maybeSingle();

    if (existingError) {
      console.error(
        "삭제 배송지 확인 오류:",
        existingError,
      );
    }

    if (!existing) {
      return NextResponse.json(
        {
          ok: false,
          error: "배송지를 찾을 수 없습니다.",
        },
        {
          status: 404,
        },
      );
    }

    const { error } = await auth.supabase
      .from("material_shipping_addresses")
      .update({
        is_active: false,
        is_default: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", addressId)
      .eq(
        "company_id",
        auth.company.company_id,
      );

    if (error) {
      console.error("배송지 삭제 오류:", error);

      return NextResponse.json(
        {
          ok: false,
          error: "배송지를 삭제하지 못했습니다.",
          detail: error.message,
        },
        {
          status: 500,
        },
      );
    }

    if (existing.is_default) {
      const {
        data: replacement,
        error: replacementError,
      } = await auth.supabase
        .from("material_shipping_addresses")
        .select("id")
        .eq(
          "company_id",
          auth.company.company_id,
        )
        .eq("is_active", true)
        .order("created_at", {
          ascending: false,
        })
        .limit(1)
        .maybeSingle();

      if (!replacementError && replacement?.id) {
        await auth.supabase
          .from("material_shipping_addresses")
          .update({
            is_default: true,
            updated_at: new Date().toISOString(),
          })
          .eq("id", replacement.id)
          .eq(
            "company_id",
            auth.company.company_id,
          );
      }
    }

    return NextResponse.json({
      ok: true,
      message: "배송지를 삭제했습니다.",
    });
  } catch (error) {
    console.error("배송지 DELETE 오류:", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error?.message ||
          "배송지를 삭제하지 못했습니다.",
      },
      {
        status: 500,
      },
    );
  }
          }
