import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
const co='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002',u='00000000-0000-4000-8000-000000000003',l='00000000-0000-4000-8000-000000000004';
test('site finalization refuses cascade children, files and calendar residue, preserving controls and ordinary effects',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema app_private;create schema storage;
 create table account_deletion_requests(id uuid,company_deletion_id uuid,user_id uuid,identity_verified boolean,scope text,status text,lease_token uuid,lease_until timestamptz);
 insert into account_deletion_requests values('${co}','${co}','${u}',true,'personal_account','processing','${l}',now()+interval '5 minutes');
 create function app_private.authorize_company_cleanup(uuid,uuid) returns void language sql as $$select$$;
 create function inspect_company_deletion_scope(uuid) returns jsonb language sql as $$select '{}'::jsonb$$;
 create function assert_account_deletion_lease(uuid,uuid,uuid) returns boolean language sql as $$select true$$;
 create table app_private.company_write_freezes(company_id uuid,request_id uuid);insert into app_private.company_write_freezes values('${co}','${co}');
 create table sites(id uuid primary key,company_id uuid,unique(id,company_id));insert into sites values('${co}','${co}'),('${other}','${other}');
 create table children(location uuid references sites on delete cascade);
 create table composite_children(location uuid,tenant uuid,foreign key(location,tenant) references sites(id,company_id) on delete cascade);



 create table storage.objects(bucket_id text,name text);`);
 await db.exec(`create table app_private.company_frozen_calendar_users(company_id uuid,request_id uuid,user_id uuid);insert into app_private.company_frozen_calendar_users values('${co}','${co}','${u}');
 create table app_private.company_cleanup_context(company_id uuid,request_id uuid,lease_token uuid,transaction_id bigint,backend_id int);
 create or replace function app_private.authorize_company_cleanup(uuid,uuid) returns void language plpgsql as $$begin delete from app_private.company_cleanup_context;insert into app_private.company_cleanup_context values('${co}',$1,$2,txid_current(),pg_backend_pid());end;$$;
 create table calendar_auto_events(company_id uuid,site_id uuid);create table calendar_auto_connections(user_id uuid,lease_id uuid);
 create table effects(site_id uuid);create function app_private.calendar_auto_changed() returns trigger language plpgsql as $$
begin
 insert into public.effects values(old.id);return old;
end;$$;
 create trigger calendar_test after delete on sites for each row execute function app_private.calendar_auto_changed();`);
 await db.exec(await readFile(new URL('../database/account_deletion_company_sites.sql',import.meta.url),'utf8'));
 await db.exec(`create table companies(id uuid primary key);
 create trigger calendar_company_test after insert on companies for each row execute function app_private.calendar_auto_changed();
 insert into companies values('${u}');delete from effects;`);
 const run=()=>db.query('select delete_empty_company_sites($1,$2) ok',[co,l]);
 await db.query('insert into children values($1)',[co]);await assert.rejects(run(),/dependent records/);await db.exec('delete from children');
 await db.query('insert into composite_children values($1,$1)',[co]);await assert.rejects(run(),/dependent records/);await db.exec('delete from composite_children');
 await db.query("insert into storage.objects values('work-photos',$1)",[`sites/${co}/x.jpg`]);await assert.rejects(run(),/files remain/);await db.exec('delete from storage.objects');
 await db.query('insert into calendar_auto_events values($1,$1)',[co]);await assert.rejects(run(),/history/);await db.exec('delete from calendar_auto_events');
 await db.query('insert into calendar_auto_connections values($1,$2)',[u,l]);await assert.rejects(run(),/execution/);await db.exec('delete from calendar_auto_connections');
 await db.exec('create or replace function assert_account_deletion_lease(uuid,uuid,uuid) returns boolean language sql as $$select false$$;');await assert.rejects(run(),/expired/);
 assert.equal((await db.query('select count(*)::int n from sites')).rows[0].n,2);
 await db.exec('create or replace function assert_account_deletion_lease(uuid,uuid,uuid) returns boolean language sql as $$select true$$;');
 assert.equal((await run()).rows[0].ok,true);assert.equal((await run()).rows[0].ok,true);
 assert.equal((await db.query('select count(*)::int n from effects')).rows[0].n,0);
 assert.deepEqual((await db.query('select id from sites')).rows,[{id:other}]);
 await db.query('delete from sites where id=$1',[other]);assert.deepEqual((await db.query('select site_id from effects')).rows,[{site_id:other}]);
 }finally{await db.close();}
});
