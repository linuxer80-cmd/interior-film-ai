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

test('VAT is allocated by site so brand and dealer groups add to the same rounded total', async () => {
  const {allocateMaterialVatRows} = await import('../lib/materialVatEstimate.mjs');
  const rows = [
    {siteId:'one', brand:'A', amount:5}, {siteId:'one', brand:'B', amount:5},
    {siteId:'two', brand:'A', amount:5}, {siteId:'two', brand:'B', amount:5},
    {siteId:'three', brand:'A', amount:0},
  ];
  const allocated = allocateMaterialVatRows(rows);
  assert.equal(allocated.reduce((sum,row)=>sum+row.vatEstimate,0),2);
  assert.equal(allocated.filter(row=>row.siteId==='one').reduce((sum,row)=>sum+row.vatEstimate,0),1);
  assert.ok(allocated.every(row=>row.vatEstimate>=0));
  assert.equal(rows[0].vatEstimate,undefined);
  assert.deepEqual(allocateMaterialVatRows([]),[]);
});

test('small split amounts keep VAT non-negative and do not duplicate it', async () => {
  const {allocateMaterialVatRows} = await import('../lib/materialVatEstimate.mjs');
  const rows = Array.from({length:13}, (_, i)=>({siteId:'a', amount:i<5?1:0}));
  const allocated=allocateMaterialVatRows(rows);
  assert.equal(allocated.reduce((sum,row)=>sum+row.vatEstimate,0),1);
  assert.ok(allocated.every(row=>Number.isInteger(row.vatEstimate) && row.vatEstimate>=0));
});
