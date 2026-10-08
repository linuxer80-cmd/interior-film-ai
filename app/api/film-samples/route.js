import { createClient } from "@supabase/supabase-js";
import { matchSample } from "../../utils/filmSample.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control":
        status === 200
          ? "public, max-age=300"
          : "no-store",
    },
  });

const fields = "id,brand,product_code,sample_image_path";

const uuid = (value) =>
  /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(
    value
  );

export async function GET(request) {
  try {
    const params = new URL(request.url).searchParams;

    const id = params.get("id") || "";
    const brand = (params.get("brand") || "").trim();
    const code = (params.get("code") || "").trim();

    if (
      (id && !uuid(id)) ||
      brand.length > 100 ||
      code.length > 100 ||
      (!id && (!brand || !code))
    ) {
      return json(
        { error: "제품 정보를 확인해주세요." },
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

    // 기존 공개 카탈로그와 동일하게 활성 제품의
    // 샘플 경로만 제공합니다. 가격 정보는 반환하지 않습니다.
    if (id) {
      const { data, error } = await db
        .from("film_products")
        .select(fields)
        .eq("is_active", true)
        .eq("id", id)
        .maybeSingle();

      if (error) throw error;

      if (data?.sample_image_path) {
        return json({ path: data.sample_image_path });
      }
    }

    if (!brand || !code) {
      return json({ path: null });
    }

    // %, _ 문자를 검색 와일드카드로 처리하지 않습니다.
    const literal = code.replace(
      /[\\%_]/g,
      (char) => "\\" + char
    );

    const { data, error } = await db
      .from("film_products")
      .select(fields)
      .eq("is_active", true)
      .ilike("product_code", literal)
      .order("id")
      .limit(101);

    if (error) throw error;

    if (data.length > 100) {
      return json({ path: null });
    }

    return json({
      path: matchSample(data, brand, code),
    });
  } catch (error) {
    console.error(
      "film-samples",
      error.code || error.message
    );

    return json(
      { error: "샘플 사진을 불러오지 못했습니다." },
      500
    );
  }
}
