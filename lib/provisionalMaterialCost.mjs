import { normalizeFilmBrand } from "./filmBrand.mjs";
const number = value => value == null || value === '' || !Number.isFinite(Number(value)) || Number(value) < 0 ? null : Number(value);
const brand = value => normalizeFilmBrand(value).toLowerCase().replace(/\s+/g, '').replace(/인테리어필름/g, '');
const code = value => String(value || '').trim().toUpperCase();
const unit = value => ['m','미터'].includes(String(value || 'm').trim().toLowerCase()) ? 'm' : String(value).trim();

// Actual costs are authoritative. Never create or modify accounting rows here.
export function provisionalMaterialCosts(materials, trips) {
  const actual = materials.filter(m => m.material_type === 'actual');
  const result = [];
  for (const m of materials.filter(m => m.material_type === 'planned')) {
    if (!code(m.product_code) || unit(m.unit) !== 'm') continue;
    const covered = actual.some(a => a.company_id === m.company_id && a.site_id === m.site_id &&
      brand(a.brand) === brand(m.brand) && code(a.product_code) === code(m.product_code) && unit(a.unit) === unit(m.unit) &&
      (!a.price_type || a.price_type === 'unspecified' || !m.price_type || m.price_type === 'unspecified' || a.price_type === m.price_type));
    if (covered) continue;
    const rows = trips.filter(t => t.company_id === m.company_id && t.site_id === m.site_id && t.material_id === m.id);
    if (!rows.length) continue;
    const pending = rows.some(t => number(t.issued) == null || number(t.returned) == null || Number(t.returned) > Number(t.issued));
    const quantity = pending ? null : Math.round(rows.reduce((sum,t) => sum + Number(t.issued) - Number(t.returned),0) * 1e6) / 1e6;
    const price = number(m.unit_price);
    result.push({...m, quantity, amount: quantity == null || price == null ? 0 : Math.round(quantity * price),
      provisional:true, quantityPending:pending, pricePending:price == null && quantity !== 0});
  }
  return result;
}

