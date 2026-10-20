import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeFilmBrand,sameFilmBrand} from '../lib/filmBrand.mjs';
import {sameFilmProduct,receiptMatchesProduct,resolveFilmType,matchesFilmSearch} from '../lib/hyundaiFilmCode.js';
import {priceBrand} from '../lib/dealerPriceImport.mjs';
import {matchingFilmProducts} from '../lib/matchingFilmProducts.mjs';
import {plannedDealerPrice} from '../lib/plannedDealerPrice.mjs';
test('aliases normalize consistently across entry, receipt, price import and search',()=>{
 for(const s of ['현대','현대 & C','현대 L&C','현대보닥','보닥','HYUNDAI']){assert.equal(normalizeFilmBrand(s),'현대보닥');assert.equal(priceBrand(s),'hyundai');assert(sameFilmProduct(s,'GS115','현대보닥','S115'));}
 for(const s of ['영림','영림필름','영림 인테리어필름',' younglim ']){assert.equal(normalizeFilmBrand(s),'영림');assert.equal(priceBrand(s),'younglim');assert(sameFilmProduct(s,'Psm210','영림','PSM210'));assert(matchesFilmSearch({brand:'영림',product_code:'PSM210'},s));}
 assert.equal(normalizeFilmBrand('예림'),'예림');assert(!sameFilmBrand('예림','영림'));assert(!sameFilmProduct('영림','PSM210','현대','PSM210'));
});
test('normalization never weakens fire type and code validation',()=>{
 assert.equal(resolveFilmType('현대&C','GS115','fire').conflict,true);
 assert.equal(receiptMatchesProduct({brand:'현대','code':'GS115'},{brand:'현대보닥',product_code:'FS115'}),false);
 assert(!sameFilmProduct('영림필름','PS160','영림','PSM160'));
});
function dbFixture(products,prices=[]){const calls=[];return {calls,from(table){let filter='',company=null,product=null,range=null;const q={select(){return q},ilike(k,v){filter=v;calls.push([table,k,v]);return q},eq(k,v){if(k==='company_id')company=v;if(k==='product_id')product=v;return q},order(){return q},range(a,b){range=[a,b];return q},then(resolve){let data=table==='film_products'?products.filter(p=>p.product_code.toUpperCase()===filter.toUpperCase()):prices.filter(p=>p.company_id===company&&p.product_id===product);if(range)data=data.slice(range[0],range[1]+1);return Promise.resolve({data,error:null}).then(resolve)}};return q;}};}
test('legacy catalog names match without connecting another brand; ambiguity requires selection',async()=>{
 const products=[{id:'a',brand:'영림 인테리어필름',product_code:'PSM210'},{id:'other',brand:'예림',product_code:'PSM210'}];
 const db=dbFixture(products,[{company_id:'own',product_id:'a',price_type:'non_fire',unit_price:9000},{company_id:'foreign',product_id:'a',price_type:'non_fire',unit_price:1}]);
 assert.deepEqual((await matchingFilmProducts(db,'영림필름','PSM210')).map(p=>p.id),['a']);
 const m={brand:'영림필름',product_code:'PSM210',unit:'m',price_type:'non_fire'};assert.equal(await plannedDealerPrice(db,'own',m),9000);
 products.push({id:'duplicate',brand:'영림',product_code:'PSM210'});assert.equal(await plannedDealerPrice(db,'own',m),null);
 assert.equal(await plannedDealerPrice(db,'own',{...m,film_product_id:'a'}),9000);
 assert.equal(await plannedDealerPrice(db,'own',{...m,film_product_id:'other'}),null);
});
