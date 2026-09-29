import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const A = '00000000-0000-0000-0000-000000000001';
const B = '00000000-0000-0000-0000-000000000002';
const S = '10000000-0000-0000-0000-000000000001';
const T = '10000000-0000-0000-0000-000000000002';
const U = 'signed-in-user';
const worker = (id, extra = {}) => ({ id, user_id: U, company_id: A, name: '시공자', phone: 'test', is_active: true, ...extra });
const site = (id = S, company_id = A) => ({ id, company_id, site_name: '현장', status: 'scheduled', schedule_start: '2026-10-21T15:00:00Z', schedule_end: '2026-10-23T14:59:00Z', contract_amount: 999999 });
const assignment = (id, extra = {}) => ({ id, company_id: A, site_id: S, worker_id: 'mine', role: 'member', ...extra });
const daily = (id, date, extra = {}) => ({ ...assignment(id), work_date: date, ...extra });

function harness({ tables = {}, errors = {}, invalidToken = false } = {}) {
  const db = {
    profiles: [], workers: [worker('mine')], companies: [{ id: A, is_active: true }, { id: B, is_active: true }],
    sites: [site(), site(T, B)], site_workers: [assignment('legacy')], site_daily_assignments: [], site_materials: [], ...tables,
  };
  const reads = [];
  const client = {
    auth: { getUser: async () => invalidToken ? { data: {}, error: Error('invalid') } : { data: { user: { id: U } } } },
    from(table) {
      reads.push(table);
      let filters = [], fields, start = 0, end = 499;
      const result = (single = false) => {
        if (errors[table]) return { data: null, error: errors[table] };
        let data = (db[table] || []).filter((row) => filters.every((f) => f(row))).slice(start, end + 1);
        if (fields) data = data.map((row) => Object.fromEntries(fields.map((key) => [key, row[key]])));
        return { data: single ? data[0] || null : data };
      };
      const q = {
        select(value) { fields = value.split(',').map((field) => field.trim()); return q; },
        eq(key, value) { filters.push((row) => row[key] === value); return q; },
        in(key, values) { filters.push((row) => values.includes(row[key])); return q; },
        order() { return q; },
        range(a, b) { start = a; end = b; return q; },
        maybeSingle: async () => result(true),
        then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
      };
      return q;
    },
  };
  const source = fs.readFileSync(new URL('../app/api/worker/my-sites/route.js', import.meta.url), 'utf8')
    .replace(/^import[^\n]*\n/gm, '').replaceAll('export ', '');
  const context = {
    URL, Intl, console: { error() {} }, createClient: () => client,
    process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test' } },
    Response: { json: (body, options) => ({ body: JSON.parse(JSON.stringify(body)), ...options }) },
  };
  vm.createContext(context); vm.runInContext(`${source}\nglobalThis.get = GET`, context);
  return { reads, get: (params = {}, token = 'Bearer valid') => context.get({
    url: `https://app.example/api/worker/my-sites?${new URLSearchParams(params)}`,
    headers: new Headers(token ? { Authorization: token } : {}),
  }) };
}

test('a worker without an owner profile sees their assigned site and safe planned materials', async () => {
  const h = harness({ tables: { site_materials: [
    { id: 'mat', company_id: A, site_id: S, material_type: 'planned', product_code: 'TEST', quantity: 5, unit_price: 10000 },
    { id: 'foreign', company_id: B, site_id: S, material_type: 'planned' },
    { id: 'actual', company_id: A, site_id: S, material_type: 'actual' },
  ] } });
  const result = await h.get();
  assert.equal(result.status, 200);
  assert.equal(result.body.sites.length, 1);
  assert.equal(result.body.sites[0].site_id, S);
  assert.equal('contract_amount' in result.body.sites[0], false);
  assert.match(result.headers['Cache-Control'], /no-store/);
  assert.equal(result.headers.Vary, 'Authorization');
  const detail = await h.get({ siteId: S });
  assert.equal(detail.body.site.site_id, S);
  assert.equal(detail.body.materials.length, 1);
  assert.equal(detail.body.materials[0].product_code, 'TEST');
  assert.equal('unit_price' in detail.body.materials[0], false);
});

test('missing and invalid tokens cannot read assignments', async () => {
  const missing = harness();
  assert.equal((await missing.get({}, '')).status, 401);
  assert.deepEqual(missing.reads, []);
  const invalid = harness({ invalidToken: true });
  assert.equal((await invalid.get()).status, 401);
  assert.deepEqual(invalid.reads, []);
});

test('inactive or unlinked workers, disabled profiles and companies cannot access sites', async () => {
  for (const tables of [
    { workers: [worker('mine', { is_active: false })] },
    { workers: [worker('mine', { user_id: 'someone-else' })] },
    { profiles: [{ id: U, is_active: false }] },
    { companies: [{ id: A, is_active: false }] },
  ]) {
    const h = harness({ tables });
    assert.equal((await h.get({ siteId: S })).status, 403);
    assert.equal(h.reads.includes('sites'), false);
    assert.equal(h.reads.includes('site_materials'), false);
  }
});

test('company/worker request parameters and same-name workers cannot expand access', async () => {
  const h = harness({ tables: {
    workers: [worker('mine'), worker('foreign', { company_id: B, user_id: 'someone-else' }), worker('same-name', { user_id: 'someone-else' })],
    site_workers: [assignment('own'), assignment('foreign', { site_id: T, company_id: B }), assignment('wrong-tenant', { site_id: T }), assignment('same-name-site', { site_id: T, worker_id: 'same-name' })],
  } });
  assert.equal((await h.get({ companyId: B, workerId: 'foreign' })).body.sites.length, 1);
  assert.equal((await h.get({ siteId: T })).status, 404);
  assert.equal(h.reads.includes('site_materials'), false);
  assert.equal((await h.get({ siteId: 'not-a-uuid' })).status, 400);
});

test('daily-only assignments appear with only personal dates, even without a legacy summary', async () => {
  const h = harness({ tables: { site_workers: [], site_daily_assignments: [
    daily('d1', '2026-10-22', { role: 'leader' }), daily('d2', '2026-10-23'),
    daily('other', '2026-10-24', { worker_id: 'someone-else' }),
  ] } });
  const result = await h.get();
  assert.equal(result.body.sites.length, 1);
  const expected = [{ work_date: '2026-10-22', role: 'leader' }, { work_date: '2026-10-23', role: 'member' }];
  assert.deepEqual(result.body.sites[0].assigned_dates, expected);
  assert.equal(result.body.sites[0].schedule_end, '2026-10-23');
  assert.equal(result.body.sites[0].worker_role, 'leader');
  assert.deepEqual((await h.get({ siteId: S })).body.site.assigned_dates, expected);
});

test('a stale legacy membership cannot expose a site allocated only to someone else', async () => {
  const h = harness({ tables: { site_daily_assignments: [daily('other', '2026-10-22', { worker_id: 'someone-else' })] } });
  assert.deepEqual((await h.get()).body.sites, []);
  assert.equal((await h.get({ siteId: S })).status, 404);
});

test('multiple records linked to the same login are included without duplicating a day', async () => {
  const h = harness({ tables: {
    workers: [worker('mine'), worker('mine-2')],
    site_daily_assignments: [daily('d1', '2026-10-22'), daily('d2', '2026-10-22', { worker_id: 'mine-2', role: 'leader' }), daily('d3', '2026-10-23', { worker_id: 'mine-2' })],
  } });
  const s = (await h.get()).body.sites[0];
  assert.equal(s.assigned_dates.length, 2);
  assert.equal(s.assigned_dates[0].role, 'leader');
});

test('changed site dates do not silently hide saved personal dates; show a confirmation notice', async () => {
  const h = harness({ tables: { site_daily_assignments: [daily('old-date', '2026-10-20')] } });
  const s = (await h.get()).body.sites[0];
  assert.equal(s.assigned_dates[0].work_date, '2026-10-20');
  assert.match(s.schedule_notice, /관리자/);
});

test('daily row pagination does not accidentally fall back to a stale legacy role', async () => {
  const h = harness({ tables: { site_daily_assignments: [
    ...Array.from({ length: 1001 }, (_, i) => daily(`other-${i}`, '2026-10-22', { worker_id: `other-${i}` })),
    daily('mine-last', '2026-10-23', { role: 'leader' }),
  ] } });
  const s = (await h.get()).body.sites[0];
  assert.deepEqual(s.assigned_dates, [{ work_date: '2026-10-23', role: 'leader' }]);
});

test('database failures are distinct from zero assignments, and missing daily schema supports legacy sites', async () => {
  assert.equal((await harness({ errors: { site_workers: Error('unavailable') } }).get()).status, 500);
  assert.equal((await harness({ errors: { site_daily_assignments: { code: '42501' } } }).get()).status, 500);
  for (const code of ['42P01', 'PGRST205']) {
    assert.equal((await harness({ errors: { site_daily_assignments: { code } } }).get()).body.sites.length, 1);
  }
  const h = harness({ errors: { site_materials: Error('material failure') } });
  const result = await h.get({ siteId: S });
  assert.equal(result.status, 200);
  assert.equal(result.body.site.site_id, S);
  assert.match(result.body.materialsError, /자재/);
  const empty = await harness({ tables: { site_workers: [] } }).get();
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.body.sites, []);
});

test('login return paths preserve a site link and reject external or unrelated destinations', () => {
  const source = fs.readFileSync(new URL('../app/utils/workerSites.js', import.meta.url), 'utf8')
    .replace(/^import[^\n]*\n/gm, '').replaceAll('export ', '');
  const context = { URLSearchParams, window: { location: { pathname: `/worker/site/${S}`, search: '' } } };
  vm.createContext(context); vm.runInContext(`${source}\nglobalThis.dest = workerDestination; globalThis.login = workerLoginUrl;`, context);
  assert.equal(context.dest(`/worker?site=${S}`), `/worker/site/${S}`);
  assert.equal(context.dest(`/worker/site/${S}`), `/worker/site/${S}`);
  assert.equal(new URLSearchParams(context.login().split('?')[1]).get('next'), `/worker/site/${S}`);
  for (const input of ['//attacker.example', 'https://attacker.example', '/admin', '/worker/../../admin', '/worker/site/bad', null]) assert.equal(context.dest(input), '/worker');
});

test('clicking an existing notification window navigates to refresh assignments before focus', async () => {
  const handlers = {}, actions = [];
  const target = `https://app.example/worker/site/${S}`;
  const client = { url: target, navigate: async (url) => { actions.push(['navigate', url]); return client; }, focus: async () => { actions.push(['focus']); } };
  const context = { URL, self: { location: { origin: 'https://app.example' }, addEventListener: (name, handler) => { handlers[name] = handler; }, clients: { matchAll: async () => [client], openWindow: async (url) => actions.push(['open', url]) } } };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), context);
  let pending;
  handlers.notificationclick({ notification: { close() {}, data: { url: target } }, waitUntil(promise) { pending = promise; } });
  await pending;
  assert.deepEqual(actions, [['navigate', target], ['focus']]);
});
