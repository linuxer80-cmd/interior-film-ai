import test from "node:test";
import assert from "node:assert/strict";
import { plannedDealerPrice, chooseDealerPrice } from "../lib/plannedDealerPrice.mjs";
test("dealer price selection respects fire type, ambiguity, zero and missing",()=>{
 const rows=[{price_type:"fire",unit_price:9000},{price_type:"non_fire",unit_price:5800}];
 assert.equal(chooseDealerPrice(rows,"non_fire"),5800);
 assert.equal(chooseDealerPrice(rows,"fire"),9000);
 assert.equal(chooseDealerPrice(rows,"unknown"),null);
 assert.equal(chooseDealerPrice([],"fire"),null);
 assert.equal(chooseDealerPrice([{price_type:"fire",unit_price:0}],"fire"),0);
 assert.equal(chooseDealerPrice([{price_type:"fire",unit_price:null}],"fire"),null);
 assert.equal(chooseDealerPrice([...rows,{price_type:"non_fire",unit_price:6000}],"non_fire"),null);
});
test("GS156 resolves S156 and scopes prices to company; never uses catalogue selling price",async()=>{
 const calls=[];
 const db={from(table){ const q={select(){return q},ilike(k,v){calls.push([table,k,v]);return Promise.resolve({data:[{id:"product",brand:"현대보닥",product_code:"S156"}]})},eq(k,v){calls.push([table,k,v]);return q},then(resolve){return Promise.resolve({data:[{price_type:"fire",unit_price:9000},{price_type:"non_fire",unit_price:5800}]}).then(resolve)}};return q}};
 assert.equal(await plannedDealerPrice(db,"company",{brand:"현대",product_code:"Gs156",unit:"m"}),5800);
 assert.ok(calls.some(c=>c[0]==="film_dealer_prices"&&c[1]==="company_id"&&c[2]==="company"));
 assert.ok(calls.some(c=>c[1]==="product_code"&&c[2]==="S156"));
 assert.equal(await plannedDealerPrice(db,"company",{brand:"현대",product_code:"Gs156",unit:"롤"}),null);
});
