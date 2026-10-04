import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8').replace(/^import[^\n]*\n/gm, '').replaceAll('export ', '');
const helpers = source('../app/utils/workerCalendar.js') + '\n' + source('../app/utils/workerPay.js');
const clean = (value) => JSON.parse(JSON.stringify(value));
const context = vm.createContext({ Intl });
vm.runInContext(helpers + '\nglobalThis.pay = { companyMonthPay, payAmount, payMonth, payDate, sumPay, koreanDay };', context);
const { companyMonthPay, payAmount, payMonth, payDate, sumPay, koreanDay } = context.pay;
const company = { id: 'a', company_name: '내 업체' };
const site = (id = 's', extra = {}) => ({ id, company_id: 'a', site_name: id, status: 'completed', schedule_start: '2026-09-01', schedule_end: '2026-09-30', ...extra });
const row = (date, role = 'member', extra = {}) => ({ id: date, site_id: 's', worker_id: 'w', company_id: 'a', work_date: date, role, ...extra });
const rate = (date = '1900-01-01', extra = {}) => ({ id: date, company_id: 'a', worker_id: 'w', effective_from: date, daily_wage: 250000, leader_allowance: 30000, ...extra });
const allowance = (date = '1900-01-01', extra = {}) => ({ company_id: 'a', effective_from: date, amount: 30000, ...extra });
const calc = (extra = {}) => clean(companyMonthPay({ company, workerIds: ['w'], sites: [site()], daily: [], legacy: [], rates: [rate()], allowanceRates: [allowance()], month: '2026-09', today: '2026-09-30', ...extra }));

test('leader allowance adds to daily wage; multiple same-day sites count once; historical dates retain their rate', () => {
  const result = calc({ sites: [site(), site('t')], daily: [row('2026-09-01'), row('2026-09-01', 'leader', { site_id: 't' }), row('2026-09-02'), row('2026-09-16', 'leader')],
    rates: [rate(), rate('2026-09-15', { daily_wage: 260000 })], allowanceRates: [allowance(), allowance('2026-09-15', { amount: 40000 })] });
  assert.equal(result.leaderDays, 2); assert.equal(result.memberDays, 1);
  assert.equal(result.baseAmount, 760000); assert.equal(result.allowanceAmount, 70000); assert.equal(result.totalAmount, 830000);
  assert.equal(result.entries.at(-1).sites.length, 2);
  assert.equal(result.entries.at(-1).totalAmount, 280000);
});

test('only completed, past/current personal days count; gaps, stale legacy roles and foreign companies never count', () => {
  const result = calc({ sites: [site(), site('scheduled', { status: 'scheduled' }), site('cancelled', { status: 'cancelled' }), site('foreign', { company_id: 'b' }), site('stale')],
    today: '2026-09-10', legacy: [row(null, 'leader'), row(null, 'leader', { site_id: 'stale' })],
    daily: [row('2026-09-01'), row('2026-09-03'), row('2026-09-20'), row('2026-08-31'), row('2026-09-05', 'leader', { site_id: 'scheduled' }),
      row('2026-09-05', 'leader', { site_id: 'cancelled' }), row('2026-09-05', 'leader', { site_id: 'foreign' }), row('2026-09-05', 'leader', { site_id: 'stale', worker_id: 'other' })] });
  assert.equal(result.memberDays, 2); assert.equal(result.leaderDays, 0); assert.equal(result.totalAmount, 500000);
  assert.deepEqual(result.entries.map((r) => r.date), ['2026-09-03', '2026-09-01']);
});

test('legacy periods use Korean inclusive dates and leap days, label inferred days and leave missing dates unresolved', () => {
  const result = calc({ month: '2024-02', sites: [site('s', { schedule_start: '2024-02-27T15:00:00Z', schedule_end: '2024-03-01T00:00:00Z' }), site('undated', { schedule_start: null, schedule_end: null })],
    legacy: [row(null, 'leader'), row(null, 'member', { site_id: 'undated' })] });
  assert.equal(result.leaderDays, 2); assert.equal(result.totalAmount, 560000); assert.equal(result.undatedSites, 1);
  assert.equal(result.entries[0].date, '2024-02-29'); assert.equal(result.entries[0].inferred, true);
  assert.equal(koreanDay('2026-09-30T15:00:00Z'), '2026-10-01');
});

test('zero is valid but missing, conflicting or not-yet-effective rates and unknown roles need review', () => {
  assert.equal(calc({ daily: [row('2026-09-01', 'leader')], rates: [rate('1900-01-01', { daily_wage: 0, leader_allowance: 0 })] }).pendingDays, 0);
  for (const rates of [[], [rate('2026-09-02')], [rate('1900-01-01', { daily_wage: null })]]) {
    const result = calc({ daily: [row('2026-09-01', 'leader')], rates });
    assert.equal(result.pendingDays, 1); assert.equal(result.totalAmount, 0); assert.equal(result.entries[0].totalAmount, null);
  }
  const conflicting = calc({ workerIds: ['w', 'duplicate'], daily: [row('2026-09-01'), row('2026-09-01', 'member', { worker_id: 'duplicate' })], rates: [rate(), rate('1900-01-01', { worker_id: 'duplicate', daily_wage: 300000 })] });
  assert.equal(conflicting.pendingDays, 1); assert.equal(conflicting.memberDays, 1);
  assert.equal(calc({ daily: [row('2026-09-01', 'invalid')] }).pendingDays, 1);
});

test('separate company rates sum independently and input validation rejects impossible dates and unsafe amounts', () => {
  const a = calc({ daily: [row('2026-09-01', 'leader')] });
  const b = calc({ company: { id: 'b' }, sites: [site('s', { company_id: 'b' })], daily: [row('2026-09-01')], rates: [rate('1900-01-01', { company_id: 'b', daily_wage: 200000 })] });
  assert.equal(sumPay([a, b]).totalAmount, 480000);
  for (const bad of [null, undefined, '', ' ', [], {}, true, -1, 0.5, 100000001, Infinity]) assert.equal(payAmount(bad), null);
  assert.equal(payAmount('0'), 0); assert.equal(payMonth('2026-13'), null); assert.equal(payMonth('2026-1'), null);
  assert.equal(payDate('2026-02-30'), null); assert.equal(payDate('2026-09-01T00:00:00Z'), null);
});

function api({ tables = {}, errors = {}, invalid = false } = {}) {
  const db = {
    workers: [{ id: 'w', company_id: 'a', user_id: 'u', is_active: true }], profiles: [],
    companies: [{ ...company, is_active: true }], sites: [site()], site_workers: [],
    site_daily_assignments: [row('2026-09-01', 'leader')], worker_pay_rates: [rate()], company_leader_allowance_rates: [allowance()], ...tables,
  };
  const reads = [];
  const client = {
    auth: { getUser: async () => invalid ? { error: Error('invalid') } : { data: { user: { id: 'u' } } } },
    from(table) {
      let filters = [], fields, start = 0, end = 499;
      const result = (single = false) => {
        if (errors[table]) return { error: Error('query failed') };
        const rows = (db[table] || []).filter((r) => filters.every((f) => f(r))).slice(start, end + 1);
        reads.push({ table, ids: rows.map((r) => r.id) });
        const data = rows.map((r) => Object.fromEntries(fields.map((f) => [f, r[f]])));
        return { data: single ? data[0] || null : data };
      };
      const q = {
        select(s) { fields = s.split(','); return q; }, eq(k, v) { filters.push((r) => r[k] === v); return q; },
        in(k, vs) { filters.push((r) => vs.includes(r[k])); return q; }, order() { return q; },
        range(a, b) { start = a; end = b; return q; }, maybeSingle: async () => result(true),
        then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
      }; return q;
    },
  };
  const FixedDate = class extends Date { constructor(...args) { super(...(args.length ? args : ['2026-09-30T12:00:00Z'])); } };
  const ctx = vm.createContext({ URL, Intl, Date: FixedDate, console: { error() {} }, createClient: () => client,
    process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test' } },
    Response: { json: (body, options) => ({ body: clean(body), ...options }) },
  });
  vm.runInContext(helpers + '\n' + source('../app/api/worker/monthly-pay/route.js') + '\nglobalThis.get = GET;', ctx);
  return { reads, get: (params = {}, token = 'Bearer valid') => ctx.get({ headers: new Headers(token ? { Authorization: token } : {}), url: `https://app.example/api/worker/monthly-pay?${new URLSearchParams(params)}` }) };
}

test('monthly API authenticates a linked worker without an owner profile and never queries another worker rate', async () => {
  const h = api({ tables: {
    workers: [{ id: 'w', company_id: 'a', user_id: 'u', is_active: true }, { id: 'other', company_id: 'b', user_id: 'someone', is_active: true }],
    worker_pay_rates: [rate(), rate('secret', { worker_id: 'other', company_id: 'b', daily_wage: 999999 })],
    site_daily_assignments: [row('2026-09-01', 'leader'), row('2026-09-02', 'leader', { worker_id: 'other' })],
  } });
  const result = await h.get({ month: '2026-09', workerId: 'other', companyId: 'b' });
  assert.equal(result.status, 200); assert.equal(result.body.totals.totalAmount, 280000);
  assert.deepEqual(h.reads.filter((r) => r.table === 'worker_pay_rates').flatMap((r) => r.ids), ['1900-01-01']);
  assert.match(result.headers['Cache-Control'], /no-store/); assert.equal(result.headers.Vary, 'Authorization');
  assert.equal(JSON.stringify(result.body).includes('other'), false);
});

test('monthly API rejects missing/expired logins, inactive memberships and invalid/future months', async () => {
  const missing = api(); assert.equal((await missing.get({}, '')).status, 401); assert.equal(missing.reads.length, 0);
  assert.equal((await api({ invalid: true }).get()).status, 401);
  for (const tables of [{ workers: [] }, { profiles: [{ id: 'u', is_active: false }] }, { workers: [{ id: 'w', company_id: 'a', user_id: 'u', is_active: false }] }, { companies: [{ ...company, is_active: false }] }]) {
    assert.equal((await api({ tables }).get()).status, 403);
  }
  for (const month of ['', '2026-13', '2026-10', 'oops']) assert.equal((await api().get({ month })).status, 400);
});

test('monthly API paginates assignments and reports read failures instead of zero pay', async () => {
  const assignments = Array.from({ length: 501 }, (_, i) => row('2026-09-01', i === 500 ? 'leader' : 'member', { id: String(i) }));
  assert.equal((await api({ tables: { site_daily_assignments: assignments } }).get()).body.totals.totalAmount, 280000);
  for (const table of ['workers', 'profiles', 'companies', 'site_workers', 'site_daily_assignments', 'sites', 'worker_pay_rates', 'company_leader_allowance_rates']) {
    assert.equal((await api({ errors: { [table]: true } }).get()).status, 500);
  }
});

function workerCrud() {
  const writes = [];
  const q = { insert(value) { writes.push({ action: 'insert', value: clean(value) }); return q; }, update(value) { writes.push({ action: 'update', value: clean(value) }); return q; }, select() { return q; }, eq() { return q; }, single: async () => ({ data: { id: 'w', ...writes.at(-1).value } }) };
  const ctx = vm.createContext({ console, Intl, useCallback: (fn) => fn, useState: (value) => [value, () => {}], supabase: { from: () => q } });
  vm.runInContext(helpers + '\n' + source('../app/admin/hooks/useWorkers.js').replace('default function useWorkers', 'function useWorkers') + '\nglobalThis.hook = useWorkers({companyId:"a"});', ctx);
  return { writes, hook: ctx.hook };
}

test('personal wage CRUD never writes per-worker allowances; phone-only edits preserve rates', async () => {
  const h = workerCrud();
  const form = { name: '시공자', phone: '010-test', daily_wage: '250000', leader_allowance: 30000, pay_rate_effective_from: '2026-09-01', update_pay_rate: true };
  assert.equal((await h.hook.createWorker(form)).success, true);
  assert.equal('leader_allowance' in h.writes[0].value, false); assert.equal(h.writes[0].value.pay_rate_effective_from, '2026-09-01');
  await h.hook.updateWorker('w', { ...form, update_pay_rate: false });
  assert.equal('daily_wage' in h.writes[1].value, false); assert.equal('leader_allowance' in h.writes[1].value, false);
  await h.hook.updateWorker('w', { ...form, daily_wage: '100000001' });
  await h.hook.createWorker({ ...form, pay_rate_effective_from: '2026-02-30' });
  assert.equal(h.writes.length, 2);
});


test('one company setting applies equally to every leader, including a newly registered worker, while personal wages stay different', () => {
  const first = calc({ daily: [row('2026-09-01', 'leader')], rates: [rate('1900-01-01', { leader_allowance: 999999 })] });
  const second = calc({ workerIds: ['new'], daily: [row('2026-09-01', 'leader', { worker_id: 'new' })], rates: [rate('2026-09-01', { worker_id: 'new', daily_wage: 200000, leader_allowance: 1 })] });
  assert.equal(first.allowanceAmount, 30000); assert.equal(second.allowanceAmount, 30000);
  assert.equal(first.totalAmount, 280000); assert.equal(second.totalAmount, 230000);
  const ordinary = calc({ daily: [row('2026-09-01')], allowanceRates: [allowance('1900-01-01', { amount: 50000 })] });
  assert.equal(ordinary.allowanceAmount, 0); assert.equal(ordinary.totalAmount, 250000);
});

test('company allowance changes retain earlier days and ignore another company or legacy individual allowance', () => {
  const result = calc({ daily: [row('2026-09-01', 'leader'), row('2026-09-15', 'leader')],
    allowanceRates: [allowance(), allowance('2026-09-15', { amount: 50000 }), allowance('2026-09-01', { company_id: 'b', amount: 999999 })] });
  assert.equal(result.allowanceAmount, 80000);
  assert.equal(calc({ daily: [row('2026-09-01', 'leader')], allowanceRates: [] }).allowanceAmount, 0);
  assert.equal(calc({ daily: [row('2026-09-01', 'leader')], allowanceRates: [allowance('1900-01-01', { amount: null })] }).pendingDays, 1);
});
