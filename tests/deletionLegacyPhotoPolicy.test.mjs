import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
const a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002',o='00000000-0000-4000-8000-000000000003';
test('exact shared consent applies to either company, never third parties or replacement objects',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema app_private;create schema storage;create table public.companies(id uuid);create table app_private.company_write_freezes(company_id uuid);create table storage.objects(id uuid,bucket_id text,name text);create function inspect_company_deletion_scope(uuid) returns jsonb language sql as $$select jsonb_build_object('company_id',$1)$$;`);
 await db.exec(await readFile(new URL('../database/account_deletion_legacy_photo_policy.sql',import.meta.url),'utf8'));
 await db.query("insert into storage.objects values($1,'work-photos','customer/exact.jpg')",[o]);
 await db.query("insert into app_private.approved_shared_photo_deletions(bucket_id,path,object_id,company_ids,policy,approval_note) values('work-photos','customer/exact.jpg',$1,$2,'delete_original_and_all_references_on_either_company_deletion','synthetic consent')",[o,[a,b]]);
 const inspect=async c=>(await db.query('select inspect_approved_shared_photo_deletions($1) p',[c])).rows[0].p;
 for(const c of [a,b]){const p=await inspect(c);assert.equal(p.files.length,1);assert.equal(p.files[0].present,true);assert.equal(p.complete,false);}
 assert.deepEqual((await inspect(o)).files,[]);
 await db.query('update storage.objects set id=$1',[a]);await assert.rejects(inspect(a),/replaced/);
 await db.exec('delete from storage.objects');assert.equal((await inspect(b)).files[0].present,false);
 await db.query('insert into app_private.company_write_freezes values($1)',[b]);
 await assert.rejects(db.query("insert into storage.objects values($1,'work-photos','customer/exact.jpg')",[o]),/frozen/);
 await db.query("insert into storage.objects values($1,'work-photos','customer/unrelated.jpg')",[o]);
 assert.equal((await db.query("select has_function_privilege('authenticated','inspect_approved_shared_photo_deletions(uuid)','execute') ok")).rows[0].ok,false);
 }finally{await db.close();}
});
