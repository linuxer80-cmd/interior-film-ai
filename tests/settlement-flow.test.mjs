import test from 'node:test';
import assert from 'node:assert/strict';
import {paymentState,profitState,actualMaterialUnpriced} from '../lib/settlementFlow.mjs';

test('unconfirmed money is never labelled settled and due state follows Korean dates',()=>{
  const today='2026-10-21';
  const site={confirmed:true,contract_amount:1000000,outstanding:500000};
  assert.equal(paymentState({...site,contract_amount:null},today).label,'금액 확인 필요');
  assert.equal(paymentState({...site,confirmed:false,outstanding:0},today).label,'기존 입금 확인 필요');
  assert.equal(paymentState({...site,outstanding:null},today).label,'수금 확인 필요');
  assert.equal(paymentState({...site,due_date:'2026-10-20'},today).label,'입금 예정일 지남');
  assert.equal(paymentState({...site,due_date:today},today).label,'미수금 있음');
  assert.equal(paymentState({...site,outstanding:0},today).label,'수금 완료');
  assert.equal(paymentState({...site,outstanding:-1},today).label,'초과 입금 확인');
});
test('missing costs hide final profit while confirmed zero prices and losses remain valid',()=>{
  const site={revenue:1000000,labor:800000,material:400000,expense:100000,profit:-300000};
  assert.equal(profitState(site).pending,false);
  for(const flag of ['missingContract','laborPending','materialPending','materialProvisional','profitIsEstimated'])assert.equal(profitState({...site,[flag]:true}).pending,true);
  assert.equal(profitState({...site,profit:null}).pending,true);
  assert.equal(actualMaterialUnpriced({quantity:10,unit_price:null,total_price:null}),true);
  assert.equal(actualMaterialUnpriced({quantity:10,unit_price:0}),false);
  assert.equal(actualMaterialUnpriced({quantity:10,total_price:0}),false);
  assert.equal(actualMaterialUnpriced({quantity:0}),false);
});
