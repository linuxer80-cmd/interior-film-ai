import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PAGE_SIZE = 1000;

function getAdminSupabase() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL 환경변수가 없습니다."
    );
  }

  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY 환경변수가 없습니다."
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
    }
  );
}

function hasPositivePrice(value) {
  const number = Number(value);

  return (
    Number.isFinite(number) &&
    number > 0
  );
}

function makePublicProduct(row) {
  /*
   * 중요:
   *
   * 아래 객체에 내부 가격 컬럼을 절대 추가하지 않습니다.
   *
   * 브라우저 비공개:
   * - fire_price_per_meter
   * - non_fire_price_per_meter
   * - material_price_per_meter
   * - price_multiplier
   * - additional_cost
   *
   * 고객 UI에서 필요한 것은 실제 가격이 아니라
   * 방염/비방염 선택 가능 여부뿐입니다.
   */

  return {
    id: row.id,
    brand: row.brand,
    product_code: row.product_code,
    product_name: row.product_name,

    category_key: row.category_key,
    pattern_line: row.pattern_line,

    color_family: row.color_family,
    color_description:
      row.color_description,
    color_hex: row.color_hex,

    texture: row.texture,
    grade: row.grade,

    wood_species: row.wood_species,
    tone_family: row.tone_family,

    sample_image_path:
      row.sample_image_path,

    sort_order: row.sort_order,

    fire_available:
      hasPositivePrice(
        row.fire_price_per_meter
      ),

    non_fire_available:
      hasPositivePrice(
        row.non_fire_price_per_meter
      ),
  };
}

async function loadAllActiveProducts(
  supabase
) {
  const selectColumns = [
    "id",
    "brand",
    "product_code",
    "product_name",
    "category_key",
    "pattern_line",
    "color_family",
    "color_description",
    "color_hex",
    "texture",
    "grade",
    "wood_species",
    "tone_family",
    "sample_image_path",

    /*
     * 서버 내부에서 availability 계산에만 사용합니다.
     * API 응답에는 실제 금액을 넣지 않습니다.
     */
    "fire_price_per_meter",
    "non_fire_price_per_meter",

    "sort_order",
  ].join(",");

  const rows = [];

  let from = 0;

  while (true) {
    const { data, error } =
      await supabase
        .from("film_products")
        .select(selectColumns)
        .eq("is_active", true)
        .order("brand", {
          ascending: true,
        })
        .order("sort_order", {
          ascending: true,
        })
        .order("id", {
          ascending: true,
        })
        .range(
          from,
          from + PAGE_SIZE - 1
        );

    if (error) {
      throw new Error(
        `필름 제품 조회 실패: ${
          error.message ||
          "알 수 없는 오류"
        }`
      );
    }

    const batch = data || [];

    rows.push(...batch);

    if (batch.length < PAGE_SIZE) {
      break;
    }

    from += PAGE_SIZE;
  }

  return rows;
}

export async function GET() {
  try {
    const supabase =
      getAdminSupabase();

    const rows =
      await loadAllActiveProducts(
        supabase
      );

    const products =
      rows.map(makePublicProduct);

    return NextResponse.json(
      {
        success: true,
        count: products.length,
        products,
      },
      {
        status: 200,

        /*
         * 제품 목록은 자주 바뀌지 않으므로
         * 짧은 캐시를 허용합니다.
         *
         * 실제 내부 단가는 응답에 없기 때문에
         * 캐시되어도 가격정보가 노출되지 않습니다.
         */
        headers: {
          "Cache-Control":
            "public, s-maxage=300, stale-while-revalidate=600",
        },
      }
    );
  } catch (error) {
    console.error(
      "film-products API 오류:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error?.message ||
          "필름 제품을 불러오지 못했습니다.",
      },
      {
        status: 500,
      }
    );
  }
}
