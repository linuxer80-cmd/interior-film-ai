import test from 'node:test';
import assert from 'node:assert/strict';
import {loadCustomerStage} from '../lib/loadCustomerStage.mjs';

function fixture({approved=true,amount=1950000,confirmed=true,paid=500000}={}){
 const reads=[];
 const rows={
  sites:{status:'completed',contract_amount:amount,work_dates:['2020-01-01']},
  work_reports:[{review_status:approved?'approved':'pending',reviewed_at:approved?'2020-01-01T03:00:00Z':null}],
  site_receivable_balances:{confirmed,paid},
  profiles:[{id:'owner'}],
  labor_personal_details:{bank_name:'테스트은행',account_number:'123-456-789',account_holder:'테스트 관리자'},
  company_estimate_defaults:{bank_account:'예전 견적서 계좌'},site_photos:[],
 };
 return {reads,db:{from(table){
  reads.push(table);
  const query={then(resolve,reject){return Promise.resolve({data:rows[table],error:null}).then(resolve,reject);}};
  for(const method of ['select','eq','in','lte','order','limit','single','maybeSingle'])query[method]=()=>query;
  return query;
 }}};
}

test('approved customer page exposes supply, VAT, gross total and gross-based remaining payment',async()=>{
 const {db}=fixture();const result=await loadCustomerStage(db,'company','site');
 assert.equal(result.amount,1950000);assert.equal(result.vatAmount,195000);
 assert.equal(result.totalAmount,2145000);assert.equal(result.paid,500000);
 assert.equal(result.outstanding,1645000);assert.equal(result.settled,false);
 assert.equal(result.bankAccount,'테스트은행 123-456-789 (테스트 관리자)');
});
test('unapproved results do not expose tax, total, payment or bank account',async()=>{
 const {db,reads}=fixture({approved:false});const result=await loadCustomerStage(db,'company','site');
 for(const key of ['amount','vatAmount','totalAmount','paid','outstanding'])assert.equal(result[key],null);
 assert.equal(result.bankAccount,'');assert.deepEqual(result.before,[]);assert.deepEqual(result.after,[]);
 assert.equal(reads.includes('site_photos'),false);
 assert.equal(reads.includes('profiles'),false);assert.equal(reads.includes('labor_personal_details'),false);
});
test('unknown settlement and missing contract never become a zero bill or paid-in-full message',async()=>{
 const pending=await loadCustomerStage(fixture({confirmed:false}).db,'company','site');
 assert.equal(pending.totalAmount,2145000);assert.equal(pending.paid,null);assert.equal(pending.outstanding,null);
 const missing=await loadCustomerStage(fixture({amount:null}).db,'company','site');
 assert.equal(missing.totalAmount,null);assert.equal(missing.vatAmount,null);assert.equal(missing.settled,false);
});
