import {sameFilmProduct} from '../lib/hyundaiFilmCode.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const sql=fs.readFileSync(new URL('../database/actual_material_manual_price.sql',import.meta.url),'utf8');
const owner='11111111-1111-4111-8111-111111111111',co='22222222-2222-4222-8222-222222222222',site='33333333-3333-4333-8333-333333333333',id='44444444-4444-4444-8444-444444444444',other='55555555-5555-4555-8555-555555555555';
async function fixture(){const db=new PGlite();await db.exec(`
create role anon;create role authenticated;create role service_role;create schema auth;create schema app_private;
create table auth.users(id uuid primary key);create table companies(id uuid primary key,is_active boolean);create table profiles(id uuid primary key,company_id uuid,role text,is_active boolean);create table sites(id uuid primary key,company_id uuid,status text);
create table site_materials(id uuid primary key,company_id uuid,site_id uuid,material_type text,brand text,product_code text,product_name text,quantity numeric,unit text,unit_price numeric,total_price numeric,memo text,updated_at timestamptz default now());
create function public.canonical_film_brand(text) returns text language sql immutable as $$select upper($1)$$;
create function app_private.actual_roll_cost(m public.site_materials) returns jsonb language plpgsql as $$begin raise exception '롤별 반입량과 입고단가를 먼저 확인해주세요.' using errcode='22023';end$$;
create function app_private.set_actual_roll_cost() returns trigger language plpgsql as $$declare calc jsonb;begin calc:=app_private.actual_roll_cost(new);if calc is not null then new.total_price:=(calc->>'total')::numeric;new.unit_price:=new.total_price/new.quantity;end if;return new;end$$;
create function public.material_purchase_cost(uuid,uuid,jsonb) returns jsonb language plpgsql as $$declare calc jsonb;begin return jsonb_build_object('label','반출한 롤의 실제 입고원가');end$$;
create function app_private.guard_settled_actual() returns trigger language plpgsql as $$begin if current_setting('app.material_settlement',true) is distinct from 'on' then raise exception '반출·반입 관리 현장은 완료보고에서 자재비가 자동 계산됩니다.';end if;return new;end$$;
insert into auth.users values('${owner}'),('${other}');insert into companies values('${co}',true);insert into profiles values('${owner}','${co}','owner',true);insert into sites values('${site}','${co}','completed');
insert into site_materials(id,company_id,site_id,material_type,brand,product_code,product_name,quantity,unit,memo) values('${id}','${co}','${site}','actual','현대보닥','VM90','메탈로즈골드',19.4,'m','정산');
create trigger guard_settled before update on site_materials for each row execute function app_private.guard_settled_actual();create trigger set_roll_cost before update on site_materials for each row execute function app_private.set_actual_roll_cost();
`);await db.exec(sql);return db;}
const body={brand:'현대보닥',product_code:'Vm90',product_name:'메탈로즈골드',quantity:19.4,unit:'m',memo:'정산',unit_price:11500};
const save=(db,value=body,user=owner)=>db.query('select update_actual_material_price($1,$2,$3,$4)',[user,site,id,JSON.stringify(value)]);
test('settled material price saves 19.4 × 11500 as 223100 without changing usage or product',async()=>{const db=await fixture();try{
 await assert.rejects(db.query('update site_materials set unit_price=11500 where id=$1',[id]),/자재비가 자동/);
 await save(db);const row=(await db.query('select quantity,unit_price,total_price,product_code from site_materials')).rows[0];assert.equal(Number(row.quantity),19.4);assert.equal(Number(row.unit_price),11500);assert.equal(Number(row.total_price),223100);assert.equal(row.product_code,'VM90');
 assert.equal((await db.query('select current_setting(\'app.material_settlement\',true) flag')).rows[0].flag,'');
 await db.exec(sql);await save(db,{...body,unit_price:0});assert.equal(Number((await db.query('select total_price from site_materials')).rows[0].total_price),0);
}finally{await db.close();}});
test('foreign actor, stale quantity and identity changes cannot bypass settlement protections',async()=>{const db=await fixture();try{
 await assert.rejects(save(db,body,other),/관리자 권한/);
 for(const patch of [{quantity:20},{product_code:'VM91'},{product_name:'다른 제품'},{memo:'변경'},{unit_price:-1},{updated_at:'2020-01-01'}])await assert.rejects(save(db,{...body,...patch}));
 assert.equal((await db.query('select count(*)::int n from app_private.actual_material_manual_prices')).rows[0].n,0);
 assert.equal((await db.query("select has_table_privilege('authenticated','app_private.actual_material_manual_prices','SELECT') ok")).rows[0].ok,false);
 assert.equal((await db.query("select has_function_privilege('authenticated','update_actual_material_price(uuid,uuid,uuid,jsonb)','EXECUTE') ok")).rows[0].ok,false);
}finally{await db.close();}});
test('save API falls back to the owner-scoped price RPC and explains missing SQL',async()=>{
 const source=fs.readFileSync(new URL('../app/api/admin/site-materials/route.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replaceAll('export ','');
 let missing=false,calls=[];
 const db={auth:{getUser:async()=>({data:{user:{id:owner}}})},from(table){let modifying=false;const q={select(){return q},eq(){return q},update(){modifying=true;return q},async maybeSingle(){if(table==='profiles')return {data:{company_id:co,role:'owner'}};if(table==='companies')return {data:{id:co,is_active:true}};if(table==='sites')return {data:{id:site}};if(table==='site_materials'&&!modifying)return {data:{id,brand:body.brand,product_code:'VM90',product_name:body.product_name,quantity:19.4,unit:'m',memo:body.memo}};return {error:{code:'P0001',message:'반출·반입 관리 현장은 완료보고에서 자재비가 자동 계산됩니다.'}};}};return q;},rpc:async(name,args)=>{calls.push({name,args});return missing?{error:{code:'PGRST202'}}:{data:{success:true,priceSource:'manual'}};}};
 const patch=new Function('createClient','normalizeFilmBrand','sameFilmProduct','process','Response',source+';return PATCH;')(()=>db,x=>x,sameFilmProduct,{env:{NEXT_PUBLIC_SUPABASE_URL:'test',SUPABASE_SERVICE_ROLE_KEY:'test'}},Response);
 const request=(patchBody={})=>new Request('https://example.test/api/admin/site-materials',{method:'PATCH',headers:{authorization:'Bearer test','content-type':'application/json'},body:JSON.stringify({...body,...patchBody,siteId:site,id,p_user:other})});
 const r=await patch(request({product_name:"카탈로그 제품명 표기"}));assert.equal(r.status,200);assert.equal((await r.json()).priceSource,'manual');assert.equal(calls[0].args.p_user,owner);assert.equal(calls[0].args.p_site,site);assert.equal(calls[0].args.p_body.product_name,body.product_name);
 const count=calls.length;const conflict=await patch(request({product_code:'VM91'}));assert.equal(conflict.status,409);const info=await conflict.json();assert.equal(info.priceOnlyMaterial.product_code,'VM90');assert.equal(calls.length,count);
 missing=true;const blocked=await patch(request());assert.equal(blocked.status,503);assert.match((await blocked.json()).error,/SQL/);
});
