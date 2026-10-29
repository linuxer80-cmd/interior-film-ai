import test from 'node:test';
import assert from 'node:assert/strict';
import { materialVatEstimate } from '../lib/materialVatEstimate.mjs';

test('shows VAT and total on the explicitly VAT-exclusive assumption', () => {
  assert.deepEqual(materialVatEstimate(5380000), {base:5380000,tax:538000,total:5918000});
  assert.deepEqual(materialVatEstimate(5), {base:5,tax:1,total:6});
  assert.equal(materialVatEstimate(-1), null);
  assert.equal(materialVatEstimate(null), null);
  assert.equal(materialVatEstimate(Infinity), null);
});
