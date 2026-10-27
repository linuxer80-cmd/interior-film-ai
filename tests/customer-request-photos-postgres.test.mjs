import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const co='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002';
const site='20000000-0000-4000-8000-000000000001',otherSite='20000000-0000-4000-8000-000000000002';
const token='30000000-0000-4000-8000-000000000001',otherToken='30000000-0000-4000-8000-000000000002';
const batch='40000000-0000-4000-8000-000000000001',fingerprint='a'.repeat(64);
const id=n=>`50000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const path=(i,b=batch)=>`sites/${co}/${site}/request/customer-${b}-${i}.jpg`;
const rows=(n=2,b=batch)=>Array.from({length:n},(_,i)=>({id:id(i+1),storage_path:path(i,b)}));
async function setup(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema storage;create table storage.objects(bucket_id text,name text);
 create table companies(id uuid primary key,is_active boolean);
 create table sites(id uuid primary key,company_id uuid,status text,site_name text);
 create table customer_site_portals(site_id uuid primary key,company_id uuid,token_id uuid unique,expires_at timestamptz);
 create table site_photos(id uuid primary key,company_id uuid,site_id uuid,photo_type text,storage_path text,photo_url text,description text);
 create table notifications(id uuid primary key default gen_random_uuid(),company_id uuid,recipient_type text,type text,priority text,title text,message text,link text,reference_type text,reference_id text,dedupe_key text unique);
 insert into companies values('${co}',true),('${other}',true);
 insert into sites values('${site}','${co}','consulting','상담 테스트'),('${otherSite}','${other}','consulting','다른 업체');
 insert into customer_site_portals values('${site}','${co}','${token}',now()+interval '1 day'),('${otherSite}','${other}','${otherToken}',now()+interval '1 day');
 insert into site_photos values('${id(100)}','${co}','${site}','request','existing/request.jpg',null,'기존 사진');
 grant usage on schema storage to service_role;grant all on all tables in schema public,storage to service_role;`);
 await db.exec(await fs.readFile(new URL('../supabase/migrations/20261027221708_customer_portal_request_photos.sql',import.meta.url),'utf8'));
 return db;
}
async function reserve(db,{t=token,b=batch,f=fingerprint,n=2,note='냉장고장 측면도 시공'}={}){
 return (await db.query('select reserve_customer_photo_submission($1,$2,$3,$4,$5) r',[t,b,f,note,n])).rows[0].r;
}
async function uploaded(db,r=rows()){for(const p of r)await db.query('insert into storage.objects values($1,$2)',['work-photos',p.storage_path]);}
async function finish(db,{t=token,b=batch,f=fingerprint,r=rows()}={}){
 return (await db.query('select complete_customer_photo_submission($1,$2,$3,$4::jsonb) r',[t,b,f,JSON.stringify(r)])).rows[0].r;
}
const count=async(db,t)=>(await db.query(`select count(*)::int n from ${t}`)).rows[0].n;

test('customer batch atomically appends requested photos and one precise admin notification; replay is idempotent',async()=>{
 const db=await setup();try{
 assert.equal(await count(db,'notifications'),0);
 await db.exec('set role service_role');assert.equal((await reserve(db)).status,'pending');await uploaded(db);
 const results=await Promise.all([finish(db),finish(db)]);assert.equal(results.filter(r=>!r.duplicate).length,1);
 assert.equal(await count(db,'site_photos'),3);assert.equal(await count(db,'notifications'),1);
 assert.equal((await reserve(db)).status,'completed');
 const n=(await db.query('select * from notifications')).rows[0];
 assert.equal(n.company_id,co);assert.equal(n.recipient_type,'company_admin');assert.equal(n.link,`/admin?tab=sites&site=${site}&section=photos`);assert.match(n.message,/2장/);
 assert.deepEqual((await db.query("select photo_type,description from site_photos where storage_path<>'existing/request.jpg'")).rows,
 [{photo_type:'request',description:'고객 상담 사진\n냉장고장 측면도 시공'},{photo_type:'request',description:'고객 상담 사진\n냉장고장 측면도 시공'}]);
 }finally{await db.close();}
});
test('missing second upload rolls back all photo records and the alert; retry commits once',async()=>{
 const db=await setup();try{await reserve(db);await uploaded(db,rows().slice(0,1));await assert.rejects(finish(db),e=>e.code==='22023');
 assert.equal(await count(db,'site_photos'),1);assert.equal(await count(db,'notifications'),0);
 assert.equal((await reserve(db)).status,'pending');await uploaded(db,rows().slice(1));await finish(db);assert.equal(await count(db,'notifications'),1);
 }finally{await db.close();}
});
test('notification insertion failure rolls back photos and completed state',async()=>{
 const db=await setup();try{await reserve(db);await uploaded(db);
 await db.exec("create function reject_notice() returns trigger language plpgsql as $$begin raise exception 'temporary queue error';end$$;create trigger reject_notice before insert on notifications for each row execute function reject_notice()");
 await assert.rejects(finish(db));assert.equal(await count(db,'site_photos'),1);assert.equal((await reserve(db)).status,'pending');
 await db.exec('drop trigger reject_notice on notifications');await finish(db);assert.equal(await count(db,'notifications'),1);
 }finally{await db.close();}
});
test('another tenant, reused id with changed data, and forged paths cannot attach photos',async()=>{
 const db=await setup();try{await reserve(db);await uploaded(db);
 await assert.rejects(reserve(db,{t:otherToken}),e=>e.code==='23505');await assert.rejects(reserve(db,{f:'b'.repeat(64)}),e=>e.code==='23505');
 await assert.rejects(finish(db,{t:otherToken}),e=>e.code==='42501');
 const forged=rows();forged[1].storage_path=`sites/${other}/${otherSite}/request/private.jpg`;
 await uploaded(db,forged.slice(1));await assert.rejects(finish(db,{r:forged}),e=>e.code==='22023');
 assert.equal(await count(db,'site_photos'),1);assert.equal(await count(db,'notifications'),0);
 }finally{await db.close();}
});
test('expiry, token rotation, status change and company disablement are rechecked at final commit',async()=>{
 const db=await setup();try{await reserve(db);await uploaded(db);
 for(const [change,restore] of [
 ["update customer_site_portals set expires_at=now()-interval '1 second' where site_id='"+site+"'","update customer_site_portals set expires_at=now()+interval '1 day'"],
 ["update sites set status='scheduled'","update sites set status='consulting'"],
 ["update companies set is_active=false","update companies set is_active=true"],
 ["update customer_site_portals set token_id='30000000-0000-4000-8000-000000000003' where site_id='"+site+"'","update customer_site_portals set token_id='"+token+"' where site_id='"+site+"'"]
 ]){await db.exec(change);await assert.rejects(finish(db),e=>e.code==='42501');await db.exec(restore);}
 assert.equal(await count(db,'site_photos'),1);assert.equal(await count(db,'notifications'),0);await finish(db);
 }finally{await db.close();}
});
test('daily quotas count pending uploads too, while existing batch retries do not consume quota',async()=>{
 const db=await setup();try{
 for(let n=1;n<=10;n++){await reserve(db,{b:`40000000-0000-4000-8000-${String(n).padStart(12,'0')}`,n:10});await db.exec("update customer_photo_submissions set created_at=now()-interval '2 minutes'");}
 await assert.rejects(reserve(db,{b:'40000000-0000-4000-8000-000000000011',n:1}),e=>e.code==='P0001');
 assert.equal((await reserve(db,{n:10})).status,'pending');assert.equal(await count(db,'customer_photo_submissions'),10);
 }finally{await db.close();}
});
test('new rows are private and RPCs are service-role-only invoker functions',async()=>{
 const db=await setup();try{
 assert.equal((await db.query("select relrowsecurity from pg_class where oid='customer_photo_submissions'::regclass")).rows[0].relrowsecurity,true);
 for(const role of ['anon','authenticated']){
  const result=(await db.query("select has_table_privilege($1,'customer_photo_submissions','SELECT') t,has_function_privilege($1,'reserve_customer_photo_submission(uuid,uuid,text,text,integer)','EXECUTE') r,has_function_privilege($1,'complete_customer_photo_submission(uuid,uuid,text,jsonb)','EXECUTE') c",[role])).rows[0];assert.deepEqual(result,{t:false,r:false,c:false});
 }
 assert.ok((await db.query("select prosecdef from pg_proc where proname in ('reserve_customer_photo_submission','complete_customer_photo_submission')")).rows.every(r=>r.prosecdef===false));
 }finally{await db.close();}
});
