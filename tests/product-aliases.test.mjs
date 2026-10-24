import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeProductAliases,productAliasKey} from '../lib/productAliases.mjs';
import {matchingFilmProducts} from '../lib/matchingFilmProducts.mjs';
import {matchesFilmSearch,receiptMatchesProduct} from '../lib/hyundaiFilmCode.js';
test('approved names normalize whitespace and punctuation without turning OCR errors into aliases',()=>{
 assert.deepEqual(normalizeProductAliases(['메탈 로즈골드',' 메탈로즈골드 ','보닥 메탈로즈골드']),['메탈 로즈골드','보닥 메탈로즈골드']);
 for(const alias of ['GSM03','GSW98','VM906','  ',null])assert.throws(()=>normalizeProductAliases([alias]));
 assert.equal(productAliasKey('메탈 로즈골드'),'메탈로즈골드');
 assert.throws(()=>normalizeProductAliases(Array(21).fill('별칭')));
});
test('search finds approved name; code comparison stays exact and fire checks stay strict',()=>{
 assert(matchesFilmSearch({brand:'현대보닥',product_code:'VM906',aliases:['메탈 로즈골드']},'메탈로즈골드'));
 assert(!receiptMatchesProduct({brand:'현대보닥',code:'GSM03'},{brand:'현대보닥',product_code:'SMT03'}));
 assert(!receiptMatchesProduct({brand:'현대보닥',code:'GS115'},{brand:'현대보닥',product_code:'FS115'}));
});
test('server resolves exact approved alias with brand scope and preserves ambiguity',async()=>{
 const calls=[];const product={id:'p',brand:'현대보닥',product_code:'VM906'};
 const db={from(){const q={select(){return q},ilike(){return q},order(){return q},range(){return Promise.resolve({data:[]})}};return q;},rpc(name,args){calls.push([name,args]);return {data:[product]};}};
 assert.deepEqual(await matchingFilmProducts(db,'현대보닥','메탈 로즈골드'),[product]);
 assert.deepEqual(calls,[['resolve_film_alias',{p_brand:'현대보닥',p_value:'메탈 로즈골드'}]]);
 db.rpc=()=>({data:[product,{...product,id:'duplicate'}]});
 assert.equal((await matchingFilmProducts(db,'현대보닥','메탈로즈골드')).length,2);
});
