import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const c='00000000-0000-4000-8000-000000000001',r='00000000-0000-4000-8000-000000000002',u='00000000-0000-4000-8000-000000000003',l='00000000-0000-4000-8000-000000000004',other='00000000-0000-4000-8000-000000000005';
test('empty company finalization refuses remaining records/files and preserves member accounts and other companies',async()=>{
const db=new PGlite();try{
await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;create schema app_private;
create table auth.users(id uuid primary key);insert into auth.users values('${u}'),('${other}');
create table companies(id uuid primary key);insert into companies values('${c}'),('${other}');
create table profiles(id uuid primary key references auth.users,company_id uuid references companies on delete set null,role text,is_active boolean);
insert into profiles values('${u}','${c}','owner',true),('${other}','${c}','worker',true);
create table account_deletion_requests(id uuid,company_deletion_id uuid,user_id uuid,identity_verified boolean,scope text,status text,lease_token uuid,lease_until timestamptz);
insert into account_deletion_requests values('${r}','${c}','${u}',true,'personal_account','processing','${l}',now()+interval '5 minutes');
create function assert_account_deletion_lease(uuid,uuid,uuid) returns boolean language sql as $$ select true $$;
create table estimate_result_cache(company_id uuid);create table estimate_cache_revisions(company_id uuid);insert into estimate_cache_revisions values('${c}'),('${other}');
create table sites(company_id uuid references companies on delete cascade);insert into sites values('${c}'),('${other}');
create table rewards(subject_key text);create table extra_links(tenant uuid references companies on delete cascade);
create table storage.objects(name text);
create table app_private.company_deleted_photo_paths(company_id uuid);insert into app_private.company_deleted_photo_paths values('${c}');`);
await db.exec(await readFile(new URL('../database/account_deletion_empty_company.sql',import.meta.url),'utf8'));
const run=()=>db.query('select delete_empty_company_record($1,$2) ok',[r,l]);
await assert.rejects(run(),/records remain/);assert.equal((await db.query('select count(*)::int n from estimate_cache_revisions')).rows[0].n,2);
await db.query('delete from sites where company_id=$1',[c]);await db.query('insert into rewards values($1)',[`company:${c}`]);await assert.rejects(run(),/records remain/);await db.exec('delete from rewards');
await db.query('insert into extra_links values($1)',[c]);await assert.rejects(run(),/references remain/);await db.exec('delete from extra_links');
await db.query('insert into storage.objects values($1)',[`history/${c}/file.jpg`]);await assert.rejects(run(),/files remain/);await db.exec('delete from storage.objects');
await db.query("update profiles set role='owner' where id=$1",[other]);await assert.rejects(run(),/Another active owner/);await db.query("update profiles set role='worker' where id=$1",[other]);
assert.equal((await run()).rows[0].ok,true);assert.equal((await run()).rows[0].ok,true);assert.ok((await db.query('select company_record_deleted_at from account_deletion_requests')).rows[0].company_record_deleted_at);
assert.equal((await db.query('select count(*)::int n from auth.users')).rows[0].n,2);
assert.equal((await db.query('select count(*)::int n from profiles where company_id is null')).rows[0].n,2);
assert.equal((await db.query('select id from companies')).rows[0].id,other);
assert.equal((await db.query('select count(*)::int n from sites')).rows[0].n,1);assert.equal((await db.query('select company_id from estimate_cache_revisions')).rows[0].company_id,other);
assert.equal((await db.query('select count(*)::int n from app_private.company_deleted_photo_paths')).rows[0].n,1);
assert.equal((await db.query("select has_function_privilege('authenticated','delete_empty_company_record(uuid,uuid)','EXECUTE') allowed")).rows[0].allowed,false);
}finally{await db.close();}
});
