import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
const co='00000000-0000-4000-8000-000000000001',u='00000000-0000-4000-8000-000000000002',other='00000000-0000-4000-8000-000000000003',lease='00000000-0000-4000-8000-000000000004';
test('calendar freeze rejects in-flight and unattributed history, skips affected claims and preserves unrelated users',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema app_private;
 create table freezes(company_id uuid);create function app_private.authorize_company_cleanup(uuid,uuid) returns void language sql as $$select$$;
 create function freeze_company_storage_writes(uuid,uuid) returns jsonb language plpgsql as $$begin insert into public.freezes values($1);return jsonb_build_object('companyId',$1);end;$$;
 create table profiles(id uuid,company_id uuid);insert into profiles values('${u}','${co}');
 create table workers(user_id uuid,company_id uuid);create table calendar_auto_events(user_id uuid,company_id uuid,site_id uuid);
 create table calendar_auto_connections(user_id uuid primary key,enabled boolean default true,needs_reconnect boolean default false,next_run_at timestamptz default now(),lease_id uuid,lease_until timestamptz);
 insert into calendar_auto_connections(user_id,lease_id,lease_until) values('${u}','${lease}',now()-interval '1 hour'),('${other}',null,null);`);
 await db.exec(await readFile(new URL('../database/account_deletion_company_calendar_freeze.sql',import.meta.url),'utf8'));
 const run=()=>db.query('select freeze_company_calendar_jobs($1,$2) plan',[co,lease]);
 await assert.rejects(run(),/execution must stop/);assert.equal((await db.query('select count(*)::int n from freezes')).rows[0].n,0);
 await db.exec('update calendar_auto_connections set lease_id=null,lease_until=null');
 await db.query('insert into calendar_auto_events(user_id) values($1)',[u]);
 await assert.rejects(run(),/Unattributed/);assert.equal((await db.query('select count(*)::int n from freezes')).rows[0].n,0);
 await db.query('update calendar_auto_events set company_id=$1,site_id=$1',[co]);
 assert.equal((await run()).rows[0].plan.knownCalendarUsersFrozen,true);
 assert.equal((await db.query('select calendar_company_sync_allowed($1) ok',[u])).rows[0].ok,false);
 assert.equal((await db.query('select * from calendar_auto_claim($1)',[u])).rows.length,0);
 assert.equal((await db.query('select * from calendar_auto_claim($1)',[other])).rows[0].user_id,other);
 await assert.rejects(db.query('update calendar_auto_connections set lease_id=$1 where user_id=$2',[lease,u]),/synchronization is frozen/);
 await db.exec('delete from profiles;delete from calendar_auto_events');
 assert.equal((await db.query('select calendar_company_sync_allowed($1) ok',[u])).rows[0].ok,false);
 assert.equal((await db.query("select has_function_privilege('authenticated','freeze_company_calendar_jobs(uuid,uuid)','execute') ok")).rows[0].ok,false);
 }finally{await db.close();}
});
