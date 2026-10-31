import test from 'node:test';
import assert from 'node:assert/strict';
import { selectUniqueEstimatePhotos } from '../lib/estimatePhotoSelection.mjs';
const photo = (bytes, name = 'photo.jpg') => new File([bytes], name, {type:'image/jpeg'});
test('duplicates within a selection and subsequent selections are skipped without using names', async () => {
  const first = await selectUniqueEstimatePhotos([photo('one'), photo('one', 'renamed.jpg'), photo('two')], [], 10);
  assert.equal(first.selected.length, 2);
  assert.equal(first.duplicateCount, 1);
  const next = await selectUniqueEstimatePhotos([photo('one'), photo('three')], first.selected, 1);
  assert.equal(next.selected.length, 1);
  assert.equal(await next.selected[0].file.text(), 'three');
  assert.equal(next.duplicateCount, 1);
});
test('hash failure retains photos and respects capacity', async () => {
  const result = await selectUniqueEstimatePhotos([photo('one'), photo('two')], [], 1, {});
  assert.equal(result.selected.length, 1);
  assert.equal(result.duplicateCount, 0);
});
