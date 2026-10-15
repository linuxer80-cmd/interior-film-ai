import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadOrderVariants,orderFlameLabel} from '../lib/materialOrderVariants.mjs';
const rows=[
 {id:'fire',brand:'현대',product_code:'S140',legacy_non_fire_code:'GS140',flame_type:'flame_retardant'},
 {id:'non',brand:'현대',product_code:'GS140',flame_type:'non_flame_retardant'},
 {id:'other',brand:'다른브랜드',product_code:'GS140'},
 {id:'off',brand:'현대',product_code:'S140',is_order_available:false},
 {id:'sold',brand:'현대',product_code:'S140',stock_status:'out_of_stock'},
 {id:'unpriced',brand:'현대',product_code:'S140',dealer_price_per_m:0},
].map(r=>({is_order_available:true,stock_status:'in_stock',dealer_price_per_m:13000,...r}));
const db={from(){let data=[...rows];const q={select(){return q},eq(k,v){data=data.filter(r=>r[k]===v);return q},in(k,v){data=data.filter(r=>v.includes(r[k]));return q},not(k,op,v){data=data.filter(r=>r[k]!=v);return q},gt(k,v){data=data.filter(r=>r[k]>v);return q},maybeSingle(){return Promise.resolve({data:data[0]||null})},then(resolve){return Promise.resolve({data}).then(resolve)}};return q}};
test('finds sale variants outside the list page, including non-fire alias',async()=>assert.deepEqual((await loadOrderVariants(db,'fire')).map(r=>r.id),['fire','non']));
test('non-fire code resolves the matching base option without other brands or unavailable rows',async()=>assert.deepEqual((await loadOrderVariants(db,'non')).map(r=>r.id),['non','fire']));
test('unavailable product does not become orderable',async()=>assert.deepEqual(await loadOrderVariants(db,'off'),[]));
test('flame labels are Korean, unknown does not imply fire',()=>{
 assert.equal(orderFlameLabel('flame_retardant'),'방염');
 assert.equal(orderFlameLabel('non_flame_retardant'),'비방염');
 assert.equal(orderFlameLabel(null),'방염 구분 미등록');
});
