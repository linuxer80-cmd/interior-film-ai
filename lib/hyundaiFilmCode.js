export const normalizeFilmCode = value =>
  String(value ?? "")
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase();

const brandKey = value =>
  normalizeFilmCode(value)
    .replace(/[&·._-]/g, "");

export function isHyundaiFilm(brand) {
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
  ].includes(brandKey(brand));
}

export function isLxFilm(brand) {
  return [
    "LX",
    "LX베니프",
    "LX하우시스",
    "LX하우시스베니프",
    "베니프",
    "BENIF",
    "LXBENIF",
    "LXHAUSYS",
    "LXHAUSYSBENIF",
  ].includes(brandKey(brand));
}

function family(brand) {
  if (isHyundaiFilm(brand)) return "hyundai";
  if (isLxFilm(brand)) return "lx";
  return "";
}

// 브랜드가 비어 있으면 알려진 코드 규칙으로 찾습니다.
export function inferFilmBrand(code) {
  const value = normalizeFilmCode(code);

  if (/^[RE]S\d[A-Z0-9-]*$/.test(value)) {
    return "LX 베니프";
  }

  if (
    /^[GF][A-Z][A-Z0-9-]*\d[A-Z0-9-]*$/.test(value) ||
    /^S\d[A-Z0-9-]*$/.test(value)
  ) {
    return "현대L&C";
  }

  return "";
}

function effectiveBrand(brand, code) {
  return normalizeFilmCode(brand)
    ? String(brand).trim()
    : inferFilmBrand(code);
}

export function filmCodeInfo(brand, code) {
  const originalCode = normalizeFilmCode(code);
  const resolvedBrand = effectiveBrand(brand, code);
  const maker = family(resolvedBrand);

  const match = originalCode.match(
    /^([GFRE])([A-Z][A-Z0-9-]*\d[A-Z0-9-]*)$/
  );

  let baseCode = originalCode;
  let priceType = "unknown";

  if (
    match &&
    maker === "hyundai" &&
    ["G", "F"].includes(match[1])
  ) {
    baseCode = match[2];
    priceType =
      match[1] === "G" ? "non_fire" : "fire";
  } else if (
    match &&
    maker === "lx" &&
    ["R", "E"].includes(match[1])
  ) {
    baseCode = match[2];
    priceType =
      match[1] === "R" ? "fire" : "non_fire";
  }

  return {
    originalCode,
    baseCode,
    priceType,
    brand: resolvedBrand,
  };
}

export function receiptSearchCode(code) {
  return filmCodeInfo("", code).baseCode;
}

export function sameFilmProduct(
  brandA,
  codeA,
  brandB,
  codeB
) {
  const a = filmCodeInfo(brandA, codeA);
  const b = filmCodeInfo(brandB, codeB);

  const makerA = family(a.brand);
  const makerB = family(b.brand);

  if (makerA && makerB) {
    return (
      makerA === makerB &&
      a.baseCode === b.baseCode
    );
  }

  return (
    brandKey(a.brand) === brandKey(b.brand) &&
    a.originalCode === b.originalCode
  );
}

export function receiptMatchesProduct(row, product) {
  const code =
    product.product_code ||
    product.code ||
    "";

  const rowBrand = effectiveBrand(
    row.brand,
    row.code
  );

  const registeredBrand = product.brand || "";
  const makerA = family(rowBrand);
  const makerB = family(registeredBrand);

  // 기본 코드가 같아도 현대와 LX는 서로 연결하지 않습니다.
  if (
    rowBrand &&
    (
      makerA && makerB
        ? makerA !== makerB
        : brandKey(rowBrand) !==
          brandKey(registeredBrand)
    )
  ) {
    return false;
  }

  const a = filmCodeInfo(
    registeredBrand,
    row.code
  );

  const b = filmCodeInfo(
    registeredBrand,
    code
  );

  if (a.baseCode !== b.baseCode) {
    return false;
  }

  // 등록 제품에도 방염 접두사가 있으면 함께 확인합니다.
  if (
    a.priceType !== "unknown" &&
    b.priceType !== "unknown" &&
    a.priceType !== b.priceType
  ) {
    return false;
  }

  return true;
}

export function resolveFilmType(
  brand,
  code,
  selectedType
) {
  const info = filmCodeInfo(brand, code);

  const explicit = [
    "non_fire",
    "fire",
  ].includes(selectedType)
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
