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
    return { ok: true, json: async () => ({ output_text: JSON.stringify({ photos: Object.fromEntries([0, 1].map((index) => [`photo_${index}`, { index, ...analysis('one-door') }])) }) }) };
  });
  assert.equal(requests, 1);
  assert.equal(result.photos.length, 2);
});

test('analysis distinguishes timeout, upstream quota, invalid image and malformed results without exposing provider messages', async () => {
  const files=[new File(['x'],'a.jpg',{type:'image/jpeg'})];
  for(const [status,body,code] of [
    [401,{error:{message:'secret',code:'invalid_api_key'}},'configuration'],
    [429,{error:{code:'insufficient_quota'}},'configuration'],
    [429,{error:{code:'rate_limit_exceeded'}},'busy'],
    [400,{error:{code:'invalid_image'}},'image'],
    [200,{output_text:'not-json'},'result'],
    [200,{status:'incomplete'},'result'],
  ]) {
    await assert.rejects(analyzeEstimatePhotos(files,'test',async()=>({ok:status===200,status,json:async()=>body})),e=>e.analysisCode===code&&!e.message.includes('secret'));
  }
  await assert.rejects(analyzeEstimatePhotos(files,'test',async()=>{throw Object.assign(new Error('timeout'),{name:'TimeoutError'})}),e=>e.analysisCode==='timeout'&&e.status===504);
});

test('kitchen and two verified views of one fire door form two subjects', () => {
  const fire = (extra = {}) => analysis('entrance-a', {
    target_type: 'fire_door', sub_category: '방화문 및 문틀', ...extra,
  });
  const kitchen = { id: 'k', analysis: normalizeAnalysisClassification({
    target_type: 'kitchen', category: '주방', sub_category: '싱크대 상부장과 하부장',
    construction_scope: 'kitchen_full', classification_confidence: 'high', view_completeness: 'full',
  }) };
  const items = [kitchen, { id: 'front', analysis: fire() },
    { id: 'frame', analysis: fire({ view_completeness: 'partial' }) }];
  const groups = buildEstimatePhotoGroups(mergeDoorViews(items));
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[1].photoNumbers, [2, 3]);
  assert.equal(groups[1].requiresConfirmation, false);
  assert.equal(groups[1].photos[1].analysis.view_completeness, 'partial');
  const priced = groups.map(g => ({ ...g, estimate: { min: 100, max: 100, average: 100 } }));
  const total = calculateQuantityEstimate(priced, 5);
  assert.equal(total.door.detectedCount, 0);
  assert.equal(total.total.average, 200);
});

test('fire door views keep manual choices, distinct doors and uncertain identities separate', () => {
  const fire = (key, extra = {}) => analysis(key, {
    target_type: 'fire_door', sub_category: '방화문 및 문틀', ...extra,
  });
  const items = [{ id: 'a', analysis: fire('one') }, { id: 'b', analysis: fire('two') },
    { id: 'c', analysis: fire('one', { object_confidence: 'low' }) }];
  const groups = buildEstimatePhotoGroups(mergeDoorViews(items));
  assert.equal(groups.length, 3);
  assert.equal(groups[2].requiresConfirmation, true);
  const separated = [{ id: 'a', analysis: fire('one') },
    { id: 'b', subjectId: 'b', analysis: fire('one') }];
  assert.equal(buildEstimatePhotoGroups(mergeDoorViews(separated)).length, 2);
  const mixed = [{ id: 'a', analysis: fire('one') }, { id: 'b', analysis: analysis('one') }];
  const merged = mergeDoorViews(mixed);
  assert.notEqual(merged[0].subjectId, merged[1].subjectId);
  const partial = [{ id: 'a', analysis: fire('one', { view_completeness: 'partial' }) }];
  assert.equal(buildEstimatePhotoGroups(mergeDoorViews(partial))[0].requiresConfirmation, true);
});

test('door merging cannot erase uncertain classification or absorb a shoe cabinet', () => {
  const fire = (extra = {}) => analysis('same', {
    target_type: 'fire_door', sub_category: '방화문 및 문틀', ...extra,
  });
  for (const extra of [
    { classification_confidence: 'low' },
    { view_completeness: 'unclear' },
  ]) {
    const rows = mergeDoorViews([{ id: 'a', analysis: fire() }, { id: 'b', analysis: fire(extra) }]);
    assert.equal(rows[1].subjectId, undefined);
    assert.equal(rows[1].analysis.requires_confirmation, true);
  }
  const shoe = analysis('same', {
    target_type: 'shoe', category: '신발장', sub_category: '신발장 문짝', door_count: 0,
  });
  const kitchen = analysis('kitchen', {
    target_type: 'kitchen', category: '주방', sub_category: '싱크대 상부장과 하부장',
    construction_scope: 'kitchen_full', door_count: 0,
  });
  const groups = buildEstimatePhotoGroups(mergeDoorViews([
    { id: 'k', analysis: kitchen }, { id: 'f', analysis: fire() }, { id: 's', analysis: shoe },
  ]));
  assert.equal(groups.length, 3);
  assert.deepEqual(groups.map(g => g.photoNumbers), [[1], [2], [3]]);
  assert.equal(groups[2].photos[0].analysis.target_type, 'shoe');
  assert.equal(fire({ sub_category: '신발장 문짝' }).confirmation_reason, 'conflicting_targets');
});

test('one identified doorway among furniture does not need a matching second door photo', () => {
  const fire = (extra = {}) => analysis('entrance', {
    target_type: 'fire_door', sub_category: '방화문',
    object_confidence: 'low', object_evidence: '단독 사진으로 다른 문과 비교할 근거 없음', ...extra,
  });
  const shoe = analysis('shoe', {
    target_type: 'shoe', category: '신발장', sub_category: '신발장 문짝', door_count: 0,
  });
  const groups = buildEstimatePhotoGroups(mergeDoorViews([
    { id: 'f', analysis: fire() }, { id: 's', analysis: shoe },
  ]));
  assert.equal(groups.length, 2);
  assert.equal(groups[0].requiresConfirmation, false);
  for (const extra of [{ door_count: 0 }, { door_count: 2 }, { classification_confidence: 'low' }]) {
    assert.equal(buildEstimatePhotoGroups(mergeDoorViews([{ id: 'f', analysis: fire(extra) }]))[0].requiresConfirmation, true);
  }
  const ambiguous = mergeDoorViews([
    { id: 'f', analysis: fire() }, { id: 'unknown', analysis: { target_type: 'other', classification_confidence: 'low' } },
  ]);
  assert.equal(ambiguous[0].analysis.subject_requires_confirmation, true);
  const two = mergeDoorViews([{ id: 'f', analysis: fire() }, { id: 'g', analysis: fire() }]);
  assert.equal(two[0].subjectId, undefined);
  assert.equal(two[1].subjectId, undefined);
});

test('short rate limit retries once with the same deadline and can recover', async () => {
  let calls=0, signal;
  const result=await analyzeEstimatePhotos([new Blob(['x'],{type:'image/jpeg'})],'test',async(_,options)=>{
    calls++; if(signal) assert.equal(options.signal,signal); signal=options.signal;
    if(calls===1)return {ok:false,status:429,headers:new Headers({'retry-after':'0'}),json:async()=>({error:{code:'rate_limit_exceeded'}})};
    return {ok:true,status:200,json:async()=>({output_text:JSON.stringify({photos:{photo_0:{index:0,...analysis('door')}}})})};
  });
  assert.equal(calls,2);assert.equal(result.photos.length,1);
});
test('quota exhaustion and long retry-after never retry', async()=>{
 for(const error of [{code:'rate_limit_exceeded'},{code:'rate_limit_exceeded',type:'insufficient_quota'}]){
  let calls=0;
  await assert.rejects(analyzeEstimatePhotos([new Blob(['x'],{type:'image/jpeg'})],'test',async()=>{calls++;return {ok:false,status:429,headers:new Headers({'retry-after':error.type?'0':'60'}),json:async()=>({error})};}));
  assert.equal(calls,1);
 }
});

test('exhausted credit is a configuration failure, not temporary congestion', async () => {
  let calls = 0;
  await assert.rejects(analyzeEstimatePhotos([new Blob(['x'], {type:'image/jpeg'})], 'test', async () => {
    calls++;
    return {ok:false, status:429, json:async()=>({error:{code:'credit_balance_exhausted'}})};
  }), error => error.analysisCode === 'configuration' && error.providerCode === 'credit_balance_exhausted');
  assert.equal(calls, 1);
});
