import { isLxFilm, normalizeFilmCode } from "./hyundaiFilmCode.js";

// Confirmed LX catalog pair: RS86 (fire) / ES86 (non-fire).
export function lx86Counterpart(code) {
  const value = normalizeFilmCode(code);
  return value === "ES86" ? "RS86" : value === "RS86" ? "ES86" : "";
}
export async function searchMaterialCatalog(db, query) {
  const result = await db.rpc("search_film_catalog", { p_query: query });
  if (result.error) throw result.error;
  const products = result.data || [];
  const code = normalizeFilmCode(query);
  const counterpart = lx86Counterpart(code);
  if (!counterpart || products.some(p => isLxFilm(p.brand) && normalizeFilmCode(p.product_code) === code)) return products;
  const fallback = await db.rpc("search_film_catalog", { p_query: counterpart });
  if (fallback.error) throw fallback.error;
  const variants = (fallback.data || []).filter(p => isLxFilm(p.brand) && normalizeFilmCode(p.product_code) === counterpart)
    .map(p => ({ ...p, product_code: code }));
  return [...products, ...variants.filter(p => !products.some(existing => existing.id === p.id))];
}
