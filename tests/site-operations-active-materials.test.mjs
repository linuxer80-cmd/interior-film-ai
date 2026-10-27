import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const patch = read('../database/site_operations_active_materials.sql');
const ids = Array.from({length: 8}, (_, n) => `00000000-0000-4000-8000-${String(n + 1).padStart(12, '0')}`);
const [company, owner, site, active, archived, worker, member, stranger] = ids;

test('report checks and snapshots exclude archived duplicates while keeping stock history and access checks', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create schema app_private;
      create table companies(id uuid primary key, is_active boolean);
      create table profiles(id uuid, company_id uuid, role text, is_active boolean, name text);
      create table sites(id uuid primary key, company_id uuid, status text, site_name text, memo text,
        schedule_start text, schedule_end text, schedule_date text, work_dates text[], work_description text, work_type text);
      create table workers(id uuid, user_id uuid, company_id uuid, name text, is_active boolean);
      create table assigned(worker_id uuid, user_id uuid, role text);
      create function public.site_operation_workers(uuid) returns setof assigned language sql as $$select * from public.assigned$$;
      create table site_daily_assignments(site_id uuid,company_id uuid,worker_id uuid,work_date text,role text);
      create table work_reports(site_id uuid,review_status text);
      create table site_materials(id uuid primary key,company_id uuid,site_id uuid,material_type text,
        brand text,product_code text,product_name text,quantity numeric,unit text,unit_price numeric,memo text,
        price_type text,film_product_id uuid,removed_at timestamptz);
      create table site_material_issues(id uuid,company_id uuid,site_id uuid,material_id uuid,quantity numeric,
        created_by uuid,created_at timestamptz default now(),voided_at timestamptz,voided_by uuid);
      create table site_material_returns(material_id uuid primary key,company_id uuid,site_id uuid,quantity numeric,
        updated_by uuid,updated_at timestamptz default now());
      create table site_material_return_history(id uuid,company_id uuid,site_id uuid,material_id uuid,
        before_quantity numeric,after_quantity numeric,reason text,created_by uuid,created_at timestamptz);
      create table site_change_events(id uuid,site_id uuid,message text,created_at timestamptz);
      create table site_change_receipts(event_id uuid,worker_id uuid,confirmed_at timestamptz,reviewed_version text);
      create function app_private.record_site_change(uuid,text) returns void language sql as $$select$$;
      insert into companies values('${company}',true);
      insert into profiles values('${owner}','${company}','owner',true,'관리자');
      insert into sites(id,company_id,status) values('${site}','${company}','in_progress');
      insert into workers values('${worker}','${member}','${company}','시공자',true);
      insert into assigned values('${worker}','${member}','leader');
      insert into site_materials(id,company_id,site_id,material_type,brand,product_code,unit,unit_price,price_type)
        values('${active}','${company}','${site}','planned','현대보닥','S245','m',5800,'non_fire'),
        ('${archived}','${company}','${site}','planned','현대보닥','S245','m',5800,'non_fire');
      update site_materials set removed_at=now() where id='${archived}';
      insert into site_material_issues(id,company_id,site_id,material_id,quantity)
        values('${active}','${company}','${site}','${active}',20.1);
      insert into site_material_returns(material_id,company_id,site_id,quantity)
        values('${active}','${company}','${site}',10);
    `);
    await db.exec(read('./fixtures/site-operations-before-active-filter.sql'));
    const get = async (user = owner, action = 'get', body = {}) => (await db.query(
      'select public.site_operations($1,$2,$3,$4) result', [user, site, action, JSON.stringify(body)]
    )).rows[0].result;
    // Reproduce the production bug before applying the migration.
    assert.equal((await get()).materials.filter(m => m.returned == null).length, 1);
    const before = await db.query('select * from site_material_issues');
    await db.exec(patch);
    await db.exec(patch); // Safe migration retry.
    for (const user of [owner, member]) {
      const state = await get(user);
      assert.equal(state.materials.length, 1);
      assert.equal(state.materials[0].id, active);
      assert.equal(state.materials[0].issued, 20.1);
      assert.equal(state.materials[0].returned, 10);
      assert.equal(state.materials[0].used, 10.1);
      assert.equal(state.materials[0].unitPrice, user === owner ? 5800 : null);
      assert.equal(state.materials.filter(m => m.returned == null).length, 0);
      assert.deepEqual((await get(user, 'latest')).snapshot.materials.map(m => m.id), [active]);
    }
    await assert.rejects(get(stranger), /배정된 현장/);
    await assert.rejects(get(owner, 'return', {materialId: archived, quantity: 0}), /예정 자재/);
    for (const fn of ['save_report_material_flow', 'save_site_material_outgoing']) {
      await assert.rejects(db.query(`select public.${fn}($1,$2,$3)`, [owner, site, JSON.stringify({materialId: archived})]), /사용.*필름/);
    }
    assert.deepEqual(await db.query('select * from site_material_issues'), before);
    assert.equal((await db.query('select count(*) n from site_materials')).rows[0].n, 2);

    // Settlement also ignores the archived duplicate, but still requires active returns.
    const settlement = read('../database/material_cost_audit.sql').match(/create or replace function public\.report_material_settlement[\s\S]*/i)[0];
    await db.exec(settlement);
    const settle = async () => (await db.query('select public.report_material_settlement($1,$2) result', [company,site])).rows[0].result;
    assert.equal((await settle())[0].quantity, 10.1);
    await db.exec(`delete from site_material_returns where material_id='${active}'`);
    assert.equal((await get()).materials.filter(m => m.returned == null).length, 1);
    await assert.rejects(settle(), /반출·반입량/);
  } finally {
    await db.close();
  }
});
