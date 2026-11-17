import { filmCodeInfo, receiptMatchesProduct } from "./hyundaiFilmCode.js";

export function selectedMaterialCode(product, query) {
  const code = product.product_code || "";
  const entered = filmCodeInfo(product.brand, query);
  const catalog = filmCodeInfo(product.brand, code);
  // Keep catalog variants intact: RS86 must never become RRS86.
  if (catalog.priceType !== "unknown" || entered.priceType === "unknown" ||
      !receiptMatchesProduct({ brand: product.brand, code: query }, product)) return code;
  return entered.originalCode[0] + code;
}
