import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
const co='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002',u='00000000-0000-4000-8000-000000000003',l='00000000-0000-4000-8000-000000000004';
test('site photo cleanup rejects unresolved originals, preserves independent photos, rolls back on lease loss and blocks shared resurrection',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema app_private;create schema storage;
 create table account_deletion_requests(id uuid,company_deletion_id uuid,user_id uuid,identity_verified boolean,scope text,status text,lease_token uuid,lease_until timestamptz);
 insert into account_deletion_requests values('${co}','${co}','${u}',true,'personal_account','processing','${l}',now()+interval '5 minutes');
 create function app_private.authorize_company_cleanup(uuid,uuid) returns void language sql as $$select$$;
 create function inspect_company_deletion_scope(uuid) returns jsonb language sql as $$select '{}'::jsonb$$;
 create function assert_account_deletion_lease(uuid,uuid,uuid) returns boolean language sql as $$select true$$;
 create table app_private.company_write_freezes(company_id uuid,request_id uuid);insert into app_private.company_write_freezes values('${co}','${co}');
 create table sites(id uuid primary key,company_id uuid);insert into sites values('${co}','${co}'),('${other}','${other}');
 create table site_photos(id int primary key,company_id uuid,site_id uuid references sites,storage_path text,photo_url text,description text);
 create table storage.objects(bucket_id text,name text);`);
 const shared=await readFile(new URL('../database/account_deletion_shared_photo_references.sql',import.meta.url),'utf8');
 await db.exec(shared.slice(0,shared.indexOf('drop trigger'))+'commit;');
 await db.exec(await readFile(new URL('../database/account_deletion_company_site_photos.sql',import.meta.url),'utf8'));
 const path=`sites/${co}/a.jpg`,own=`sites/${other}/b.jpg`;
 await db.query('insert into site_photos values(1,$1,$1,$3,null,null),(2,$2,$2,$3,null,null),(3,$2,$2,$4,null,null)',[co,other,path,own]);
 const run=()=>db.query('select delete_company_site_photo_references($1,$2) ok',[co,l]);
 const count=async table=>(await db.query(`select count(*)::int n from ${table}`)).rows[0].n;
 await db.query("insert into storage.objects values('work-photos',$1)",[path]);
 await assert.rejects(run(),/files remain/);assert.equal(await count('site_photos'),3);
 await db.exec('delete from storage.objects');
 for(const bad of ['legacy/a.jpg',`sites/${co}/../a.jpg`,`sites/${co}/%61.jpg`,`sites/${co}/a\\b.jpg`]){
 await db.query('update site_photos set storage_path=$1 where id=1',[bad]);await assert.rejects(run(),/ownership/);
 }
 await db.query('update site_photos set storage_path=$1,photo_url=$2 where id=1',[path,'https://untrusted.example/a.jpg']);
 await assert.rejects(run(),/URL/);
 await db.query('update site_photos set photo_url=$1 where id=1',[`https://test.supabase.co/storage/v1/object/sign/work-photos/${path}?token=example`]);
 await db.query('update site_photos set description=$1 where id=3',[path]);await assert.rejects(run(),/Embedded/);
 await db.exec('update site_photos set description=null');
 await db.exec('create or replace function assert_account_deletion_lease(uuid,uuid,uuid) returns boolean language sql as $$select false$$;');
 await assert.rejects(run(),/expired/);assert.equal(await count('site_photos'),3);assert.equal(await count('app_private.company_deleted_photo_paths'),0);
 await db.exec('create or replace function assert_account_deletion_lease(uuid,uuid,uuid) returns boolean language sql as $$select true$$;');
 assert.equal((await run()).rows[0].ok,true);assert.equal((await run()).rows[0].ok,true);
 assert.deepEqual((await db.query('select storage_path from site_photos')).rows,[{storage_path:own}]);assert.equal(await count('sites'),2);
 await assert.rejects(db.query('insert into site_photos values(4,$1,$1,$2,null,null)',[other,path]),/pending permanent deletion/);
 await assert.rejects(db.query('select delete_company_site_photo_references($1,$2)',[co,u]),/lease required/);
 assert.equal((await db.query("select has_function_privilege('authenticated','delete_company_site_photo_references(uuid,uuid)','EXECUTE') ok")).rows[0].ok,false);
 }finally{await db.close();}
});
