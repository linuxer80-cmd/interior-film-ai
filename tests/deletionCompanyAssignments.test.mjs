import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
const c='00000000-0000-4000-8000-000000000001',o='00000000-0000-4000-8000-000000000002',u='00000000-0000-4000-8000-000000000003',l='00000000-0000-4000-8000-000000000004';
test('authorized company assignment deletion suppresses notifications/sync while ordinary deletions retain effects',async()=>{
const db=new PGlite();try{
await db.exec(`create role anon;create role authenticated;create role service_role;create schema app_private;create schema labor_internal;
create table companies(id uuid primary key);insert into companies values('${c}'),('${o}');
create table account_deletion_requests(id uuid,company_deletion_id uuid,user_id uuid,identity_verified boolean,scope text,status text,lease_token uuid,lease_until timestamptz);insert into account_deletion_requests values('${c}','${c}','${u}',true,'personal_account','processing','${l}',now()+interval '5 minutes');
create function inspect_company_deletion_scope(uuid) returns jsonb language sql as $$select '{}'::jsonb$$;create function assert_account_deletion_lease(uuid,uuid,uuid) returns boolean language sql as $$select true$$;
create table sites(id uuid primary key,company_id uuid);insert into sites values('${c}','${c}'),('${o}','${o}');
create table labor_jobs(id uuid primary key,company_id uuid);create table labor_applications(job_id uuid references labor_jobs on delete cascade,accepted_site_id uuid references sites);
create table effects(company_id uuid);
create table site_daily_assignments(company_id uuid,site_id uuid references sites);insert into site_daily_assignments values('${c}','${c}'),('${o}','${o}');`);
for(const t of ['site_workers','worker_assignment_wages','worker_assignment_alerts','worker_schedule_reminders','worker_commute_cache','owner_work_days','owner_site_participation','worker_team_messages','site_change_events'])await db.exec(`create table public.${t}(company_id uuid);insert into public.${t} values('${c}'),('${o}');`);
await db.exec('create table app_private.worker_alert_snapshots(company_id uuid)');
for(const fn of ['app_private.capture_worker_alert_state','app_private.calendar_auto_changed','app_private.site_change_trigger','labor_internal.reconcile_labor_assignment_trigger']){
await db.exec(`create function ${fn}() returns trigger language plpgsql as $$\nbegin\n insert into public.effects values(old.company_id);return old;\nend;$$;`);
}
await db.exec(`create trigger capture before delete on site_daily_assignments for each row execute function app_private.capture_worker_alert_state();create trigger calendar after delete on site_daily_assignments for each row execute function app_private.calendar_auto_changed();create trigger notify after delete on site_daily_assignments for each row execute function app_private.site_change_trigger();create constraint trigger reconcile after delete on site_daily_assignments deferrable initially deferred for each row execute function labor_internal.reconcile_labor_assignment_trigger();`);
await db.exec(await readFile(new URL('../database/account_deletion_company_assignments.sql',import.meta.url),'utf8'));
await assert.rejects(db.query('select delete_company_assignments($1,$2)',[c,u]),/lease required/);
assert.equal((await db.query('select count(*)::int n from effects')).rows[0].n,0);
assert.equal((await db.query('select delete_company_assignments($1,$2) ok',[c,l])).rows[0].ok,true);
assert.equal((await db.query('select count(*)::int n from effects')).rows[0].n,0);
assert.equal((await db.query('select company_id from site_daily_assignments')).rows[0].company_id,o);
await db.query('delete from site_daily_assignments where company_id=$1',[o]);assert.equal((await db.query('select count(*)::int n from effects')).rows[0].n,4);
await assert.rejects(db.query('insert into site_daily_assignments values($1,$1)',[c]),/being deleted/);
}finally{await db.close();}});
