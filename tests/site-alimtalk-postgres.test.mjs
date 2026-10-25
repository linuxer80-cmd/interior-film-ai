import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const co='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002',owner='20000000-0000-4000-8000-000000000001',worker='20000000-0000-4000-8000-000000000002',site='30000000-0000-4000-8000-000000000001',first='40000000-0000-4000-8000-000000000001',next='40000000-0000-4000-8000-000000000002';
async function setup(){const db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create table companies(id uuid primary key,is_active boolean);create table profiles(id uuid primary key,company_id uuid,role text,is_active boolean);
 create table sites(id uuid primary key,company_id uuid,status text);create table workers(id uuid primary key,company_id uuid,is_active boolean);
 create table notifications(id uuid primary key);create table super_admins(user_id uuid,is_active boolean);
 insert into companies values('${co}',true),('${other}',true);insert into profiles values('${owner}','${co}','owner',true),('${worker}','${co}','worker',true);
 insert into sites values('${site}','${co}','scheduled');insert into super_admins values('${owner}',true);`);
 await db.exec(await fs.readFile(new URL('../supabase/migrations/20261025015339_site_alimtalk_solapi.sql',import.meta.url),'utf8'));
 await db.query('insert into alimtalk_accounts(company_id,enabled,available_count) values($1,true,2)',[co]);return db;}
const reserve=(db,id=first,actor=owner,company=co,expected=null,resend=false)=>db.query('select reserve_site_alimtalk($1,$2,$3,$4,null,$5,$6,$7,$8,$9,$10) result',[id,company,site,actor,'customer_schedule','010-****-5678','test-template','a'.repeat(64),expected,resend]);
const count=async db=>(await db.query('select available_count from alimtalk_accounts where company_id=$1',[co])).rows[0].available_count;
test('atomic duplicate reservation consumes only one credit, pending blocks resend and final failure refunds once',async()=>{
 const db=await setup();try{const results=await Promise.all([reserve(db),reserve(db)]);assert.equal(results.filter(r=>r.rows[0].result.accepted).length,1);assert.equal(await count(db),1);
 assert.equal((await reserve(db,next,owner,co,first,true)).rows[0].result.reason,'pending');
 await db.query("select settle_alimtalk($1,'failed',null,'4040')",[first]);await db.query("select settle_alimtalk($1,'failed',null,'4040')",[first]);assert.equal(await count(db),2);
 assert.equal((await reserve(db,next,owner,co,first,true)).rows[0].result.accepted,true);assert.equal(await count(db),1);
 }finally{await db.close();}
});
test('cross-company, worker and inactive owner access cannot reserve; no public grants',async()=>{
 const db=await setup();try{for(const [actor,company] of [[worker,co],[owner,other]])await assert.rejects(reserve(db,first,actor,company),e=>e.code==='42501');
 await db.query('update profiles set is_active=false where id=$1',[owner]);await assert.rejects(reserve(db),e=>e.code==='42501');
 assert.equal(await count(db),2);const r=await db.query("select has_table_privilege('authenticated','alimtalk_deliveries','select') t,has_function_privilege('anon','reserve_site_alimtalk(uuid,uuid,uuid,uuid,uuid,text,text,text,text,uuid,boolean)','execute') f");assert.deepEqual(r.rows[0],{t:false,f:false});
 }finally{await db.close();}
});
test('stale preview, disabled wallet and insufficient credit block without creating deliveries; grant retries are idempotent',async()=>{
 const db=await setup();try{assert.equal((await reserve(db,first,owner,co,next,false)).rows[0].result.reason,'stale');
 await db.exec('update alimtalk_accounts set enabled=false');assert.equal((await reserve(db)).rows[0].result.reason,'disabled');
 await db.exec('update alimtalk_accounts set enabled=true,available_count=0');assert.equal((await reserve(db)).rows[0].result.reason,'insufficient');
 for(let i=0;i<2;i++)await db.query('select grant_alimtalk_credits($1,$2,10,$3,$4)',[next,co,'입금 확인 테스트',owner]);assert.equal(await count(db),10);
 await db.query('select set_alimtalk_enabled($1,$2,false)',[co,owner]);await db.query('select set_alimtalk_enabled($1,$2,true)',[co,owner]);assert.equal(await count(db),10);
 await assert.rejects(db.query('select grant_alimtalk_credits($1,$2,10,$3,$4)',[first,co,'금액 오류',worker]),e=>e.code==='42501');
 }finally{await db.close();}
});

test('automatic reminder reserves once per first date, independently of manual sends, with service-only permissions',async()=>{
 const db=await setup();try{
 await db.exec('alter table sites add column work_dates date[],add column schedule_start timestamptz,add column schedule_date date;');
 await db.exec(await fs.readFile(new URL('../supabase/migrations/20261025021023_customer_day_before_alimtalk.sql',import.meta.url),'utf8'));
 await db.exec("update sites set work_dates=array[((now() at time zone 'Asia/Seoul')::date+1),((now() at time zone 'Asia/Seoul')::date+2)]");
 const call=(id,hash='b'.repeat(64))=>db.query("select reserve_customer_reminder($1,$2,$3,(now() at time zone 'Asia/Seoul')::date+1,'010-****-5678','test',$4) result",[id,co,site,hash]);
 await reserve(db);assert.equal((await call(next)).rows[0].result.accepted,true);assert.equal(await count(db),0);
 await db.query("select settle_alimtalk($1,'failed',null,'4040')",[next]);assert.equal(await count(db),1);
 assert.equal((await call('40000000-0000-4000-8000-000000000003','c'.repeat(64))).rows[0].result.reason,'duplicate');assert.equal(await count(db),1);
 await db.exec("update sites set status='cancelled'");assert.equal((await call(next)).rows[0].result.reason,'inactive');
 assert.equal((await db.query("select has_function_privilege('authenticated','reserve_customer_reminder(uuid,uuid,uuid,date,text,text,text)','execute') allowed")).rows[0].allowed,false);
 }finally{await db.close();}
});

test('operator messages need no credits, preserve duplicate protection and never create refund credits',async()=>{
 const db=await setup(),op='2ddfe3d9-4411-4991-ae35-5b876be411bc';try{
 await db.query('insert into companies values($1,true)',[op]);await db.query('update profiles set company_id=$1 where id=$2',[op,owner]);await db.query('update sites set company_id=$1',[op]);
 await db.exec('alter table sites add column work_dates date[],add column schedule_start timestamptz,add column schedule_date date;');
 await db.exec(await fs.readFile(new URL('../supabase/migrations/20261025021023_customer_day_before_alimtalk.sql',import.meta.url),'utf8'));
 const migration=await fs.readFile(new URL('../supabase/migrations/20261025021846_operator_company_unlimited.sql',import.meta.url),'utf8');await db.exec(migration.split('-- Prevent future plan')[0]);
 const r=await reserve(db,first,owner,op);assert.equal(r.rows[0].result.accepted,true);assert.equal((await reserve(db,first,owner,op)).rows[0].result.reason,'duplicate');
 await db.query("select settle_alimtalk($1,'failed',null,'4040')",[first]);await db.query("select settle_alimtalk($1,'failed',null,'4040')",[first]);
 assert.equal((await db.query('select available_count from alimtalk_accounts where company_id=$1',[op])).rows[0].available_count,0);
 await db.exec("update sites set work_dates=array[(now() at time zone 'Asia/Seoul')::date+1]");
 assert.equal((await db.query("select reserve_customer_reminder($1,$2,$3,(now() at time zone 'Asia/Seoul')::date+1,'mask','template',$4) result",[next,op,site,'a'.repeat(64)])).rows[0].result.accepted,true);
 assert.equal((await db.query('select available_count from alimtalk_accounts where company_id=$1',[op])).rows[0].available_count,0);
 }finally{await db.close();}
});
test('worker day-before reminders validate current assignments, deduplicate and honor operator exemption',async()=>{
 const db=await setup(),b='20000000-0000-4000-8000-000000000003',op='2ddfe3d9-4411-4991-ae35-5b876be411bc';try{
 await db.exec('alter table sites add column work_dates date[],add column schedule_start timestamptz,add column schedule_end timestamptz,add column schedule_date date;create table site_daily_assignments(id uuid,company_id uuid,site_id uuid,worker_id uuid,work_date date);create table site_workers(id uuid,company_id uuid,site_id uuid,worker_id uuid);');
 await db.exec(await fs.readFile(new URL('../supabase/migrations/20261025021023_customer_day_before_alimtalk.sql',import.meta.url),'utf8'));
 await db.query('insert into companies values($1,true)',[op]);
 await db.exec((await fs.readFile(new URL('../supabase/migrations/20261025021846_operator_company_unlimited.sql',import.meta.url),'utf8')).split('-- Prevent future plan')[0]);
 await db.exec(await fs.readFile(new URL('../database/worker_alimtalk_reminders.sql',import.meta.url),'utf8'));
 await db.query('insert into workers values($1,$2,true),($3,$2,true)',[worker,co,b]);
 await db.exec("update sites set work_dates=array[(now() at time zone 'Asia/Seoul')::date+1,(now() at time zone 'Asia/Seoul')::date+2]");
 await db.query("insert into site_daily_assignments values($1,$2,$3,$4,(now() at time zone 'Asia/Seoul')::date+1),($5,$2,$3,$6,(now() at time zone 'Asia/Seoul')::date+1)",[first,co,site,worker,next,b]);
 const call=(id,w=worker,c=co)=>db.query("select reserve_worker_reminder($1,$2,$3,$4,(now() at time zone 'Asia/Seoul')::date+1,'mask','template',$5) result",[id,c,site,w,'f'.repeat(64)]);
 assert.equal((await call(first)).rows[0].result.accepted,true);assert.equal(await count(db),1);
 assert.equal((await call(next)).rows[0].result.reason,'duplicate');assert.equal(await count(db),1);
 await db.exec("update sites set status='cancelled'");assert.equal((await call(next,b)).rows[0].result.reason,'inactive');await db.exec("update sites set status='scheduled'");
 await db.query('delete from site_daily_assignments where worker_id=$1',[b]);assert.equal((await call(next,b)).rows[0].result.reason,'stale');
 // Existing date-specific assignments prevent a site-wide legacy record from reviving a removed assignment.
 await db.query('insert into site_workers values($1,$2,$3,$4)',[next,co,site,b]);assert.equal((await call(next,b)).rows[0].result.reason,'stale');
 await db.exec('delete from site_daily_assignments');assert.equal((await call(next,b)).rows[0].result.accepted,true);assert.equal(await count(db),0);
 await db.query("select settle_alimtalk($1,'failed',null,'4040')",[next]);await db.query("select settle_alimtalk($1,'failed',null,'4040')",[next]);assert.equal(await count(db),1);
 await db.query('update sites set company_id=$1',[op]);await db.query('update workers set company_id=$1',[op]);await db.query('update site_workers set company_id=$1',[op]);
 const freeId='40000000-0000-4000-8000-000000000009';assert.equal((await call(freeId,b,op)).rows[0].result.accepted,true);
 await db.query("select settle_alimtalk($1,'failed',null,'4040')",[freeId]);assert.equal((await db.query('select available_count from alimtalk_accounts where company_id=$1',[op])).rows[0].available_count,0);
 assert.equal((await db.query("select has_function_privilege('authenticated','reserve_worker_reminder(uuid,uuid,uuid,uuid,date,text,text,text)','execute') allowed")).rows[0].allowed,false);
 }finally{await db.close();}
});
