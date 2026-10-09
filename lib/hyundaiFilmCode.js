export const normalizeFilmCode = value =>
  String(value ?? "")
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase();

export function isHyundaiFilm(brand) {
  const value = normalizeFilmCode(brand)
    .replace(/[&·._-]/g, "");

  return [
    "현대",
    "현대LNC",
    "현대LC",
    "현대보닥",
    "현대인테리어필름",
    "HYUNDAI",
    "HYUNDAILNC",
    "HYUNDAILC",
    "HYUNDAIBODAQ",
    "BODAQ",
    "보닥",
  ].includes(value);
}

export function filmCodeInfo(brand, code) {
  const originalCode = normalizeFilmCode(code);

  const match = originalCode.match(
    /^([GF])([A-Z][A-Z0-9-]*\d[A-Z0-9-]*)$/
  );

  const enabled =
    isHyundaiFilm(brand) && Boolean(match);

  return {
    originalCode,
    baseCode: enabled ? match[2] : originalCode,
    priceType: enabled
      ? match[1] === "G"
        ? "non_fire"
        : "fire"
      : "unknown",
  };
}

// 검색어만 기본 코드로 넓힙니다.
// 실제 제품 연결은 등록된 브랜드를 확인한 뒤 수행합니다.
export function receiptSearchCode(code) {
  const value = normalizeFilmCode(code);

  const match = value.match(
    /^([GF])([A-Z][A-Z0-9-]*\d[A-Z0-9-]*)$/
  );

  return match ? match[2] : value;
}

export function sameFilmProduct(
  brandA,
  codeA,
  brandB,
  codeB
) {
  if (
    isHyundaiFilm(brandA) &&
    isHyundaiFilm(brandB)
  ) {
    return (
      filmCodeInfo(brandA, codeA).baseCode ===
      filmCodeInfo(brandB, codeB).baseCode
    );
  }

  return (
    normalizeFilmCode(brandA) ===
      normalizeFilmCode(brandB) &&
    normalizeFilmCode(codeA) ===
      normalizeFilmCode(codeB)
  );
}

export function receiptMatchesProduct(row, product) {
  const brand = product.brand || "";
  const code =
    product.product_code || product.code || "";

  if (
    row.brand &&
    !(
      isHyundaiFilm(row.brand) &&
      isHyundaiFilm(brand)
    ) &&
    normalizeFilmCode(row.brand) !==
      normalizeFilmCode(brand)
  ) {
    return false;
  }

  if (isHyundaiFilm(brand)) {
    return (
      filmCodeInfo(brand, row.code).baseCode ===
      filmCodeInfo(brand, code).baseCode
    );
  }

  return (
    normalizeFilmCode(row.code) ===
    normalizeFilmCode(code)
  );
}

export function resolveFilmType(
  brand,
  code,
  selectedType
) {
  const info = filmCodeInfo(brand, code);

  const explicit = ["non_fire", "fire"].includes(
    selectedType
  )
    ? selectedType
    : "unknown";

  const conflict =
    info.priceType !== "unknown" &&
    explicit !== "unknown" &&
    info.priceType !== explicit;

  return {
    ...info,
    conflict,
    resolvedType: conflict
      ? "unknown"
      : explicit !== "unknown"
        ? explicit
        : info.priceType,
  };
}
