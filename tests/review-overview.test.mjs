import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewOverview, reviewMemoText, reviewPaymentAction } from '../lib/reviewOverview.mjs';
test('review flags usage and missing photos/content separately from purchase price',()=>{
 const result=reviewOverview({report:{work_summary:''},afterPhotos:[],materials:[{quantity:4,unit_price:null},{quantity:2,unit_price:0},{quantity:0,unit_price:null}]},{materials:[{returned:null},{returned:0}]});
 assert.deepEqual(result.checks.map(item=>item.id),['photos','content','usage']);
 assert.equal(result.unpriced.length,1);
 assert.ok(!result.checks.some(item=>item.id==='price'));
});
test('expense, additional material and registered labor totals do not double count each other',()=>{
 const result=reviewOverview({report:{work_summary:'완료'},afterPhotos:[{}],expenses:[{expense_type:'meal',amount:10000},{expense_type:'material',amount:20000},{description:'완료보고/인건비:{}',amount:250000},{description:'수익관리/자재비: 구매',amount:5000},{description:'수익관리/인건비: 인건비',amount:100000}]});
 assert.equal(result.expenseTotal,10000);assert.equal(result.extraMaterialTotal,25000);assert.equal(result.laborTotal,350000);assert.deepEqual(result.checks,[]);
});
test('selected reasons are composed once in a stable order, with optional custom details',()=>{
 const text=reviewMemoText(['expenses','photos','photos'],'  주방 문짝 사진 추가해주세요.  ');
 assert.ok(text.startsWith('사진 부족:'));assert.equal(text.split('사진 부족:').length,2);assert.match(text,/경비 내역:/);assert.ok(text.endsWith('주방 문짝 사진 추가해주세요.'));
 assert.equal(reviewMemoText([],'  '),'');assert.equal(reviewMemoText([],'직접 입력'),'직접 입력');
});
test('payment is unknown until fetched and confirmed; zero debt is not inferred from missing amounts',()=>{
 assert.equal(reviewPaymentAction(null).kind,'unknown');
 assert.equal(reviewPaymentAction({site:{confirmed:false}}).kind,'confirm');
 assert.equal(reviewPaymentAction({site:{confirmed:true,outstanding:null}}).kind,'confirm');
 assert.equal(reviewPaymentAction({site:{confirmed:true,outstanding:'300000'}}).kind,'outstanding');
 assert.equal(reviewPaymentAction({site:{confirmed:true,outstanding:0}}).kind,'settled');
});
