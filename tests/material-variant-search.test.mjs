import test from 'node:test';
import assert from 'node:assert/strict';
import {searchMaterialCatalog} from '../lib/materialCatalogVariants.mjs';
import {matchingFilmProducts} from '../lib/matchingFilmProducts.mjs';
import {resolveFilmType,sameFilmProduct} from '../lib/hyundaiFilmCode.js';
const rs={id:'catalog86',brand:'LX하우시스 베니프',product_code:'RS86',product_name:'클라우드화이트'};
const db={async rpc(_,args){return {data:args.p_query==='RS86'?[rs]:[]}},from(){let code;return {select(){return this},ilike(_,v){code=v;return this},order(){return this},async range(){return {data:code==='RS86'?[rs]:[]}}}}};
test('ES86 search, selected ID lookup and non-fire validation work together',async()=>{
 const result=await searchMaterialCatalog(db,'Es86');
 assert.equal(result.length,1);assert.equal(result[0].product_code,'ES86');
 assert.equal(result[0].id,rs.id);
 const linked=await matchingFilmProducts(db,result[0].brand,result[0].product_code);
 assert.equal(linked[0].id,result[0].id);
 assert.equal(sameFilmProduct(result[0].brand,'ES86',linked[0].brand,linked[0].product_code),true);
 assert.equal(resolveFilmType(result[0].brand,'ES86','non_fire').conflict,false);
 assert.equal(resolveFilmType(result[0].brand,'ES86','fire').conflict,true);
});
test('existing exact ES86 product takes precedence',async()=>{
 let calls=0;const exact={...rs,id:'es',product_code:'ES86'};
 const found=await searchMaterialCatalog({async rpc(){calls++;return {data:[exact]}}},'ES86');
 assert.deepEqual(found,[exact]);assert.equal(calls,1);
});
test('other manufacturers and undocumented variants are not substituted',async()=>{
 const wrong={async rpc(){return {data:[{...rs,brand:'영림'}]}}};
 assert.equal((await searchMaterialCatalog(wrong,'ES86')).filter(p=>p.product_code==='ES86').length,0);
 let calls=0;await searchMaterialCatalog({async rpc(){calls++;return {data:[]}}},'ES999');assert.equal(calls,1);
});
