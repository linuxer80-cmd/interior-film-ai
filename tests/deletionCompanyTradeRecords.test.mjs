import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
const co='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002',u='00000000-0000-4000-8000-000000000003',l='00000000-0000-4000-8000-000000000004';
test('frozen trade cleanup preserves foreign records and rolls back preceding business deletion if dependencies remain',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema app_private;
 create table companies(id uuid primary key);insert into companies values('${co}'),('${other}');create table sites(company_id uuid);
 create table account_deletion_requests(id uuid,company_deletion_id uuid,user_id uuid,identity_verified boolean,scope text,status text,lease_token uuid,lease_until timestamptz);
 insert into account_deletion_requests values('${co}','${co}','${u}',true,'personal_account','processing','${l}',now()+interval '5 minutes');
 create function app_private.authorize_company_cleanup(uuid,uuid) returns void language sql as $$select$$;
 create function inspect_company_deletion_scope(uuid) returns jsonb language sql as $$select '{}'::jsonb$$;
 create function assert_account_deletion_lease(uuid,uuid,uuid) returns boolean language sql as $$select true$$;
 create table app_private.company_write_freezes(company_id uuid,request_id uuid);insert into app_private.company_write_freezes values('${co}','${co}');
 create table trade_clients(id uuid primary key,company_id uuid);insert into trade_clients values('${co}','${co}'),('${other}','${other}');
 create table trade_contacts(id uuid primary key,company_id uuid,client_id uuid references trade_clients);insert into trade_contacts values('${co}','${co}','${co}'),('${other}','${other}','${other}');
 create table trade_requests(company_id uuid);insert into trade_requests values('${co}'),('${other}');
 create table trade_site_links(company_id uuid,contact_id uuid references trade_contacts);insert into trade_site_links values('${other}','${co}');
 create table trade_payment_batches(company_id uuid,client_id uuid references trade_clients);insert into trade_payment_batches values('${co}','${co}');
 create table business_records(company_id uuid);insert into business_records values('${co}');
 create function delete_company_quote_records(uuid,uuid) returns boolean language sql as $$select true$$;
 create function delete_company_business_records(uuid,uuid) returns boolean language plpgsql as $$begin delete from public.business_records;return true;end;$$;`);
 await db.exec(await readFile(new URL('../database/account_deletion_company_trade_records.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../database/account_deletion_frozen_business.sql',import.meta.url),'utf8'));
 const run=()=>db.query('select delete_frozen_company_business_records($1,$2) ok',[co,l]);
 await assert.rejects(run(),/Cross-company/);
 assert.equal((await db.query('select count(*)::int n from business_records')).rows[0].n,1);
 await db.query('update trade_site_links set contact_id=$1',[other]);
 await assert.rejects(run(),/foreign key/);
 assert.equal((await db.query('select count(*)::int n from business_records')).rows[0].n,1);
 assert.equal((await db.query('select count(*)::int n from trade_contacts')).rows[0].n,2);
 await db.exec('delete from trade_payment_batches');
 assert.equal((await run()).rows[0].ok,true);assert.equal((await run()).rows[0].ok,true);
 for(const table of ['trade_clients','trade_contacts','trade_requests'])assert.deepEqual((await db.query(`select company_id from ${table}`)).rows,[{company_id:other}]);
 await assert.rejects(db.query('select delete_company_trade_records($1,$2)',[co,u]),/lease required/);
 }finally{await db.close();}
});
