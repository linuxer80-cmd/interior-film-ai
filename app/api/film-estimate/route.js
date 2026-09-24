import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/*
 * =========================================================
 * 기존 app/utils/estimatePrice.js와 동일한 계산 기준
 * =========================================================
 *
 * AI 기본견적:
 * SOLID 비방염 11,000원/m 기준
 *
 * 전체 견적:
 * 70% = 인건비 + 기타
 * 30% = 필름 자재비
 *
 * 중요:
 * 실제 필름 단가는 이 서버 내부에서만 사용하고
 * 브라우저 응답에는 절대 포함하지 않습니다.
 */

const MATERIAL_COST_RATIO = 0.3;
const LABOR_OTHER_RATIO = 0.7;
const SOLID_BASE_PRICE = 11000;

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

function normalizeFireType(value) {
  return value === "fire"
    ? "fire"
    : "non_fire";
}

function toFiniteNumber(value) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : 0;
}

function roundToThousand(value) {
  return (
    Math.round(
      toFiniteNumber(value) / 1000
    ) * 1000
  );
}

/*
 * =========================================================
 * 기존 adjustEstimateByFilm과 동일한 계산
 * =========================================================
 */

function adjustPrice(
  basePrice,
  selectedMaterialPrice
) {
  const price =
    toFiniteNumber(basePrice);

  /*
   * 기존 로직:
   * 기본금액이 없으면 1,000원 단위 반올림 후 반환
   */
  if (!price) {
    return roundToThousand(price);
  }

  /*
   * 기존 로직:
   * 선택 조건의 가격정보가 없으면
   * AI 기본견적을 그대로 유지
   */
  if (!selectedMaterialPrice) {
    return roundToThousand(price);
  }

  const laborAndOther =
    price * LABOR_OTHER_RATIO;

  const materialBase =
    price * MATERIAL_COST_RATIO;

  const materialRatio =
    selectedMaterialPrice /
    SOLID_BASE_PRICE;

  const adjustedMaterial =
    materialBase * materialRatio;

  const result =
    laborAndOther +
    adjustedMaterial;

  return roundToThousand(result);
}

function normalizeEstimate(value) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return null;
  }

  return {
    min: toFiniteNumber(value.min),
    max: toFiniteNumber(value.max),
    average: toFiniteNumber(
      value.average
    ),
  };
}

function adjustEstimate(
  estimate,
  selectedMaterialPrice
) {
  const normalized =
    normalizeEstimate(estimate);

  if (!normalized) {
    return null;
  }

  return {
    min: adjustPrice(
      normalized.min,
      selectedMaterialPrice
    ),

    max: adjustPrice(
      normalized.max,
      selectedMaterialPrice
    ),

    average: adjustPrice(
      normalized.average,
      selectedMaterialPrice
    ),
  };
}

function sanitizeGroupEstimate(group) {
  if (
    !group ||
    typeof group !== "object" ||
    Array.isArray(group)
  ) {
    return null;
  }

  const estimate =
    normalizeEstimate(group.estimate);

  if (!estimate) {
    return null;
  }

  /*
   * 서버가 다시 돌려줄 때 사용할 식별값만 보관합니다.
   * 브라우저가 보낸 임의 객체 전체를 그대로 반환하지 않습니다.
   */
  return {
    key:
      group.key === null ||
      group.key === undefined
        ? null
        : String(group.key),

    estimate,
  };
}

async function findFilm(
  supabase,
  {
    productId,
    brand,
    productCode,
  }
) {
  /*
   * 가격 계산에 필요한 컬럼만 서버에서 조회합니다.
   *
   * 이 값들은 API 응답으로 보내지 않습니다.
   */
  let query = supabase
    .from("film_products")
    .select(
      [
        "id",
        "brand",
        "product_code",
        "product_name",
        "fire_price_per_meter",
        "non_fire_price_per_meter",
      ].join(",")
    )
    .eq("is_active", true);

  if (productId) {
    query = query.eq(
      "id",
      productId
    );
  } else {
    if (!brand || !productCode) {
      return null;
    }

    query = query
      .eq("brand", brand)
      .eq(
        "product_code",
        productCode
      );
  }

  const { data, error } =
    await query
      .limit(1)
      .maybeSingle();

  if (error) {
    throw new Error(
      `필름 가격 조회 실패: ${
        error.message ||
        "알 수 없는 오류"
      }`
    );
  }

  return data || null;
}

export async function POST(request) {
  try {
    let body;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          success: false,
          error:
            "요청 데이터 형식이 올바르지 않습니다.",
        },
        {
          status: 400,
        }
      );
    }

    const productId = String(
      body?.product_id || ""
    ).trim();

    const brand = String(
      body?.brand || ""
    ).trim();

    const productCode = String(
      body?.product_code || ""
    ).trim();

    const fireType =
      normalizeFireType(
        body?.fire_type
      );

    /*
     * product_id가 있으면 그것을 우선 사용합니다.
     * 없을 경우 brand + product_code로 조회합니다.
     */
    if (
      !productId &&
      (!brand || !productCode)
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "필름 제품 정보가 없습니다.",
        },
        {
          status: 400,
        }
      );
    }

    const supabase =
      getAdminSupabase();

    const film =
      await findFilm(
        supabase,
        {
          productId,
          brand,
          productCode,
        }
      );

    if (!film) {
      return NextResponse.json(
        {
          success: false,
          error:
            "선택한 필름 제품을 찾을 수 없습니다.",
        },
        {
          status: 404,
        }
      );
    }

    /*
     * 실제 내부단가는 여기에서만 읽습니다.
     */
    const firePrice =
      toFiniteNumber(
        film.fire_price_per_meter
      );

    const nonFirePrice =
      toFiniteNumber(
        film.non_fire_price_per_meter
      );

    const fireAvailable =
      firePrice > 0;

    const nonFireAvailable =
      nonFirePrice > 0;

    const selectedMaterialPrice =
      fireType === "fire"
        ? firePrice
        : nonFirePrice;

    const selectedPriceAvailable =
      selectedMaterialPrice > 0;

    /*
     * =======================================================
     * 총 견적 계산
     * =======================================================
     */

    const baseEstimate =
      normalizeEstimate(
        body?.base_estimate
      );

    const adjustedEstimate =
      baseEstimate
        ? adjustEstimate(
            baseEstimate,
            selectedMaterialPrice
          )
        : null;

    /*
     * =======================================================
     * 부위별 견적 계산
     * =======================================================
     *
     * CustomerEstimatePage의 기존 displayGroups 계산을
     * 서버에서 동일하게 처리하기 위한 값입니다.
     */

    const requestedGroups =
      Array.isArray(body?.groups)
        ? body.groups
        : [];

    const adjustedGroups =
      requestedGroups
        .map(
          sanitizeGroupEstimate
        )
        .filter(Boolean)
        .map((group) => ({
          key: group.key,

          estimate:
            adjustEstimate(
              group.estimate,
              selectedMaterialPrice
            ),
        }));

    /*
     * =======================================================
     * 공개 응답
     * =======================================================
     *
     * 절대 반환하지 않는 값:
     *
     * fire_price_per_meter
     * non_fire_price_per_meter
     * material_price_per_meter
     * price_multiplier
     * additional_cost
     *
     * selectedMaterialPrice 역시 반환하지 않습니다.
     */

    return NextResponse.json(
      {
        success: true,

        film: {
          id: film.id,
          brand: film.brand,
          product_code:
            film.product_code,
          product_name:
            film.product_name,

          fire_available:
            fireAvailable,

          non_fire_available:
            nonFireAvailable,
        },

        fire_type: fireType,

        selected_price_available:
          selectedPriceAvailable,

        base_estimate:
          baseEstimate,

        adjusted_estimate:
          adjustedEstimate,

        adjusted_groups:
          adjustedGroups,
      },
      {
        status: 200,

        /*
         * 견적 계산 결과는 사용자 입력에 따라 달라지므로
         * 공유 캐시에 저장하지 않습니다.
         */
        headers: {
          "Cache-Control":
            "no-store",
        },
      }
    );
  } catch (error) {
    console.error(
      "film-estimate API 오류:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error?.message ||
          "필름 적용 견적을 계산하지 못했습니다.",
      },
      {
        status: 500,
      }
    );
  }
        }
