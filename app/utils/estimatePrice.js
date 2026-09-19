// app/utils/estimatePrice.js

// ======================================================
// 인테리어필름 자재 단가에 따른 견적 보정
//
// 현재 AI 자동견적은 솔리드 필름 기준.
//
// 전체 시공 견적 중:
// - 인건비 + 기타 비용 = 70%
// - 필름 자재비 = 30%
//
// 자재비 30%에만 선택 필름의 가격 차이를 적용.
//
// 솔리드 소비자 기준단가:
// - 비방염 S = 11,000원/m
// - 방염 S   = 15,000원/m
// ======================================================

export const MATERIAL_COST_RATIO = 0.3;
export const LABOR_OTHER_RATIO = 0.7;

export const SOLID_BASE_PRICE = {
  non_fire: 11000,
  fire: 15000,
};


// ------------------------------------------------------
// 선택한 필름의 m당 가격
// ------------------------------------------------------

export function getFilmPrice(
  film,
  fireType = "non_fire"
) {
  if (!film) {
    return 0;
  }

  if (fireType === "fire") {
    return Number(
      film.fire_price_per_meter || 0
    );
  }

  return Number(
    film.non_fire_price_per_meter || 0
  );
}


// ------------------------------------------------------
// 솔리드 기준가격
// ------------------------------------------------------

export function getSolidBasePrice(
  fireType = "non_fire"
) {
  return Number(
    SOLID_BASE_PRICE[fireType] ||
      SOLID_BASE_PRICE.non_fire
  );
}


// ------------------------------------------------------
// 해당 제품의 가격정보 존재 여부
// ------------------------------------------------------

export function hasFilmPrice(
  film,
  fireType = "non_fire"
) {
  return (
    getFilmPrice(
      film,
      fireType
    ) > 0
  );
}


// ------------------------------------------------------
// 선택 필름과 솔리드의 가격 배율
//
// 예:
// 비방염 SPW = 19,000원
// 비방염 솔리드 = 11,000원
//
// 19,000 / 11,000 = 약 1.727
// ------------------------------------------------------

export function getMaterialPriceRatio(
  film,
  fireType = "non_fire"
) {
  const filmPrice =
    getFilmPrice(
      film,
      fireType
    );

  const solidPrice =
    getSolidBasePrice(
      fireType
    );

  if (
    !filmPrice ||
    !solidPrice
  ) {
    return 1;
  }

  return (
    filmPrice /
    solidPrice
  );
}


// ------------------------------------------------------
// 하나의 견적금액 보정
//
// 예:
// 기존견적 = 1,000,000원
//
// 70%
// = 700,000원
//
// 자재비 30%
// = 300,000원
//
// SPW 비방염
// 19,000 / 11,000
// = 1.727배
//
// 보정 자재비
// 300,000 × 1.727
// = 약 518,182원
//
// 최종
// = 약 1,218,182원
// ------------------------------------------------------

export function adjustEstimateByFilm(
  basePrice,
  film,
  fireType = "non_fire"
) {
  const base =
    Number(basePrice || 0);

  if (!base) {
    return 0;
  }

  // 필름 미선택
  // → 기존 솔리드 기준 견적 유지
  if (!film) {
    return Math.round(base);
  }

  const filmPrice =
    getFilmPrice(
      film,
      fireType
    );

  const solidPrice =
    getSolidBasePrice(
      fireType
    );

  // 가격표에 단가가 없는 제품
  // → 임의 추정하지 않고 기존 견적 유지
  if (
    !filmPrice ||
    !solidPrice
  ) {
    return Math.round(base);
  }

  const laborAndOther =
    base *
    LABOR_OTHER_RATIO;

  const baseMaterialCost =
    base *
    MATERIAL_COST_RATIO;

  const materialRatio =
    filmPrice /
    solidPrice;

  const adjustedMaterialCost =
    baseMaterialCost *
    materialRatio;

  const result =
    laborAndOther +
    adjustedMaterialCost;

  // 기존 견적처럼 천원 단위로 정리
  return (
    Math.round(
      result / 1000
    ) * 1000
  );
}


// ------------------------------------------------------
// min / average / max 견적을 한 번에 보정
// ------------------------------------------------------

export function adjustEstimateRange(
  estimate,
  film,
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
        film,
        fireType
      ),

    average:
      adjustEstimateByFilm(
        estimate.average,
        film,
        fireType
      ),

    max:
      adjustEstimateByFilm(
        estimate.max,
        film,
        fireType
      ),
  };
}
