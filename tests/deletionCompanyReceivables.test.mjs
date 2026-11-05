import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
const c='00000000-0000-4000-8000-000000000001',o='00000000-0000-4000-8000-000000000002',u='00000000-0000-4000-8000-000000000003',l='00000000-0000-4000-8000-000000000004';
test('company receivable deletion orders dependencies, rejects cross-company allocations, preserves control records and prevents re-creation',async()=>{
const db=new PGlite();try{
await db.exec(`create role anon;create role authenticated;create role service_role;create table companies(id uuid primary key);insert into companies values('${c}'),('${o}');
create table account_deletion_requests(id uuid,company_deletion_id uuid,user_id uuid,identity_verified boolean,scope text,status text,lease_token uuid,lease_until timestamptz);insert into account_deletion_requests values('${c}','${c}','${u}',true,'personal_account','processing','${l}',now()+interval '5 minutes');
create function inspect_company_deletion_scope(uuid) returns jsonb language sql as $$select '{}'::jsonb$$;create function assert_account_deletion_lease(uuid,uuid,uuid) returns boolean language sql as $$select true$$;
create table sites(id uuid primary key,company_id uuid);create table trade_clients(id uuid primary key,company_id uuid);
insert into sites values('${c}','${c}'),('${o}','${o}');insert into trade_clients values('${c}','${c}'),('${o}','${o}');
create table site_payment_accounts(site_id uuid,company_id uuid,primary key(site_id,company_id));insert into site_payment_accounts values('${c}','${c}'),('${o}','${o}');
create table site_payment_entries(id uuid primary key,site_id uuid,company_id uuid,amount numeric,foreign key(site_id,company_id) references site_payment_accounts on delete restrict);insert into site_payment_entries values('${c}','${c}','${c}',100),('${o}','${o}','${o}',200);
create table trade_payment_batches(id uuid primary key,company_id uuid,client_id uuid references trade_clients,amount numeric);insert into trade_payment_batches values('${c}','${c}','${c}',100),('${o}','${o}','${o}',200);
create table trade_payment_allocations(batch_id uuid references trade_payment_batches,entry_id uuid references site_payment_entries);insert into trade_payment_allocations values('${c}','${c}'),('${o}','${o}'),('${c}','${o}');`);
await db.exec(await readFile(new URL('../database/account_deletion_company_receivables.sql',import.meta.url),'utf8'));
const run=()=>db.query('select delete_company_receivables($1,$2) ok',[c,l]);await assert.rejects(run(),/Cross-company/);
assert.equal((await db.query('select count(*)::int n from site_payment_entries')).rows[0].n,2);
await db.query('delete from trade_payment_allocations where batch_id=$1 and entry_id=$2',[c,o]);assert.equal((await run()).rows[0].ok,true);assert.equal((await run()).rows[0].ok,true);
assert.deepEqual((await db.query('select company_id,amount from site_payment_entries')).rows,[{company_id:o,amount:'200'}]);
assert.equal((await db.query('select count(*)::int n from sites')).rows[0].n,2);assert.equal((await db.query('select count(*)::int n from trade_clients')).rows[0].n,2);
await assert.rejects(db.query('insert into site_payment_accounts values($1,$1)',[c]),/being deleted/);
assert.equal((await db.query("select has_function_privilege('authenticated','delete_company_receivables(uuid,uuid)','EXECUTE') allowed")).rows[0].allowed,false);
}finally{await db.close();}});
