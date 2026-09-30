import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function harness({ limited = false } = {}) {
  const logs = [], calls = [];
  const client = { from(table) {
    let rows = table === 'companies' ? [{ id: 'mine', slug: 'mine', is_active: true }] : [];
    const query = {
      select() { return query; }, eq(key, value) { rows = rows.filter((row) => row[key] === value); return query; },
      insert(row) { logs.push(row); rows = [{ id: 'analysis-id' }]; return query; },
      maybeSingle: async () => ({ data: rows[0] || null }), single: async () => ({ data: rows[0] || null }),
    }; return query;
  } };
  const code = fs.readFileSync(new URL('../app/api/estimate-analyze/route.js', import.meta.url), 'utf8')
    .replace(/^import[^\n]+\n/gm, '').replaceAll('export ', '');
  const context = {
    console: { error() {}, warn() {} }, process: { env: { OPENAI_API_KEY: 'test' } },
    NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) },
    getUsageAdminSupabase: () => client, ESTIMATE_ANALYSIS_MODEL: 'test-model',
    checkUsageLimit: async (args) => { calls.push(['limit', args]); return { ok: !limited, status: 429 }; },
    makeUsageLimitError: () => ({ error: 'limit' }),
    analyzeEstimatePhotos: async (files) => { calls.push(['vision', files.length]); return { usage: {}, photos: files.map((_, index) => ({ index, analysis: { target_type: 'door', object_key: 'a', object_confidence: 'high', object_evidence: 'same frame' } })) }; },
  };
  vm.createContext(context); vm.runInContext(`${code}\nglobalThis.post=POST;`, context);
  const post = async ({ slug = 'mine', count = 5, type = 'image/jpeg', size = 4 } = {}) => {
    const form = new FormData(); form.append('company_slug', slug);
    for (let i = 0; i < count; i++) form.append('images', new File([new Uint8Array(size)], 'a.jpg', { type }));
    return context.post(new Request('https://example.test', { method: 'POST', body: form }));
  };
  return { post, calls, logs };
}

test('batch analysis checks the owning active company and records photo count once', async () => {
  const h = harness(), result = await h.post();
  assert.equal(result.status, 200);
  assert.equal(result.body.photos.length, 5);
  assert.equal(result.body.analysis_id, 'analysis-id');
  assert.equal(h.calls[0][1].requestedQuantity, 5);
  assert.equal(h.calls.filter(([name]) => name === 'vision').length, 1);
  assert.equal(h.logs[0].company_id, 'mine');
  assert.equal(h.logs[0].quantity, 5);
});

test('missing company, over-quota, invalid type/count/size cannot reach the model', async () => {
  for (const input of [{ slug: 'other' }, { count: 11 }, { type: 'text/plain' }, { count: 2, size: 2_000_001 }]) {
    const h = harness();
    assert.ok((await h.post(input)).status >= 400);
    assert.equal(h.calls.filter(([name]) => name === 'vision').length, 0);
  }
  const limited = harness({ limited: true });
  assert.equal((await limited.post()).status, 429);
  assert.equal(limited.calls.filter(([name]) => name === 'vision').length, 0);
});
