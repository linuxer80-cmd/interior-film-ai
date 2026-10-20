import { resolveFilmType, sameFilmProduct } from "./hyundaiFilmCode.js";

// No selling-price fallback: only the current company's dealer purchase prices.
export function chooseDealerPrice(rows, priceType) {
  const eligible = rows.filter(row =>
    ["fire", "non_fire"].includes(row.price_type) &&
    (priceType === "unknown" || row.price_type === priceType));
  if (!eligible.length || eligible.some(row => row.unit_price == null ||
    !Number.isFinite(Number(row.unit_price)) || Number(row.unit_price) < 0 ||
    Number(row.unit_price) > 100000000)) return null;
  const prices = [...new Set(eligible.map(row => Number(row.unit_price)))];
  return prices.length === 1 ? prices[0] : null;
}

export async function plannedDealerPrice(db, companyId, material) {
  if (!["m", "미터"].includes(String(material.unit || "").trim().toLowerCase())) return null;
  const info = resolveFilmType(material.brand, material.product_code, material.price_type);
  if (info.conflict) return null;
  if (!info.baseCode || !material.brand) return null;
  const products = await db.from("film_products").select("id,brand,product_code")
    .ilike("product_code", info.baseCode);
  if (products.error) throw products.error;
  const ids = (products.data || []).filter(product =>
    sameFilmProduct(material.brand, material.product_code, product.brand, product.product_code)
  ).map(product => product.id);
  if (ids.length !== 1) return null;
  const prices = await db.from("film_dealer_prices").select("unit_price,price_type")
    .eq("company_id", companyId).eq("product_id", ids[0]);
  if (prices.error) throw prices.error;
  return chooseDealerPrice(prices.data || [], info.resolvedType);
}
