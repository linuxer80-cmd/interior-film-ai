import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateQuantityEstimate, quantityEstimateDetails, mergeDoorViews } from '../app/utils/doorEstimate.js';
import { buildEstimatePhotoGroups, assignEstimateSubject, normalizeAnalysisClassification } from '../app/utils/categoryUtils.js';
import { analyzeEstimatePhotos, validateEstimatePhotos } from '../lib/estimatePhotoAnalysis.js';

const door = (key, average, min = average, max = average) => ({ key, category: '문 및 문틀', subCategory: '방문 및 문틀',
  photos: [{ id: key }], estimate: { min, max, average } });
const twoDoors = () => [door('a', 190000), door('b', 195000, 190000, 200000)];
const analysis = (object_key, extra = {}) => normalizeAnalysisClassification({
  target_type: 'door', category: '문 및 문틀', sub_category: '방문 및 문틀', construction_scope: 'whole',
  view_completeness: 'full', classification_confidence: 'high', object_key, object_confidence: 'high',
  object_evidence: '문턱과 벽 타일 줄눈, 고정 설비의 위치 일치', door_count: 1, ...extra,
});
const photos = () => ['bath-a', 'bath-a', 'bath-b', 'bath-b', 'bath-b'].map((key, i) => ({ id: `p${i}`, analysis: analysis(key) }));

test('385000 for two sets defaults to two; total five costs 962500, not 1925000', () => {
  const initial = calculateQuantityEstimate(twoDoors());
  assert.equal(initial.door.detectedCount, 2);
  assert.equal(initial.door.quantity, 2);
  assert.equal(initial.door.unitEstimate.average, 192500);
  assert.equal(initial.total.average, 385000);
  const five = calculateQuantityEstimate(twoDoors(), 5);
  assert.equal(five.total.average, 962500);
  assert.equal(five.total.min, 950000);
  assert.equal(five.total.max, 975000);
  assert.equal(calculateQuantityEstimate(twoDoors(), 1).total.average, 192500);
  assert.equal(calculateQuantityEstimate(twoDoors(), 2).total.average, 385000);
});

test('quantity changes only standard doors; film pricing and lead subtotals agree', () => {
  const kitchen = { ...door('k', 700000), category: '주방 가구', subCategory: '싱크대 하부장' };
  const fire = { ...door('f', 250000), subCategory: '방화문' };
  const entrance = { ...door('e', 400000), subCategory: '현관문' };
  const pricing = calculateQuantityEstimate([...twoDoors(), kitchen, fire, entrance], 5, (value) => value * 1.1);
  assert.equal(pricing.door.detectedCount, 2);
  assert.equal(pricing.total.average, 1058750 + 770000 + 275000 + 440000);
  const details = quantityEstimateDetails(pricing);
  assert.equal(details.filter((row) => row.group_key === 'door-total').length, 1);
  assert.equal(details[0].quantity, 5);
  assert.equal(details[0].detected_quantity, 2);
  assert.equal(details[0].unit_average, 211750);
  assert.equal(details.reduce((sum, row) => sum + row.estimate_average, 0), pricing.total.average);
});

test('unknown prices or ambiguous subjects cannot be silently treated as all priced sets', () => {
  const missing = { ...door('b', 0), estimate: null };
  const pricing = calculateQuantityEstimate([door('a', 190000), missing], 5);
  assert.equal(pricing.door.canScale, false);
  assert.equal(pricing.door.unitEstimate, null);
  assert.equal(pricing.total.average, 190000);
  assert.equal(pricing.total.missingCount, 1);
  assert.equal(calculateQuantityEstimate([{ ...door('a', 190000), requiresConfirmation: true }], 5).total, null);
});

test('five angles of two different doors produce exactly two physical sets', () => {
  const groups = buildEstimatePhotoGroups(mergeDoorViews(photos()));
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map((g) => g.photoNumbers), [[1, 2], [3, 4, 5]]);
  assert.equal(groups.some((g) => g.requiresConfirmation), false);
  assert.equal(groups[0].subjectSource, 'ai');
});

test('verified partial alternate views use their complete view; unknown identity never adds guessed sets', () => {
  const items = photos();
  items[1].analysis = analysis('bath-a', { view_completeness: 'partial' });
  items[4].analysis = analysis('bath-b', { object_confidence: 'low' });
  const groups = buildEstimatePhotoGroups(mergeDoorViews(items));
  assert.equal(groups.length, 3);
  assert.equal(groups[0].requiresConfirmation, false);
  assert.equal(groups[2].subjectRequiresConfirmation, true);
  assert.equal(groups[2].requiresConfirmation, true);
  const multiple = buildEstimatePhotoGroups(mergeDoorViews([{ id: 'a', analysis: analysis('wide', { door_count: 2 }) }]));
  assert.equal(multiple[0].requiresConfirmation, true);
});

test('manual separation/merge overrides AI, and furniture cannot be merged into a door', () => {
  const items = photos();
  const separate = assignEstimateSubject(items, 'p1', 'p1');
  assert.equal(buildEstimatePhotoGroups(mergeDoorViews(separate)).length, 3);
  const together = assignEstimateSubject(items, 'p2', 'p0');
  const linked = mergeDoorViews(together);
  assert.equal(linked[0].subjectId, 'p0');
  assert.equal(linked[2].subjectId, 'p0');
  const automatic = assignEstimateSubject(separate, 'p1', 'auto');
  assert.equal(buildEstimatePhotoGroups(mergeDoorViews(automatic)).length, 2);
  const mixed = [{ id: 'door', analysis: analysis('same') }, { id: 'closet', analysis: { ...analysis('same'), target_type: 'closet', category: '붙박이장', sub_category: '붙박이장 문짝' } }];
  assert.equal(buildEstimatePhotoGroups(mergeDoorViews(mixed)).length, 2);
});

test('batch comparison rejects missing/duplicate/invented photo indices instead of using a partial count', () => {
  const rows = [0, 1].map((index) => ({ index, ...analysis(`door-${index}`) }));
  assert.equal(validateEstimatePhotos({ photos: rows }, 2).length, 2);
  assert.throws(() => validateEstimatePhotos({ photos: [rows[0]] }, 2));
  assert.throws(() => validateEstimatePhotos({ photos: [rows[0], rows[0]] }, 2));
  assert.throws(() => validateEstimatePhotos({ photos: [rows[0], { ...rows[1], index: 4 }] }, 2));
});

test('one bounded vision request sees all angles and does not receive prices', async () => {
  const files = [new Blob(['one'], { type: 'image/jpeg' }), new Blob(['two'], { type: 'image/jpeg' })];
  let requests = 0;
  const result = await analyzeEstimatePhotos(files, 'test', async (_, options) => {
    requests++;
    const body = JSON.parse(options.body);
    assert.equal(body.store, false);
    assert.equal(body.input[0].content.filter((part) => part.type === 'input_image').length, 2);
    assert.equal(body.text.format.type, 'json_schema');
    assert.ok(!JSON.stringify(body).includes('actual_cost'));
    return { ok: true, json: async () => ({ output_text: JSON.stringify({ photos: [0, 1].map((index) => ({ index, ...analysis('one-door') })) }) }) };
  });
  assert.equal(requests, 1);
  assert.equal(result.photos.length, 2);
});
