import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const A = '00000000-0000-0000-0000-000000000001';
const B = '00000000-0000-0000-0000-000000000002';
const row = (id, company = A) => ({ id, company_id: company, category: '붙박이장', photo_type: 'before', storage_path: `history/${id}.jpg`, created_at: '2026-09-29T00:00:00Z' });
function harness({ role = 'super', invalidToken = false, tables = {}, storageFailure = false } = {}) {
  const reads = [];
  const signs = [];
  const db = {
    super_admins: role === 'normal' ? [] : [{ user_id: 'user', is_active: role === 'super' }],
    companies: [{ id: A, company_name: '업체 A' }, { id: B, company_name: '업체 B' }],
    work_photos: [row('photo-a'), row('photo-b', B)], site_photos: [], sites: [], estimate_usage: [], customer_leads: [], ...tables,
  };
  const client = {
    auth: { getUser: async () => invalidToken ? { data: {}, error: Error('invalid') } : { data: { user: { id: 'user' } } } },
    from(table) {
      reads.push(table);
      let result = db[table] || [];
      let count;
      const q = {
        select() { return q; },
        eq(key, value) { result = result.filter((item) => item[key] === value); return q; },
        in(key, values) { result = result.filter((item) => values.includes(item[key])); return q; },
        order() { return q; },
        range(start, end) { count = result.length; result = result.slice(start, end + 1); return q; },
        maybeSingle: async () => ({ data: result[0] || null }),
        then(resolve, reject) { return Promise.resolve({ data: result, count: count ?? result.length }).then(resolve, reject); },
      };
      return q;
    },
    storage: { from(bucket) {
      assert.equal(bucket, 'work-photos');
      return { createSignedUrls: async (paths, seconds) => {
        assert.equal(seconds, 600);
        signs.push(...paths);
        if (storageFailure) return { error: Error('storage down') };
        return { data: paths.map((path) => path.includes('missing') ? { path, error: 'not found' } : { path, signedUrl: `signed:${path}` }) };
      } };
    } },
  };
  const source = fs.readFileSync(new URL('../app/api/super-admin/company-photos/route.js', import.meta.url), 'utf8')
    .replace(/^import[^\n]*\n/gm, '').replaceAll('export ', '');
  const context = { URL, console: { error() {} }, createClient: () => client,
    process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test' } },
    NextResponse: { json: (body, options) => ({ body, ...options }) },
  };
  vm.createContext(context); vm.runInContext(`${source}\nglobalThis.get = GET`, context);
  return { reads, signs, get: (params = {}, token = 'Bearer test') => context.get({
    url: `https://app.example/api/super-admin/company-photos?${new URLSearchParams({ company_id: A, ...params })}`,
    headers: new Headers(token ? { Authorization: token } : {}),
  }) };
}

test('missing or invalid sessions cannot query company records or sign photos', async () => {
  const missing = harness();
  assert.equal((await missing.get({}, '')).status, 401);
  assert.equal(missing.reads.length, 0);
  const invalid = harness({ invalidToken: true });
  assert.equal((await invalid.get()).status, 401);
  assert.equal(invalid.reads.length, 0);
});

test('ordinary and inactive super admins are denied even with a valid company UUID', async () => {
  for (const role of ['normal', 'inactive']) {
    const h = harness({ role });
    assert.equal((await h.get({ company_id: B })).status, 403);
    assert.deepEqual(h.reads, ['super_admins']);
    assert.equal(h.signs.length, 0);
  }
});

test('active super admin can inspect each company; returned photos stay scoped to the selected company', async () => {
  const h = harness();
  const result = await h.get({ company_id: B });
  assert.equal(result.status, 200);
  assert.equal(result.body.company.id, B);
  assert.equal(result.body.photos.length, 1);
  assert.equal(result.body.photos[0].url, 'signed:history/photo-b.jpg');
  assert.deepEqual(h.signs, ['history/photo-b.jpg']);
  assert.match(result.headers['Cache-Control'], /no-store/);
  assert.equal(result.headers.Vary, 'Authorization');
});

test('invalid source/page/company/type and unknown companies do not reach photo storage', async () => {
  const h = harness();
  for (const params of [{ source: 'super_admins' }, { company_id: 'bad-id' }, { page: '1.5' }, { page: '-1' }, { photo_type: 'bad' }, { source: 'estimate', photo_type: 'before' }]) {
    assert.equal((await h.get(params)).status, 400);
  }
  assert.equal((await h.get({ company_id: '00000000-0000-0000-0000-000000000003' })).status, 404);
  assert.equal(h.signs.length, 0);
});

test('work photos are filtered and paginated before signing URLs', async () => {
  const photos = Array.from({ length: 30 }, (_, i) => row(`photo-${i}`));
  photos.push({ ...row('after'), photo_type: 'after' }, row('foreign', B));
  const h = harness({ tables: { work_photos: photos } });
  const result = await h.get({ photo_type: 'before', page: '2' });
  assert.equal(result.body.total_records, 30);
  assert.equal(result.body.photos.length, 6);
  assert.equal(result.body.has_more, false);
  assert.equal(h.signs.length, 6);
});

test('site photos include the site name; customer sources flatten all photos with per-record deduplication', async () => {
  const h = harness({ tables: {
    site_photos: [{ ...row('site-photo'), site_id: 'site-1', photo_type: 'request' }],
    sites: [{ id: 'site-1', company_id: A, site_name: '테스트 현장' }],
    estimate_usage: [{ id: 'estimate', company_id: A, photo_paths: ['estimate-usage/a.jpg', 'estimate-usage/a.jpg', 'estimate-usage/b.jpg'] }],
    customer_leads: [{ id: 'lead', company_id: A, customer_photo_paths: ['customer/lead.jpg'] }],
  } });
  assert.equal((await h.get({ source: 'site' })).body.photos[0].title, '테스트 현장');
  const estimates = await h.get({ source: 'estimate' });
  assert.equal(estimates.body.total_records, 1);
  assert.equal(estimates.body.photos.length, 2);
  assert.equal((await h.get({ source: 'lead' })).body.photos[0].url, 'signed:customer/lead.jpg');
});

test('legacy storage URLs work; unsafe paths and missing objects show errors without dropping valid photos', async () => {
  const h = harness({ tables: { work_photos: [
    { ...row('old'), storage_path: null, photo_url: 'https://example.supabase.co/storage/v1/object/sign/work-photos/history/old.jpg?token=expired' },
    { ...row('external'), storage_path: null, photo_url: 'https://other.example/history/external.jpg' },
    { ...row('unsafe'), storage_path: 'history/../private.jpg' }, row('missing'), row('valid'),
  ] } });
  const result = await h.get();
  assert.equal(result.body.photos.length, 5);
  assert.equal(result.body.photos[0].url, 'signed:history/old.jpg');
  assert.equal(result.body.photos[1].url, null);
  assert.equal(result.body.photos[2].url, null);
  assert.equal(result.body.photos[3].url, null);
  assert.equal(result.body.photos[4].url, 'signed:history/valid.jpg');
  assert.deepEqual(h.signs, ['history/old.jpg', 'history/missing.jpg', 'history/valid.jpg']);
});

test('storage outages fail visibly instead of returning an empty successful gallery', async () => {
  assert.equal((await harness({ storageFailure: true }).get()).status, 500);
});
