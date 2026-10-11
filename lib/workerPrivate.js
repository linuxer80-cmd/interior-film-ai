import { createClient } from "@supabase/supabase-js";

export const privateFields = [
  "bank_name",
  "account_number",
  "account_holder",
  "departure_address",
];

export const uuid = value =>
  typeof value === "string" &&
  /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);

export const privateJson = (body, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
    },
  });

export function cleanPrivate(body) {
  const result = {};

  for (const field of privateFields) {
    if (typeof body[field] !== "string") {
      throw Error("계좌와 출발 주소 입력을 확인해주세요.");
    }

    result[field] = body[field].trim();

    if (
      result[field].length >
      (field === "departure_address" ? 300 : 100)
    ) {
      throw Error("입력 내용이 너무 깁니다.");
    }
  }

  if (
    result.account_number &&
    !/^[0-9 -]{3,50}$/.test(result.account_number)
  ) {
    throw Error(
      "계좌번호는 숫자·공백·하이픈으로 입력해주세요.",
    );
  }

  if (
    result.account_number &&
    (!result.bank_name || !result.account_holder)
  ) {
    throw Error("은행명과 예금주도 입력해주세요.");
  }

  return result;
}

export async function privateAuth(request, ownerOnly = true) {
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer (.+)$/i)?.[1];

  if (!token) {
    return {
      error: "로그인이 필요합니다.",
      status: 401,
    };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return {
      error: "서버 설정을 확인해주세요.",
      status: 503,
    };
  }

  const db = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const {
    data: { user },
    error,
  } = await db.auth.getUser(token);

  if (error || !user) {
    return {
      error: "로그인을 다시 해주세요.",
      status: 401,
    };
  }

  if (!ownerOnly) return { db, user };

  const profile = await db
    .from("profiles")
    .select("company_id,role,is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (profile.error) throw profile.error;

  if (
    !profile.data?.company_id ||
    profile.data.role !== "owner" ||
    profile.data.is_active === false
  ) {
    return {
      error: "관리자 권한이 필요합니다.",
      status: 403,
    };
  }

  const company = await db
    .from("companies")
    .select("id,is_active")
    .eq("id", profile.data.company_id)
    .maybeSingle();

  if (company.error) throw company.error;

  if (!company.data || company.data.is_active === false) {
    return {
      error: "업체를 확인해주세요.",
      status: 403,
    };
  }

  return {
    db,
    user,
    companyId: profile.data.company_id,
  };
}

export function privateError(error) {
  if (["42P01", "PGRST205"].includes(error?.code)) {
    return "시공자 계좌·주소 저장용 SQL을 먼저 실행해주세요.";
  }

  return "시공자 계좌·주소를 처리하지 못했습니다. 다시 시도해주세요.";
}
