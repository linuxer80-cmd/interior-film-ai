import { priceBrand } from "./dealerPriceImport.mjs";
export function orderFlameLabel(value) {
  if (["flame_retardant", "fire", "방염"].includes(value)) return "방염";
  if (["non_flame_retardant", "non_fire", "비방염"].includes(value))
    return "비방염";
  return "방염 구분 미등록";
}

export async function loadOrderVariants(db, productId) {
  const saleQuery = () =>
    db
      .from("film_products")
      .select("*")
      .eq("is_active", true)
      .eq("is_order_available", true)
      .eq("stock_status", "in_stock")
      .not("dealer_price_per_m", "is", null)
      .gt("dealer_price_per_m", 0);
  const { data: base, error } = await saleQuery()
    .eq("id", productId)
    .maybeSingle();
  if (error) throw error;
  if (!base) return [];
  const codes = [
    ...new Set([base.product_code, base.legacy_non_fire_code].filter(Boolean)),
  ];
  const [direct, reverse] = await Promise.all([
    saleQuery().eq("brand", base.brand).in("product_code", codes),
    saleQuery()
      .eq("brand", base.brand)
      .eq("legacy_non_fire_code", base.product_code),
  ]);
  if (direct.error) throw direct.error;
  if (reverse.error) throw reverse.error;
  return loadSaleOptions(db, [
    ...new Map(
      [base, ...(direct.data || []), ...(reverse.data || [])].map((row) => [
        row.id,
        row,
      ]),
    ).values(),
  ]);
}

export function orderPriceType(value) {
  if (["fire", "flame_retardant", "방염"].includes(value)) return "fire";
  if (["non_fire", "non_flame_retardant", "비방염"].includes(value))
    return "non_fire";
  return "unknown";
}
export const orderVariantKey = (product) =>
  `${product.id}:${product.price_type || orderPriceType(product.flame_type)}`;
export function saleOptions(product, prices = []) {
  if (priceBrand(product.brand) !== "younglim")
    return [{ ...product, variant_key: orderVariantKey(product) }];
  const rows = prices.filter(
    (row) =>
      row.product_id === product.id &&
      row.vat_included === false &&
      ["fire", "non_fire"].includes(row.price_type) &&
      Number.isSafeInteger(Number(row.installer_price)) &&
      Number(row.installer_price) > 0 &&
      Number(row.installer_price) <= 10000000,
  );
  if (!rows.length)
    return [{ ...product, variant_key: orderVariantKey(product) }];
  return rows
    .map((row) => {
      const option = {
        ...product,
        price_type: row.price_type,
        flame_type:
          row.price_type === "fire" ? "flame_retardant" : "non_flame_retardant",
        dealer_price_per_m: Number(row.installer_price),
        price_vat_included: false,
      };
      return { ...option, variant_key: orderVariantKey(option) };
    })
    .sort(
      (a, b) =>
        Number(b.price_type === orderPriceType(product.flame_type)) -
        Number(a.price_type === orderPriceType(product.flame_type)),
    );
}
export async function loadSaleOptions(db, products) {
  const ids = products
    .filter((p) => priceBrand(p.brand) === "younglim")
    .map((p) => p.id);
  let prices = [];
  if (ids.length) {
    const result = await db
      .from("film_catalog_prices")
      .select("product_id,price_type,installer_price,vat_included")
      .in("product_id", ids)
      .eq("vat_included", false);
    if (result.error) throw result.error;
    prices = result.data || [];
  }
  return products.flatMap((product) => saleOptions(product, prices));
}
export function selectSaleOption(
  options,
  productId,
  requestedType,
  originalType,
) {
  const type = requestedType ?? orderPriceType(originalType);
  if (!["fire", "non_fire"].includes(type))
    throw Error("방염·비방염 구분을 확인해주세요.");
  const option = options.find(
    (p) =>
      p.id === productId &&
      (p.price_type || orderPriceType(p.flame_type)) === type,
  );
  if (!option)
    throw Error(
      "선택한 방염·비방염 옵션은 현재 판매하지 않습니다. 상품을 새로 확인해주세요.",
    );
  return option;
}
