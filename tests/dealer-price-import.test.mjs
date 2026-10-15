import test from 'node:test';
import assert from 'node:assert/strict';
import {expandPriceRules,netPrice,sellingMaterialPrices} from '../lib/dealerPriceImport.mjs';
const rule=(over={})=>({brand:'영림',prefixes:'PS',priceType:'non_fire',unit:'m',supply:6500,supplyVat:'excluded',interior:11000,interiorVat:'included',consumer:null,consumerVat:'unknown',...over});
const p=(id,code,brand='영림',alias=null)=>({id,brand,product_code:code,legacy_non_fire_code:alias});
test('PS is not PSM; punctuation-separated groups expand without duplicate products',()=>{
 const r=expandPriceRules([rule({prefixes:'PW.PS.PX.IS'}),rule({prefixes:'PSM',supply:9000})],[p('1','PS160','영림 인테리어필름'),p('2','PSM197'),p('3','PW100'),p('4','PS160','삼성')]);
 assert.equal(r.rows.length,3);assert.equal(r.rows.find(x=>x.productId==='2').supply,9000);assert.deepEqual(r.counts,[2,1]);
});
test('Younglim fire prefix maps catalog base to fire price only',()=>{
 const r=expandPriceRules([rule({prefixes:'FPSM',priceType:'fire'})],[p('1','PSM197')]);
 assert.equal(r.rows.length,1);assert.equal(r.rows[0].priceType,'fire');
});
test('LX maps actual catalog non-fire aliases, not invented suffixes',()=>{
 const products=[p('1','DW550','LX하우시스 베니프','EW550'),p('2','BM001','LX하우시스 베니프','BE001')];
 const r=expandPriceRules([rule({brand:'LX Z:IN',prefixes:'EW'}),rule({brand:'LX',prefixes:'DW',priceType:'fire',supply:12000})],products);
 assert.equal(r.rows.length,2);assert.deepEqual(new Set(r.rows.map(x=>x.supply)),new Set([6500,12000]));assert.ok(r.rows.every(x=>x.productId==='1'));
});
test('contradictory overlapping rules block product rather than choosing silently',()=>{
 const r=expandPriceRules([rule(),rule({supply:9000})],[p('1','PS160')]);assert.equal(r.conflicts.length,1);assert.equal(r.rows.length,0);
});
test('VAT conversion, zero and missing prices are distinct',()=>{
 assert.equal(netPrice(11000,'included'),10000);assert.equal(netPrice(6500,'excluded'),6500);assert.equal(netPrice(0,'included'),0);assert.equal(netPrice('','unknown'),null);
 assert.throws(()=>netPrice(1000,'unknown'));assert.throws(()=>netPrice(-1,'excluded'));assert.throws(()=>netPrice(Infinity,'excluded'));
});
test('unknown fire type and non-m units require correction before preview',()=>{
 assert.throws(()=>expandPriceRules([rule({priceType:'unknown'})],[]));assert.throws(()=>expandPriceRules([rule({unit:'kg'})],[]));
});
test('Samsung exact groups stay separate and brand scoped',()=>{
 const r=expandPriceRules([rule({brand:'삼성',prefixes:'SLG'})],[p('1','SLG100','삼성인테리어필름'),p('2','SLF100','삼성')]);assert.equal(r.rows.length,1);
});
test('B2B quote uses selling price without mutating purchase data',()=>{
 const rows=[{id:'m',brand:'LX',code:'Dw550',unit:'m',unitPrice:6500,used:5.7}];
 const result=sellingMaterialPrices(rows,[{id:'m',price_type:'fire'}],[p('p','DW550','LX하우시스 베니프','EW550')],[{product_id:'p',price_type:'fire',interior_price:15000}]);
 assert.equal(result[0].unitPrice,15000);assert.equal(rows[0].unitPrice,6500);assert.equal(result[0].used,5.7);
});
test('unknown fire type with differing prices stays unresolved; zero selling price valid',()=>{
 const rows=[{id:'m',brand:'영림',code:'PS160',unit:'m',unitPrice:6500}];
 const products=[p('p','PS160')];
 const prices=[{product_id:'p',price_type:'fire',interior_price:12000},{product_id:'p',price_type:'non_fire',interior_price:0}];
 assert.equal(sellingMaterialPrices(rows,[],products,prices)[0].unitPrice,null);
 assert.equal(sellingMaterialPrices(rows,[{id:'m',price_type:'non_fire'}],products,prices)[0].unitPrice,0);
});
test('missing or duplicate product links never fall back to cost',()=>{
 const rows=[{id:'m',brand:'영림',code:'PS160',unit:'m',unitPrice:6500}];
 assert.equal(sellingMaterialPrices(rows,[],[],[])[0].unitPrice,null);
 assert.equal(sellingMaterialPrices(rows,[],[p('1','PS160'),p('2','PS160')],[])[0].unitPrice,null);
});
test('consumer quotes select consumer column independently',()=>{
 const rows=[{id:'m',brand:'영림',code:'PS160',unit:'m',unitPrice:6500}];
 const prices=[{product_id:'p',price_type:'fire',interior_price:12000,consumer_price:17000}];
 assert.equal(sellingMaterialPrices(rows,[{id:'m',price_type:'fire'}],[p('p','PS160')],prices,'consumer_price')[0].unitPrice,17000);
});
