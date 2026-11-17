import test from 'node:test';
import assert from 'node:assert/strict';
import { selectedMaterialCode } from '../lib/selectedMaterialCode.mjs';
import { matchingFilmProducts } from '../lib/matchingFilmProducts.mjs';
const lx={id:'lx',brand:'LX하우시스 베니프',product_code:'RS86'};
test('catalog prefixes are not doubled',()=>{
 assert.equal(selectedMaterialCode(lx,'RS86'),'RS86');
 assert.equal(selectedMaterialCode({...lx,product_code:'ES86'},'ES86'),'ES86');
 assert.equal(selectedMaterialCode({brand:'현대',product_code:'GS115'},'GS115'),'GS115');
});
test('typed variant is preserved for a base-code catalog product',()=>{
 assert.equal(selectedMaterialCode({...lx,product_code:'S86'},'RS86'),'RS86');
 assert.equal(selectedMaterialCode({brand:'현대',product_code:'S115'},'GS115'),'GS115');
 assert.equal(selectedMaterialCode(lx,'클라우드화이트'),'RS86');
});
function dbFor(products){return {from(){let code;return {select(){return this},ilike(_,v){code=v;return this},order(){return this},async range(){return {data:products.filter(p=>p.product_code===code)}}}},async rpc(){return {data:[]}}};}
test('selected prefixed catalog product can be resolved for save',async()=>{
 assert.deepEqual(await matchingFilmProducts(dbFor([lx]),lx.brand,'RS86'),[lx]);
});
test('base-code catalogs remain supported and unrelated brands excluded',async()=>{
 const base={...lx,id:'base',product_code:'S86'};
 const other={id:'other',brand:'영림',product_code:'S86'};
 assert.deepEqual(await matchingFilmProducts(dbFor([base,other]),lx.brand,'RS86'),[base]);
});
