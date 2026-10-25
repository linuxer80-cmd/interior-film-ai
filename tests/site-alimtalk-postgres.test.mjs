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
