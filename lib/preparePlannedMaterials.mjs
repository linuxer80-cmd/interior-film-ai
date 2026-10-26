import {normalizeFilmBrand} from './filmBrand.mjs';
import {resolveFilmType, filmCodeInfo} from './hyundaiFilmCode.js';
import {matchingFilmProducts} from './matchingFilmProducts.mjs';
import {plannedDealerPrice} from './plannedDealerPrice.mjs';

const invalid = message => { throw Object.assign(new Error(message), {status:400}); };

// Resolve before creating the site, so invalid variants or failed price reads
// leave the registration form intact instead of creating a partial site.
export async function preparePlannedMaterials(db, companyId, materials) {
  if (!Array.isArray(materials) || materials.length > 100) invalid('자재는 100개까지 등록할 수 있습니다.');
  const rows = materials.map(m => {
    if (!m || typeof m !== 'object' || Array.isArray(m)) invalid('자재 입력을 확인해주세요.');
    const text = (key, max) => {
      const value = String(m[key] ?? '').trim();
      if (value.length > max) invalid('자재 입력 내용이 너무 깁니다.');
      return value;
    };
    const brand = normalizeFilmBrand(text('brand',100));
    const code = text('product_code',100), name = text('product_name',200);
    if (!code && !name) return null;
    if (!['fire','non_fire'].includes(m.price_type)) invalid('자재별 방염·비방염을 선택해주세요.');
    const type = resolveFilmType(brand,code,m.price_type);
    if (type.conflict) invalid('제품 코드와 방염·비방염 구분이 다릅니다. 다시 확인해주세요.');
    const price = m.unit_price == null || String(m.unit_price).trim() === '' ? null : Number(m.unit_price);
    if (price !== null && (!Number.isFinite(price) || price < 0 || price > 100000000)) invalid('매입단가를 확인해주세요.');
    return {brand,product_code:code,product_name:name,price_type:m.price_type,
      film_product_id:m.film_product_id || null,quantity:0,unit:text('unit',20) || 'm',
      unit_price:price,memo:text('memo',1000)};
  }).filter(Boolean);
  for (let start=0; start<rows.length; start+=5) {
    await Promise.all(rows.slice(start,start+5).map(async row => {
      const products = await matchingFilmProducts(db,row.brand,row.product_code);
      const chosen = row.film_product_id ? products.find(p=>p.id===row.film_product_id) : products.length===1 ? products[0] : null;
      if (row.film_product_id && !chosen) invalid('선택한 제품과 브랜드·제품번호가 다릅니다. 제품을 다시 선택해주세요.');
      row.film_product_id = chosen?.id || null;
      if (chosen && !products.some(p=>filmCodeInfo(row.brand,row.product_code).baseCode===p.product_code)) row.product_code=chosen.product_code;
      if (row.unit_price === null) row.unit_price=await plannedDealerPrice(db,companyId,row);
      row.total_price=row.unit_price === null ? null : 0;
    }));
  }
  return rows;
}
