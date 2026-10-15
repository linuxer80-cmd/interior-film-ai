export const codeKey = value => String(value || '').toUpperCase().replace(/\s+/g, '');
export function priceBrand(value) {
  const key = codeKey(value).replace(/[^A-Z0-9가-힣]/g, '');
  if (['영림','영림인테리어필름','YOUNGLIM'].includes(key)) return 'younglim';
  if (['LX','LX베니프','LX하우시스','LX하우시스베니프','LXZIN','LX지인','베니프','BENIF','LXBENIF'].includes(key)) return 'lx';
  if (['현대','현대보닥','현대LNC','현대LC','현대인테리어필름','BODAQ','HYUNDAIBODAQ'].includes(key)) return 'hyundai';
  if (['삼성','삼성인테리어필름','삼성필름','SAMSUNG'].includes(key)) return 'samsung';
  return key;
}
export function netPrice(value, vat) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 10000000 || !['included','excluded'].includes(vat)) throw Error('가격과 VAT 구분을 확인해주세요.');
  return Math.round((vat === 'included' ? n / 1.1 : n) * 1000000) / 1000000;
}
export function normalizeRules(input) {
  if (!Array.isArray(input) || !input.length || input.length > 150) throw Error('단가표는 1~150행으로 입력해주세요.');
  return input.map((r,i) => {
    const prefixes = [...new Set(String(r.prefixes || '').split(/[\s,/.·]+/).filter(Boolean).map(codeKey))];
    if (!r.brand || String(r.brand).length > 100 || !prefixes.length || prefixes.some(p=>!(/^[A-Z][A-Z0-9-]{0,29}$/.test(p))) || !['fire','non_fire'].includes(r.priceType) || r.unit !== 'm') throw Error(`${i+1}행: 브랜드·코드·방염 구분·미터 단위를 확인해주세요.`);
    const values = Object.fromEntries(['supply','interior','consumer'].map(k=>[k,netPrice(r[k],r[k+'Vat'])]));
    if (Object.values(values).every(v=>v===null)) throw Error(`${i+1}행: 가격을 입력하거나 행을 삭제해주세요.`);
    return {brand:String(r.brand).trim(),prefixes,priceType:r.priceType,...values};
  });
}
// A family prefix ends before the numeric product number: PS never matches PSM.
function matches(code,prefix) {
  return code === prefix || (code.startsWith(prefix) && /^[0-9]/.test(code.slice(prefix.length)));
}
function variantCodes(product,type) {
  const base=codeKey(product.product_code), alias=codeKey(product.legacy_non_fire_code);
  const brand=priceBrand(product.brand);
  if (brand==='lx') return type==='non_fire' ? (alias ? [alias] : [base]) : [base];
  if (brand==='younglim') return type==='fire' ? [base.startsWith('F')?base:'F'+base] : [base.startsWith('F')?base.slice(1):base];
  if (brand==='hyundai') {
    const plain=/^[GF][A-Z]+\d/.test(base)?base.slice(1):base;
    return [(type==='fire'?'F':'G')+plain,plain];
  }
  return [base];
}
export function expandPriceRules(input,products) {
  const rules=normalizeRules(input), counts=rules.map(()=>0), rows=[], conflicts=[];
  for (const product of products) for (const priceType of ['fire','non_fire']) {
    const hits=rules.flatMap((r,i)=>r.priceType===priceType && priceBrand(r.brand)===priceBrand(product.brand) && r.prefixes.some(p=>variantCodes(product,priceType).some(c=>matches(c,p))) ? [{r,i}] : []);
    if (!hits.length) continue;
    const values=[...new Set(hits.map(({r})=>JSON.stringify([r.supply,r.interior,r.consumer])))];
    if (values.length!==1) { conflicts.push(`${product.brand} ${product.product_code} ${priceType}: 중복 단가`); continue; }
    hits.forEach(h=>counts[h.i]++);
    rows.push({productId:product.id,brand:product.brand,code:product.product_code,priceType,supply:hits[0].r.supply,interior:hits[0].r.interior,consumer:hits[0].r.consumer});
  }
  if (rows.length>3000) throw Error('적용 제품이 3,000개를 초과합니다. 단가표를 나눠주세요.');
  return {rows:rows.sort((a,b)=>(a.productId+a.priceType).localeCompare(b.productId+b.priceType)),counts,conflicts};
}

export function sellingMaterialPrices(materials,metadata,products,prices,priceColumn='interior_price') {
  if (!['interior_price','consumer_price'].includes(priceColumn)) throw Error('판매 단가 구분을 확인해주세요.');
  return materials.map(m=>{
    const meta=metadata.find(x=>x.id===m.id);
    const candidates=meta?.film_product_id ? products.filter(p=>p.id===meta.film_product_id) : products.filter(p=>priceBrand(p.brand)===priceBrand(m.brand) && [codeKey(p.product_code),codeKey(p.legacy_non_fire_code)].includes(codeKey(m.code)));
    let price=null;
    if (candidates.length===1 && ['m','미터'].includes(String(m.unit||'').toLowerCase())) {
      const p=candidates[0];
      let type=meta?.price_type;
      // Only an explicit non-fire alias can establish a missing type.
      if (!['fire','non_fire'].includes(type) && p.legacy_non_fire_code && codeKey(m.code)===codeKey(p.legacy_non_fire_code) && codeKey(p.product_code)!==codeKey(p.legacy_non_fire_code)) type='non_fire';
      const choices=prices.filter(x=>x.product_id===p.id && (['fire','non_fire'].includes(type)?x.price_type===type:true));
      const values=[...new Set(choices.map(x=>x[priceColumn]).filter(v=>v!=null).map(Number))];
      if (values.length===1 && (['fire','non_fire'].includes(type) || (choices.length===2 && choices.every(x=>x[priceColumn]!=null)))) price=values[0];
    }
    return {...m,unitPrice:price};
  });
}
