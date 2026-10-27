import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const co='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002',owner='20000000-0000-4000-8000-000000000001',worker='20000000-0000-4000-8000-000000000002',site='30000000-0000-4000-8000-000000000001';
const first='40000000-0000-4000-8000-000000000001',second='40000000-0000-4000-8000-000000000002',third='40000000-0000-4000-8000-000000000003';
const op='2ddfe3d9-4411-4991-ae35-5b876be411bc';
async function setup(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create table companies(id uuid primary key,is_active boolean);create table profiles(id uuid primary key,company_id uuid,role text,is_active boolean);
 create table sites(id uuid primary key,company_id uuid,status text,work_dates date[],schedule_start timestamptz,schedule_end timestamptz,schedule_date date,customer_phone text);
 create table workers(id uuid primary key,company_id uuid,is_active boolean);create table notifications(id uuid primary key);create table super_admins(user_id uuid,is_active boolean);
 insert into companies values('${co}',true),('${other}',true),('${op}',true);
 insert into profiles values('${owner}','${co}','owner',true),('${worker}','${co}','worker',true);
 insert into sites(id,company_id,status,work_dates,customer_phone) values('${site}','${co}','scheduled',array['2099-11-05','2099-11-06']::date[],'010-1234-5678');`);
 await db.exec(await fs.readFile(new URL('../supabase/migrations/20261025015339_site_alimtalk_solapi.sql',import.meta.url),'utf8'));
 await db.exec(await fs.readFile(new URL('../supabase/migrations/20261025021023_customer_day_before_alimtalk.sql',import.meta.url),'utf8'));
 await db.exec((await fs.readFile(new URL('../supabase/migrations/20261025021846_operator_company_unlimited.sql',import.meta.url),'utf8')).split('-- Prevent future plan')[0]);
 await db.exec(await fs.readFile(new URL('../supabase/migrations/20261027113000_customer_schedule_change_alimtalk.sql',import.meta.url),'utf8'));
 await db.query('insert into alimtalk_accounts(company_id,enabled,available_count) values($1,true,5)',[co]);
 return db;
}
const events=async db=>(await db.query('select id,status,new_dates::text,old_dates::text from customer_schedule_alerts order by created_at')).rows;
const change=(db,dates=['2099-11-07','2099-11-08'])=>db.query('update sites set work_dates=$1::date[] where id=$2',[dates,site]);
const reserve=async(db,e,id=first,{company=co,actor=owner,dates=['2099-11-07','2099-11-08'],phone='01012345678',hash='a'.repeat(64)}={})=>(await db.query('select reserve_customer_schedule_alert($1,$2,$3,$4,$5,$6::date[],$7,$8,$9,$10) result',[e,id,company,site,actor,dates,phone,'010-****-5678','approved-template',hash])).rows[0].result;
const credits=async(db,c=co)=>(await db.query('select available_count from alimtalk_accounts where company_id=$1',[c])).rows[0].available_count;

test('installation, same dates, reorder, rollback and transient changes do not create customer messages',async()=>{
 const db=await setup();try{
 assert.equal((await events(db)).length,0);
 await change(db,['2099-11-06','2099-11-05','2099-11-06']);assert.equal((await events(db)).length,0);
 await db.exec('begin');await change(db);await db.exec('rollback');assert.equal((await events(db)).length,0);
 await db.exec('begin');await change(db);await change(db,['2099-11-05','2099-11-06']);await db.exec('commit');assert.equal((await events(db)).length,0);
 await db.exec('begin');await change(db,['2099-11-07']);await change(db);await db.exec('commit');
 const rows=await events(db);assert.equal(rows.length,1);assert.equal(rows[0].old_dates,'{2099-11-05,2099-11-06}');assert.equal(rows[0].new_dates,'{2099-11-07,2099-11-08}');
 assert.equal((await db.query('select count(*)::int n from app_private.customer_schedule_snapshots')).rows[0].n,0);
 }finally{await db.close();}
});
test('consultation/initial confirmation is separate; later removal or addition creates only the latest event',async()=>{
 const db=await setup();try{
 await db.exec("update sites set status='consulting'");await change(db);await db.exec("update sites set status='scheduled'");assert.equal((await events(db)).length,0);
 await change(db,['2099-11-07']);await change(db,['2099-11-07','2099-11-09']);
 assert.deepEqual((await events(db)).map(e=>e.status),['superseded','pending']);
 await db.exec("update sites set status='cancelled'");assert.ok((await events(db)).every(e=>e.status==='superseded'));
 await db.exec("update sites set status='in_progress'");await change(db,['2000-01-01']);await change(db,[]);assert.equal((await events(db)).length,2);
 }finally{await db.close();}
});
test('legacy KST range and explicit list compare by customer-visible dates',async()=>{
 const db=await setup();try{
 await db.exec("update sites set work_dates=null,schedule_start='2099-11-04T15:00:00Z',schedule_end='2099-11-06T08:00:00Z'");assert.equal((await events(db)).length,0);
 await db.exec("update sites set schedule_end='2099-11-07T08:00:00Z'");assert.equal((await events(db))[0].new_dates,'{2099-11-05,2099-11-06,2099-11-07}');
 }finally{await db.close();}
});
test('one reservation/charge per change even concurrently, pending old receipt does not block new dates, refunds once',async()=>{
 const db=await setup();try{
 await db.query("select reserve_site_alimtalk($1,$2,$3,$4,null,'customer_schedule','mask','template',$5,null,false)",[third,co,site,owner,'b'.repeat(64)]);
 await change(db);const e=(await events(db))[0].id;
 const results=await Promise.all([reserve(db,e),reserve(db,e)]);assert.equal(results.filter(r=>r.accepted).length,1);assert.equal(await credits(db),3);
 await db.query("select settle_alimtalk($1,'unknown',null,'timeout')",[first]);assert.equal((await reserve(db,e,second)).accepted,false);
 await db.query("select settle_alimtalk($1,'failed',null,'4040')",[first]);await db.query("select settle_alimtalk($1,'failed',null,'4040')",[first]);assert.equal(await credits(db),4);
 await change(db,['2099-11-05','2099-11-06']);const e2=(await events(db)).at(-1).id;
 assert.equal((await reserve(db,e2,second,{dates:['2099-11-05','2099-11-06'],hash:'b'.repeat(64)})).accepted,true);assert.equal(await credits(db),3);
 }finally{await db.close();}
});
test('stale payload, edited phone, foreign tenant, worker, disabled wallet and expired event never send',async()=>{
 const db=await setup();try{
 await change(db);const e=(await events(db))[0].id;
 assert.equal((await reserve(db,e,first,{dates:['2099-11-07']})).reason,'stale');
 assert.equal((await reserve(db,e,first,{phone:'01099999999'})).reason,'stale');
 await assert.rejects(reserve(db,e,first,{company:other}),x=>x.code==='42501');
 await assert.rejects(reserve(db,e,first,{actor:worker}),x=>x.code==='42501');
 assert.equal((await reserve(db,e,first,{company:other,actor:null})).reason,'inactive');
 await db.exec('update alimtalk_accounts set enabled=false');assert.equal((await reserve(db,e)).reason,'disabled');
 await db.exec('update alimtalk_accounts set enabled=true,available_count=0');assert.equal((await reserve(db,e)).reason,'insufficient');
 await db.exec("update customer_schedule_alerts set expires_at=now()-interval '1 second'");assert.equal((await reserve(db,e)).reason,'stale');
 assert.equal((await events(db))[0].status,'expired');assert.equal((await db.query('select count(*)::int n from alimtalk_deliveries')).rows[0].n,0);
 const permission=await db.query("select has_table_privilege('authenticated','customer_schedule_alerts','select') as readable,has_function_privilege('anon','reserve_customer_schedule_alert(uuid,uuid,uuid,uuid,uuid,date[],text,text,text,text)','execute') as callable");assert.deepEqual(permission.rows[0],{readable:false,callable:false});
 }finally{await db.close();}
});
test('an exact manual notice after the edit suppresses auto duplicate; operator still needs no credits',async()=>{
 const db=await setup();try{
 await change(db);const e=(await events(db))[0].id;
 await db.query("select reserve_site_alimtalk($1,$2,$3,$4,null,'customer_schedule','mask','template',$5,null,false)",[third,co,site,owner,'a'.repeat(64)]);
 assert.equal((await reserve(db,e)).reason,'duplicate');assert.equal((await events(db))[0].status,'superseded');assert.equal(await credits(db),4);
 await db.query('update sites set company_id=$1',[op]);await db.query('update profiles set company_id=$1 where id=$2',[op,owner]);
 await change(db,['2099-11-10']);const next=(await events(db)).at(-1).id;
 assert.equal((await reserve(db,next,second,{company:op,dates:['2099-11-10']})).accepted,true);assert.equal(await credits(db,op),0);
 await db.query("select settle_alimtalk($1,'failed',null,'4040')",[second]);assert.equal(await credits(db,op),0);
 }finally{await db.close();}
});
