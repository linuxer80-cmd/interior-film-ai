import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
const co='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002',thread='00000000-0000-4000-8000-000000000003';
test('known company uploads stay frozen after chat deletion, while other-company uploads and file removal remain possible',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema app_private;create schema storage;
 create table companies(id uuid primary key);insert into companies values('${co}'),('${other}');
 create table app_private.company_write_freezes(company_id uuid primary key);
 create table customer_chat_threads(id uuid primary key,company_id uuid);insert into customer_chat_threads values('${thread}','${co}');
 create table storage.objects(bucket_id text,name text,primary key(bucket_id,name));
 insert into storage.objects values('work-photos','sites/${co}/old.jpg'),('work-photos','sites/${other}/control.jpg');
 create function freeze_company_direct_writes(uuid,uuid) returns jsonb language plpgsql as $$begin insert into app_private.company_write_freezes values($1) on conflict do nothing;return jsonb_build_object('companyId',$1,'complete',false);end;$$;`);
 const sql=await readFile(new URL('../database/account_deletion_company_storage_freeze.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);
 const result=(await db.query('select freeze_company_storage_writes($1,$1) value',[co])).rows[0].value;
 assert.equal(result.knownStorageUploadsFrozen,true);assert.equal(result.complete,false);
 for(const [bucket,path] of [['work-photos',`sites/${co}/new.jpg`],['work-photos',`history/${co}/new.jpg`],['company-showcase',`${co}/new.jpg`],['site-call-audio-private',`${co}/user/new.m4a`],['customer-chat',`${thread}/new.jpg`]])await assert.rejects(db.query('insert into storage.objects values($1,$2)',[bucket,path]),/uploads are frozen/);
 await db.query('delete from customer_chat_threads where id=$1',[thread]);
 await assert.rejects(db.query('insert into storage.objects values($1,$2)',['customer-chat',`${thread}/late.jpg`]),/uploads are frozen/);
 await assert.rejects(db.query('update storage.objects set name=$1 where name=$2',[`sites/${other}/moved.jpg`,`sites/${co}/old.jpg`]),/uploads are frozen/);
 await assert.rejects(db.query('update storage.objects set name=$1 where name=$2',[`sites/${co}/moved.jpg`,`sites/${other}/control.jpg`]),/uploads are frozen/);
 await db.query('insert into storage.objects values($1,$2)',['work-photos',`sites/${other}/new.jpg`]);
 await db.query('delete from storage.objects where name=$1',[`sites/${co}/old.jpg`]);
 assert.equal((await db.query('select count(*)::int n from storage.objects')).rows[0].n,2);
 assert.equal((await db.query("select has_function_privilege('authenticated','freeze_company_storage_writes(uuid,uuid)','execute') allowed")).rows[0].allowed,false);
 }finally{await db.close();}
});
