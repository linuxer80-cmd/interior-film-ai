import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {inspectDeletionReferences} from '../lib/deletionReferenceCheck.mjs';
const u='00000000-0000-4000-8000-000000000001',o='00000000-0000-4000-8000-000000000002';
test('reference inventory finds UUID actors and exact personal subject keys without treating company rewards as personal',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema app_private;
 create table auth.users(id uuid primary key);
 create table linked(actor_id uuid references auth.users);
 create table badge_ai_requests(actor uuid);
 create table awards(subject_key text);
 create table app_private.hidden_rewards(subject_key varchar);
 insert into auth.users values('${u}');insert into linked values('${u}');
 insert into badge_ai_requests values('${u}'),('${o}');
 insert into awards values('user:${u}'),('company:${u}'),('user:${u}-suffix'),('user:${o}');
 insert into app_private.hidden_rewards values('user:${u}');`);
 await db.exec(await readFile(new URL('../database/account_deletion_reference_inventory.sql',import.meta.url),'utf8'));
 const rpc={rpc:async(name,{p_user})=>({data:(await db.query('select inspect_account_deletion_references($1) refs',[p_user])).rows[0].refs})};
 const result=await inspectDeletionReferences(rpc,u);assert.equal(result.blocked,true);
 assert.deepEqual(result.references.map(x=>`${x.schema}.${x.table}.${x.column}:${x.rows}`).sort(),['app_private.hidden_rewards.subject_key:1','public.awards.subject_key:1','public.badge_ai_requests.actor:1','public.linked.actor_id:1']);
 await db.query('delete from linked');await db.query('delete from badge_ai_requests where actor=$1',[u]);await db.query('delete from awards where subject_key=$1',['user:'+u]);await db.query('delete from app_private.hidden_rewards');
 assert.deepEqual(await inspectDeletionReferences(rpc,u),{references:[],blocked:false});
 assert.equal((await db.query("select has_function_privilege('authenticated','inspect_account_deletion_references(uuid)','EXECUTE') allowed")).rows[0].allowed,false);
 }finally{await db.close();}
});
