import test from 'node:test';
import assert from 'node:assert/strict';
import { materialVatEstimate, profitAfterMaterialVat } from '../lib/materialVatEstimate.mjs';

test('shows VAT and total on the explicitly VAT-exclusive assumption', () => {
  assert.deepEqual(materialVatEstimate(5380000), {base:5380000,tax:538000,total:5918000});
  assert.deepEqual(materialVatEstimate(5), {base:5,tax:1,total:6});
  assert.equal(materialVatEstimate(-1), null);
  assert.equal(materialVatEstimate(null), null);
  assert.equal(materialVatEstimate(Infinity), null);
});

test('profit deducts only estimated VAT in addition to already deducted material cost', () => {
  assert.equal(profitAfterMaterialVat(1000000, 400000), 960000);
  assert.equal(profitAfterMaterialVat(5000, 100000), -5000);
  assert.equal(profitAfterMaterialVat(100000, 0), 100000);
  assert.equal(profitAfterMaterialVat(null, 1000), null);
});
