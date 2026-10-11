import {
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const INSTALLED = Symbol.for(
  "film.ai.quota.v1"
);

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const fault = (
  message,
  code = "AI_QUOTA_UNAVAILABLE",
  status = 503
) =>
  Object.assign(new Error(message), {
    code,
    status,
  });

function database() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw fault(
      "AI 사용량 서버 설정을 확인해주세요."
    );
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function decodeAiContext(
  headers,
  secret,
  now = Date.now()
) {
  const raw =
    headers.get("x-film-ai-context") || "";

  const signature =
    headers.get("x-film-ai-signature") || "";

  if (
    !secret ||
    !raw ||
    raw.length > 2000 ||
    !/^[a-f0-9]{64}$/.test(signature)
  ) {
    throw fault(
      "AI 요청의 업체 및 사용량 정보를 확인할 수 없습니다."
    );
  }

  const expected = createHmac(
    "sha256",
    secret
  )
    .update(raw)
    .digest();

  if (
    !timingSafeEqual(
      expected,
      Buffer.from(signature, "hex")
    )
  ) {
    throw fault(
      "AI 요청 인증에 실패했습니다."
    );
  }

  let value;

  try {
    value = JSON.parse(raw);
  } catch {
    throw fault(
      "AI 요청 정보가 올바르지 않습니다."
    );
  }

  if (
    value.version !== 1 ||
    !uuid.test(value.requestId || "") ||
    !value.feature ||
    !Number.isInteger(value.units) ||
    value.units < 1 ||
    value.units > 30 ||
    !Number.isFinite(value.createdAt) ||
    now - value.createdAt > 300000 ||
    value.createdAt > now + 10000
  ) {
    throw fault(
      "AI 요청 정보가 만료되었거나 올바르지 않습니다."
    );
  }

  return value;
}

async function resolveScope(
  db,
  context,
  headers
) {
  if (
    context.public &&
    context.companySlug &&
    /^[a-z0-9-]+$/.test(context.companySlug)
  ) {
    const { data, error } = await db
      .from("companies")
      .select("id,is_active")
      .eq("slug", context.companySlug)
      .maybeSingle();

    if (
      error ||
      !data ||
      data.is_active === false
    ) {
      throw fault(
        "사용할 수 있는 업체를 확인해주세요.",
        "AI_COMPANY_NOT_FOUND",
        403
      );
    }

    return data.id;
  }

  const token = (
    headers.get("authorization") || ""
  ).match(/^Bearer\s+(.+)$/i)?.[1];

  if (!token) {
    throw fault(
      "AI 사용에는 로그인이 필요합니다.",
      "AI_AUTH_REQUIRED",
      401
    );
  }

  const {
    data: auth,
    error: authError,
  } = await db.auth.getUser(token);

  if (authError || !auth?.user) {
    throw fault(
      "다시 로그인해주세요.",
      "AI_AUTH_REQUIRED",
      401
    );
  }

  const userId = auth.user.id;

  const {
    data: profile,
    error: profileError,
  } = await db
    .from("profiles")
    .select("company_id,role,is_active")
    .eq("id", userId)
    .maybeSingle();

  if (
    profileError ||
    profile?.is_active === false
  ) {
    throw fault(
      "사용 가능한 계정을 확인해주세요.",
      "AI_ACCOUNT_INACTIVE",
      403
    );
  }

  if (context.worker) {
    const {
      data: workers,
      error,
    } = await db
      .from("workers")
      .select("id,company_id")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("id");

    if (error || !workers?.length) {
      throw fault(
        "연결된 시공자 업체가 없습니다.",
        "AI_COMPANY_NOT_FOUND",
        403
      );
    }

    if (context.siteId) {
      if (!uuid.test(context.siteId)) {
        throw fault(
          "현장 정보를 확인해주세요.",
          "AI_SITE_INVALID",
          400
        );
      }

      const {
        data: site,
        error: siteError,
      } = await db
        .from("sites")
        .select("company_id")
        .eq("id", context.siteId)
        .maybeSingle();

      if (
        siteError ||
        !site ||
        !workers.some(
          (worker) =>
            worker.company_id ===
            site.company_id
        )
      ) {
        throw fault(
          "소속 현장 정보를 확인해주세요.",
          "AI_SITE_INVALID",
          403
        );
      }

      return site.company_id;
    }

    const ids = [
      ...new Set(
        workers.map(
          (worker) => worker.company_id
        )
      ),
    ];

    const {
      data: companies,
      error: companyError,
    } = await db
      .from("companies")
      .select("id,is_active")
      .in("id", ids);

    if (companyError) {
      throw fault(
        "시공자 업체 정보를 확인하지 못했습니다."
      );
    }

    const first = workers.find(
      (worker) =>
        companies?.some(
          (company) =>
            company.id ===
              worker.company_id &&
            company.is_active !== false
        )
    );

    if (!first) {
      throw fault(
        "사용 가능한 시공자 업체가 없습니다.",
        "AI_COMPANY_NOT_FOUND",
        403
      );
    }

    return first.company_id;
  }

  const {
    data: superAdmin,
    error: superError,
  } = await db
    .from("super_admins")
    .select("user_id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  if (superError) {
    throw fault(
      "관리자 권한을 확인하지 못했습니다."
    );
  }

  if (superAdmin) {
    if (
      context.targetCompany &&
      !uuid.test(context.targetCompany)
    ) {
      throw fault(
        "대상 업체를 확인해주세요.",
        "AI_COMPANY_INVALID",
        400
      );
    }

    return context.targetCompany || null;
  }

  if (
    !profile?.company_id ||
    profile.role !== "owner"
  ) {
    throw fault(
      "업체 관리자 권한이 필요합니다.",
      "AI_OWNER_REQUIRED",
      403
    );
  }

  return profile.company_id;
}

export async function checkAiRequestQuota(
  headers
) {
  const context = decodeAiContext(
    headers,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const db = database();

  const companyId = await resolveScope(
    db,
    context,
    headers
  );

  const { data: quota, error } =
    await db.rpc(
      "reserve_ai_feature_quota",
      {
        p_company_id: companyId,
        p_request_id: context.requestId,
        p_feature: context.feature,
        p_units: context.units,
        p_reserve: false,
      }
    );

  if (error) {
    throw fault(
      "AI 횟수 제한 SQL과 서버 연결을 확인해주세요."
    );
  }

  if (!quota?.ok) {
    throw fault(
      quota?.error ||
        "이번 이용 기간의 AI 횟수를 모두 사용했습니다.",
      "AI_COUNT_LIMIT_REACHED",
      429
    );
  }
}

export function createAiQuotaFetch({
  nativeFetch,
  getHeaders,
  makeDatabase = database,
}) {
  return async function quotaFetch(
    input,
    options = {}
  ) {
    let url;

    try {
      url = new URL(
        typeof input === "string" ||
        input instanceof URL
          ? input
          : input.url
      );
    } catch {
      return nativeFetch(input, options);
    }

    if (
      url.hostname !== "api.openai.com"
    ) {
      return nativeFetch(input, options);
    }

    try {
      const headers = await getHeaders();

      const context = decodeAiContext(
        headers,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );

      const db = makeDatabase();

      const companyId = await resolveScope(
        db,
        context,
        headers
      );

      const { data: quota, error } =
        await db.rpc(
          "reserve_ai_feature_quota",
          {
            p_company_id: companyId,
            p_request_id: context.requestId,
            p_feature: context.feature,
            p_units: context.units,
          }
        );

      if (error) {
        throw fault(
          "AI 횟수 제한 SQL과 서버 연결을 확인해주세요."
        );
      }

      if (!quota?.ok) {
        throw fault(
          quota?.error ||
            "이번 이용 기간의 AI 횟수를 모두 사용했습니다.",
          "AI_COUNT_LIMIT_REACHED",
          429
        );
      }

      // 유료 API 호출 직전에 횟수를 예약합니다.
      const response = await nativeFetch(
        input,
        options
      );

      // 실제 API 사용량을 저장합니다.
      // 발생 비용으로 이용을 차단하지 않습니다.
      try {
        const result =
          await response.clone().json();

        let model = result.model || "";

        if (
          !model &&
          typeof options.body === "string"
        ) {
          model =
            JSON.parse(options.body).model ||
            "";
        }

        if (
          !model &&
          options.body instanceof FormData
        ) {
          model =
            options.body.get("model") || "";
        }

        const {
          error: recordError,
        } = await db.rpc(
          "record_ai_feature_call",
          {
            p_request_id: context.requestId,
            p_model: model,
            p_status: response.status,
            p_usage: result.usage || {},
          }
        );

        if (recordError) {
          console.error(
            "AI usage recording failed",
            recordError.code
          );
        }
      } catch {
        console.warn(
          "AI usage response could not be recorded"
        );
      }

      return response;
    } catch (error) {
      return Response.json(
        {
          error: {
            message: error.status
              ? error.message
              : "AI 연결 또는 횟수 확인에 실패했습니다.",
            code:
              error.code ||
              "AI_QUOTA_UNAVAILABLE",
          },
          code:
            error.code ||
            "AI_QUOTA_UNAVAILABLE",
        },
        { status: error.status || 503 }
      );
    }
  };
}

export function installAiQuota() {
  if (globalThis[INSTALLED]) return;

  globalThis.fetch = createAiQuotaFetch({
    nativeFetch:
      globalThis.fetch.bind(globalThis),
    getHeaders: async () => {
      const { headers } = await import(
        "next/headers"
      );

      return headers();
    },
  });

  globalThis[INSTALLED] = true;
    }
