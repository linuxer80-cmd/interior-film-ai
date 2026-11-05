import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
const co='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002',u='00000000-0000-4000-8000-000000000003',l='00000000-0000-4000-8000-000000000004';
test('extra work cleanup preserves foreign billing, rejects unresolved media and rolls back on lease loss',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema app_private;create schema storage;
 create table account_deletion_requests(id uuid,company_deletion_id uuid,user_id uuid,identity_verified boolean,scope text,status text,lease_token uuid,lease_until timestamptz);
 insert into account_deletion_requests values('${co}','${co}','${u}',true,'personal_account','processing','${l}',now()+interval '5 minutes');
 create function app_private.authorize_company_cleanup(uuid,uuid) returns void language sql as $$select$$;
 create function inspect_company_deletion_scope(uuid) returns jsonb language sql as $$select '{}'::jsonb$$;
 create function assert_account_deletion_lease(uuid,uuid,uuid) returns boolean language sql as $$select true$$;
 create table app_private.company_write_freezes(company_id uuid,request_id uuid);insert into app_private.company_write_freezes values('${co}','${co}');
 create table sites(id uuid primary key,company_id uuid);insert into sites values('${co}','${co}'),('${other}','${other}');
 create table site_extra_work(id int primary key,company_id uuid,site_id uuid references sites,photo_paths jsonb,description text,approved_amount numeric);
 create table storage.objects(bucket_id text,name text);`);
 const shared=await readFile(new URL('../database/account_deletion_shared_photo_references.sql',import.meta.url),'utf8');
 await db.exec(shared.slice(0,shared.indexOf('drop trigger'))+'commit;');
 const start=shared.indexOf('create or replace function app_private.remove_deleted_photo_paths');
 const end=shared.indexOf('-- Narrow cleanup');
 await db.exec(shared.slice(start,end));
 await db.exec(await readFile(new URL('../database/account_deletion_company_extra_work.sql',import.meta.url),'utf8'));
 const path=`extra-work/${co}/a.jpg`,own=`extra-work/${other}/b.jpg`;
 await db.query('insert into site_extra_work values(1,$1,$1,$3,\'target\',100),(2,$2,$2,$4,\'preserve\',999)',[co,other,JSON.stringify([path]),JSON.stringify([path,own])]);
 const run=()=>db.query('select delete_company_extra_work_records($1,$2) ok',[co,l]);
 const count=async table=>(await db.query(`select count(*)::int n from ${table}`)).rows[0].n;
 await db.query("insert into storage.objects values('work-photos',$1)",[path]);await assert.rejects(run(),/files remain/);
 await db.exec('delete from storage.objects');
 for(const bad of [null,{},[null],[{path}],['legacy/a.jpg'],[`extra-work/${co}/../a.jpg`],[own]]){
 await db.query('update site_extra_work set photo_paths=$1 where id=1',[JSON.stringify(bad)]);await assert.rejects(run(),/structure|ownership/);
 }
 await db.query('update site_extra_work set photo_paths=$1 where id=1',[JSON.stringify([path])]);
 await db.query('update site_extra_work set description=$1 where id=1',['https://unknown.example/original']);await assert.rejects(run(),/text reference/);
 await db.exec("update site_extra_work set description='target' where id=1");
 await db.query('update site_extra_work set description=$1 where id=2',[path]);await assert.rejects(run(),/Embedded/);
 await db.exec("update site_extra_work set description='preserve' where id=2");
 await db.query('update site_extra_work set site_id=$1 where id=1',[other]);await assert.rejects(run(),/Cross-company/);
 await db.query('update site_extra_work set site_id=$1 where id=1',[co]);
 await db.exec('create or replace function assert_account_deletion_lease(uuid,uuid,uuid) returns boolean language sql as $$select false$$;');
 await assert.rejects(run(),/expired/);assert.equal(await count('site_extra_work'),2);assert.equal(await count('app_private.company_deleted_photo_paths'),0);
 assert.deepEqual((await db.query('select photo_paths from site_extra_work where id=2')).rows[0].photo_paths,[path,own]);
 await db.exec('create or replace function assert_account_deletion_lease(uuid,uuid,uuid) returns boolean language sql as $$select true$$;');
 assert.equal((await run()).rows[0].ok,true);assert.equal((await run()).rows[0].ok,true);
 assert.deepEqual((await db.query('select photo_paths,description,approved_amount from site_extra_work')).rows,[{photo_paths:[own],description:'preserve',approved_amount:'999'}]);
 assert.equal(await count('sites'),2);
 await assert.rejects(db.query('update site_extra_work set photo_paths=$1',[JSON.stringify([path])]),/pending permanent deletion/);
 assert.equal((await db.query("select has_function_privilege('authenticated','delete_company_extra_work_records(uuid,uuid)','EXECUTE') ok")).rows[0].ok,false);
 }finally{await db.close();}
});
