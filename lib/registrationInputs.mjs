import { normalizeFilmBrand } from './filmBrand.mjs';

const text = value => String(value ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
const knownType = value => ['fire', 'non_fire'].includes(value);

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
