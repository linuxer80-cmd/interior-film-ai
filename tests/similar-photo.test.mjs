import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const WORK = '00000000-0000-0000-0000-000000000001';
const OTHER = '00000000-0000-0000-0000-000000000002';
function route(photos, missingObjects = []) {
  const signed = [];
  const tables = {
    companies: [{ id: 'company-a', slug: 'test', is_active: true }],
    work_items: [{ id: WORK, company_id: 'company-a' }, { id: OTHER, company_id: 'company-b' }],
    work_photos: photos,
  };
  const client = {
    from(table) {
      let rows = tables[table];
      const query = {
        select() { return query; },
        eq(key, value) { rows = rows.filter((row) => row[key] === value); return query; },
        in(key, values) { rows = rows.filter((row) => values.includes(row[key])); return query; },
        order() { return query; },
        limit(n) { rows = rows.slice(0, n); return query; },
        maybeSingle: async () => ({ data: rows[0] || null, error: null }),
        then(resolve, reject) { return Promise.resolve({ data: rows, error: null }).then(resolve, reject); },
      };
      return query;
    },
    storage: { from: () => ({ createSignedUrl: async (path) => {
      signed.push(path);
      return missingObjects.includes(path) ? { error: Error('missing') } : { data: { signedUrl: `signed:${path}` } };
    } }) },
  };
  const source = fs.readFileSync(new URL('../app/api/similar-photo/route.js', import.meta.url), 'utf8')
    .replace(/^import[^\n]+\n/gm, '').replaceAll('export ', '');
  const context = { URL, console: { error() {} }, process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co' } },
    createClient: () => client, NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } };
  vm.createContext(context);
  vm.runInContext(`${source}\nglobalThis.post = POST`, context);
  return { signed, post: (body) => context.post({ json: async () => ({ company_slug: 'test', ...body }) }) };
}
const photo = (overrides = {}) => ({ company_id: 'company-a', work_item_id: WORK, photo_type: 'before', storage_path: 'history/1789133498662.jpg', ...overrides });

test('legacy timestamp path is resolved from its company-owned record, not cast to a UUID', async () => {
  const h = route([photo()]);
  const result = await h.post({ work_item_id: WORK, photo_type: 'before' });
  assert.equal(result.status, 200);
  assert.equal(result.body.signed_url, 'signed:history/1789133498662.jpg');
});

test('another company work item or photo path can never be signed', async () => {
  const h = route([photo({ work_item_id: OTHER, company_id: 'company-b' })]);
  assert.equal((await h.post({ work_item_id: OTHER, photo_type: 'before' })).status, 404);
  assert.equal((await h.post({ path: 'history/1789133498662.jpg' })).body.found, false);
  assert.equal((await h.post({ path: 'history/company-a/unregistered.jpg' })).body.found, false);
  assert.equal(h.signed.length, 0);
});

test('missing after photo stays missing rather than repeating the before photo', async () => {
  const h = route([photo()]);
  const result = await h.post({ work_item_id: WORK, photo_type: 'after' });
  assert.equal(result.body.found, false);
  assert.equal(h.signed.length, 0);
});

test('history reference uses its owned work item and supports a legacy URL without inventing an after image', async () => {
  const h = route([photo({ photo_type: 'history', storage_path: null, photo_url: 'https://example.supabase.co/storage/v1/object/public/work-photos/history/legacy.jpg' })]);
  assert.equal((await h.post({ work_item_id: WORK, photo_type: 'history' })).body.signed_url, 'signed:history/legacy.jpg');
  assert.equal((await h.post({ work_item_id: WORK, photo_type: 'after' })).body.found, false);
  assert.equal((await h.post({ work_item_id: OTHER, photo_type: 'history' })).status, 404);
});

test('legacy storage URL is normalized, missing objects fall back to another registered photo', async () => {
  const h = route([photo(), photo({ storage_path: null, photo_url: 'https://example.supabase.co/storage/v1/object/sign/work-photos/history/good.jpg?token=old' })], ['history/1789133498662.jpg']);
  const result = await h.post({ work_item_id: WORK, photo_type: 'before' });
  assert.equal(result.body.signed_url, 'signed:history/good.jpg');
});

test('missing storage object reports a load error; external URLs and traversal are not signed', async () => {
  const h = route([photo()], ['history/1789133498662.jpg']);
  assert.equal((await h.post({ work_item_id: WORK, photo_type: 'before' })).status, 502);
  for (const path of ['https://evil.example/history/a.jpg', 'history/../secret.jpg']) {
    assert.equal((await h.post({ path })).status, 400);
  }
  assert.equal(h.signed.length, 1);
});
