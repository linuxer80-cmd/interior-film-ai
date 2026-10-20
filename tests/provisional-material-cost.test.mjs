import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {provisionalMaterialCosts as costs} from '../lib/provisionalMaterialCost.mjs';
const material=(id,code,price,extra={})=>({id,company_id:'co',site_id:'site',material_type:'planned',brand:'영림',product_code:code,unit:'m',unit_price:price,...extra});
const trip=(id,issued,returned,extra={})=>({material_id:id,issued,returned,company_id:'co',site_id:'site',...extra});
test('Cheolsan usage yields 656000 without creating accounting records',()=>{
 const m=[material('a','PS160',6500),material('b','PSM197',9000),material('c','PSM210',9000)];
 const t=[trip('a',25,25),... [1,9.3,7.3,5.4,25,25,10.2].map(n=>trip('a',n,0)),trip('b',15.2,9.5),trip('c',16.1,9)];
 const before=JSON.stringify([m,t]);const rows=costs(m,t);
 assert.deepEqual(rows.map(r=>r.quantity),[83.2,5.7,7.1]);assert.equal(rows.reduce((s,r)=>s+r.amount,0),656000);assert.equal(JSON.stringify([m,t]),before);
});
test('actual costs replace matching provisional rows including brand aliases and code case',()=>{
 const m=[material('a','Psm197',9000),material('b','PSM210',9000),material('actual','PSM197',8000,{material_type:'actual',brand:'영림 인테리어필름'})];
 assert.deepEqual(costs(m,[trip('a',15.2,9.5),trip('b',16.1,9)]).map(r=>r.id),['b']);
});
test('same code at other site/company, brand or explicit fire type does not suppress usage',()=>{
 const planned=material('a','A',100,{price_type:'fire'});
 for(const extra of [{company_id:'other'},{site_id:'other'},{brand:'현대'},{price_type:'non_fire'}]){
  const actual={...planned,...extra,id:'actual',material_type:'actual'};
  assert.equal(costs([planned,actual],[trip('a',10,2)])[0].amount,800);
 }
});
test('unreturned or invalid roll keeps entire material pending; zero return and free price are valid',()=>{
 for(const returned of [null,undefined,-1,11]){
  const r=costs([material('a','A',100)],[trip('a',10,returned),trip('a',2,0)])[0];assert.equal(r.quantity,null);assert.equal(r.amount,0);assert.equal(r.quantityPending,true);
 }
 assert.equal(costs([material('a','A',0)],[trip('a',10,0)])[0].amount,0);
 assert.equal(costs([material('a','A',null)],[trip('a',10,10)])[0].pricePending,false);
 assert.equal(costs([material('a','A',null)],[trip('a',10,1)])[0].pricePending,true);
});
test('cross-company/site trips and non-meter materials never contribute',()=>{
 assert.deepEqual(costs([material('a','A',100)],[trip('a',10,0,{company_id:'other'}),trip('a',10,0,{site_id:'other'})]),[]);
 assert.deepEqual(costs([material('a','A',100,{unit:'롤'})],[trip('a',10,0)]),[]);
});
test('profit API sums actual plus provisional once and retains company-scoped reads',async()=>{
 const source=fs.readFileSync(new URL('../app/api/admin/profit/route.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replaceAll('export ','');
 const tables={profiles:[{id:'user',company_id:'co',role:'owner',is_active:true}],companies:[{id:'co',is_active:true}],sites:[{id:'site',company_id:'co',site_name:'철산대림',status:'in_progress',contract_amount:3540000,site_workers:[],work_dates:[]}],site_materials:[material('a','PS160',6500)],film_stock_trips:[trip('a',108.2,25)],site_expenses:[],site_daily_assignments:[],work_reports:[],company_leader_allowance_rates:[],company_leader_allowances:[]};
 const reads=[];
 const db={auth:{getUser:async()=>({data:{user:{id:'user'}}})},from(name){const filters=[];const q={select(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},neq(k,v){filters.push(r=>r[k]!==v);return q},in(k,v){filters.push(r=>v.includes(r[k]));return q},order(){return q},range(){return q},maybeSingle(){q.single=true;return q},then(resolve){reads.push({name,count:filters.length});const rows=(tables[name]||[]).filter(r=>filters.every(f=>f(r)));return Promise.resolve({data:q.single?rows[0]||null:rows,error:null}).then(resolve)}};return q}};
 const GET=new Function('createClient','process','Response','provisionalMaterialCosts','resolveRevenue','loadLaborContracts','contractWage',source+';return GET;')(()=>db,{env:{NEXT_PUBLIC_SUPABASE_URL:'x',SUPABASE_SERVICE_ROLE_KEY:'x'}},Response,costs,s=>({revenue:s.contract_amount}),async()=>[],()=>0);
 async function get(){const response=await GET(new Request('https://app.example/api/admin/profit?siteId=11111111-1111-1111-1111-111111111111',{headers:{authorization:'Bearer test'}}));return response.json()}
 // Site ID must match the requested UUID for the real scoped query.
 const id='11111111-1111-1111-1111-111111111111';for(const rows of Object.values(tables))for(const r of rows){if(r.site_id==='site')r.site_id=id;if(r.id==='site')r.id=id;}
 let result=await get();assert.equal(result.sites[0].material,540800);assert.equal(result.sites[0].materialProvisional,true);
 tables.site_materials.push({...tables.site_materials[0],id:'actual',material_type:'actual',quantity:83.2,total_price:499200});
 result=await get();assert.equal(result.sites[0].material,499200);assert.equal(result.sites[0].materialProvisional,false);assert.equal(result.breakdown.material.length,1);
 assert.ok(reads.filter(r=>r.name==='film_stock_trips').every(r=>r.count>=2));
});
