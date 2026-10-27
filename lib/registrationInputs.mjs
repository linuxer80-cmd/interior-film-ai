import { normalizeFilmBrand } from './filmBrand.mjs';

const text = value => String(value ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
const knownType = value => ['fire', 'non_fire'].includes(value);

const unspecifiedNames = new Set(['인테리어필름','필름','인테리어시트지','시트지','필름시공','인테리어필름시공','자재미정','제품미정','미정','추후결정']);

// A trade/category mentioned in a consultation is not a selected material product.
// Keep all of its useful details as notes instead of creating a phantom stock item.
export function normalizeRegistrationDraft(draft) {
  if (!Array.isArray(draft.materials)) return draft;
  const notes = [];
  const materials = draft.materials.filter(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return true;
    if (text(item.film_product_id) || text(item.product_code) || !unspecifiedNames.has(text(item.product_name).replace(/\s/g,''))) return true;
    const detail = [item.brand, item.product_name,
      item.price_type === 'fire' ? '방염' : item.price_type === 'non_fire' ? '비방염' : '',
      item.quantity != null && String(item.quantity).trim() && Number(item.quantity) > 0 ? `${item.quantity}${item.unit || 'm'}` : '',
      item.unit_price != null && String(item.unit_price).trim() ? `단가 ${item.unit_price}원` : '',
      item.memo].map(value=>String(value ?? '').trim()).filter(Boolean).join(' · ');
    notes.push(`자재 상담(제품 미정): ${detail}`);
    return false;
  });
  let memo = String(draft.memo ?? '').trim();
  for (const note of new Set(notes)) if (!memo.includes(note)) memo = [memo,note].filter(Boolean).join('\n');
  return {...draft, materials, ...(notes.length ? {memo} : {})};
}

export function registrationMaterialTypeError(materials) {
  const missing = (materials || []).find(item => item && (text(item.product_code) || text(item.product_name)) && !knownType(item.price_type));
  return missing ? `${[missing.brand,missing.product_code || missing.product_name].filter(Boolean).join(' ')}: 방염·비방염을 선택해주세요.` : '';
}

export function registrationAmountValues(data) {
  return Object.fromEntries(['contract_amount','deposit_amount'].flatMap(field=>{
    const raw=data[field], value=Number(raw);
    return raw != null && String(raw).trim()!=='' && /^\d+$/.test(String(raw).trim()) && Number.isSafeInteger(value) && value<=999999999999
      ? [[field,String(value)]] : [];
  }));
}

// Reapplying the same extraction must retain the user's price/type edits.
export function mergeRegistrationMaterials(previous, incoming) {
  const result = [...previous];
  for (const item of incoming) {
    if (!text(item.product_code) && !text(item.product_name)) continue;
    const duplicate = result.some(row =>
      normalizeFilmBrand(row.brand) === normalizeFilmBrand(item.brand) &&
      ['product_code', 'product_name', 'memo'].every(key => text(row[key]) === text(item[key])) &&
      text(row.unit || 'm') === text(item.unit || 'm') &&
      (!knownType(item.price_type) || row.price_type === item.price_type)
    );
    if (!duplicate) result.push(item);
  }
  return result;
}

export function registrationCustomerFields(previous, choice) {
  if (choice.type !== 'business' || !choice.clientId) return previous;
  return { ...previous, customer_name: choice.name || '', customer_phone: choice.phone || '' };
}
