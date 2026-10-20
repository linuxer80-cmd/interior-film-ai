// Real PostgreSQL integration check using optional, pinned PGlite test runtime.
// CALENDAR_TEST_PGLITE=file:///.../@electric-sql/pglite/dist/index.js node --test test/calendar-queue-sql.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const {PGlite}=await import(process.env.CALENDAR_TEST_PGLITE);
const id=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
const u=id(1),v=id(2),w=id(3),co=id(10),foreign=id(11),site=id(20),other=id(21),wu=id(30),wv=id(31),ww=id(32),material=id(40);
const db=new PGlite();
await db.exec(`
create role anon;create role authenticated;create role service_role bypassrls;
create schema auth;create table auth.users(id uuid primary key);
create table public.companies(id uuid primary key,company_name text,is_active boolean);
create table public.profiles(id uuid primary key,is_active boolean);
create table public.workers(id uuid primary key,company_id uuid,user_id uuid,is_active boolean,name text);
create table public.sites(id uuid primary key,company_id uuid,site_name text,address text,address_detail text,memo text,work_type text,work_description text,status text,schedule_start date,schedule_end date,work_dates jsonb,contract_amount numeric);
create table public.site_workers(id uuid primary key,company_id uuid,site_id uuid,worker_id uuid,role text);
create table public.site_daily_assignments(id uuid primary key,company_id uuid,site_id uuid,worker_id uuid,role text,work_date date);
create table public.site_materials(id uuid primary key,company_id uuid,site_id uuid,material_type text,brand text,product_code text,product_name text,price_type text,memo text,quantity numeric);
insert into auth.users values('${u}'),('${v}'),('${w}');
insert into companies values('${co}','mine',true),('${foreign}','foreign',true);
insert into profiles values('${u}',true),('${v}',true),('${w}',true);
insert into workers values('${wu}','${co}','${u}',true,'u'),('${wv}','${co}','${v}',true,'v'),('${ww}','${foreign}','${w}',true,'w');
insert into sites(id,company_id,address) values('${site}','${co}','old'),('${other}','${foreign}','foreign');
insert into site_workers values('${id(50)}','${co}','${site}','${wu}','leader');
insert into site_materials(id,company_id,site_id,material_type,brand,quantity) values('${material}','${co}','${site}','planned','brand',0);
`);
await db.exec(await fs.readFile(new URL('../database/google_calendar_auto.sql',import.meta.url),'utf8'));
await db.exec(`insert into calendar_auto_connections(user_id,refresh_cipher) values('${u}','encrypted'),('${v}','encrypted'),('${w}','encrypted')`);
const queueSql=await fs.readFile(new URL('../database/google_calendar_queue.sql',import.meta.url),'utf8');
await db.exec(queueSql);
const query=async sql=>(await db.query(sql)).rows;
const clean=()=>db.exec("update calendar_auto_connections set synced_version=dirty_version,next_run_at=now()+interval '1 day',lease_id=null,lease_until=null,enabled=true,needs_reconnect=false");
const pending=async()=> (await query('select user_id from calendar_auto_connections where dirty_version>synced_version order by user_id')).map(r=>r.user_id);
const claim=async(user=u)=>(await query(`select * from calendar_auto_claim('${user}')`))[0];
async function scenario(name,fn){await test(name,async()=>{await clean();await fn();});}
await scenario('clean users do not run every five minutes',async()=>{assert.equal(await claim(),undefined);});
await scenario('site summary change enqueues assigned user only, not entire company or another company',async()=>{await db.exec(`update sites set address='new' where id='${site}'`);assert.deepEqual(await pending(),[u]);});
await scenario('financial-only and same-value site updates do not enqueue',async()=>{await db.exec(`update sites set contract_amount=100 where id='${site}';update sites set address=address where id='${site}'`);assert.deepEqual(await pending(),[]);});
await scenario('planned film edit queues; quantities and actual materials do not',async()=>{await db.exec(`update site_materials set quantity=5 where id='${material}'`);assert.deepEqual(await pending(),[]);await db.exec(`update site_materials set brand='new-brand' where id='${material}'`);assert.deepEqual(await pending(),[u]);});
await scenario('daily assignment invalidates old legacy assignee as well as new assignee',async()=>{await db.exec(`insert into site_daily_assignments values('${id(60)}','${co}','${site}','${wv}','member','2026-10-21')`);assert.deepEqual(await pending(),[u,v]);});
await scenario('deleting a daily assignment includes removed user',async()=>{await db.exec(`delete from site_daily_assignments where id='${id(60)}'`);assert.deepEqual(await pending(),[u,v]);});
await scenario('removing legacy assignment still queues its former assignee',async()=>{await db.exec(`delete from site_workers where id='${id(50)}'`);assert.deepEqual(await pending(),[u]);await db.exec(`insert into site_workers values('${id(50)}','${co}','${site}','${wu}','leader')`);});
await scenario('worker unlink queues previous app identity',async()=>{await db.exec(`update workers set user_id=null where id='${wu}'`);assert.deepEqual(await pending(),[u]);await db.exec(`update workers set user_id='${u}' where id='${wu}'`);});
await scenario('company summary change queues only that company memberships',async()=>{await db.exec(`update companies set company_name='renamed' where id='${co}'`);assert.deepEqual(await pending(),[u,v]);});
await scenario('repeated edits collapse into one queued user and overlap cannot claim same user',async()=>{await db.exec(`update sites set memo='one' where id='${site}';update sites set memo='two' where id='${site}'`);assert.deepEqual(await pending(),[u]);assert.ok(await claim());assert.equal(await claim(),undefined);});
await scenario('completion acknowledges only claimed version; changes during run stay queued',async()=>{
 await db.exec(`update sites set memo='before' where id='${site}'`);const c=await claim();
 await db.exec(`update sites set memo='during' where id='${site}'`);
 const result=await query(`select calendar_auto_complete('${u}','${c.generation}','${c.lease_id}',${c.dirty_version}) as done`);assert.equal(result[0].done,true);assert.deepEqual(await pending(),[u]);assert.ok(await claim());
});
await scenario('clean success waits a day but changes wake it immediately',async()=>{
 await db.exec(`update sites set memo='test' where id='${site}'`);const c=await claim();
 await query(`select calendar_auto_complete('${u}','${c.generation}','${c.lease_id}',${c.dirty_version})`);assert.equal(await claim(),undefined);
 const [r]=await query(`select next_run_at>now()+interval '23 hours' as later from calendar_auto_connections where user_id='${u}'`);assert.equal(r.later,true);
 await db.exec(`update sites set memo='wake' where id='${site}'`);assert.ok(await claim());
});
await scenario('daily sweep claims even an unchanged due user',async()=>{await db.exec(`update calendar_auto_connections set next_run_at=now()-interval '1 second' where user_id='${u}'`);assert.ok(await claim());});
await scenario('stale generation cannot complete replaced or disconnected connection',async()=>{
 await db.exec(`update sites set memo='stale' where id='${site}'`);const c=await claim();await db.exec(`update calendar_auto_connections set generation=gen_random_uuid() where user_id='${u}'`);
 const result=await query(`select calendar_auto_complete('${u}','${c.generation}','${c.lease_id}',${c.dirty_version}) as done`);assert.equal(result[0].done,false);
});
await scenario('reconnect-needed and disabled users are not queued',async()=>{await db.exec(`update calendar_auto_connections set needs_reconnect=true where user_id='${u}';update sites set memo='skip' where id='${site}'`);assert.deepEqual(await pending(),[]);assert.equal(await claim(),undefined);});
await scenario('public clients cannot execute queue helpers or read credentials',async()=>{
 const [r]=await query(`select has_function_privilege('authenticated','app_private.calendar_auto_changed()','execute') as trigger_access,has_function_privilege('anon','public.calendar_auto_complete(uuid,uuid,uuid,bigint)','execute') as complete_access,has_table_privilege('authenticated','public.calendar_auto_connections','select') as token_access`);assert.deepEqual(r,{trigger_access:false,complete_access:false,token_access:false});
});
await scenario('trigger works for an RLS-authorized source write without granting token-table access',async()=>{
 await db.exec(`grant usage on schema public to authenticated;grant update,select on sites to authenticated;alter table sites enable row level security;create policy own_site on sites to authenticated using(id='${site}') with check(id='${site}');set role authenticated;update sites set memo='rls allowed' where id='${site}';reset role;`);assert.deepEqual(await pending(),[u]);
});
await scenario('setup is idempotent and requeues without altering source data',async()=>{await db.exec(queueSql);assert.deepEqual(await pending(),[u,v,w]);});
await db.close();
