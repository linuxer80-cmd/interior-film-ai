import {filmCodeInfo,sameFilmProduct} from './hyundaiFilmCode.js';
import {chooseDealerPrice} from './plannedDealerPrice.mjs';
export async function auditMaterialCost(db,companyId,m) {
 const result={id:m.id,name:m.product_code||m.product_name,brand:m.brand,unit:m.unit,savedPrice:m.unit_price,linkedProductId:m.film_product_id};
 if(m.unit_price!=null)return {...result,reason:'priced',reasonText:'현장 원가 단가가 입력되어 있습니다.'};
 if(!['m','미터'].includes(String(m.unit||'').trim().toLowerCase()))return {...result,reason:'unit',reasonText:'단위가 m/미터가 아니어서 자동 매입단가 조회에서 제외됩니다.'};
 const info=filmCodeInfo(m.brand,m.product_code);
 if(!info.baseCode||!m.brand)return {...result,reason:'identity',reasonText:'브랜드 또는 제품코드가 없어 자동 조회하지 못합니다.'};
 const products=await db.from('film_products').select('id,brand,product_code,product_name').ilike('product_code',info.baseCode);
 if(products.error)throw products.error;
 const matches=(products.data||[]).filter(p=>sameFilmProduct(m.brand,m.product_code,p.brand,p.product_code));
 if(matches.length!==1)return {...result,baseCode:info.baseCode,priceType:info.priceType,matchedProducts:matches,reason:'product',reasonText:matches.length?'같은 브랜드·코드의 제품이 여러 개여서 원가를 확정하지 못합니다.':'등록된 브랜드·제품코드와 일치하는 카탈로그 제품이 없습니다.'};
 const prices=await db.from('film_dealer_prices').select('dealer_id,price_type,unit_price').eq('company_id',companyId).eq('product_id',matches[0].id);
 if(prices.error)throw prices.error;
 const rows=prices.data||[],eligible=rows.filter(r=>['fire','non_fire'].includes(r.price_type)&&(info.priceType==='unknown'||r.price_type===info.priceType));
 const price=chooseDealerPrice(rows,info.priceType);
 return {...result,baseCode:info.baseCode,priceType:info.priceType,matchedProducts:matches,prices:rows,availablePrice:price,
 reason:!eligible.length?'no_purchase_price':price==null?'ambiguous':'not_applied',
 reasonText:!eligible.length?'필름장이 업체에 이 제품·방염 구분의 대리점 매입단가가 등록되어 있지 않습니다.':price==null?'방염 구분 또는 대리점별 매입단가가 하나로 확정되지 않아 자동 입력을 생략했습니다.':'현재는 매입단가가 조회되지만 현장 원가에는 반영되지 않은 상태입니다. 등록 이후 단가가 추가되었거나 기존 현장에 자동 재적용되지 않았을 수 있습니다.'};
}
