import test from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {readFile} from 'node:fs/promises';
const id='00000000-0000-4000-8000-000000000001';
test('calendar provenance survives removal and unknown scope is never certified',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema app_private;
 create function app_private.guard_company_write_freeze() returns trigger language plpgsql as $$begin if tg_op='DELETE' then return old;end if;return new;end$$;
 create table calendar_auto_events(company_id uuid,user_id uuid,site_id uuid,event_id text);
 create table calendar_auto_connections(user_id uuid);
 create table sites(id uuid,company_id uuid);
 create table account_deletion_requests(id uuid,company_deletion_id uuid);
 create table app_private.company_frozen_calendar_users(company_id uuid,user_id uuid,request_id uuid);
 create function assert_company_deletion_frozen(uuid,uuid) returns boolean language sql as $$select true$$;
 create function freeze_company_calendar_jobs(uuid,uuid) returns jsonb language plpgsql as $$declare co uuid;begin perform user_id from calendar_auto_events where company_id=co union select user_id from app_private.company_frozen_calendar_users where company_id=co;return '{}';end$$;
 insert into calendar_auto_events values('${id}','${id}','${id}','fm'||repeat('a',64));
 insert into account_deletion_requests values('${id}','${id}');
 insert into app_private.company_frozen_calendar_users values('${id}','${id}','${id}');`);
 await db.exec(await readFile(new URL('../database/account_deletion_calendar_history.sql',import.meta.url),'utf8'));
 await db.exec('delete from calendar_auto_events');
 const p=(await db.query('select inspect_frozen_company_calendar_scope($1,$1) p',[id])).rows[0].p;
 const records=(await db.query('select inspect_company_calendar_deletion_ledger($1,$1) p',[id])).rows[0].p;
 assert.equal(records.length,1);assert.equal(records[0].event_id,'fm'+'a'.repeat(64));
 assert.deepEqual(p.siteIds,[id]);assert.deepEqual(p.userIds,[id]);assert.equal(p.usersComplete,false);assert.equal(p.sitesComplete,false);
 await db.exec('delete from app_private.company_frozen_calendar_users');await assert.rejects(db.query('select inspect_frozen_company_calendar_scope($1,$1)',[id]),/not frozen/);
 assert.equal((await db.query("select has_function_privilege('authenticated','inspect_frozen_company_calendar_scope(uuid,uuid)','execute') ok")).rows[0].ok,false);
 }finally{await db.close();}
});
