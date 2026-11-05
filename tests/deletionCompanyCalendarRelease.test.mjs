import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
import {releaseCompanyCalendarPause} from '../lib/deletionCompanyCalendarRelease.mjs';
const co='00000000-0000-4000-8000-000000000001',u='00000000-0000-4000-8000-000000000002',other='00000000-0000-4000-8000-000000000003',lease='00000000-0000-4000-8000-000000000004';
test('release requires remote verification and a still-valid lease before any DB write',async()=>{
 let calls=0;const args={db:{rpc:async()=>{calls++;return {data:true};}},requestId:co,lease,assertLease:async()=>true,verifyRemote:async()=>false};
 await assert.rejects(releaseCompanyCalendarPause(args),/not verified/);assert.equal(calls,0);
 args.verifyRemote=async()=>true;let checks=0;args.assertLease=async()=>++checks===1;
 await assert.rejects(releaseCompanyCalendarPause(args),/lease/);assert.equal(calls,0);
 args.assertLease=async()=>true;assert.equal(await releaseCompanyCalendarPause(args),true);assert.equal(calls,1);
});
test('release refuses remaining scope and only removes this company pause without enabling disconnected users',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema app_private;
 create table account_deletion_requests(id uuid,company_deletion_id uuid,user_id uuid,subject_id uuid,identity_verified boolean,scope text,status text,company_record_deleted_at timestamptz,lease_token uuid,lease_until timestamptz);
 insert into account_deletion_requests values('${co}','${co}','${u}',null,true,'personal_account','processing',now(),'${lease}',now()+interval '5 minutes');
 create table companies(id uuid);insert into companies values('${co}');create table profiles(company_id uuid);create table workers(company_id uuid);
 create table calendar_auto_events(user_id uuid,company_id uuid,site_id uuid);
 create table account_deletion_blocks(user_id uuid);insert into account_deletion_blocks values('${u}');
 create table app_private.company_write_freezes(company_id uuid,request_id uuid);insert into app_private.company_write_freezes values('${co}','${co}');
 create table app_private.company_frozen_calendar_users(company_id uuid,user_id uuid,request_id uuid);insert into app_private.company_frozen_calendar_users values('${co}','${other}','${co}'),('${lease}','${other}','${lease}');
 create table calendar_auto_connections(user_id uuid,lease_id uuid,enabled boolean,needs_reconnect boolean,next_run_at timestamptz);
 insert into calendar_auto_connections values('${other}',null,true,false,'2100-01-01');`);
 await db.exec(await readFile(new URL('../database/account_deletion_company_calendar_release.sql',import.meta.url),'utf8'));
 const run=()=>db.query('select release_company_calendar_jobs($1,$2) ok',[co,lease]);
 await assert.rejects(run(),/scope remains/);
 assert.equal((await db.query('select count(*)::int n from app_private.company_frozen_calendar_users')).rows[0].n,2);
 await db.exec('delete from companies');
 await db.query('insert into calendar_auto_events(user_id) values($1)',[other]);await assert.rejects(run(),/Unattributed/);
 await db.exec('delete from calendar_auto_events');
 assert.equal((await run()).rows[0].ok,true);assert.equal((await run()).rows[0].ok,true);
 assert.deepEqual((await db.query('select company_id from app_private.company_frozen_calendar_users')).rows,[{company_id:lease}]);
 assert.equal((await db.query("select next_run_at='2100-01-01'::timestamptz unchanged from calendar_auto_connections")).rows[0].unchanged,true);
 await db.exec(`delete from app_private.company_frozen_calendar_users;insert into app_private.company_frozen_calendar_users values('${co}','${other}','${co}');update calendar_auto_connections set enabled=false;`);
 await run();assert.equal((await db.query('select enabled from calendar_auto_connections')).rows[0].enabled,false);
 assert.equal((await db.query("select has_function_privilege('authenticated','release_company_calendar_jobs(uuid,uuid)','execute') ok")).rows[0].ok,false);
 }finally{await db.close();}
});
