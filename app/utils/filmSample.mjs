export function normalizeBrand(value) {
  const brand = String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9가-힣]/g, "");

  if (
    [
      "현대",
      "현대보닥",
      "현대보닥BODAQ",
      "HYUNDAIBODAQ",
      "BODAQ",
    ].includes(brand)
  ) {
    return "BODAQ";
  }

  if (
    ["영림", "영림인테리어필름", "YOUNGLIM"].includes(brand)
  ) {
    return "YOUNGLIM";
  }

  return brand;
}

export function sampleUrls(path, baseUrl = "") {
  const value = String(path || "").trim();

  if (!value) return [];

  if (/^https?:\/\//i.test(value)) {
    return [value];
  }

  if (
    /^[a-z][a-z0-9+.-]*:/i.test(value) ||
    value.startsWith("//")
  ) {
    return [];
  }

  if (
    value.startsWith("/") &&
    !value.startsWith("/storage/v1/object/public/")
  ) {
    return [value];
  }

  const base = baseUrl.replace(/\/+$/, "");

  if (!base) return [];

  const clean = value
    .replace(/^\/?storage\/v1\/object\/public\//, "")
    .replace(/^\/+/, "");

  const encoded = clean
    .split("/")
    .map((part) => {
      try {
        return encodeURIComponent(decodeURIComponent(part));
      } catch {
        return encodeURIComponent(part);
      }
    })
    .join("/");

  const root = `${base}/storage/v1/object/public/`;

  return [
    ...new Set([
      root + encoded,
      ...(
        !clean.startsWith("film-samples/")
          ? [root + "film-samples/" + encoded]
          : []
      ),
    ]),
  ];
}

export function matchSample(products, brand, code) {
  const key = normalizeBrand(brand);
  const number = String(code || "").trim().toUpperCase();

  if (!key || !number) return null;

  const matches = products.filter(
    (product) =>
      normalizeBrand(product.brand) === key &&
      String(product.product_code || "")
        .trim()
        .toUpperCase() === number
  );

  return matches.length === 1
    ? matches[0].sample_image_path || null
    : null;
}
