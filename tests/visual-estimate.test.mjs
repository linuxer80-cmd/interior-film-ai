import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAnalysisClassification, getGroupKey, selectEstimateCases } from '../app/utils/categoryUtils.js';
import { selectVisuallyVerifiedCases, calculateVisualEstimate } from '../app/utils/visualEstimate.js';
import { loadVisualCandidates, readVisualSearchRequest, registeredStoragePath, verifyVisualCandidates } from '../lib/visualCaseSearch.js';

const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const candidate = (n, extra = {}) => ({ work_item_id: id(n), category: '싱크대', sub_category: '하부장', actual_cost: 200000 + n * 100000, similarity: .99 - n * .01, pictures: [{ url: `https://example.supabase.co/signed/${n}`, type: 'before', path: `history/${n}.jpg` }], ...extra });
const match = (n, extra = {}) => ({ candidate_id: id(n), rank: n, target_match: 'same', scope_match: 'same', structure_match: 'close', scale_match: 'comparable', confidence: 'high', matching_features: ['하부장만 시공', '일자 배치와 같은 문 수'], differences: ['시공 전후 색상 차이'], reason: '하부장 시공 범위와 일자 배치·문 수가 유사합니다.', ...extra });
const result = (matches, extra = {}) => ({ query_usable: true, query_reason: '대상 전체 확인', matches, ...extra });
const lower = { category: '싱크대', sub_category: '하부장', construction_scope: 'kitchen_lower' };

test('textually closest full kitchen loses to a visually verified lower-only case', () => {
  const candidates = [candidate(1, { similarity: .99 }), candidate(2, { similarity: .71 })];
  const verified = selectVisuallyVerifiedCases(candidates, result([match(1, { scope_match: 'different', rank: 2 }), match(2, { rank: 1 })]));
  assert.deepEqual(verified.map(c => c.work_item_id), [id(2)]);
  const estimate = calculateVisualEstimate(verified);
  assert.equal(estimate.average, 400000);
  assert.equal(estimate.count, 1);
  assert.equal(estimate.min, estimate.max);
  assert.equal(estimate.confidence, '낮음');
});

test('all four compatibility dimensions and actual evidence must pass; high confidence alone cannot override a mismatch', () => {
  for (const patch of [{ target_match: 'different' }, { scope_match: 'uncertain' }, { structure_match: 'different' }, { scale_match: 'uncertain' }, { confidence: 'medium' }, { matching_features: [] }, { reason: '' }]) {
    assert.equal(selectVisuallyVerifiedCases([candidate(1)], result([match(1, patch)])).length, 0);
  }
  assert.equal(selectVisuallyVerifiedCases([candidate(1)], result([match(1)], { query_usable: false })).length, 0);
});

test('missing, duplicate, invented candidate IDs and invented ranks reject the entire comparison', () => {
  const candidates = [candidate(1), candidate(2)];
  for (const matches of [[match(1)], [match(1), match(1)], [match(1), match(3)], [match(1), match(2, { rank: 1 })], [match(1), match(2, { rank: 5 })]]) {
    assert.throws(() => selectVisuallyVerifiedCases(candidates, result(matches)));
  }
});

test('observed amounts use only unique verified jobs, never description scores or a fabricated ±10% band', () => {
  const rows = [candidate(1, { actual_cost: 200000, visual_verified: true }), candidate(2, { actual_cost: 400000, visual_verified: true }), candidate(1, { actual_cost: 200000, visual_verified: true }), candidate(3, { actual_cost: 9999999 })];
  assert.deepEqual(calculateVisualEstimate(rows), { min: 200000, max: 400000, average: 300000, count: 2, confidence: '낮음', range_basis: 'observed_cases', price_spread: 'wide' });
  assert.equal(calculateVisualEstimate([candidate(1)]), null);
  assert.equal(calculateVisualEstimate([candidate(1, { actual_cost: Infinity, visual_verified: true })]), null);
});

test('cabinet doors retain their actual furniture category; original refrigerator category keeps its scope', () => {
  assert.equal(getGroupKey({ category: '싱크대', sub_category: '하부장 도어' }), 'kitchen');
  const fridge = normalizeAnalysisClassification({ category: '냉장고장', sub_category: '측판', classification_confidence: 'high' });
  assert.equal(fridge.construction_scope, 'kitchen_fridge');
  assert.equal(fridge.requires_confirmation, false);
  assert.equal(normalizeAnalysisClassification({ category: '문 및 문틀', sub_category: '중문', target_type: 'door' }).target_type, 'middle_door');
  assert.equal(normalizeAnalysisClassification({ category: '방화문', sub_category: '중문' }).requires_confirmation, true);
  assert.equal(normalizeAnalysisClassification({ ...lower, classification_confidence: 'high', view_completeness: 'partial' }).requires_confirmation, false);
  assert.equal(selectEstimateCases([candidate(1, { actual_cost: Infinity })], lower).length, 0);
});

test('known kitchen scope reaches visual comparison despite cropping, without inventing a price or dimensions', () => {
  for (const construction_scope of ['kitchen_lower', 'kitchen_upper', 'kitchen_full']) {
    const analysis = normalizeAnalysisClassification({ category: '주방 가구', target_type: 'kitchen', construction_scope,
      view_completeness: 'partial', classification_confidence: 'medium', observable_structure: 'ㄱ자 배치, 끝부분 미확인' });
    assert.equal(analysis.requires_confirmation, false);
    assert.equal(analysis.construction_scope, construction_scope);
    assert.equal(analysis.view_completeness, 'partial');
    assert.equal(analysis.classification_confidence, 'medium');
    assert.equal(analysis.estimate, undefined);
    // The price comparison still rejects a photo whose missing area prevents a scale comparison.
    assert.equal(selectVisuallyVerifiedCases([candidate(1)], result([match(1, { scale_match: 'uncertain' })])).length, 0);
  }
});

test('identifiable open doors can reach comparison without assuming a price or changing their observed count', () => {
  for (const door_count of [0, 1, 2]) {
    const analysis = normalizeAnalysisClassification({ category: '문 및 문틀', sub_category: '방문', target_type: 'door',
      view_completeness: 'partial', classification_confidence: 'high', door_count,
      observable_structure: '문짝과 건축용 문틀이 보이는 열린 욕실 방문, 상단 가장자리 미확인' });
    assert.equal(analysis.target_type, 'door');
    assert.equal(analysis.requires_confirmation, false);
    assert.equal(analysis.view_completeness, 'partial');
    assert.equal(analysis.door_count, door_count);
    assert.equal(analysis.estimate, undefined);
  }
});

test('unidentified scopes, unreadable doors, low confidence and conflicting targets still require confirmation', () => {
  const base = { ...lower, target_type: 'kitchen', classification_confidence: 'high', view_completeness: 'partial' };
  for (const [analysis, reason] of [
    [{ ...base, view_completeness: 'unclear' }, 'unclear_view'],
    [{ ...base, classification_confidence: 'low' }, 'low_confidence'],
    [{ ...base, sub_category: '주방 가구', construction_scope: 'unknown' }, 'unknown_scope'],
    [{ ...base, sub_category: '상부장과 하부장' }, 'conflicting_scope'],
    [{ category: '문 및 문틀', target_type: 'door', view_completeness: 'unclear', classification_confidence: 'high' }, 'unclear_view'],
    [{ category: '문 및 문틀', target_type: 'door', view_completeness: 'partial', classification_confidence: 'low' }, 'low_confidence'],
    [{ category: '문 및 문틀', sub_category: '붙박이장', target_type: 'door', view_completeness: 'partial', classification_confidence: 'high' }, 'conflicting_targets'],
    [{ category: '냉장고장', view_completeness: 'partial', classification_confidence: 'high' }, 'incomplete_view'],
  ]) {
    const normalized = normalizeAnalysisClassification(analysis);
    assert.equal(normalized.requires_confirmation, true);
    assert.equal(normalized.confirmation_reason, reason);
  }
});

function database() {
  const calls = [], signed = [];
  const tables = {
    work_items: Array.from({ length: 7 }, (_, n) => ({ id: id(n + 1), company_id: n === 6 ? 'other-company' : 'mine', category: '싱크대', sub_category: n === 5 ? '상부장과 하부장' : '하부장', actual_cost: 200000 + n * 100000 })),
    work_photos: Array.from({ length: 7 }, (_, n) => ({ work_item_id: id(n + 1), company_id: n === 6 ? 'other-company' : 'mine', photo_type: n === 4 ? 'history' : 'before', storage_path: `history/${n + 1}.jpg` })),
  };
  tables.work_photos.push({ work_item_id: id(1), company_id: 'other-company', photo_type: 'after', storage_path: 'history/foreign.jpg' });
  const supabase = {
    from(table) {
      let rows = tables[table]; const filters = [];
      const q = {
        select() { return q; }, eq(key, value) { filters.push([key, value]); rows = rows.filter(r => r[key] === value); return q; },
        in(key, values) { rows = rows.filter(r => values.includes(r[key])); return q; },
        order() { return q; }, limit(n) { rows = rows.slice(0, n); return q; },
        then(done, fail) { calls.push({ table, filters }); return Promise.resolve({ data: rows, error: null }).then(done, fail); },
      }; return q;
    },
    storage: { from: () => ({ createSignedUrl: async path => { signed.push(path); return { data: { signedUrl: `https://example.supabase.co/signed/${path}` } }; } }) },
  };
  return { supabase, tables, calls, signed };
}

test('candidate photos, prices and scope come from company-owned records; foreign and full-scope jobs stay excluded', async () => {
  const db = database();
  const raw = Array.from({ length: 7 }, (_, n) => candidate(n + 1, { actual_cost: 1, before_path: 'https://evil.example/x', construction_scope: 'kitchen_lower' }));
  const rows = await loadVisualCandidates(db.supabase, 'mine', raw, lower, 'https://example.supabase.co');
  assert.equal(rows.length, 5);
  assert.equal(rows[0].actual_cost, 200000);
  assert.ok(rows.every(r => r.work_item_id !== id(6) && r.work_item_id !== id(7)));
  assert.ok(db.calls.every(c => c.filters.some(([key, value]) => key === 'company_id' && value === 'mine')));
  assert.ok(db.signed.every(path => !path.includes('foreign') && !path.includes('evil')));
  assert.equal(rows[0].before_path, 'history/1.jpg');
  assert.equal(db.calls.filter(c => c.table === 'work_photos').length, 1);
});

test('history-only photo stays a reference photo instead of being mislabeled as after', async () => {
  const db = database();
  const rows = await loadVisualCandidates(db.supabase, 'mine', [candidate(5)], lower, 'https://example.supabase.co');
  assert.equal(rows[0].reference_path, 'history/5.jpg');
  assert.equal(rows[0].after_path, null);
  assert.equal(rows[0].before_path, null);
});

test('arbitrary external URLs and traversal can never become signed comparison inputs', () => {
  const origin = 'https://example.supabase.co';
  assert.equal(registeredStoragePath(`${origin}/storage/v1/object/sign/work-photos/history/a.jpg?token=expired`, origin), 'history/a.jpg');
  for (const value of ['https://evil.example/x', 'history/../private.jpg', 'history\\private.jpg', 'history/a.jpg?token=x']) assert.equal(registeredStoragePath(value, origin), '');
});

test('visual request contains actual customer/candidate images, excludes prices/text scores, and uses one bounded vision call', async () => {
  let called = 0;
  const verified = await verifyVisualCandidates({ images: ['data:image/jpeg;base64,YQ=='], candidates: [candidate(1)], analysis: lower, apiKey: 'test', fetchImpl: async (url, options) => {
    called++; assert.equal(url, 'https://api.openai.com/v1/responses');
    const request = JSON.parse(options.body), content = request.input[0].content;
    assert.equal(content.filter(c => c.type === 'input_image').length, 2);
    assert.ok(content.filter(c => c.type === 'input_image').every(c => ['high', 'auto'].includes(c.detail)));
    assert.equal(request.text.format.strict, true);
    assert.equal(request.store, false);
    assert.ok(!JSON.stringify(content).includes('actual_cost'));
    assert.ok(!JSON.stringify(content).includes('similarity'));
    return { ok: true, json: async () => ({ status: 'completed', output_text: JSON.stringify(result([match(1)])), usage: { input_tokens: 12 } }) };
  } });
  assert.equal(called, 1);
  assert.equal(verified.status, 'verified');
  assert.equal(verified.rows.length, 1);
  assert.equal(verified.usage.input_tokens, 12);
});

test('vision failure or truncated JSON cannot silently fall back to text matching', async () => {
  for (const data of [{ status: 'incomplete' }, { output_text: '{' }, { output_text: JSON.stringify(result([])) }]) {
    await assert.rejects(verifyVisualCandidates({ images: ['image'], candidates: [candidate(1)], analysis: lower, apiKey: 'test', fetchImpl: async () => ({ ok: true, json: async () => data }) }));
  }
});

test('multipart parsing bounds photo count/bytes, and legacy text-only requests have no visual input', async () => {
  const form = new FormData(); form.append('metadata', JSON.stringify({ company_slug: 'test' }));
  form.append('images', new File(['jpeg'], 'a.jpg', { type: 'image/jpeg' }));
  const request = () => ({ headers: new Headers({ 'content-type': 'multipart/form-data' }), formData: async () => form });
  const parsed = await readVisualSearchRequest(request());
  assert.equal(parsed.body.company_slug, 'test'); assert.equal(parsed.images.length, 1);
  for (let i = 0; i < 2; i++) form.append('images', new File(['jpeg'], 'a.jpg', { type: 'image/jpeg' }));
  await assert.rejects(readVisualSearchRequest(request()));
  assert.deepEqual((await readVisualSearchRequest({ headers: new Headers(), json: async () => ({ text: 'kitchen' }) })).images, []);
});


test('legacy generic kitchen labels reach photo verification without weakening final scope checks', async () => {
  const db = database();
  db.tables.work_items[0].sub_category = '싱크대';
  const candidates = await loadVisualCandidates(db.supabase, 'mine', [candidate(1)], lower, 'https://example.supabase.co');
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].visual_verified, undefined);
  assert.equal(calculateVisualEstimate(candidates), null);
  assert.equal(selectVisuallyVerifiedCases(candidates, result([match(1, {scope_match:'uncertain'})])).length, 0);
  assert.equal(selectVisuallyVerifiedCases(candidates, result([match(1)])).length, 1);
});

test('a fifth candidate is compared, while duplicate records do not consume candidate slots', async () => {
  const db = database();
  const candidates = await loadVisualCandidates(db.supabase, 'mine', [candidate(1), candidate(1), ...[2,3,4,5].map(n=>candidate(n))], lower, 'https://example.supabase.co');
  assert.equal(candidates.length, 5);
  assert.ok(candidates.some(c=>c.work_item_id===id(5)));
});

test('temporary provider failure retries once within the same deadline', async () => {
  let calls = 0, firstSignal;
  const verified = await verifyVisualCandidates({ images: ['image'], candidates: [candidate(1)], analysis: lower, apiKey: 'test', fetchImpl: async (_, options) => {
    calls++;
    if (calls === 1) { firstSignal = options.signal; return { ok: false, status: 503, json: async () => ({ error: { code: 'server_error' } }) }; }
    assert.equal(options.signal, firstSignal);
    return { ok: true, json: async () => ({ status: 'completed', output_text: JSON.stringify(result([match(1)])) }) };
  } });
  assert.equal(calls, 2);
  assert.equal(verified.status, 'verified');
});

test('quota and image errors preserve diagnostic codes without retries or provider text', async () => {
  for (const [status, code, expected] of [[429, 'insufficient_quota', 'visual_limited'], [400, 'invalid_image_url', 'visual_image_error']]) {
    let calls = 0;
    await assert.rejects(verifyVisualCandidates({ images: ['image'], candidates: [candidate(1)], analysis: lower, apiKey: 'test', fetchImpl: async () => {
      calls++;
      return { ok: false, status, json: async () => ({ error: { code, message: 'private signed URL' } }) };
    } }), error => error.visualStatus === expected && error.visualDiagnostic.code === code && !JSON.stringify(error).includes('private signed URL'));
    assert.equal(calls, 1);
  }
});

test('staged comparison stops after top three when verified, expands only for no match', async () => {
  for (const expand of [false, true]) {
    const batches = [], signals = [];
    const actual = await verifyVisualCandidates({ images: ['image'], candidates: [1,2,3,4,5,6,7,8].map(n => candidate(n)), analysis: lower, apiKey: 'test', fetchImpl: async (_, options) => {
      const content = JSON.parse(options.body).input[0].content;
      const ids = content.filter(c => c.type === 'input_text' && c.text.startsWith('{')).map(c => JSON.parse(c.text).candidate_id);
      batches.push(ids); signals.push(options.signal);
      const matches = ids.map((value, i) => match(Number(value.slice(-12)), { rank: i + 1, scope_match: expand && batches.length === 1 ? 'different' : 'same' }));
      return { ok: true, json: async () => ({ output_text: JSON.stringify(result(matches)), usage: { input_tokens: 10, output_tokens: 2, input_tokens_details: { cached_tokens: 3 } } }) };
    } });
    assert.deepEqual(batches[0], [1,2,3].map(id));
    assert.equal(batches.length, expand ? 2 : 1);
    if (expand) { assert.deepEqual(batches[1], [4,5,6,7,8].map(id)); assert.equal(signals[0], signals[1]); }
    assert.equal(actual.status, 'verified');
    assert.equal(actual.usage.input_tokens, expand ? 20 : 10);
    assert.equal(actual.usage.input_tokens_details.cached_tokens, expand ? 6 : 3);
  }
});
