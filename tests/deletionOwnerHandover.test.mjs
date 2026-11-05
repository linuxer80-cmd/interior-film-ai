import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const u='00000000-0000-4000-8000-000000000001',o='00000000-0000-4000-8000-000000000002',r='00000000-0000-4000-8000-000000000003',l='00000000-0000-4000-8000-000000000004',c='00000000-0000-4000-8000-000000000005';
test('owner can detach only while another active owner remains; deleting the remaining owner is refused',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table account_deletion_requests(id uuid,user_id uuid,lease_token uuid,lease_until timestamptz,identity_verified boolean,scope text,status text,worker_ids uuid[] default '{}');
 create table account_deletion_blocks(user_id uuid primary key);
 create table companies(id uuid primary key);
 create table profiles(id uuid primary key,company_id uuid,role text,is_active boolean,updated_at timestamptz);
 create table workers(id uuid,user_id uuid,is_active boolean,updated_at timestamptz);
 create table worker_relationships(user_id uuid);
 create table push_subscriptions(user_id uuid);
 create function account_deletion_shared_auth_check(uuid) returns boolean language sql as $$select false$$;
 create function verify_account_deletion_core(uuid,uuid) returns jsonb language sql as $$select '{"clear":true}'::jsonb$$;
 insert into companies values('${c}');insert into profiles values('${u}','${c}','owner',true,now()),('${o}','${c}','owner',false,now());
 insert into account_deletion_requests(id,user_id,lease_token,lease_until,identity_verified,scope,status) values('${r}','${u}','${l}',now()+interval '5 minutes',true,'personal_account','processing');`);
 await db.exec(await readFile(new URL('../database/account_deletion_owner_handover.sql',import.meta.url),'utf8'));
 const block=()=>db.query('select block_account_deletion_access($1,$2)',[r,l]);
 const detach=()=>db.query('select detach_deleted_account_profile($1,$2)',[r,l]);
 await assert.rejects(block(),/Owner transfer required/);
 await db.query('update profiles set is_active=true where id=$1',[o]);await block();
 assert.equal((await db.query('select is_active from profiles where id=$1',[u])).rows[0].is_active,false);
 await db.query('update profiles set is_active=false where id=$1',[o]);await assert.rejects(detach(),/Owner transfer required/);
 await db.query('update profiles set is_active=true where id=$1',[o]);await detach();await detach();
 assert.deepEqual((await db.query('select id,is_active from profiles')).rows,[{id:o,is_active:true}]);
 await db.query('update account_deletion_requests set user_id=$1',[o]);await assert.rejects(block(),/Owner transfer required/);
 assert.equal((await db.query('select count(*)::int n from companies')).rows[0].n,1);
 await db.exec('alter table account_deletion_requests add column company_deletion_id uuid;alter table account_deletion_requests add column company_record_deleted_at timestamptz;');
 await db.query('update profiles set company_id=null where id=$1',[o]);await block();
 await assert.rejects(detach(),/Owner transfer required/);
 await db.query('update account_deletion_requests set company_deletion_id=$1,company_record_deleted_at=now()',[c]);
 await assert.rejects(detach(),/Owner transfer required/);
 await db.query('delete from companies where id=$1',[c]);await detach();
 assert.equal((await db.query('select count(*)::int n from profiles')).rows[0].n,0);
 }finally{await db.close();}
});
