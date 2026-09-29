import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as categories from '../app/utils/categoryUtils.js';

const { normalizeAnalysisClassification: normalize, getConstructionScope: scope, getEstimateGroupKey: groupKey, selectEstimateCases } = categories;
const kitchen = (sub_category) => ({ category: '주방 가구', sub_category });

test('negative statements and background tags cannot replace the target', () => {
  const door = normalize({ category: '문 및 문틀', sub_category: '방문', classification_confidence: 'high', classification_evidence: '붙박이장이 아닌 출입용 방문', tags: ['배경 붙박이장'], description: '뒤쪽 주방이 보임' });
  assert.equal(door.target_type, 'door');
  assert.equal(door.requires_confirmation, false);
  const wardrobe = normalize({ category: '붙박이장', sub_category: '붙박이장 도어', classification_confidence: 'high', description: '옆 방문과 문틀이 보임' });
  assert.equal(wardrobe.target_type, 'closet');
});

test('conflicting targets require confirmation instead of silent relabeling', () => {
  const result = normalize({ category: '문 및 문틀', sub_category: '붙박이장', classification_confidence: 'high' });
  assert.equal(result.target_type, 'other');
  assert.equal(result.requires_confirmation, true);
});

test('kitchen scopes remain separate and unknown scope is not assumed whole', () => {
  const labels = ['싱크대 하부장', '싱크대 상부장', '싱크대 상부장과 하부장', '냉장고장'];
  assert.deepEqual(labels.map((label) => scope(kitchen(label))), ['kitchen_lower', 'kitchen_upper', 'kitchen_full', 'kitchen_fridge']);
  assert.equal(new Set(labels.map((label) => groupKey(kitchen(label)))).size, 4);
  assert.equal(scope(kitchen('싱크대')), 'unknown');
  assert.equal(normalize({ ...kitchen('싱크대'), classification_confidence: 'high' }).requires_confirmation, true);
  assert.equal(normalize({ ...kitchen('싱크대 상부장과 하부장'), construction_scope: 'kitchen_lower' }).requires_confirmation, true);
});

test('lower cabinet estimate excludes whole kitchen and unknown legacy scope', () => {
  const rows = [
    { ...kitchen('싱크대 상부장과 하부장'), actual_cost: 900000, similarity: .97 },
    { ...kitchen('싱크대'), actual_cost: 800000, similarity: .95 },
    { ...kitchen('싱크대 하부장'), actual_cost: 400000, similarity: .86 },
    { category: '문 및 문틀', sub_category: '방문', actual_cost: 200000, similarity: .99 },
  ];
  const selected = selectEstimateCases(rows, kitchen('싱크대 하부장'));
  assert.equal(selected.length, 1);
  assert.equal(selected[0].actual_cost, 400000);
});

test('duplicate photos of a job do not consume candidate slots; equal prices do not collapse distinct jobs', () => {
  const base = { ...kitchen('싱크대 하부장'), actual_cost: 100000, similarity: .9 };
  const rows = Array.from({ length: 12 }, () => ({ ...base, work_item_id: 'a' }));
  rows.push({ ...base, work_item_id: 'b' }, { ...base }, { ...base });
  assert.equal(selectEstimateCases(rows, kitchen('싱크대 하부장'), 3).length, 3);
});

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
const ok = (body) => ({ ok: true, text: async () => JSON.stringify(body) });
const flush = () => new Promise(setImmediate);

// Exercise the real hook with React's state/ref contracts and deferred network requests.
// No AI request, real upload, billing event or customer data is created.
function harness() {
  const state = [];
  let cursor = 0;
  let id = 0;
  const uploads = [];
  const thumbnails = [];
  const calls = [];
  const source = fs.readFileSync(new URL('../app/hooks/useEstimate.js', import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?from\s+["'][^"']+["'];\s*/gm, '')
    .replace('export default function useEstimate', 'function useEstimate');
  const context = {
    ...categories, console: { error() {}, warn() {} }, FormData,
    makeId: () => `id-${++id}`,
    prepareImage: async (file) => ({ file, preview: 'blob:test' }), revokePreviewUrl() {},
    useState(initial) { const i = cursor++; if (!(i in state)) state[i] = typeof initial === 'function' ? initial() : initial; return [state[i], (value) => { state[i] = typeof value === 'function' ? value(state[i]) : value; }]; },
    useRef(initial) { const i = cursor++; if (!(i in state)) state[i] = { current: initial }; return state[i]; },
    fetch: async (url, options) => {
      calls.push(url);
      if (url === '/api/usage-limit') return ok({ success: true, allowed: true });
      if (url === '/api/analyze') {
        assert.equal(options.body.get('purpose'), 'estimate');
        return ok({ analysis: normalize({ ...kitchen('싱크대 하부장'), classification_confidence: 'high' }) });
      }
      if (url === '/api/similar-estimate') {
        assert.equal(JSON.parse(options.body.get('metadata')).construction_scope, 'kitchen_lower');
        assert.ok(options.body.getAll('images').length >= 1);
        assert.ok(options.body.getAll('images').length <= 2);
        return ok({ success: true, search_status: 'verified', estimate: { min: 100000, max: 100000, average: 100000, range_basis: 'observed_cases' }, similar_cases: [{ actual_cost: 100000, visual_verified: true, visual_rank: 1, work_item_id: '00000000-0000-0000-0000-000000000001', before_path: null, after_path: null }] });
      }
      if (url === '/api/similar-photo') { const body = JSON.parse(options.body); assert.equal(body.work_item_id, '00000000-0000-0000-0000-000000000001'); assert.ok(['before', 'after'].includes(body.photo_type)); const task = deferred(); thumbnails.push(task); return task.promise; }
      if (url === '/api/estimate-photo') { const task = deferred(); uploads.push(task); return task.promise; }
      if (url === '/api/estimate-usage') return ok({ success: true, usage_id: 'usage' });
      throw Error(`Unexpected URL ${url}`);
    },
  };
  vm.createContext(context);
  vm.runInContext(`${source}\nglobalThis.createHook=useEstimate;`, context);
  return { uploads, thumbnails, calls, render() { cursor = 0; return context.createHook({ companySlug: 'test-company' }); } };
}

test('estimate becomes ready before slow storage/thumbnails; consultation shares uploads', async () => {
  const h = harness();
  await h.render().addImages([new Blob(['photo'])]);
  const work = h.render().handleAnalyze();
  await flush();
  assert.equal(h.render().resultReady, true, JSON.stringify({message:h.render().message,calls:h.calls}));
  assert.equal(h.render().loading, true);
  assert.equal(h.render().totalEstimate.average, 100000);
  assert.equal(h.uploads.length, 1);
  const consultation = h.render().ensureEstimatePhotos();
  await flush();
  assert.equal(h.uploads.length, 1);
  h.uploads[0].resolve(ok({ success: true, path: 'customer/one.jpg' }));
  await work;
  assert.equal((await consultation)[0], 'customer/one.jpg');
  assert.equal(h.render().loading, false);
  assert.equal(h.thumbnails.length, 2);
  h.thumbnails.forEach((task) => task.resolve(ok({ success: true, signed_url: 'https://example.com/photo' })));
  await flush();
});

test('partial upload failure preserves estimate and retries only the missing image', async () => {
  const h = harness();
  await h.render().addImages([new Blob(['one']), new Blob(['two'])]);
  const work = h.render().handleAnalyze();
  await flush();
  assert.equal(h.render().resultReady, true, JSON.stringify({message:h.render().message,calls:h.calls}));
  h.uploads[0].resolve(ok({ success: true, path: 'customer/one.jpg' }));
  h.uploads[1].resolve({ ok: false, text: async () => JSON.stringify({ error: 'temporary failure' }) });
  await work;
  assert.equal(h.render().resultReady, true, JSON.stringify({message:h.render().message,calls:h.calls}));
  assert.match(h.render().storageStatus, /1\/2/);
  const retry = h.render().ensureEstimatePhotos();
  await flush();
  assert.equal(h.uploads.length, 3);
  h.uploads[2].resolve(ok({ success: true, path: 'customer/two.jpg' }));
  const paths = await retry;
  assert.equal(paths.length, 2);
  assert.equal(h.render().storageStatus, '사진 저장 완료');
  h.thumbnails.forEach((task) => task.resolve(ok({ success: true, signed_url: 'https://example.com/photo' })));
  await flush();
});


test('same category photos remain distinct unless the customer explicitly groups the same object', () => {
  const analysis = { category: '붙박이장', sub_category: '붙박이장 문짝', target_type: 'closet' };
  const photos = ['a', 'b', 'c'].map((id) => ({ id, analysis }));
  assert.equal(categories.buildEstimatePhotoGroups(photos).length, 3);
  const linked = categories.assignEstimateSubject(photos, 'b', 'a');
  const groups = categories.buildEstimatePhotoGroups(linked);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].photoNumbers, [1, 2]);
  assert.equal(categories.buildEstimatePhotoGroups(categories.assignEstimateSubject(linked, 'b', '')).length, 3);
  assert.equal(categories.buildEstimatePhotoGroups([{ ...photos[0], subjectId: 'deleted' }, photos[1]]).length, 2);
});

test('explicit photo selection corrects refrigerator/shoe categories and never joins incompatible scopes', () => {
  const original = normalize({ category: '붙박이장', classification_confidence: 'high' });
  const fridge = categories.applyEstimateTarget(original, 'kitchen_fridge');
  const shoe = categories.applyEstimateTarget(original, 'shoe');
  assert.equal(fridge.target_type, 'kitchen');
  assert.equal(fridge.construction_scope, 'kitchen_fridge');
  assert.equal(shoe.target_type, 'shoe');
  assert.equal(categories.buildEstimatePhotoGroups([
    { id: 'a', analysis: fridge }, { id: 'b', subjectId: 'a', analysis: shoe },
  ]).length, 2);
});

test('two separate targets produce two estimates; explicitly grouped views count once', async () => {
  for (const linked of [false, true]) {
    const h = harness();
    await h.render().addImages([new Blob(['one']), new Blob(['two'])]);
    if (linked) {
      const photos = h.render().images;
      h.render().updatePhotoOptions(photos[1].id, { subjectId: photos[0].id });
    }
    const work = h.render().handleAnalyze();
    await flush();
    assert.equal(h.render().groups.length, linked ? 1 : 2);
    assert.equal(h.render().totalEstimate.average, linked ? 100000 : 200000);
    h.uploads.forEach((task, i) => task.resolve(ok({ success: true, path: `customer/${i}.jpg` })));
    h.thumbnails.forEach((task) => task.resolve(ok({ success: true, signed_url: 'https://example.com/photo' })));
    await work;
  }
});

test('photos load independently with missing RPC paths and failed sides can be retried', async () => {
  const h = harness();
  await h.render().addImages([new Blob(['one'])]);
  const work = h.render().handleAnalyze();
  await flush();
  assert.equal(h.render().groups[0].similarItems[0].beforeStatus, 'loading');
  h.thumbnails[0].resolve(ok({ success: true, signed_url: 'https://example.com/before' }));
  await flush();
  assert.equal(h.render().groups[0].similarItems[0].beforeUrl, 'https://example.com/before');
  assert.equal(h.render().groups[0].similarItems[0].afterStatus, 'loading');
  h.thumbnails[1].resolve({ ok: false, text: async () => JSON.stringify({ error: 'temporary' }) });
  await flush();
  assert.equal(h.render().groups[0].similarItems[0].afterStatus, 'error');
  h.render().retrySimilarPhoto(h.render().groups[0].key, 0, 'after');
  await flush();
  assert.equal(h.thumbnails.length, 3);
  h.thumbnails[2].resolve(ok({ success: true, signed_url: 'https://example.com/after' }));
  await flush();
  assert.equal(h.render().groups[0].similarItems[0].afterUrl, 'https://example.com/after');
  h.uploads[0].resolve(ok({ success: true, path: 'customer/one.jpg' }));
  await work;
});

test('late photo responses cannot restore an old estimate after reset', async () => {
  const h = harness();
  await h.render().addImages([new Blob(['one'])]);
  const work = h.render().handleAnalyze();
  await flush();
  h.uploads[0].resolve(ok({ success: true, path: 'customer/one.jpg' }));
  await work;
  h.render().resetEstimateResults();
  h.thumbnails.forEach((task) => task.resolve(ok({ success: true, signed_url: 'https://example.com/old' })));
  await flush();
  assert.equal(h.render().groups.length, 0);
});
