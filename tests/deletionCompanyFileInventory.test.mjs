import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const c='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
test('server inventory uses company and thread ownership, preserves unrelated files and remains incomplete',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema storage;create schema app_private;
 create table app_private.company_frozen_chat_threads(thread_id uuid primary key,company_id uuid not null);
 create table storage.objects(bucket_id text,name text);
 create table work_photos(company_id uuid,storage_path text,photo_url text);
 create table site_photos(company_id uuid,storage_path text,photo_url text);
 create table estimate_photos(company_id uuid,storage_path text,photo_url text);
 create table photo_case_management(company_id uuid,storage_path text,photo_url text);
 create table customer_leads(company_id uuid,customer_photo_path text);
 create table site_extra_work(company_id uuid,photo_paths jsonb);
 create table estimate_usage(company_id uuid,photo_paths jsonb);
 create table customer_chat_threads(id uuid,company_id uuid);
 create function inspect_company_deletion_scope(uuid) returns jsonb language sql as $$ select jsonb_build_object('company_id',$1) $$;
 insert into customer_chat_threads values('${c}','${c}'),('${other}','${other}');
 insert into storage.objects values('work-photos','sites/${c}/x.jpg'),('work-photos','history/${other}/x.jpg'),('customer-chat','${c}/x.jpg'),('customer-chat','${other}/x.jpg'),('labor-avatars','${c}/x.jpg'),('film-samples','${c}/x.jpg'),('company-showcase','${c}/x.jpg'),('work-photos','customer/${c}/legacy.jpg');`);
 await db.exec(await readFile(new URL('../database/account_deletion_company_files.sql',import.meta.url),'utf8'));
 const p=(await db.query('select inspect_company_deletion_files($1) p',[c])).rows[0].p;
 assert.equal(p.complete,false);assert.deepEqual(p.chatThreadIds,[c]);assert.equal(p.files.length,3);assert.deepEqual(p.sharedFiles,[]);
 await db.query('insert into site_photos values($1,$2,null)',[other,`sites/${c}/x.jpg`]);
 const shared=(await db.query('select inspect_company_deletion_files($1) p',[c])).rows[0].p;
 assert.equal(shared.files.length,3);assert.equal(shared.sharedFilePolicy,'delete_original_and_references');assert.equal(shared.sharedFiles.length,1);assert.equal(shared.complete,false);
 await db.exec('delete from site_photos');
 await db.query('insert into site_extra_work values($1,$2)',[other,JSON.stringify([`sites/${c}/x.jpg`])]);
 assert.equal((await db.query('select inspect_company_deletion_files($1) p',[c])).rows[0].p.sharedFiles.length,1);
 // A retry must still find attachments after the parent thread was deleted.
 await db.query('insert into app_private.company_frozen_chat_threads values($1,$1)',[c]);
 await db.query('delete from customer_chat_threads where id=$1',[c]);
 const retry=(await db.query('select inspect_company_deletion_files($1) p',[c])).rows[0].p;
 assert.deepEqual(retry.chatThreadIds,[c]);assert.equal(retry.files.length,3);
 assert.ok(retry.files.some(f=>f.bucket==='customer-chat'&&f.path===`${c}/x.jpg`));
 // A conflicting live row must fail for both possible company claims.
 await db.query('insert into customer_chat_threads values($1,$2)',[c,other]);
 for(const company of [c,other])await assert.rejects(db.query('select inspect_company_deletion_files($1)',[company]),/snapshot mismatch/);
 assert.equal((await db.query('select count(*)::int n from storage.objects')).rows[0].n,8);
 assert.equal((await db.query("select has_function_privilege('authenticated','inspect_company_deletion_files(uuid)','EXECUTE') allowed")).rows[0].allowed,false);
 }finally{await db.close();}
});
