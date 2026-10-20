const aliases = {
  "현대보닥": ["현대보닥","현대","현대&C","현대H&C","현대L&C","현대LNC","현대인테리어필름","현대필름","현대보닷","보닥","HYUNDAI","HYUNDAIL&C","HYUNDAILNC","HYUNDAIH&C","HYUNDAIBODAQ","BODAQ"],
  "영림": ["영림","영림필름","영림인테리어필름","영림 인테리어필름","YOUNGLIM","YOUNGLIMINTERIORFILM"],
};
export const filmBrandKey = value => String(value ?? "").normalize("NFKC").trim().toUpperCase().replace(/[\s&·._-]+/g,"");
const labels = new Map(Object.entries(aliases).flatMap(([label,names])=>names.map(name=>[filmBrandKey(name),label])));
export function normalizeFilmBrand(value) {
  const raw = String(value ?? "").trim();
  return labels.get(filmBrandKey(raw)) || raw;
}
export function sameFilmBrand(a,b) {
  return filmBrandKey(normalizeFilmBrand(a)) === filmBrandKey(normalizeFilmBrand(b));
}
export function filmBrandAliases(value) {
  const label=normalizeFilmBrand(value);
  return [...new Set([String(value ?? "").trim(),label,...(aliases[label]||[])])].filter(Boolean);
}

