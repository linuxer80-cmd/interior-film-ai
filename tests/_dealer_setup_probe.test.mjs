import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const root=new URL('./fixtures/dealer-setup-probe/',import.meta.url);
const defs=await Promise.all(['film_dealers','register_dealer_film'].map(n=>readFile(new URL(n+'_fixture.sql',root),'utf8')));
const co='11111111-1111-4111-8111-111111111111',owner='22222222-2222-4222-8222-222222222222',outsider='33333333-3333-4333-8333-333333333333';
const id1='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',id2='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',id3='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
async function fixture(){ const db=new PGlite();await db.exec(`
 create table public.companies(id uuid primary key,is_active boolean);
 create table public.profiles(id uuid primary key,company_id uuid,role text,is_active boolean);
 create table public.film_dealers(id uuid primary key default gen_random_uuid(),company_id uuid,name text,phone text,brands text,revision int default 1,unique(company_id,name));
 create table public.film_products(id uuid primary key default gen_random_uuid(),brand text,product_code text,product_name text,sample_image_path text,is_active boolean default true,is_order_available boolean,created_at timestamptz default now(),legacy_non_fire_code text);
 create table public.film_dealer_prices(id uuid primary key default gen_random_uuid(),company_id uuid,dealer_id uuid,product_id uuid,unit_price numeric,price_type text,revision int default 1,unique(company_id,dealer_id,product_id,price_type));
 create table public.film_dealer_requests(id uuid primary key,company_id uuid,actor uuid,action text,payload jsonb);
 create table public.film_product_registration_requests(id uuid primary key,company_id uuid,actor uuid,payload jsonb,product_id uuid);
 create table public.film_stock_rolls(id uuid primary key,company_id uuid);
 create table public.film_roll_purchases(company_id uuid,roll_id uuid);
 create function public.film_stock(uuid,uuid,text,jsonb) returns jsonb language sql as $$select '{"owner":true,"rolls":[]}'::jsonb$$;
 insert into companies values('${co}',true);
 insert into profiles values('${owner}','${co}','owner',true),('${outsider}','${co}','worker',true);
 `);for(const d of defs) await db.exec(d);return db; }
const call=(db,actor,action,body)=>db.query('select public.film_dealers($1,$2,$3::jsonb) value',[actor,action,JSON.stringify(body)]);
const register=(db,actor,body)=>db.query('select public.register_dealer_film($1,$2::jsonb) value',[actor,JSON.stringify(body)]);
test('dealer creation retries the identical request without duplicate and rejects changed payload',async()=>{const db=await fixture();try{
 const body={action:'dealer',requestId:id1,name:'드림아트',phone:'',brands:''};await call(db,owner,'dealer',body);await call(db,owner,'dealer',body);
 assert.equal((await db.query('select count(*)::int n from film_dealers')).rows[0].n,1);
 await assert.rejects(call(db,owner,'dealer',{...body,name:'다른 이름'}),/다른 내용/);
 await assert.rejects(call(db,owner,'dealer',{...body,requestId:id2}),/unique/i);
 await assert.rejects(call(db,outsider,'dealer',{...body,requestId:id3}),/관리자/);
}finally{await db.close()}});
test('product and price registration is atomic and retries preserve one product and price',async()=>{const db=await fixture();try{
 await call(db,owner,'dealer',{action:'dealer',requestId:id1,name:'드림아트',phone:'',brands:''});
 const did=(await db.query('select id from film_dealers')).rows[0].id;
 const body={action:'register_product',requestId:id2,dealerId:did,brand:'현대',productCode:'S115',productName:'',priceType:'non_fire',unitPrice:'7200'};
 await register(db,owner,body);await register(db,owner,body);
 assert.equal((await db.query('select count(*)::int n from film_products')).rows[0].n,1);
 assert.equal((await db.query('select count(*)::int n from film_dealer_prices')).rows[0].n,1);
 await assert.rejects(register(db,owner,{...body,requestId:id3}),/이미 공급가/);
 assert.equal(Number((await db.query('select unit_price from film_dealer_prices')).rows[0].unit_price),7200);
}finally{await db.close()}});
test('price update requires the current revision and cannot cross company or worker boundaries',async()=>{const db=await fixture();try{
 await call(db,owner,'dealer',{action:'dealer',requestId:id1,name:'드림아트',phone:'',brands:''});const did=(await db.query('select id from film_dealers')).rows[0].id;
 await register(db,owner,{action:'register_product',requestId:id2,dealerId:did,brand:'현대',productCode:'S115',productName:'',priceType:'non_fire',unitPrice:'7200'});
 const p=(await db.query('select * from film_dealer_prices')).rows[0];const body={action:'price',requestId:id3,dealerId:did,productId:p.product_id,priceType:'non_fire',unitPrice:'7500',priceRevision:p.revision};
 await assert.rejects(call(db,outsider,'price',body),/관리자/);await assert.rejects(call(db,owner,'price',{...body,priceRevision:0}),/변경/);
 await call(db,owner,'price',body);await call(db,owner,'price',body);
 const after=(await db.query('select unit_price,revision from film_dealer_prices')).rows[0];assert.equal(Number(after.unit_price),7500);assert.equal(after.revision,p.revision+1);
}finally{await db.close()}});
