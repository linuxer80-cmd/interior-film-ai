import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
const c='00000000-0000-4000-8000-000000000001',o='00000000-0000-4000-8000-000000000002',u='00000000-0000-4000-8000-000000000003',l='00000000-0000-4000-8000-000000000004';
test('work history cleanup removes dependent corrections and expenses while preserving other-company reports and sites',async()=>{
const db=new PGlite();try{
await db.exec(`create role anon;create role authenticated;create role service_role;create schema app_private;create table companies(id uuid primary key);insert into companies values('${c}'),('${o}');
create table account_deletion_requests(id uuid,company_deletion_id uuid,user_id uuid,identity_verified boolean,scope text,status text,lease_token uuid,lease_until timestamptz);insert into account_deletion_requests values('${c}','${c}','${u}',true,'personal_account','processing','${l}',now()+interval '5 minutes');
create function inspect_company_deletion_scope(uuid) returns jsonb language sql as $$select '{}'::jsonb$$;create function assert_account_deletion_lease(uuid,uuid,uuid) returns boolean language sql as $$select true$$;
create table sites(id uuid primary key,company_id uuid);insert into sites values('${c}','${c}'),('${o}','${o}');
create table work_reports(id uuid primary key,company_id uuid,site_id uuid references sites);insert into work_reports values('${c}','${c}','${c}'),('${o}','${o}','${o}');
create table work_report_history(company_id uuid,report_id uuid references work_reports);insert into work_report_history values('${c}','${c}'),('${o}','${o}');
create table site_expenses(id uuid primary key,company_id uuid);insert into site_expenses values('${c}','${c}'),('${o}','${o}');
create table attendance_records(id uuid primary key,company_id uuid,expense_id uuid references site_expenses);insert into attendance_records values('${c}','${c}','${c}'),('${o}','${o}','${o}');
create table attendance_corrections(company_id uuid,attendance_id uuid references attendance_records);insert into attendance_corrections values('${c}','${c}'),('${o}','${o}');
create table worker_badge_commutes(company_id uuid,attendance_id uuid references attendance_records on delete cascade);insert into worker_badge_commutes values('${c}','${c}'),('${o}','${o}');
create table attendance_locations(company_id uuid);insert into attendance_locations values('${c}'),('${o}');`);
await db.exec(await readFile(new URL('../database/account_deletion_company_work_records.sql',import.meta.url),'utf8'));
const run=()=>db.query('select delete_company_work_records($1,$2) ok',[c,l]);assert.equal((await run()).rows[0].ok,true);assert.equal((await run()).rows[0].ok,true);
for(const t of ['work_reports','work_report_history','site_expenses','attendance_records','attendance_corrections','worker_badge_commutes','attendance_locations'])assert.deepEqual((await db.query(`select company_id from ${t}`)).rows,[{company_id:o}]);
assert.equal((await db.query('select count(*)::int n from sites')).rows[0].n,2);
await assert.rejects(db.query('insert into attendance_locations values($1)',[c]),/being deleted/);
}finally{await db.close();}});
