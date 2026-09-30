import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as categories from '../app/utils/categoryUtils.js';
import * as visual from '../app/utils/visualEstimate.js';
import * as search from '../lib/visualCaseSearch.js';

const WORK = '00000000-0000-0000-0000-000000000001';
function harness(options = {}) {
  const calls = [], logs = [];
  const tables = {
    companies: [{ id: 'mine', slug: 'test', subscription_plan: 'basic', is_active: true }],
    work_items: [{ id: WORK, company_id: 'mine', category: '싱크대', sub_category: '하부장', actual_cost: 400000 }],
    work_photos: [{ work_item_id: WORK, company_id: 'mine', photo_type: 'before', storage_path: 'history/photo.jpg' }],
  };
  const client = {
    from(table) {
      let rows = tables[table] || [];
      const q = {
        select() { return q; }, eq(key, value) { rows = rows.filter(r => r[key] === value); return q; },
        in(key, values) { rows = rows.filter(r => values.includes(r[key])); return q; },
        order() { return q; }, limit(n) { rows = rows.slice(0, n); return q; },
        insert(value) { logs.push(value); rows = [{ id: 'usage' }]; return q; },
        single: async () => ({ data: rows[0], error: null }), maybeSingle: async () => ({ data: rows[0], error: null }),
        then(done, fail) { return Promise.resolve({ data: rows, error: null }).then(done, fail); },
      }; return q;
    },
    rpc: async () => ({ data: [{ work_item_id: WORK, category: '싱크대', sub_category: '하부장', actual_cost: 1, similarity: .99 }] }),
    storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: 'https://example.supabase.co/signed' } }) }) },
  };
  const fetchImpl = async (url, request) => {
    calls.push(url);
    if (url.endsWith('/embeddings')) return { ok: true, json: async () => ({ data: [{ embedding: [1, 2, 3] }] }) };
    if (options.visionFails) return { ok: false, json: async () => ({ error: { message: 'temporary' } }) };
    const content = JSON.parse(request.body).input[0].content;
    assert.equal(content.filter(c => c.type === 'input_image').length, 2);
    return { ok: true, json: async () => ({ output_text: JSON.stringify({ query_usable: true, query_reason: '대상 확인', matches: [{ candidate_id: WORK, rank: 1, target_match: 'same', scope_match: options.wrongScope ? 'different' : 'same', structure_match: 'close', scale_match: 'comparable', confidence: 'high', matching_features: ['일자 배치', '하부장 동일 문 수'], differences: [], reason: '하부장 범위와 문 구성이 비슷합니다.' }] }), usage: { input_tokens: 123 } }) };
  };
  const source = fs.readFileSync(new URL('../app/api/similar-estimate/route.js', import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?from\s+["'][^"']+["'];\s*/gm, '').replaceAll('export ', '');
  const context = {
    ...categories, ...visual, ...search, AbortSignal, console: { error() {}, warn() {} },
    verifyVisualCandidates: (args) => search.verifyVisualCandidates({ ...args, fetchImpl }),
    createClient: () => client, fetch: fetchImpl,
    process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test', OPENAI_API_KEY: 'test' } },
    checkUsageLimit: async () => options.limitReached ? { ok: false, status: 429 } : { ok: true, used: 0, limit: 20 },
    makeUsageLimitError: () => ({ success: false, error: 'limit' }),
    NextResponse: { json: (body, opts) => ({ body, status: opts?.status || 200 }) },
  };
  vm.createContext(context); vm.runInContext(`${source}\nglobalThis.post = POST;`, context);
  const metadata = { company_slug: 'test', category: '싱크대', sub_category: '하부장', construction_scope: 'kitchen_lower', text: '일자 하부장 3짝' };
  async function post(textOnly = false) {
    if (textOnly) return context.post(new Request('https://example.test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(metadata) }));
    const form = new FormData(); form.append('metadata', JSON.stringify(metadata)); form.append('images', new File(['jpeg'], 'a.jpg', { type: 'image/jpeg' }));
    return context.post(new Request('https://example.test', { method: 'POST', body: form }));
  }
  return { calls, logs, post };
}

test('complete endpoint prices only visually verified company-owned work and records vision usage', async () => {
  const h = harness(), response = await h.post();
  assert.equal(response.status, 200);
  assert.equal(response.body.search_status, 'verified');
  assert.equal(response.body.estimate.average, 400000);
  assert.equal(response.body.similar_cases[0].visual_verified, true);
  assert.equal(response.body.similar_cases[0].actual_cost, 400000);
  assert.equal(h.calls.length, 2);
  assert.equal(h.logs[0].metadata.visual_usage.input_tokens, 123);
  assert.equal(h.logs[0].metadata.matched_cases[0].work_item_id, WORK);
  assert.equal(h.logs[0].metadata.matched_cases[0].actual_cost, 400000);
  assert.equal(h.logs[0].metadata.estimate.average, 400000);
});

test('vision failure and scope mismatch return no estimate even with .99 text similarity', async () => {
  for (const options of [{ visionFails: true }, { wrongScope: true }]) {
    const h = harness(options), response = await h.post();
    assert.equal(response.status, 200);
    assert.equal(response.body.estimate, null);
    assert.equal(response.body.similar_cases.length, 0);
    assert.ok(['visual_unavailable', 'no_verified_match'].includes(response.body.search_status));
  }
});

test('legacy requests never receive an image match without photos; quota blocks both billed calls', async () => {
  const legacy = harness(), response = await legacy.post(true);
  assert.equal(response.body.search_status, 'images_required');
  assert.equal(response.body.estimate, null);
  assert.equal(legacy.calls.length, 0);
  const limited = harness({ limitReached: true });
  assert.equal((await limited.post()).status, 429);
  assert.equal(limited.calls.length, 0);
});
