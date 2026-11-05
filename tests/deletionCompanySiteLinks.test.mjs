import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const c='00000000-0000-4000-8000-000000000001', o='00000000-0000-4000-8000-000000000002', u='00000000-0000-4000-8000-000000000003', l='00000000-0000-4000-8000-000000000004';

test('site link cleanup rejects foreign references, removes delivery dependencies first and retains photo evidence', async () => {
 const db=new PGlite();
 try {
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema app_private;
  create table companies(id uuid primary key);insert into companies values('${c}'),('${o}');
  create table account_deletion_requests(id uuid,company_deletion_id uuid,user_id uuid,identity_verified boolean,scope text,status text,lease_token uuid,lease_until timestamptz);
  insert into account_deletion_requests values('${c}','${c}','${u}',true,'personal_account','processing','${l}',now()+interval '5 minutes');
  create function inspect_company_deletion_scope(uuid) returns jsonb language sql as $$select '{}'::jsonb$$;
  create function assert_account_deletion_lease(uuid,uuid,uuid) returns boolean language sql as $$select true$$;
  create table sites(id uuid primary key,company_id uuid);insert into sites values('${c}','${c}'),('${o}','${o}');
  create table customer_schedule_alerts(id uuid primary key,company_id uuid,site_id uuid references sites);
  insert into customer_schedule_alerts values('${c}','${c}','${c}'),('${o}','${o}','${o}');
  create table alimtalk_deliveries(company_id uuid,site_id uuid references sites,customer_schedule_alert_id uuid references customer_schedule_alerts,status text default 'success',accounting text default 'charged');
  insert into alimtalk_deliveries(company_id,site_id,customer_schedule_alert_id) values('${c}','${c}','${c}'),('${o}','${o}','${c}');
  create table site_photos(company_id uuid,site_id uuid references sites,storage_path text);
  insert into site_photos values('${c}','${c}','legacy/original.jpg');`);
  for(const t of ['customer_site_portals','consultation_registration_requests','trade_site_links']) {
   await db.exec(`create table ${t}(company_id uuid,site_id uuid references sites);insert into ${t} values('${c}','${c}'),('${o}','${o}');`);
  }
  const sql=await readFile(new URL('../database/account_deletion_company_site_links.sql',import.meta.url),'utf8');
  await db.exec(sql);await db.exec(sql);
  const run=()=>db.query('select delete_company_site_links($1,$2) ok',[c,l]);
  await assert.rejects(db.query('select delete_company_site_links($1,$2)',[c,u]),/lease required/);
  await assert.rejects(run(),/Cross-company/);
  assert.equal((await db.query('select count(*)::int n from customer_site_portals')).rows[0].n,2);
  await db.query('update alimtalk_deliveries set customer_schedule_alert_id=$1 where company_id=$1',[o]);
  await db.query("update alimtalk_deliveries set status='unknown' where company_id=$1",[c]);
  await assert.rejects(run(),/Unsettled company delivery/);
  assert.equal((await db.query('select count(*)::int n from customer_site_portals')).rows[0].n,2);
  await db.query("update alimtalk_deliveries set status='success' where company_id=$1",[c]);
  assert.equal((await run()).rows[0].ok,true);assert.equal((await run()).rows[0].ok,true);
  for(const t of ['alimtalk_deliveries','customer_schedule_alerts','customer_site_portals','consultation_registration_requests','trade_site_links']) {
   assert.deepEqual((await db.query(`select company_id from ${t}`)).rows,[{company_id:o}]);
  }
  assert.equal((await db.query('select storage_path from site_photos')).rows[0].storage_path,'legacy/original.jpg');
  assert.equal((await db.query('select count(*)::int n from sites')).rows[0].n,2);
  await assert.rejects(db.query('insert into customer_site_portals values($1,$1)',[c]),/being deleted/);
  assert.equal((await db.query("select has_function_privilege('authenticated','delete_company_site_links(uuid,uuid)','EXECUTE') ok")).rows[0].ok,false);
 } finally {await db.close();}
});
