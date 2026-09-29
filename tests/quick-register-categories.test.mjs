import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { QUICK_REGISTER_CATEGORIES, resolveQuickRegisterCategory } from '../app/utils/quickRegisterCategories.js';
import { getConstructionScope, getEstimateGroupKey } from '../app/utils/categoryUtils.js';
import { FILM_TARGET_RULES } from '../app/utils/visionRules.js';

function endpoint(photos) {
  const source = fs.readFileSync(new URL('../app/api/quick-register/analyze/route.js', import.meta.url), 'utf8')
    .replace(/^import[^\n]*\n/gm, '').replaceAll('export ', '');
  const context = {
    QUICK_REGISTER_CATEGORIES, resolveQuickRegisterCategory, FILM_TARGET_RULES, Buffer, JSON,
    process: { env: {} },
    NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200 }) },
    createClient: () => ({
      auth: { getUser: async () => ({ data: { user: { id: 'admin' } } }) },
      rpc: async () => ({ data: [{ company_id: 'company', is_active: true }] }),
    }),
    fetch: async () => ({ ok: true, json: async () => ({ output_text: JSON.stringify({ photos }) }) }),
  };
  vm.createContext(context);
  vm.runInContext(`${source}\nglobalThis.post=POST;`, context);
  return context.post({
    headers: new Headers({ authorization: 'Bearer test-token' }),
    formData: async () => ({
      getAll: () => photos.map(() => ({ type: 'image/jpeg', size: 10, arrayBuffer: async () => new ArrayBuffer(10) })),
      get: () => JSON.stringify(photos.map(() => ({}))),
    }),
  });
}

test('refrigerator cabinets survive the API response and the bulk editor category validation', async () => {
  const result = await endpoint([
    { index: 0, site_key: '1', category: '냉장고장', sub_category: '측판', photo_type: 'after', confidence: 'high' },
    { index: 1, site_key: '1', category: '냉장고장', sub_category: '상단 수납부', photo_type: 'before', confidence: 'high' },
    { index: 2, site_key: '2', category: '붙박이장', sub_category: '도어', photo_type: 'after', confidence: 'high' },
  ]);
  assert.equal(result.status, 200);
  assert.deepEqual(Array.from(result.body.photos, (photo) => resolveQuickRegisterCategory(photo.category)), ['냉장고장', '냉장고장', '붙박이장']);
  assert.equal(result.body.photos[1].photo_type, 'before');
});

test('bulk refrigerator cabinet data remains in the refrigerator estimate scope', () => {
  for (const sub_category of ['전체', '측판', '상단 수납부', '도어']) {
    const fridge = { category: resolveQuickRegisterCategory('냉장고장'), sub_category };
    assert.equal(getConstructionScope(fridge), 'kitchen_fridge');
    assert.notEqual(getEstimateGroupKey(fridge), getEstimateGroupKey({ category: '붙박이장', sub_category: '도어' }));
  }
});

test('unrecognized or malformed categories stay reviewable without becoming wardrobe data', () => {
  assert.equal(resolveQuickRegisterCategory(' 냉장고장 '), '냉장고장');
  for (const value of [null, undefined, {}, '미확인 가구']) assert.equal(resolveQuickRegisterCategory(value), '기타');
});
