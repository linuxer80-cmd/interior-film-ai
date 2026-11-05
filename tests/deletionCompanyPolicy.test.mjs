import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const u='00000000-0000-4000-8000-000000000001',o='00000000-0000-4000-8000-000000000002',c='00000000-0000-4000-8000-000000000003',foreign='00000000-0000-4000-8000-000000000004';
test('last-owner requests record company closure, inventory isolates company, retries cannot expand active execution scope',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table companies(id uuid primary key);
 create table profiles(id uuid primary key,company_id uuid references companies,role text,is_active boolean);
 create table account_deletion_requests(id uuid primary key default gen_random_uuid(),user_id uuid unique,status text default 'review_required',identity_verified boolean,identity_verified_at timestamptz,scope text,updated_at timestamptz);
 create table sites(id uuid primary key,company_id uuid references companies);
 create table history(site_id uuid references sites);
 create table rewards(subject_key text);
 insert into companies values('${c}'),('${foreign}');insert into profiles values('${u}','${c}','owner',true),('${o}','${c}','owner',true);
 insert into sites values('${c}','${c}'),('${foreign}','${foreign}');insert into history values('${c}');
 insert into rewards values('company:${c}'),('company:${foreign}'),('user:${u}');`);
 await db.exec(await readFile(new URL('../database/account_deletion_company_policy.sql',import.meta.url),'utf8'));
 const submit=async()=>(await db.query('select * from submit_account_deletion_request($1)',[u])).rows[0];
 let req=await submit();assert.equal(req.company_deletion_id,null);
 await db.query('update profiles set is_active=false where id=$1',[o]);req=await submit();assert.equal(req.company_deletion_id,c);
 const plan=(await db.query('select inspect_company_deletion_scope($1) plan',[req.id])).rows[0].plan;
 assert.equal(plan.preserve_other_auth_accounts,true);
 assert.equal(plan.direct_records.find(x=>x.table==='profiles').action,'detach_company');
 assert.equal(plan.direct_records.find(x=>x.table==='sites').action,'delete_company_records');
 assert.equal(plan.scope_complete,false);assert.equal(plan.storage_review_required,true);
 assert.equal(plan.direct_records.find(x=>x.table==='sites').rows,1);assert.equal(plan.direct_records.find(x=>x.table==='rewards').rows,1);
 assert.ok(plan.dependencies.some(x=>x.table==='public.history'&&x.parent==='public.sites'));
 await db.query('update profiles set is_active=true where id=$1',[o]);await assert.rejects(db.query('select inspect_company_deletion_scope($1)',[req.id]),/Another active owner/);
 req=await submit();assert.equal(req.company_deletion_id,null);
 await db.query("update account_deletion_requests set status='processing'");await db.query('update profiles set is_active=false where id=$1',[o]);
 req=await submit();assert.equal(req.company_deletion_id,null);assert.equal(req.status,'processing');
 assert.equal((await db.query('select count(*)::int n from sites')).rows[0].n,2);
 assert.equal((await db.query("select has_function_privilege('authenticated','inspect_company_deletion_scope(uuid)','EXECUTE') allowed")).rows[0].allowed,false);
 }finally{await db.close();}
});
