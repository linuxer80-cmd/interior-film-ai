import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveRevenue,revenueSourceLabel} from '../lib/siteRevenue.mjs';
test('contract takes priority over report and is independent of customer type',()=>{
 for(const customer_type of ['personal','business',null])assert.deepEqual(resolveRevenue({contract_amount:1000000,customer_type},{review_status:'approved',approved_amount:1200000}),{revenue:1000000,missingContract:false,revenueSource:'contract'});
});
test('no contract uses only latest administrator-approved report',()=>{
 for(const contract_amount of [null,'',0,'0'])assert.deepEqual(resolveRevenue({contract_amount},{review_status:'approved',approved_amount:1200000}),{revenue:1200000,missingContract:false,revenueSource:'approved_report'});
});
test('pending, rejected and absent reports leave revenue unconfirmed',()=>{
 for(const review_status of ['pending','rejected',null])assert.deepEqual(resolveRevenue({contract_amount:0},{review_status,approved_amount:1200000}),{revenue:0,missingContract:true,revenueSource:'missing'});
 assert.equal(resolveRevenue({},null).missingContract,true);
});
test('explicit approved zero is valid; invalid approval amount is not',()=>{
 assert.equal(resolveRevenue({}, {review_status:'approved',approved_amount:0}).missingContract,false);
 for(const approved_amount of [null,'',-1,'invalid'])assert.equal(resolveRevenue({}, {review_status:'approved',approved_amount}).missingContract,true);
});
test('screen distinguishes contract, approved report and pending amount',()=>{
 assert.equal(revenueSourceLabel('contract'),'계약금액');
 assert.equal(revenueSourceLabel('approved_report'),'관리자 승인금액');
 assert.equal(revenueSourceLabel('missing'),'금액 미확정');
});
