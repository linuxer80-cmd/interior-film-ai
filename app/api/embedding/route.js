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

export async function POST(request) {
  try {
    const token = request.headers
      .get("authorization")
      ?.match(/^Bearer\s+(.+)$/i)?.[1]
      ?.trim();

    if (!token) {
      return json(
        { error: "관리자 로그인이 필요합니다." },
        401
      );
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key || !process.env.OPENAI_API_KEY) {
      return json(
        { error: "서버 설정을 확인해주세요." },
        503
      );
    }

    const db = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const {
      data: auth,
      error: authError,
    } = await db.auth.getUser(token);

    if (authError || !auth?.user) {
      return json(
        { error: "로그인이 만료되었습니다." },
        401
      );
    }

    const {
      data: admin,
      error: adminError,
    } = await db
      .from("super_admins")
      .select("user_id")
      .eq("user_id", auth.user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (adminError) throw adminError;

    if (!admin) {
      const {
        data: profile,
        error: profileError,
      } = await db
        .from("profiles")
        .select("company_id,role,is_active")
        .eq("id", auth.user.id)
        .maybeSingle();

      if (profileError) throw profileError;

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

      const {
        data: company,
        error: companyError,
      } = await db
        .from("companies")
        .select("id,is_active")
        .eq("id", profile.company_id)
        .maybeSingle();

      if (companyError) throw companyError;

      if (!company || company.is_active === false) {
        return json(
          { error: "사용할 수 없는 업체입니다." },
          403
        );
      }
    }

    let body;

    try {
      body = await request.json();
    } catch {
      return json(
        { error: "요청 형식이 올바르지 않습니다." },
        400
      );
    }

    const text =
      typeof body?.text === "string"
        ? body.text.trim()
        : "";

    if (!text || text.length > 8000) {
      return json(
        {
          error:
            "분석할 내용은 1~8,000자로 입력해주세요.",
        },
        400
      );
    }

    const response = await fetch(
      "https://api.openai.com/v1/embeddings",
      {
        method: "POST",
        signal: AbortSignal.timeout(45000),
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "text-embedding-3-small",
          input: text,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error(
        "Embedding provider error:",
        response.status
      );

      return json(
        {
          error:
            "임베딩 생성에 실패했습니다. 잠시 후 다시 시도해주세요.",
        },
        response.status === 429 ? 429 : 502
      );
    }

    const embedding = data?.data?.[0]?.embedding;

    if (
      !Array.isArray(embedding) ||
      embedding.length !== 1536 ||
      !embedding.every(Number.isFinite)
    ) {
      return json(
        {
          error:
            "올바른 임베딩 결과를 받지 못했습니다.",
        },
        502
      );
    }

    return json({
      success: true,
      embedding,
      dimensions: embedding.length,
    });
  } catch (error) {
    console.error(
      "Embedding route error:",
      error?.name,
      error?.code
    );

    return json(
      {
        error:
          "임베딩을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.",
      },
      503
    );
  }
}
