import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const S = '10000000-0000-0000-0000-000000000001';
const source = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8').replace(/^import[^\n]*\n/gm, '').replaceAll('export ', '');
const clean = (value) => JSON.parse(JSON.stringify(value));

function api({ tables = {}, errors = {}, invalid = false, race = false, workerRoute = false, photoRoute = false } = {}) {
  const db = {
    profiles: [{ id: 'u', company_id: 'a', role: 'owner', is_active: true }], companies: [{ id: 'a', is_active: true }],
    sites: [{ id: S, company_id: 'a', status: 'in_progress' }], work_reports: [],
    workers: [{ id: 'w', user_id: 'u', company_id: 'a', is_active: true }],
    site_workers: [{ id: 'crew', company_id: 'a', site_id: S, worker_id: 'w', role: 'leader' }],
    site_daily_assignments: [], ...tables,
  };
  const reads = [], writes = [], saves = [];
  const client = {
    auth: { getUser: async () => invalid ? { error: Error('invalid') } : { data: { user: { id: 'u' } } } },
    from(table) {
      reads.push(table);
      let filters = [], fields, patch, max = Infinity;
      const result = (single = false) => {
        if (errors[table]) return { error: Error('database failure') };
        const rows = db[table].filter((r) => filters.every((f) => f(r))).slice(0, max);
        if (patch && race) return { data: single ? null : [] };
        if (patch) { for (const row of rows) Object.assign(row, patch); writes.push({ table, patch, ids: rows.map((r) => r.id) }); }
        const data = fields ? rows.map((row) => Object.fromEntries(fields.map((f) => [f, row[f]]))) : rows;
        return { data: clean(single ? data[0] || null : data) };
      };
      const q = {
        select(s) { fields = s.split(',').map((f) => f.trim()).filter(Boolean); return q; },
        eq(k, v) { filters.push((r) => r[k] === v); return q; },
        update(value) { patch = clean(value); return q; },
        order() { return q; }, limit(n) { max = n; return q; },
        maybeSingle: async () => result(true), then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
      };
      return q;
    },
  };
  const response = { json: (body, options = {}) => ({ body: clean(body), status: options.status || 200, ...options }) };
  const ctx = vm.createContext({ console: { error() {} }, createClient: () => client, NextResponse: response, Response: response,
    process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test' } },
    recordSave: (value) => { saves.push(clean(value)); return { id: 'report' }; },
  });
  vm.runInContext(source(photoRoute ? '../app/api/worker/site-photos/route.js' : workerRoute ? '../app/api/worker/site-work-report/route.js' : '../app/api/admin/site-status/route.js') + '\nglobalThis.post = POST;', ctx);
  // Keep real worker authentication, assignment and report-state checks. Stub only downstream persistence.
  if (workerRoute) vm.runInContext('submitWorkReport = async (args) => { recordSave({companyId:args.worker.company_id,siteId:args.siteId}); return {reportId:"report",materialCount:0,expenseCount:0}; };', ctx);
  if (photoRoute) vm.runInContext('uploadPhoto = async (args) => { recordSave({companyId:args.companyId,siteId:args.siteId}); return "test/photo.jpg"; }; insertPhotoRecord = async () => ({id:"photo"});', ctx);
  const initial = workerRoute ? { siteId: S, work_summary: '시공 완료' } : { siteId: S, status: 'completed', expectedStatus: 'in_progress' };
  return { db, reads, writes, saves, post: (body = initial, token = 'Bearer valid') => ctx.post({
    headers: new Headers(token ? { Authorization: token } : {}), json: async () => body,
    formData: async () => ({ get: (key) => key === 'siteId' ? body.siteId : key === 'photoType' ? 'after' : '',
      getAll: () => [{ name: 'test.jpg', type: 'image/jpeg', size: 3, arrayBuffer: async () => new ArrayBuffer(3) }] }),
  }) };
}

test('owner can complete and reopen a site without creating or modifying reports, materials or photos', async () => {
  const h = api();
  const result = await h.post();
  assert.equal(result.status, 200);
  assert.equal(h.db.sites[0].status, 'completed');
  assert.deepEqual(h.writes.map((w) => w.table), ['sites']);
  assert.deepEqual(h.db.work_reports, []);
  assert.equal(h.reads.includes('work_reports'), false);
  assert.match(result.headers['Cache-Control'], /no-store/);
  assert.equal((await h.post({ siteId: S, status: 'in_progress', expectedStatus: 'completed' })).status, 200);
  assert.equal(h.db.sites[0].status, 'in_progress');
});

test('changing the site preserves pending, approved and rejected reports exactly', async () => {
  for (const review_status of ['pending', 'approved', 'rejected']) {
    const row = { id: 'r', company_id: 'a', site_id: S, review_status, approved_amount: 300000, review_memo: 'preserve' };
    const h = api({ tables: { work_reports: [row] } });
    assert.equal((await h.post()).status, 200);
    assert.deepEqual(h.db.work_reports, [row]);
    assert.equal(h.reads.includes('work_reports'), false);
  }
});

test('missing/expired login, workers and disabled owners/companies cannot change sites', async () => {
  const missing = api();
  assert.equal((await missing.post(undefined, '')).status, 401);
  assert.deepEqual(missing.reads, []);
  assert.equal((await api({ invalid: true }).post()).status, 401);
  for (const tables of [
    { profiles: [] }, { profiles: [{ id: 'u', company_id: 'a', role: 'worker' }] },
    { profiles: [{ id: 'u', company_id: 'a', role: 'owner', is_active: false }] }, { companies: [{ id: 'a', is_active: false }] },
  ]) {
    const h = api({ tables });
    assert.equal((await h.post()).status, 403);
    assert.deepEqual(h.writes, []);
  }
});

test('supplied company IDs cannot change another company site', async () => {
  const h = api({ tables: { sites: [{ id: S, company_id: 'b', status: 'in_progress' }] } });
  assert.equal((await h.post({ companyId: 'b', siteId: S, status: 'completed', expectedStatus: 'in_progress' })).status, 404);
  assert.equal(h.db.sites[0].status, 'in_progress');
  assert.deepEqual(h.writes, []);
});

test('stale changes and competing writes cannot overwrite a newer status; repeated completion is harmless', async () => {
  const h = api();
  assert.equal((await h.post({ siteId: S, status: 'completed', expectedStatus: 'scheduled' })).status, 409);
  assert.deepEqual(h.writes, []);
  assert.equal((await api({ race: true }).post()).status, 409);
  await h.post();
  assert.equal((await h.post()).status, 200);
  assert.equal(h.writes.length, 1);
});

test('invalid states and database failures are returned instead of claiming completion', async () => {
  for (const body of [null, { siteId: S, status: 'approved', expectedStatus: 'in_progress' }, { siteId: S, status: 'completed' }]) {
    assert.equal((await api().post(body)).status, 400);
  }
  const h = api({ errors: { sites: true } });
  assert.equal((await h.post()).status, 500);
  assert.equal(h.db.sites[0].status, 'in_progress');
});

test('assigned leader can submit a missing report or a correction after manual completion', async () => {
  for (const work_reports of [[], [{ id: 'r', site_id: S, company_id: 'a', review_status: 'rejected' }]]) {
    const h = api({ workerRoute: true, tables: { sites: [{ id: S, company_id: 'a', status: 'completed' }], work_reports } });
    const result = await h.post();
    assert.equal(result.status, 200);
    assert.equal(result.body.review_status, 'pending');
    assert.deepEqual(h.saves, [{ companyId: 'a', siteId: S }]);
    assert.equal(h.db.sites[0].status, 'completed');
  }
});

test('completed sites still block duplicate/approved reports, cancelled sites, members and unassigned workers', async () => {
  for (const review_status of ['pending', 'approved']) {
    const h = api({ workerRoute: true, tables: { sites: [{ id: S, company_id: 'a', status: 'completed' }], work_reports: [{ id: 'r', site_id: S, company_id: 'a', review_status }] } });
    assert.equal((await h.post()).status, 409);
    assert.deepEqual(h.saves, []);
  }
  for (const [tables, status] of [
    [{ sites: [{ id: S, company_id: 'a', status: 'cancelled' }] }, 409],
    [{ site_workers: [{ id: 'crew', company_id: 'a', site_id: S, worker_id: 'w', role: 'member' }] }, 403],
    [{ site_workers: [] }, 403], [{ sites: [{ id: S, company_id: 'b', status: 'completed' }] }, 404],
  ]) {
    const h = api({ workerRoute: true, tables });
    assert.equal((await h.post()).status, status);
    assert.deepEqual(h.saves, []);
  }
});

test('manual completion still permits the leader to upload photos for a first or corrected report', async () => {
  for (const work_reports of [[], [{ id: 'r', site_id: S, company_id: 'a', review_status: 'rejected' }]]) {
    const h = api({ photoRoute: true, tables: { sites: [{ id: S, company_id: 'a', status: 'completed' }], work_reports } });
    assert.equal((await h.post()).status, 200);
    assert.deepEqual(h.saves, [{ companyId: 'a', siteId: S }]);
    assert.equal(h.db.sites[0].status, 'completed');
  }
});

test('photos of submitted/approved reports stay frozen even if an owner reopens the site', async () => {
  for (const status of ['completed', 'in_progress']) for (const review_status of ['pending', 'approved']) {
    const h = api({ photoRoute: true, tables: { sites: [{ id: S, company_id: 'a', status }], work_reports: [{ id: 'r', site_id: S, company_id: 'a', review_status }] } });
    assert.equal((await h.post()).status, 409);
    assert.deepEqual(h.saves, []);
  }
});

test('photo uploads enforce leader assignment on completed sites and fail closed on report lookup errors', async () => {
  const tables = { sites: [{ id: S, company_id: 'a', status: 'completed' }], site_workers: [{ id: 'crew', company_id: 'a', site_id: S, worker_id: 'w', role: 'member' }] };
  const member = api({ photoRoute: true, tables });
  assert.equal((await member.post()).status, 403);
  assert.deepEqual(member.saves, []);
  const leader = api({ photoRoute: true, tables: { ...tables, site_daily_assignments: [{ id: 'daily', company_id: 'a', site_id: S, worker_id: 'w', role: 'leader' }] } });
  assert.equal((await leader.post()).status, 200);
  const failed = api({ photoRoute: true, errors: { work_reports: true } });
  assert.equal((await failed.post()).status, 500);
  assert.deepEqual(failed.saves, []);
  assert.equal((await api({ photoRoute: true, tables: { sites: [{ id: S, company_id: 'a', status: 'cancelled' }] } }).post()).status, 409);
});

const require = createRequire(import.meta.url);
const swc = require('next/dist/build/swc');
await swc.loadBindings();
const { code } = await swc.transform(fs.readFileSync(new URL('../app/admin/site-detail/SiteStatusControl.js', import.meta.url), 'utf8'), {
  jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'classic' } } }, module: { type: 'commonjs' },
});
function controls(updateSiteStatus) {
  let slots = [], cursor = 0;
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], (v) => { slots[i] = v; }]; },
    useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
  };
  const ctx = vm.createContext({ exports: {}, React, require: () => React });
  vm.runInContext(code, ctx);
  return (props = {}) => { cursor = 0; return ctx.exports.default({ site: { id: S, status: 'in_progress' }, updateSiteStatus, hasReport: false, ...props }); };
}
function find(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) return node.map((n) => find(n, predicate)).find(Boolean) || null;
  return predicate(node) ? node : find(node.props?.children, predicate);
}
const button = (tree, text) => find(tree, (n) => n.type === 'button' && n.props.children.includes(text));

test('manual completion is available without a report, prevents double taps and reports save failures inline', async () => {
  let finish, calls = 0;
  const render = controls(async (...args) => { calls++; assert.deepEqual(args, [S, 'completed', 'in_progress']); return await new Promise((r) => { finish = r; }); });
  const complete = button(render(), '✓ 시공 완료');
  const pending = complete.props.onClick();
  await complete.props.onClick();
  assert.equal(calls, 1);
  assert.equal(button(render(), '✓ 시공 완료').props.disabled, true);
  finish({ success: false, error: '저장 실패' });
  await pending;
  assert.ok(find(render(), (n) => n.props.role === 'alert' && n.props.children.includes('저장 실패')));
  assert.equal(button(render(), '✓ 시공 완료').props.disabled, false);
});

test('completion can be reversed while the approved report label remains separate', async () => {
  const calls = [];
  const render = controls(async (...args) => { calls.push(args); return { success: true }; });
  const tree = render({ site: { id: S, status: 'completed' }, hasReport: true, reviewStatus: 'approved' });
  assert.equal(button(tree, '✓ 시공 완료').props['aria-pressed'], true);
  assert.ok(find(tree, (n) => n.type === 'strong' && n.props.children.includes('승인 완료')));
  await button(tree, '시공 중').props.onClick();
  assert.deepEqual(calls, [[S, 'in_progress', 'completed']]);
});
