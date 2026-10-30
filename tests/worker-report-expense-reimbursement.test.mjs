import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migration = await readFile(new URL('../supabase/migrations/20261030111331_worker_report_expense_reimbursement.sql', import.meta.url), 'utf8');
const company='00000000-0000-0000-0000-000000000001', site='00000000-0000-0000-0000-000000000002';
const worker='00000000-0000-0000-0000-000000000003', user='00000000-0000-0000-0000-000000000004';
const signature='public.submit_worker_work_report(uuid,uuid,uuid,uuid,text,text,text,jsonb,jsonb)';

async function database() {
 const db = new PGlite();
 await db.exec(`
 create role anon; create role authenticated; create role service_role;
 create table public.site_expenses (company_id uuid, site_id uuid, expense_type text, amount numeric,
 description text, expense_date date, created_by uuid, reimbursement_worker_id uuid);
 create or replace function ${signature.replaceAll('uuid,uuid,uuid,uuid,text,text,text,jsonb,jsonb','p_company_id uuid,p_site_id uuid,p_worker_id uuid,p_user_id uuid,p_work_region text,p_work_summary text,p_memo text,p_materials jsonb,p_expenses jsonb')}
 returns jsonb language plpgsql set search_path='' as $body$
 begin
  insert into public.site_expenses (
    company_id, site_id, expense_type, amount, description, expense_date, created_by
  ) select p_company_id, p_site_id, coalesce(nullif(x.expense_type, ''), 'other'), x.amount,
    case when x.description like '완료보고/%' then x.description else '완료보고/' || coalesce(nullif(btrim(x.description), ''),'경비') end, coalesce(x.expense_date, current_date), p_user_id
  from jsonb_to_recordset(p_expenses) as x (
    expense_type text, amount numeric, description text, expense_date date
  );
  return '{}'::jsonb;
 end; $body$;
 revoke all on function ${signature} from public,anon,authenticated;
 grant execute on function ${signature} to service_role;
 `);
 return db;
}

test('worker report expenses are assigned to the author once; labor rows and historical data are not changed',async()=>{
 const db=await database();try{
  await db.query(`insert into site_expenses(company_id,site_id,amount,description,created_by) values ($1,$2,100,'old',$3)`,[company,site,user]);
  await db.exec(migration); await db.exec(migration); // safe to rerun
  assert.equal((await db.query(`select has_function_privilege('anon','${signature}','execute') as allowed`)).rows[0].allowed,false);
  assert.equal((await db.query(`select has_function_privilege('authenticated','${signature}','execute') as allowed`)).rows[0].allowed,false);
  assert.equal((await db.query(`select has_function_privilege('service_role','${signature}','execute') as allowed`)).rows[0].allowed,true);
  const entries=[{expense_type:'meal',amount:12000,description:'점심',expense_date:'2026-10-20'},{expense_type:'parking',amount:5000,description:'주차',expense_date:'2026-10-21'},{expense_type:'other',amount:200000,description:'완료보고/인건비:{"workerId":"other"}'}];
  await db.query('select public.submit_worker_work_report($1,$2,$3,$4,null,null,null,$5::jsonb,$6::jsonb)',[company,site,worker,user,'[]',JSON.stringify(entries)]);
  const rows=(await db.query('select * from site_expenses order by amount')).rows;
  assert.equal(rows.length,4);
  assert.equal(rows[0].reimbursement_worker_id,null);
  assert.equal(rows[1].reimbursement_worker_id,worker);
  assert.equal(rows[2].reimbursement_worker_id,worker);
  assert.equal(rows[3].reimbursement_worker_id,null);
 }finally{await db.close();}
});

test('migration aborts if the current function does not match the expected version',async()=>{
 const db=await database();try{
  await db.exec(`create or replace function ${signature.replaceAll('uuid,uuid,uuid,uuid,text,text,text,jsonb,jsonb','p_company_id uuid,p_site_id uuid,p_worker_id uuid,p_user_id uuid,p_work_region text,p_work_summary text,p_memo text,p_materials jsonb,p_expenses jsonb')} returns jsonb language sql as 'select ''{}''::jsonb';`);
  await assert.rejects(db.exec(migration),/예상과 다릅니다/);
 }finally{await db.close();}
});
