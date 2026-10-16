import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const owner='10000000-0000-0000-0000-000000000001',worker='10000000-0000-0000-0000-000000000002',other='10000000-0000-0000-0000-000000000003',admin='10000000-0000-0000-0000-000000000004';
const co='20000000-0000-0000-0000-000000000001',otherCo='20000000-0000-0000-0000-000000000002';
test('tenure badges honor original dates, thresholds, company scope and permissions',async()=>{
const db=new PGlite();try{
 await db.exec(`
 create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create schema storage;
 create table auth.users(id uuid primary key,email_confirmed_at timestamptz);
 create table public.companies(id uuid primary key,is_active boolean);
 create table public.profiles(id uuid primary key,company_id uuid,role text,is_active boolean);
 create table public.super_admins(user_id uuid primary key,is_active boolean);
 create table public.sites(id uuid primary key,company_id uuid,status text);
 create table public.work_reports(id uuid primary key,site_id uuid,company_id uuid,created_by uuid,review_status text);
 create table public.workers(id uuid primary key,user_id uuid,company_id uuid,is_active boolean);
 create table public.worker_relationships(worker_id uuid,user_id uuid,company_id uuid,ended_at timestamptz);
 create table public.film_stock_trips(id uuid primary key,site_id uuid,company_id uuid,returned_by uuid,returned numeric);
 create table public.labor_profiles(user_id uuid primary key,name text,photo_path text,region text,daily_wage integer);
 create table public.labor_personal_details(user_id uuid primary key,phone text);
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(bucket_id text,name text);
 insert into auth.users values('${owner}',now()),('${worker}',now()),('${other}',now()),('${admin}',now());
 insert into companies values('${co}',true),('${otherCo}',true);
 insert into profiles values('${owner}','${co}','owner',true),('${other}','${otherCo}','owner',true);
 insert into super_admins values('${admin}',true);
 insert into labor_profiles values('${worker}','시공자','avatar.webp','인천',250000);
 insert into labor_personal_details values('${worker}','01000000000');
 insert into sites select ('30000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'${co}','completed' from generate_series(1,10) n;
 insert into work_reports select gen_random_uuid(),id,company_id,'${worker}','approved' from sites;
 insert into film_stock_trips select gen_random_uuid(),id,company_id,'${worker}',5 from sites;
 -- A duplicate report must not count as another completed site.
 insert into work_reports select gen_random_uuid(),id,company_id,'${worker}','approved' from sites limit 1;
 `);
 await db.exec(await readFile(new URL('../database/achievement_badges.sql',import.meta.url),'utf8'));

await db.exec(`alter table labor_personal_details add column departure_address text;
create table worker_private_details(worker_id uuid,company_id uuid,departure_address text);
create table attendance_records(id uuid primary key,worker_id uuid,company_id uuid,site_id uuid,work_day date,clock_in timestamptz,in_verified boolean,review_status text,site_address text);
insert into workers values('50000000-0000-0000-0000-000000000001','${worker}','${co}',true);
update labor_personal_details set departure_address='old origin';`);
const migration=await readFile(new URL('../database/worker_commute_badges.sql',import.meta.url),'utf8');
await db.exec(migration);await db.exec(migration);

const activity=await readFile(new URL('../database/worker_activity_badges.sql',import.meta.url),'utf8');
await db.exec(activity);await db.exec(activity);

await db.exec(`alter table auth.users add column created_at timestamptz;
alter table companies add column created_at timestamptz;
update auth.users set created_at=now()-interval '100 days' where id='${worker}';
update auth.users set created_at=now()-interval '6 days' where id='${owner}';
update companies set created_at=now()-interval '365 days' where id='${co}';`);
const tenure=await readFile(new URL('../database/tenure_badges.sql',import.meta.url),'utf8');
await db.exec(tenure);await db.exec(tenure);
const get=(actor,scope)=>(db.query("select achievement_action($1,'get',jsonb_build_object('scope',$2::text)) v",[actor,scope])).then(r=>r.rows[0].v);
let result=await get(worker,'worker');
assert.ok(result.badges.find(b=>b.id==='worker_tenure_100').earned_at);
assert.equal(result.badges.find(b=>b.id==='worker_tenure_180').earned_at,null);
result=await get(owner,'owner');
assert.ok(result.badges.find(b=>b.id==='owner_tenure_365').earned_at);
assert.equal(result.badges.find(b=>b.id==='owner_tenure_730').earned_at,null);
result=await get(owner,'worker');
assert.equal(result.badges.find(b=>b.id==='worker_tenure_7').earned_at,null);
await db.query("update auth.users set created_at=now()-interval '7 days' where id=$1",[owner]);
result=await get(owner,'worker');
assert.ok(result.badges.find(b=>b.id==='worker_tenure_7').earned_at);
assert.equal((await db.query("select achievement_tenure_metrics($1,'owner') v",[worker])).rows[0].v.company_days,0);
await db.query("update auth.users set created_at=now()+interval '1 day' where id=$1",[other]);
assert.equal((await db.query("select achievement_tenure_metrics($1,'worker') v",[other])).rows[0].v.member_days,0);
await db.exec('set role authenticated');
await assert.rejects(db.query("select achievement_tenure_metrics($1,'worker')",[worker]));
await db.exec('reset role');
}finally{await db.close();}});
