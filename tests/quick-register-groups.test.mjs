import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBulkSites, bulkGroupKey, chooseBulkReferences, firstBulkError, focusBulkField, resolveBulkBatch, retainBulkPrices } from '../app/utils/quickRegisterGroups.js';
import { prepareBulkPhoto } from '../app/admin/quickRegisterFiles.js';

const photo = (id, extra = {}) => ({ id, name: `${id}.jpg`, objectId: id, site: '6', category: '붙박이장', subCategory: '도어', type: 'after', file: new File(['jpeg'], `${id}.jpg`, { type: 'image/jpeg' }), takenAt: '2026-02-06T00:00:00Z', ...extra });
const result = (index, objectKey, extra = {}) => ({ index, site_key: 'site-1', object_key: objectKey, object_confidence: 'high', object_evidence: '문 개수, 폭 비율, 옆 벽과 거울 위치 일치', category: '붙박이장', sub_category: '도어', photo_type: 'after', confidence: 'high', ...extra });
function resolve(batch, references, results) {
  let site = 10, object = 0;
  return resolveBulkBatch(batch, references, results, () => String(site++), () => `object-${++object}`);
}

test('two views share one work item; a third cabinet of the same category/date/site stays separate', () => {
  const photos = resolve([photo('27953'), photo('28173'), photo('27619')], [], [result(0, 'cabinet-a'), result(1, 'cabinet-a'), result(2, 'cabinet-b')]);
  const sites = buildBulkSites(photos);
  assert.equal(sites.length, 1);
  assert.deepEqual(sites[0].groups.map(g => g.photos.map(p => p.name)), [['27953.jpg', '28173.jpg'], ['27619.jpg']]);
  assert.equal(sites[0].groups[0].photos[0].objectId, sites[0].groups[0].photos[1].objectId);
});

test('legacy, uncertain or unsupported identity never merges merely by category', () => {
  for (const patch of [{ object_key: undefined }, { object_confidence: 'medium' }, { object_evidence: '' }]) {
    const photos = resolve([photo('a'), photo('b')], [], [result(0, 'one', patch), result(1, 'one', patch)]);
    assert.equal(buildBulkSites(photos)[0].groups.length, 2);
    assert.ok(photos.every(p => p.groupingReview));
  }
  assert.equal(buildBulkSites([photo('a', { objectId: undefined }), photo('b', { objectId: undefined })])[0].groups.length, 2);
});

test('references retain multiple physical targets in the same site across batches', () => {
  const refs = [photo('a', { objectId: 'existing-a' }), photo('b', { objectId: 'existing-b' })];
  const selected = chooseBulkReferences(refs, [photo('new')]);
  assert.equal(selected.length, 2);
  const photos = resolve([photo('a2'), photo('b2')], refs, [result(0, 'a'), result(1, 'b'), result(2, 'a'), result(3, 'b')]);
  assert.deepEqual(photos.map(p => [p.site, p.objectId]), [['6', 'existing-a'], ['6', 'existing-b']]);
});

test('conflicting reference object IDs and unrelated sites cannot silently merge', () => {
  const refs = [photo('a', { objectId: 'existing-a' }), photo('b', { objectId: 'existing-b' })];
  const photos = resolve([photo('new')], refs, [result(0, 'same'), result(1, 'same'), result(2, 'same')]);
  assert.notEqual(photos[0].objectId, 'existing-a');
  assert.notEqual(photos[0].objectId, 'existing-b');
  assert.equal(photos[0].groupingReview, true);
  const differentSites = resolve([photo('x'), photo('y')], [], [result(0, 'same'), result(1, 'same', { site_key: 'site-2' })]);
  assert.equal(buildBulkSites(differentSites).length, 2);
  assert.notEqual(differentSites[0].objectId, differentSites[1].objectId);
});

test('changed membership clears only affected prices; state-only edits preserve amounts', () => {
  const before = [photo('a', { objectId: 'wardrobe' }), photo('b', { objectId: 'wardrobe' }), photo('c')];
  const key = bulkGroupKey(before[0]), other = bulkGroupKey(before[2]);
  const prices = { [key]: '380000', [other]: '180000' };
  const split = [before[0], { ...before[1], objectId: 'separate' }, before[2]];
  assert.deepEqual(retainBulkPrices(before, split, prices), { [other]: '180000' });
  const moved = [before[0], { ...before[1], objectId: before[2].objectId }, before[2]];
  assert.deepEqual(retainBulkPrices(before, moved, prices), {});
  assert.deepEqual(retainBulkPrices(before, before.map(p => ({ ...p, type: 'before' })), prices), prices);
  assert.deepEqual(retainBulkPrices(before, [before[2]], prices), { [other]: '180000' });
});

test('validation finds visible first price/type/file error without changing input values', () => {
  const photos = [photo('a'), photo('b', { type: 'unknown' })];
  const keyA = bulkGroupKey(photos[0]), keyB = bulkGroupKey(photos[1]);
  for (const amount of ['', '0', '-1', 'Infinity', '가격']) assert.equal(firstBulkError(photos, { [keyA]: amount }).field, `price:${keyA}`);
  const prices = { [keyA]: '300,000', [keyB]: '180000' };
  assert.equal(firstBulkError(photos, prices).field, 'type:b');
  assert.equal(firstBulkError([photos[0], { ...photos[1], type: 'after', file: null }], prices).field, 'file:b');
  assert.equal(firstBulkError(photos.map(p => ({ ...p, type: 'after' })), prices), null);
  assert.equal(prices[keyA], '300,000');
});

test('error navigation opens collapsed ancestors before focus and scroll', () => {
  const order = [];
  const details = { tagName: 'DETAILS', open: false, parentElement: null };
  const element = {
    parentElement: { tagName: 'LABEL', parentElement: details },
    focus(options) { assert.equal(details.open, true); assert.equal(options.preventScroll, true); order.push('focus'); },
    scrollIntoView(options) { assert.equal(options.block, 'center'); order.push('scroll'); },
  };
  focusBulkField(element);
  assert.deepEqual(order, ['focus', 'scroll']);
});

test('preparation snapshots provider bytes once; later file loss cannot break saved JPEG', async () => {
  let readable = true, reads = 0;
  const original = { name: 'mobile.jpg', type: 'image/jpeg', lastModified: 100, async arrayBuffer() { reads++; if (!readable) throw new Error('provider lost'); return new TextEncoder().encode('original bytes').buffer; } };
  const prepared = await prepareBulkPhoto(original, {
    parse: async owned => { assert.equal(await owned.text(), 'original bytes'); return { DateTimeOriginal: new Date('2026-02-06T00:00:00Z'), latitude: 37.5, longitude: 126.6 }; },
    resize: async owned => { readable = false; return new File([await owned.arrayBuffer()], 'mobile.jpg', { type: 'image/jpeg' }); },
    hash: async file => `hash:${await file.text()}`,
  });
  assert.equal(reads, 1);
  assert.equal(await prepared.file.text(), 'original bytes');
  assert.equal(prepared.name, 'mobile.jpg');
  assert.equal(prepared.imageHash, 'hash:original bytes');
  assert.equal(prepared.latitude, 37.5);
  assert.equal(prepared.takenAt, '2026-02-06T00:00:00.000Z');
});

test('unreadable originals fail during preparation, before any storage work', async () => {
  let resized = false;
  await assert.rejects(prepareBulkPhoto({ arrayBuffer: async () => { throw new Error('read failed'); } }, { resize: async () => { resized = true; } }), /read failed/);
  assert.equal(resized, false);
  await assert.rejects(prepareBulkPhoto(new File([], 'empty.jpg')), /빈 사진/);
});
