// app/utils/estimatePrice.js

/*
 * =========================================================
 * 견적 계산 기준
 * =========================================================
 *
 * AI 기본견적은
 * SOLID 비방염 11,000원/m 기준으로 계산된 견적으로 봅니다.
 *
 * 전체 견적 구성:
 *
 * 70% = 인건비 + 기타 비용
 * 30% = 필름 자재비
 *
 * 따라서 필름 종류나 방염 여부가 바뀌면
 * 전체 금액이 아니라 자재비 30%에만
 * 선택 필름의 단가 차이를 반영합니다.
 */

export const MATERIAL_COST_RATIO = 0.3;

export const LABOR_OTHER_RATIO = 0.7;

/*
 * 중요:
 *
 * 방염을 선택하더라도 기준단가는
 * SOLID 방염 15,000원이 아닙니다.
 *
 * 모든 견적의 기준은
 * SOLID 비방염 11,000원으로 고정합니다.
 */

export const SOLID_BASE_PRICE = 11000;


/*
 * =========================================================
 * 선택 필름 가격 가져오기
 * =========================================================
 */

export function getFilmPrice(
  selectedFilm,
  fireType = "non_fire"
) {
  if (!selectedFilm) {
    return 0;
  }

  if (fireType === "fire") {
    return Number(
      selectedFilm.fire_price_per_meter || 0
    );
  }

  return Number(
    selectedFilm.non_fire_price_per_meter || 0
  );
}


/*
 * =========================================================
 * 기준가격
 * =========================================================
 *
 * 어떤 필름을 선택하든
 * 어떤 방염 조건을 선택하든
 *
 * SOLID 비방염 11,000원 기준입니다.
 */

export function getSolidBasePrice() {
  return SOLID_BASE_PRICE;
}


/*
 * =========================================================
 * 가격정보 존재 여부
 * =========================================================
 */

export function hasFilmPrice(
  selectedFilm,
  fireType = "non_fire"
) {
  return (
    getFilmPrice(
      selectedFilm,
      fireType
    ) > 0
  );
}


/*
 * =========================================================
 * 선택 필름 가격비율
 * =========================================================
 *
 * 예:
 *
 * SOLID 비방염
 * 11,000 / 11,000 = 1.000
 *
 * SOLID 방염
 * 15,000 / 11,000 = 1.364
 *
 * RM 비방염
 * 17,000 / 11,000 = 1.545
 *
 * RM 방염
 * 21,000 / 11,000 = 1.909
 */

export function getMaterialPriceRatio(
  selectedFilm,
  fireType = "non_fire"
) {
  const selectedPrice =
    getFilmPrice(
      selectedFilm,
      fireType
    );

  if (!selectedPrice) {
    return 1;
  }

  return (
    selectedPrice /
    SOLID_BASE_PRICE
  );
}


/*
 * =========================================================
 * 최종 견적 계산
 * =========================================================
 *
 * 계산식:
 *
 * 최종견적
 * =
 * 기본견적 × 70%
 * +
 * 기본견적 × 30%
 * ×
 * (선택필름단가 / 11,000)
 */

export function adjustEstimateByFilm(
  basePrice,
  selectedFilm,
  fireType = "non_fire"
) {
  const price = Number(
    basePrice || 0
  );

  if (
    !price ||
    !selectedFilm
  ) {
    return Math.round(
      price / 1000
    ) * 1000;
  }

  const selectedMaterialPrice =
    getFilmPrice(
      selectedFilm,
      fireType
    );

  /*
   * 선택한 조건의 가격정보가 없으면
   * 기본 AI 견적을 그대로 유지
   */

  if (!selectedMaterialPrice) {
    return Math.round(
      price / 1000
    ) * 1000;
  }

  /*
   * 인건비 + 기타
   */

  const laborAndOther =
    price *
    LABOR_OTHER_RATIO;

  /*
   * 기본 자재비
   */

  const materialBase =
    price *
    MATERIAL_COST_RATIO;

  /*
   * SOLID 비방염 11,000원 대비
   * 선택 필름 가격비율
   */

  const materialRatio =
    selectedMaterialPrice /
    SOLID_BASE_PRICE;

  /*
   * 조정된 자재비
   */

  const adjustedMaterial =
    materialBase *
    materialRatio;

  /*
   * 최종견적
   */

  const result =
    laborAndOther +
    adjustedMaterial;

  /*
   * 1,000원 단위 반올림
   */

  return Math.round(
    result / 1000
  ) * 1000;
}


/*
 * =========================================================
 * 견적 범위 한번에 계산
 * =========================================================
 */

export function adjustEstimateRange(
  estimate,
  selectedFilm,
  fireType = "non_fire"
) {
  if (!estimate) {
    return null;
  }

  return {
    ...estimate,

    min:
      adjustEstimateByFilm(
        estimate.min,
        selectedFilm,
        fireType
      ),

    max:
      adjustEstimateByFilm(
        estimate.max,
        selectedFilm,
        fireType
      ),

    average:
      adjustEstimateByFilm(
        estimate.average,
        selectedFilm,
        fireType
      ),
  };
    }
