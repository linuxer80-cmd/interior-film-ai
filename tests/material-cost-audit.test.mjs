import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {preparePlannedMaterials} from '../lib/preparePlannedMaterials.mjs';
const co='11111111-1111-4111-8111-111111111111', owner='22222222-2222-4222-8222-222222222222', site='33333333-3333-4333-8333-333333333333', product='44444444-4444-4444-8444-444444444444', material='55555555-5555-4555-8555-555555555555';
function catalog({fail=false,conflict=false}={}) {
 const reads=[];
 const tables={film_products:[{id:product,brand:'현대보닥',product_code:'ZX103'}],film_dealer_prices:[{company_id:co,product_id:product,price_type:'non_fire',unit_price:8400},{company_id:co,product_id:product,price_type:'fire',unit_price:10000},...(conflict?[{company_id:co,product_id:product,price_type:'non_fire',unit_price:8500}]:[])]};
 return {reads,from(table){const filters=[];const q={select(){return q},ilike(k,v){filters.push(r=>r[k].toLowerCase()===v.toLowerCase());return q},eq(k,v){filters.push(r=>r[k]===v);return q},order(){return q},range(){return q},then(resolve){reads.push(table);return Promise.resolve(fail?{error:Error('lookup failed')}:{data:tables[table].filter(r=>filters.every(f=>f(r)))}).then(resolve)}};return q},rpc:async()=>({data:[]})};
}
test('registration links Hyundai aliases to catalog and correct non-fire purchase cost before saving',async()=>{
 const db=catalog();const rows=await preparePlannedMaterials(db,co,[{brand:'현대 & C',product_code:'zx103',price_type:'non_fire',unit_price:'',quantity:24.6,total_price:999}]);
 assert.equal(rows[0].brand,'현대보닥');assert.equal(rows[0].film_product_id,product);assert.equal(rows[0].unit_price,8400);assert.equal(rows[0].price_type,'non_fire');assert.equal(rows[0].quantity,0);assert.equal(rows[0].total_price,0);
 assert.equal((await preparePlannedMaterials(db,co,[{brand:'현대',product_code:'ZX103',price_type:'fire'}]))[0].unit_price,10000);
});
test('registration blocks unknown/conflicting fire types and foreign product IDs; missing/ambiguous prices remain null',async()=>{
 for(const m of [{price_type:''},{price_type:'fire',product_code:'GZX103'},{film_product_id:owner},{unit_price:-1}])await assert.rejects(preparePlannedMaterials(catalog(),co,[{brand:'현대',product_code:'ZX103',price_type:'non_fire',...m}]),e=>e.status===400);
 await assert.rejects(preparePlannedMaterials(catalog({fail:true}),co,[{brand:'현대',product_code:'ZX103',price_type:'non_fire'}]),/lookup failed/);
 assert.equal((await preparePlannedMaterials(catalog({conflict:true}),co,[{brand:'현대',product_code:'ZX103',price_type:'non_fire'}]))[0].unit_price,null);
 assert.equal((await preparePlannedMaterials(catalog(),co,[{brand:'현대',product_code:'ZX103',price_type:'non_fire',unit_price:0}]))[0].unit_price,0);
});
test('database settlement excludes removed materials and dealer cost enforces saved fire type',async()=>{
 const db=new PGlite();try{
 await db.exec(`create schema app_private;
 create table companies(id uuid primary key,is_active boolean);
 create table profiles(id uuid primary key,company_id uuid,role text,is_active boolean);
 create table sites(id uuid primary key,company_id uuid,status text);
 create table site_materials(id uuid primary key,company_id uuid,site_id uuid,material_type text,brand text,product_code text,product_name text,film_product_id uuid,price_type text,quantity numeric,unit text,unit_price numeric,total_price numeric,memo text,updated_at timestamptz,removed_at timestamptz);
 create table site_material_returns(material_id uuid,company_id uuid,site_id uuid,quantity numeric);
 create table site_material_issues(material_id uuid,company_id uuid,site_id uuid,quantity numeric,voided_at timestamptz);
 create table film_products(id uuid primary key,brand text,product_code text);
 create table film_dealers(id uuid primary key,company_id uuid,name text);
 create table film_dealer_prices(id uuid primary key,company_id uuid,dealer_id uuid,product_id uuid,price_type text,unit_price numeric);
 create function app_private.actual_roll_cost(public.site_materials) returns jsonb language sql as $$select null::jsonb$$;
 create function app_private.film_brand_key(text) returns text language sql as $$select $1$$;
 insert into companies values('${co}',true);insert into profiles values('${owner}','${co}','owner',true);insert into sites values('${site}','${co}','completed');
 insert into film_products values('${product}','현대보닥','ZX103');insert into film_dealers values('${owner}','${co}','대리점');
 insert into film_dealer_prices values('66666666-6666-4666-8666-666666666666','${co}','${owner}','${product}','non_fire',8400),('77777777-7777-4777-8777-777777777777','${co}','${owner}','${product}','fire',10000);
 insert into site_materials(id,company_id,site_id,material_type,brand,product_code,film_product_id,price_type,quantity,unit) values('${material}','${co}','${site}','actual','현대보닥','ZX103','${product}','non_fire',24.6,'m');`);
 await db.exec(fs.readFileSync(new URL('../database/material_cost_audit.sql',import.meta.url),'utf8'));
 const get=async(user=owner)=>(await db.query('select public.material_purchase_cost($1,$2) r',[user,material])).rows[0].r;
 let quote=await get();assert.equal(quote.options.length,1);assert.equal(quote.options[0].unitPrice,8400);
 await assert.rejects(get(co),/관리자/);
 await assert.rejects(db.query('select public.material_purchase_cost($1,$2,$3)',[owner,material,JSON.stringify({action:'apply',version:quote.version,optionId:'77777777-7777-4777-8777-777777777777'})]),/선택/);
 await db.query('select public.material_purchase_cost($1,$2,$3)',[owner,material,JSON.stringify({action:'apply',version:quote.version,optionId:quote.options[0].id})]);
 let row=(await db.query('select * from site_materials')).rows[0];assert.equal(Number(row.total_price),206640);assert.equal(row.price_type,'non_fire');assert.equal(Number(row.quantity),24.6);
 await db.exec(`update site_materials set price_type=null;`);quote=await get();assert.equal(quote.options.length,2);
 const chosen=quote.options.find(p=>p.priceType==='fire');await db.query('select public.material_purchase_cost($1,$2,$3)',[owner,material,JSON.stringify({action:'apply',version:quote.version,optionId:chosen.id})]);
 assert.equal((await db.query('select price_type from site_materials')).rows[0].price_type,'fire');
 await db.exec(`update site_materials set material_type='planned',removed_at=now();`);
 assert.deepEqual((await db.query('select report_material_settlement($1,$2) r',[co,site])).rows[0].r,[]);
 await db.exec(`update site_materials set removed_at=null;`);
 await assert.rejects(db.query('select report_material_settlement($1,$2)',[co,site]),/반출·반입량/);
 await db.exec(`insert into site_material_issues values('${material}','${co}','${site}',45,null);insert into site_material_returns values('${material}','${co}','${site}',20.4);`);
 const settled=(await db.query('select report_material_settlement($1,$2) r',[co,site])).rows[0].r;assert.equal(settled[0].quantity,24.6);assert.equal(settled[0].price_type,'fire');
 }finally{await db.close();}
});

test('registration preparation API refuses unauthorized callers and uses the authenticated company',async()=>{
 const source=fs.readFileSync(new URL('../app/api/admin/registration-materials/route.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replaceAll('export ','');
 let denied=true,called=0;
 const post=new Function('privateAuth','json','preparePlannedMaterials',source+';return POST;')(
 async()=>denied?{error:'관리자 권한 필요',status:403}:{db:{},companyId:co},(b,status=200)=>Response.json(b,{status}),async(db,company,rows)=>{assert.equal(company,co);called++;return rows;});
 const req=()=>new Request('https://app.test/api',{method:'POST',body:JSON.stringify({companyId:owner,materials:[]})});
 assert.equal((await post(req())).status,403);assert.equal(called,0);denied=false;
 const response=await post(req());assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'application/json');assert.equal(called,1);
});

test('actual material API saves selected fire type and rejects code/type conflicts',async()=>{
 const {sameFilmProduct,resolveFilmType}=await import('../lib/hyundaiFilmCode.js');
 const source=fs.readFileSync(new URL('../app/api/admin/site-materials/route.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replaceAll('export ','');
 const writes=[];
 const db={auth:{getUser:async()=>({data:{user:{id:owner}}})},from(table){const q={select(){return q},eq(){return q},insert(v){writes.push(v);return q},maybeSingle:async()=>({data:table==='profiles'?{company_id:co,role:'owner'}:table==='companies'?{id:co,is_active:true}:table==='sites'?{id:site}:{id:material}})};return q;}};
 const post=new Function('createClient','normalizeFilmBrand','sameFilmProduct','resolveFilmType','matchingFilmProducts','process','Response',source+';return POST;')(()=>db,x=>x,sameFilmProduct,resolveFilmType,async()=>[{id:product}],{env:{NEXT_PUBLIC_SUPABASE_URL:'test',SUPABASE_SERVICE_ROLE_KEY:'test'}},Response);
 const req=over=>new Request('https://app.test/api',{method:'POST',headers:{authorization:'Bearer test'},body:JSON.stringify({siteId:site,brand:'현대보닥',product_code:'ZX103',film_product_id:product,price_type:'non_fire',quantity:24.6,unit:'m',unit_price:8400,...over})});
 assert.equal((await post(req({}))).status,200);assert.equal(writes[0].price_type,'non_fire');assert.equal(writes[0].film_product_id,product);assert.equal(writes[0].total_price,206640);assert.equal(writes[0].company_id,co);
 assert.equal((await post(req({product_code:'GZX103',price_type:'fire'}))).status,400);assert.equal(writes.length,1);
});
