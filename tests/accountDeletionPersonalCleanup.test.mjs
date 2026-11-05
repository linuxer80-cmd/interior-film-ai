import test from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {readFile} from 'node:fs/promises';import {createPersonalDeletionCleanup} from '../lib/accountDeletionPersonalCleanup.mjs';
const id='00000000-0000-4000-8000-000000000001';
test('real personal-scope assessment accepts clean accounts/avatars and refuses business data, owners and unknown files',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema storage;create schema app_private;create table companies(id uuid);create table app_private.company_frozen_calendar_users(company_id uuid,user_id uuid,request_id uuid);
 create table account_deletion_requests(id uuid,user_id uuid,subject_id uuid,company_deletion_id uuid,company_record_deleted_at timestamptz);insert into account_deletion_requests(id,user_id,subject_id) values('${id}','${id}','${id}');
 create table profiles(id uuid,role text,company_id uuid);create table storage.objects(bucket_id text,name text,owner_id text);
 create table test_refs(value jsonb);insert into test_refs values('[]');
 create function assert_account_deletion_lease(uuid,uuid,uuid) returns boolean language sql as $$select true$$;
 create function account_deletion_shared_auth_check(uuid) returns boolean language sql as $$select false$$;
 create function inspect_account_deletion_references(uuid) returns jsonb language sql as $$select value from public.test_refs$$;`);
 await db.exec(await readFile(new URL('../database/account_deletion_minimal_personal.sql',import.meta.url),'utf8'));
 const inspect=async()=>(await db.query('select inspect_minimal_personal_deletion($1,$1) p',[id])).rows[0].p;
 assert.equal((await inspect()).eligible,true);
 await db.query("insert into profiles(id,role) values($1,'owner')",[id]);assert.equal((await inspect()).eligible,false);
 await db.query('update account_deletion_requests set company_deletion_id=$1,company_record_deleted_at=now()',[id]);assert.equal((await inspect()).eligible,true);
 await db.query('insert into companies values($1)',[id]);assert.equal((await inspect()).eligible,false);
 await db.exec('delete from companies;update account_deletion_requests set company_record_deleted_at=null');
 await db.exec("update profiles set role='worker'");assert.equal((await inspect()).eligible,true);
 await db.query('insert into storage.objects values($1,$2,$3)',['labor-avatars',`${id}/${id}.png`,id]);assert.equal((await inspect()).eligible,true);assert.equal((await inspect()).filesRemaining,1);
 await db.exec("update storage.objects set bucket_id='work-photos'");assert.equal((await inspect()).eligible,false);
 await db.exec('delete from storage.objects');await db.query('update test_refs set value=$1',[JSON.stringify([{schema:'public',table:'workers'}])]);assert.equal((await inspect()).eligible,false);
 assert.equal((await db.query("select has_function_privilege('authenticated','inspect_minimal_personal_deletion(uuid,uuid)','execute') ok")).rows[0].ok,false);
 }finally{await db.close();}
});
test('cleanup refuses leftovers and rechecks detachment before Auth completion',async()=>{
 let state={subjectId:id,eligible:true,codes:[],filesRemaining:1,profileRemaining:true};
 const cleanup=createPersonalDeletionCleanup({rpc:async()=>({data:state})},{requestId:id,userId:id,getLease:()=>id});
 assert.equal((await cleanup.preflight()).complete,true);await assert.rejects(cleanup.deletePrivateFiles());
 state={...state,filesRemaining:0};await cleanup.deletePrivateFiles();await cleanup.scrubPersonalData();assert.equal(await cleanup.verifyBeforeAuthDeletion(),false);
 state={...state,profileRemaining:false};assert.equal(await cleanup.verifyBeforeAuthDeletion(),true);assert.equal(await cleanup.verifyComplete(),true);
 state={...state,eligible:false,codes:['unexpected_records']};assert.equal((await cleanup.preflight()).complete,false);assert.equal(await cleanup.verifyComplete(),false);
});
