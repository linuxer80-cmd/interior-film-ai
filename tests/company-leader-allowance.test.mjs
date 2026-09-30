import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8').replace(/^import[^\n]*\n/gm, '').replaceAll('export ', '');
const clean = (value) => JSON.parse(JSON.stringify(value));

function api({ tables = {}, invalid = false, errors = {}, race = false } = {}) {
  const db = {
    profiles: [{ id: 'u', company_id: 'a', role: 'owner', is_active: true }], companies: [{ id: 'a', is_active: true }],
    company_leader_allowances: [{ company_id: 'a', amount: 30000, effective_from: '2026-09-01', version: 0 }, { company_id: 'b', amount: 70000, effective_from: '2026-09-01', version: 0 }], ...tables,
  };
  const reads = [], writes = [];
  const client = {
    auth: { getUser: async () => invalid ? { error: Error('invalid') } : { data: { user: { id: 'u' } } } },
    from(table) {
      reads.push(table);
      let filters = [], fields, patch, insert;
      const q = {
        select(s) { fields = s.split(','); return q; }, eq(k, v) { filters.push((r) => r[k] === v); return q; },
        update(value) { patch = value; return q; }, insert(value) { insert = value; return q; },
        async maybeSingle() {
          if (errors[table]) return { error: { code: errors[table] } };
          if (race && (insert || patch)) return insert ? { error: { code: '23505' } } : { data: null };
          if (insert) {
            if (db[table].some((r) => r.company_id === insert.company_id)) return { error: { code: '23505' } };
            const row = { ...insert, version: 0 }; db[table].push(row); writes.push({ table, row: clean(row) });
            return { data: Object.fromEntries(fields.map((f) => [f, row[f]])) };
          }
          const row = db[table].find((r) => filters.every((f) => f(r)));
          if (row && patch) {
            if (patch.effective_from < row.effective_from) return { error: { code: 'P0001' } };
            Object.assign(row, patch, { version: row.version + 1 }); writes.push({ table, row: clean(row) });
          }
          return { data: row ? Object.fromEntries(fields.map((f) => [f, row[f]])) : null };
        },
      }; return q;
    },
  };
  const FixedDate = class extends Date { constructor(...args) { super(...(args.length ? args : ['2026-09-30T12:00:00Z'])); } };
  const ctx = vm.createContext({ Date: FixedDate, Intl, console: { error() {} }, createClient: () => client,
    Response: { json: (body, options) => ({ body: clean(body), ...options }) },
    process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test' } },
  });
  vm.runInContext(source('../app/utils/workerCalendar.js') + '\n' + source('../app/utils/workerPay.js') + '\n' + source('../app/api/admin/leader-allowance/route.js') + '\nglobalThis.routes = {GET,POST};', ctx);
  return { db, reads, writes, call: (method = 'GET', body = { amount: 50000, effective_from: '2026-09-15', version: 0 }, token = 'Bearer valid') => ctx.routes[method]({
    url: 'https://app.example/api/admin/leader-allowance?companyId=b', headers: new Headers(token ? { Authorization: token } : {}), json: async () => body,
  }) };
}

test('owner saves one company amount without rewriting individual wages or touching another company', async () => {
  const h = api();
  assert.equal((await h.call()).body.setting.amount, 30000);
  const saved = await h.call('POST', { companyId: 'b', workerId: 'someone', amount: 50000, effective_from: '2026-09-15', version: 0 });
  assert.equal(saved.status, 200); assert.equal(saved.body.setting.amount, 50000); assert.equal(saved.body.setting.version, 1);
  assert.deepEqual(h.writes.map((w) => [w.table, w.row.company_id]), [['company_leader_allowances', 'a']]);
  assert.equal(h.db.company_leader_allowances[1].amount, 70000);
  assert.match(saved.headers['Cache-Control'], /no-store/); assert.equal(saved.headers.Vary, 'Authorization');
});

test('missing login, worker accounts and disabled owners/companies cannot read or save settings', async () => {
  for (const method of ['GET', 'POST']) {
    const h = api(); assert.equal((await h.call(method, undefined, '')).status, 401); assert.equal(h.reads.length, 0);
    assert.equal((await api({ invalid: true }).call(method)).status, 401);
    for (const tables of [{ profiles: [] }, { profiles: [{ id: 'u', company_id: 'a', role: 'worker', is_active: true }] },
      { profiles: [{ id: 'u', company_id: 'a', role: 'owner', is_active: false }] }, { companies: [{ id: 'a', is_active: false }] }]) {
      const h = api({ tables }); assert.equal((await h.call(method)).status, 403); assert.equal(h.writes.length, 0);
      assert.equal(h.reads.includes('company_leader_allowances'), false);
    }
  }
});

test('new companies default to zero and can save their first setting; competing inserts/updates return conflict', async () => {
  const h = api({ tables: { company_leader_allowances: [] } });
  assert.deepEqual((await h.call()).body.setting, { amount: 0, effective_from: null, version: null });
  assert.equal((await h.call('POST', { amount: 0, effective_from: '2026-09-01', version: null })).status, 200);
  assert.equal(h.writes[0].row.amount, 0);
  assert.equal((await h.call('POST', { amount: 50000, effective_from: '2026-09-01', version: null })).status, 409);
  const existing = api(); await existing.call('POST'); assert.equal((await existing.call('POST')).status, 409);
  assert.equal(existing.writes.length, 1);
  assert.equal((await api({ race: true }).call('POST')).status, 409);
});

test('blank/negative/unsafe amounts, invalid/future/backdated dates and invalid versions cannot save', async () => {
  const valid = { amount: 30000, effective_from: '2026-09-15', version: 0 };
  for (const amount of [null, '', ' ', -1, 0.5, 100000001, {}, true]) {
    const h = api(); assert.equal((await h.call('POST', { ...valid, amount })).status, 400); assert.equal(h.writes.length, 0);
  }
  for (const effective_from of ['2026-02-30', '2026-10-01', '', '1999-01-01', '2026-08-31']) {
    const h = api(); assert.equal((await h.call('POST', { ...valid, effective_from })).status, 400); assert.equal(h.writes.length, 0);
  }
  for (const version of [undefined, -1, 0.5, '0']) assert.equal((await api().call('POST', { ...valid, version })).status, 400);
});

test('query failures are explicit errors, never successful saves or an invented zero setting', async () => {
  for (const method of ['GET', 'POST']) for (const table of ['profiles', 'companies', 'company_leader_allowances']) {
    const h = api({ errors: { [table]: 'XX000' } }); assert.equal((await h.call(method)).status, 500); assert.equal(h.writes.length, 0);
  }
});
