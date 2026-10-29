import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('worker submission and resubmission create one company-scoped notice atomically', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create schema app_private;
      create table public.sites (id uuid primary key, company_id uuid, site_name text);
      create table public.workers (id uuid primary key, company_id uuid, user_id uuid, name text);
      create table public.work_reports (id uuid primary key, company_id uuid, site_id uuid,
        worker_id uuid, created_by uuid, review_status text, memo text);
      create table public.notifications (company_id uuid, recipient_type text, type text,
        priority text, title text, message text, link text, reference_type text, reference_id text);
    `);
    await db.exec(await readFile(new URL('../supabase/migrations/20261029060432_worker_report_admin_notification.sql', import.meta.url), 'utf8'));
    const co = '00000000-0000-0000-0000-000000000001';
    const site = '00000000-0000-0000-0000-000000000002';
    const worker = '00000000-0000-0000-0000-000000000003';
    const user = '00000000-0000-0000-0000-000000000004';
    const report = '00000000-0000-0000-0000-000000000005';
    await db.query('insert into sites values ($1,$2,$3)', [site, co, '송도 현장']);
    await db.query('insert into workers values ($1,$2,$3,$4)', [worker, co, user, '김시공']);
    await db.query("insert into work_reports values ($1,$2,$3,$4,$5,'pending',null)", [report, co, site, worker, user]);
    let notices = (await db.query('select * from notifications')).rows;
    assert.equal(notices.length, 1);
    assert.equal(notices[0].company_id, co);
    assert.equal(notices[0].recipient_type, 'company_admin');
    assert.match(notices[0].message, /송도 현장 · 김시공님/);
    assert.equal(notices[0].link, `/admin?tab=sites&site=${site}&section=report`);
    await db.query("update work_reports set memo='changed' where id=$1", [report]);
    await db.query("update work_reports set review_status='pending' where id=$1", [report]);
    await db.query("update work_reports set review_status='rejected' where id=$1", [report]);
    await db.query("update work_reports set review_status='pending' where id=$1", [report]);
    assert.equal((await db.query('select count(*)::int as n from notifications')).rows[0].n, 2);
    await db.exec('begin');
    await db.query("update work_reports set review_status='rejected' where id=$1", [report]);
    await db.query("update work_reports set review_status='pending' where id=$1", [report]);
    await db.exec('rollback');
    assert.equal((await db.query('select count(*)::int as n from notifications')).rows[0].n, 2);
    await db.query("insert into work_reports values ('00000000-0000-0000-0000-000000000006',$1,$2,null,$3,'pending',null)", [co,site,user]);
    await db.query("insert into work_reports values ('00000000-0000-0000-0000-000000000007',$1,$2,$3,'00000000-0000-0000-0000-000000000099','pending',null)", [co,site,worker]);
    assert.equal((await db.query('select count(*)::int as n from notifications')).rows[0].n, 2);
  } finally { await db.close(); }
});
