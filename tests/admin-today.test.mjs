import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8').replace(/^import[^\n]*\n/gm, '').replaceAll('export ', '');
const helpers = `${source('../app/utils/workerCalendar.js')}\n${source('../app/utils/adminToday.js')}`;
const context = vm.createContext({ Intl });
vm.runInContext(`${helpers}\nglobalThis.build = buildAdminToday; globalThis.day = koreanDay;`, context);
const TODAY = '2026-10-22';
const build = (data, today = TODAY) => JSON.parse(JSON.stringify(context.build(data, today)));
const site = (id = 's', extra = {}) => ({ id, company_id: 'a', site_name: '테스트 현장', status: 'scheduled', schedule_start: '2026-10-21T15:00:00Z', schedule_end: '2026-10-23T14:59:00Z', ...extra });
const worker = (id = 'w', extra = {}) => ({ id, company_id: 'a', is_active: true, ...extra });
const assignment = (extra = {}) => ({ id: 'assignment', company_id: 'a', site_id: 's', worker_id: 'w', role: 'leader', ...extra });
const daily = (date, extra = {}) => ({ ...assignment(), work_date: date, ...extra });
const report = (status, updated_at, extra = {}) => ({ id: updated_at, company_id: 'a', site_id: 's', review_status: status, updated_at, ...extra });

test('only the latest report determines review/revision; approved work never resurfaces for assignment', () => {
  const reports = [report('pending', '2026-10-20T10:00:00Z'), report('approved', '2026-10-21T10:00:00Z')];
  assert.deepEqual(build({ sites: [site()], reports }).tasks, []);
  reports.push(report('rejected', '2026-10-22T10:00:00Z'));
  assert.equal(build({ sites: [site()], reports }).counts.revision, 1);
  reports.push(report('pending', '2026-10-23T10:00:00Z'));
  const result = build({ sites: [site()], reports });
  assert.deepEqual(result.counts, { assignment: 0, review: 1, revision: 0, missing: 0 });
  assert.equal(result.tasks[0].section, 'report');
  assert.equal(build({ sites: [site()], reports: [report(null, '2026-10-22')] }).counts.review, 1);
});

test('cancelled sites are excluded; completed reports can still require review', () => {
  const result = build({ sites: [site('s', { status: 'cancelled' }), site('done', { status: 'completed' })],
    reports: [report('pending', TODAY), report('pending', TODAY, { site_id: 'done' })] });
  assert.equal(result.tasks.length, 1);
  assert.equal(result.tasks[0].siteId, 'done');
  assert.deepEqual(result.todaySites, []);
});

test('manual completion replaces assignment tasks with missing-report follow-up', () => {
  const data = { sites: [site('s', { status: 'completed', updated_at: '2026-10-21T15:00:00Z' })] };
  const result = build(data);
  assert.deepEqual(result.counts, { assignment: 0, review: 0, revision: 0, missing: 1 });
  assert.deepEqual(result.todaySites, []);
  assert.equal(result.tasks[0].section, 'report-write');
  assert.equal(result.tasks[0].date, TODAY);
  data.sites[0].status = 'in_progress';
  assert.equal(build(data).counts.missing, 0);
  assert.equal(build(data).counts.assignment, 1);
});

test('later report submission, rejection and approval replace missing follow-up without reopening the site', () => {
  const data = { sites: [site('s', { status: 'completed' })], reports: [] };
  for (const [status, kind] of [['pending', 'review'], ['rejected', 'revision'], ['approved', null]]) {
    data.reports = [report(status, TODAY)];
    const result = build(data);
    assert.equal(result.counts.missing, 0);
    assert.deepEqual(result.tasks.map((t) => t.kind), kind ? [kind] : []);
    assert.deepEqual(result.todaySites, []);
    assert.equal(data.sites[0].status, 'completed');
  }
});

test('missing/invalid dates stay undated instead of defaulting to today, and link to schedule editing', () => {
  for (const extra of [
    { schedule_start: undefined, schedule_end: undefined },
    { schedule_start: 'invalid', schedule_end: null },
    { schedule_start: '2026-02-30', schedule_end: '2026-02-30' },
    { schedule_start: '2026-10-23', schedule_end: '2026-10-22' },
  ]) {
    const result = build({ sites: [site('s', extra)] });
    assert.equal(result.tasks[0].section, 'schedule');
    assert.match(result.tasks[0].reason, /일정/);
    assert.deepEqual(result.todaySites, []);
  }
  const legacyDate = build({ sites: [site('s', { schedule_start: undefined, schedule_end: undefined, schedule_date: TODAY })] });
  assert.equal(legacyDate.todaySites.length, 1);
  assert.equal(legacyDate.tasks[0].date, TODAY);
});

test('today follows Korean midnight and includes the final scheduled day', () => {
  assert.equal(context.day('2026-10-21T14:59:59Z'), '2026-10-21');
  assert.equal(context.day('2026-10-21T15:00:00Z'), TODAY);
  assert.equal(build({ sites: [site()] }, '2026-10-23').todaySites.length, 1);
  assert.equal(build({ sites: [site()] }, '2026-10-24').todaySites.length, 0);
  assert.equal(build({ sites: [site()] }, '2026-10-24').tasks[0].overdue, true);
});

test('active leaders satisfy assignments; members and disabled workers do not', () => {
  const data = { sites: [site()], workers: [worker()], assignments: [assignment()] };
  assert.equal(build(data).tasks.length, 0);
  assert.equal(build(data).todaySites[0].hasLeader, true);
  data.assignments = [assignment({ role: 'member' })];
  assert.match(build(data).tasks[0].reason, /팀장/);
  data.workers = [worker('w', { is_active: false })];
  assert.equal(build(data).todaySites[0].workerCount, 0);
  assert.match(build(data).tasks[0].reason, /담당 시공자/);
});

test('daily schedules override legacy crews, preserve rest days and flag the first missing future leader', () => {
  const data = { sites: [site('s', { schedule_end: '2026-10-25' })], workers: [worker()], assignments: [assignment()],
    daily: [daily('2026-10-23'), daily('2026-10-25', { role: 'member' })] };
  const result = build(data);
  assert.deepEqual(result.todaySites, []);
  assert.equal(result.tasks.length, 1);
  assert.equal(result.tasks[0].date, '2026-10-25');
  assert.match(result.tasks[0].reason, /10\/25/);
  data.daily[1].role = 'leader';
  assert.deepEqual(build(data).tasks, []);
  assert.equal(build(data, '2026-10-23').todaySites[0].workerCount, 1);
});

test('daily crews deduplicate workers and reject a stale legacy leader or out-of-range dates', () => {
  const data = { sites: [site()], workers: [worker()], assignments: [assignment()], daily: [daily(TODAY, { role: 'member' }), daily(TODAY, { role: 'member' })] };
  assert.equal(build(data).todaySites[0].workerCount, 1);
  assert.equal(build(data).todaySites[0].hasLeader, false);
  assert.equal(build(data).counts.assignment, 1);
  data.daily = [daily('2026-10-20')];
  assert.match(build(data).tasks[0].reason, /변경/);
  assert.deepEqual(build(data).todaySites, []);
});

test('due assignments precede reviews, upcoming assignments and revision follow-ups', () => {
  const result = build({ sites: [site('due'), site('future', { schedule_start: '2026-10-28', schedule_end: '2026-10-28' }), site('review'), site('revision')],
    reports: [report('pending', '2026-10-21', { site_id: 'review' }), report('rejected', '2026-10-21', { site_id: 'revision' })] });
  assert.deepEqual(result.tasks.map((t) => t.siteId), ['due', 'review', 'future', 'revision']);
});

function harness({ tables = {}, errors = {}, invalidToken = false, configured = true } = {}) {
  const db = { profiles: [{ id: 'user', company_id: 'a', role: 'owner', is_active: true }],
    companies: [{ id: 'a', is_active: true }], sites: [site()], workers: [worker()],
    site_workers: [], site_daily_assignments: [], work_reports: [], ...tables };
  const reads = [], filters = [], pages = [];
  const client = {
    auth: { getUser: async () => invalidToken ? { data: {}, error: Error('invalid') } : { data: { user: { id: 'user' } } } },
    from(table) {
      reads.push(table);
      let conditions = [], fields, start = 0, end = 499;
      const result = (single = false) => {
        if (errors[table]) return { data: null, error: errors[table] };
        let data = db[table].filter((row) => conditions.every((f) => f(row))).slice(start, end + 1);
        if (fields) data = data.map((row) => Object.fromEntries(fields.map((key) => [key, row[key]])));
        return { data: single ? data[0] || null : data };
      };
      const q = {
        select(value) { fields = value.split(','); return q; },
        eq(key, value) { filters.push([table, key, value]); conditions.push((row) => row[key] === value); return q; },
        order() { return q; },
        range(a, b) { pages.push([table, a, b]); start = a; end = b; return q; },
        maybeSingle: async () => result(true),
        then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
      };
      return q;
    },
  };
  const ctx = vm.createContext({ Intl, console: { error() {} }, createClient: () => client,
    process: { env: configured ? { NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test' } : {} },
    Response: { json: (body, options) => ({ body: JSON.parse(JSON.stringify(body)), ...options }) } });
  vm.runInContext(`${helpers}\n${source('../app/api/admin/today-tasks/route.js')}\nglobalThis.get = GET;`, ctx);
  return { reads, filters, pages, get: (token = 'Bearer valid') => ctx.get({ url: 'https://app.example/api/admin/today-tasks?companyId=b', headers: new Headers(token ? { Authorization: token } : {}) }) };
}

test('missing/invalid tokens never read company data; missing server settings are explicit', async () => {
  const missing = harness();
  assert.equal((await missing.get('')).status, 401);
  assert.deepEqual(missing.reads, []);
  const invalid = harness({ invalidToken: true });
  assert.equal((await invalid.get()).status, 401);
  assert.deepEqual(invalid.reads, []);
  assert.equal((await harness({ configured: false }).get()).status, 503);
});

test('only an active company owner can read the dashboard', async () => {
  for (const tables of [
    { profiles: [] },
    { profiles: [{ id: 'user', company_id: 'a', role: 'worker' }] },
    { profiles: [{ id: 'user', company_id: 'a', role: 'owner', is_active: false }] },
    { companies: [{ id: 'a', is_active: false }] },
    { companies: [] },
  ]) {
    const h = harness({ tables });
    assert.equal((await h.get()).status, 403);
    assert.equal(h.reads.includes('sites'), false);
  }
});

test('every read is company-scoped, ignores a supplied company ID and omits private pricing/contact data', async () => {
  const h = harness({ tables: {
    sites: [site('s', { contract_amount: 999999, customer_phone: 'private', address_detail: 'private' }), site('other', { company_id: 'b' })],
    work_reports: [report('pending', TODAY, { company_id: 'b' })],
    site_workers: [assignment({ company_id: 'b' })],
    site_daily_assignments: [daily(TODAY, { company_id: 'b' })],
    workers: [worker('w', { company_id: 'b' })],
  } });
  const result = await h.get();
  assert.equal(result.status, 200);
  assert.equal(result.body.tasks.length, 1);
  assert.equal(result.body.tasks[0].siteId, 's');
  assert.equal(result.body.tasks[0].kind, 'assignment');
  for (const table of ['sites', 'work_reports', 'site_workers', 'site_daily_assignments', 'workers']) {
    assert.ok(h.filters.some(([t, key, value]) => t === table && key === 'company_id' && value === 'a'));
  }
  assert.doesNotMatch(JSON.stringify(result.body), /private|contract_amount|customer_phone|address_detail/);
  assert.match(result.headers['Cache-Control'], /no-store/);
  assert.equal(result.headers.Vary, 'Authorization');
});

test('pagination includes a latest report beyond 500 rows and avoids phantom pending reviews', async () => {
  const h = harness({ tables: { work_reports: [
    ...Array.from({ length: 1001 }, (_, i) => report('pending', '2026-10-20', { id: `old-${i}` })),
    report('approved', '2026-10-21', { id: 'last' }),
  ] } });
  assert.deepEqual((await h.get()).body.tasks, []);
  assert.equal(h.pages.filter(([table]) => table === 'work_reports').length, 3);
});

test('database errors cannot masquerade as an empty to-do list', async () => {
  for (const table of ['profiles', 'companies', 'sites', 'work_reports', 'site_workers', 'site_daily_assignments', 'workers']) {
    const result = await harness({ errors: { [table]: Error('database unavailable') } }).get();
    assert.equal(result.status, 500);
    assert.equal('counts' in result.body, false);
  }
  const empty = await harness({ tables: { sites: [] } }).get();
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.body.counts, { assignment: 0, review: 0, revision: 0, missing: 0 });
});
