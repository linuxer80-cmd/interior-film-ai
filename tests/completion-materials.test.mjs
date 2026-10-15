import test from 'node:test';
import assert from 'node:assert/strict';
import { completionSeed, completionMaterials } from '../lib/completionEstimate.mjs';

test('site usage creates film rows before actual costs exist and groups same product', () => {
  const materials = [
    {brand:'영림',code:'PS160',used:12.3,unit:'m',unitPrice:5000},
    {brand:'영림',code:'ps160',used:2.2,unit:'m',unitPrice:6000},
    {brand:'현대',code:'PS160',used:3,unit:'m',unitPrice:4000},
  ];
  const before = JSON.stringify(materials);
  const doc = completionSeed({}, {}, {}, materials);
  assert.equal(doc.items.length, 2);
  assert.equal(doc.items[0].name, '영림 · PS160');
  assert.equal(doc.items[0].quantity, 14.5);
  assert.equal(doc.items[0].amount, 74700);
  assert.equal(JSON.stringify(materials), before);
});

test('matching actual film is not charged twice; unrelated film and expenses survive', () => {
  const actual = [
    {brand:'영림',productCode:'PS160',productName:'화이트',product:'PS160 · 화이트',quantity:10,unit:'m',amount:50000},
    {brand:'현대',productCode:'S115',product:'S115',quantity:4,unit:'m',amount:20000},
    {product:'접착제',quantity:null,amount:1000},
  ];
  const rows = completionMaterials(actual, [{brand:'영림',code:'ps160',name:'화이트',used:8,unit:'m',unitPrice:5000}]);
  assert.equal(rows.length,3);
  assert.equal(rows[0].quantity,8);
  assert.equal(rows.reduce((sum,row)=>sum+row.amount,0),61000);
  assert.equal(rows[2].category,'supplies');
});

test('unknown return is not issued quantity or zero; confirmed zero and free price stay valid', () => {
  const rows = completionMaterials([], [
    {code:'A',issued:50,used:null,unitPrice:5000},
    {code:'B',issued:50,used:0,unitPrice:5000},
    {code:'C',used:3,unitPrice:0},
    {code:'D',used:3,unitPrice:null},
  ]);
  assert.equal(rows[0].quantity,'');
  assert.equal(rows[0].quantityPending,true);
  assert.equal(rows[1].quantity,0);
  assert.equal(rows[1].quantityPending,false);
  assert.equal(rows[2].pricePending,false);
  assert.equal(rows[3].quantity,3);
  assert.equal(rows[3].pricePending,true);
});

test('one pending part keeps grouped usage unconfirmed; units do not mix', () => {
  const rows = completionMaterials([], [
    {code:'A',used:5,unit:'m',unitPrice:100},
    {code:'A',used:null,unit:'m',unitPrice:100},
    {code:'A',used:2,unit:'롤',unitPrice:1000},
  ]);
  assert.equal(rows.length,2);
  assert.equal(rows[0].quantity,'');
  assert.equal(rows[0].amount,0);
  assert.equal(rows[1].quantity,2);
});
