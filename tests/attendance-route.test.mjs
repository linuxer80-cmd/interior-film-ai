import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const uid = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const user = uid(1), companyA = uid(2), companyB = uid(3);
const workerA = uid(4), workerB = uid(5), siteA = uid(6), siteB = uid(7);
const recordA = uid(8), recordB = uid(9);
const source = readFileSync(new URL('../app/api/attendance/route.js', import.meta.url), 'utf8')
  .replace('import { createClient } from "@supabase/supabase-js";', '')
  .replaceAll('export ', '');

function fixture({ owner = false, inactive = false, rpcError = null } = {}) {
  const rows = {
    profiles: [{ id: user, company_id: companyA, role: owner ? 'owner' : 'worker', is_active: true }],
    companies: [
      { id: companyA, company_name: 'A 업체', is_active: true },
      { id: companyB, company_name: 'B 업체', is_active: !inactive },
    ],
    workers: [
      { id: workerA, user_id: user, company_id: companyA, name: '본인', is_active: true },
      { id: workerB, user_id: user, company_id: companyB, name: '본인', is_active: true },
      { id: uid(10), user_id: uid(11), company_id: companyB, name: '다른 시공자', is_active: true },
    ],
    sites: [
      { id: siteA, company_id: companyA, site_name: 'A 현장', address: '인천', status: 'active' },
      { id: siteB, company_id: companyB, site_name: 'B 현장', address: '부천', status: 'active' },
    ],
    attendance_records: [
      { id: recordA, company_id: companyA, worker_id: workerA, site_id: siteA, work_day: '2026-10-10', clock_in: '2026-10-10T00:00:00Z', clock_out: '2026-10-10T09:00:00Z' },
      { id: recordB, company_id: companyB, worker_id: workerB, site_id: siteB, work_day: '2026-09-30', clock_in: '2026-09-30T00:00:00Z', clock_out: null },
      { id: uid(12), company_id: companyB, worker_id: uid(10), site_id: siteB, work_day: '2026-10-10', clock_in: '2026-10-10T00:00:00Z', clock_out: null },
    ],
    attendance_settings: [], attendance_locations: [],
    site_daily_assignments: [{ id: uid(13), company_id: companyB, site_id: siteB, worker_id: workerB, work_date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date()) }],
    site_workers: [{ id: uid(14), company_id: companyB, site_id: siteB, worker_id: workerB }],
  };
  const calls = [], queries = [];
  const db = {
    auth: { getUser: async () => ({ data: { user: { id: user } }, error: null }) },
    from(table) {
      let predicates = [], single = false, start = 0, end = Infinity;
      const filters = [];
      const q = {
        select() { return q; },
        eq(k, v) { predicates.push(r => r[k] === v); filters.push([k, v]); return q; },
        neq(k, v) { predicates.push(r => r[k] !== v); return q; },
        in(k, v) { predicates.push(r => v.includes(r[k])); return q; },
        is(k, v) { return q.eq(k, v); },
        gte(k, v) { predicates.push(r => r[k] >= v); return q; },
        lt(k, v) { predicates.push(r => r[k] < v); return q; },
        order() { return q; },
        range(a, b) { start = a; end = b; return q; },
        limit(n) { end = n - 1; return q; },
        maybeSingle() { single = true; return q; },
        then(resolve, reject) {
          queries.push({ table, filters });
          const result = rows[table].filter(r => predicates.every(p => p(r))).slice(start, end + 1);
          return Promise.resolve({ data: single ? result[0] || null : result, error: null }).then(resolve, reject);
        },
      };
      return q;
    },
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === 'attendance_today_sites') return { data: rows.sites.filter(s => s.company_id === args.p_company), error: null };
      return { data: { success: true }, error: rpcError };
    },
  };
  const context = vm.createContext({ createClient: () => db, Response, URL, Intl, Date, Set, console: { error() {} }, process: { env: {} }, AbortSignal });
  vm.runInContext(`${source}\nglobalThis.handlers = {GET, POST};`, context);
  const get = (mode = 'worker', month = '2026-10') => context.handlers.GET(new Request(`https://test/api/attendance?mode=${mode}&month=${month}`, { headers: { authorization: 'Bearer test' } }));
  const post = body => context.handlers.POST(new Request('https://test/api/attendance', { method: 'POST', headers: { authorization: 'Bearer test', 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  return { get, post, calls, queries, rows };
}

test('worker reads own records across companies including a previous-month open shift', async () => {
  const f = fixture();
  const res = await f.get();
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body.records.map(r => r.id).sort(), [recordA, recordB].sort());
  assert.deepEqual(body.sites.map(s => s.company_id).sort(), [companyA, companyB].sort());
  assert.equal(body.sites.find(s => s.id === siteB).site_name, 'B 업체 · B 현장');
});

test('owner in worker mode also receives their records from both companies', async () => {
  const res = await fixture({ owner: true }).get();
  assert.equal((await res.json()).records.length, 2);
});

test('admin view remains scoped to the owned company', async () => {
  const res = await fixture({ owner: true }).get('admin');
  const body = await res.json();
  assert.deepEqual(body.records.map(r => r.id), [recordA]);
  assert.deepEqual(body.sites.map(s => s.id), [siteA]);
});

test('worker cannot access admin view or correction actions', async () => {
  const f = fixture();
  assert.equal((await f.get('admin')).status, 403);
  for (const action of ['settings', 'review', 'correct']) {
    assert.equal((await f.post({ action, id: recordA })).status, 403);
  }
  assert.equal(f.calls.length, 0);
});

test('clock-in resolves company from selected site despite owner profile and supplied company', async () => {
  const f = fixture({ owner: true });
  const res = await f.post({ action: 'in', siteId: siteB, companyId: companyA, consent: true });
  assert.equal(res.status, 200);
  assert.ok(f.queries.some(q => q.table === 'attendance_locations' && q.filters.some(([k,v]) => k === 'company_id' && v === companyB)));
  assert.equal(f.calls.at(-1).name, 'attendance_action');
  assert.equal(f.calls.at(-1).args.p_user, user);
});

test('clock-out accepts own record from another company', async () => {
  const f = fixture({ owner: true });
  assert.equal((await f.post({ action: 'out', id: recordB, consent: true })).status, 200);
  assert.equal(f.calls.at(-1).args.p_body.id, recordB);
});

test('another workers record is rejected before mutation', async () => {
  const f = fixture();
  assert.equal((await f.post({ action: 'out', id: uid(12), consent: true })).status, 403);
  assert.equal(f.calls.length, 0);
});

test('inactive-company membership cannot clock in or appear in worker records', async () => {
  const f = fixture({ inactive: true });
  assert.equal((await f.post({ action: 'in', siteId: siteB, consent: true })).status, 403);
  assert.deepEqual((await (await f.get()).json()).records.map(r => r.id), [recordA]);
});

test('malformed IDs are rejected before RPC', async () => {
  const f = fixture();
  assert.equal((await f.post({ action: 'in', siteId: 'invalid' })).status, 400);
  assert.equal(f.calls.length, 0);
});

test('owner correction uses the existing correction RPC', async () => {
  const f = fixture({ owner: true });
  assert.equal((await f.post({ action: 'correct', id: recordA })).status, 200);
  assert.equal(f.calls.at(-1).name, 'attendance_correct');
});

test('database rejection is not reported as a saved attendance record', async () => {
  const f = fixture({ rpcError: { message: '오늘 이 현장에 배정되어 있지 않습니다.' } });
  const res = await f.post({ action: 'in', siteId: siteA, consent: true });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /배정/);
});
