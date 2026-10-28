import test from 'node:test';
import assert from 'node:assert/strict';
import {loadCustomerStage} from '../lib/loadCustomerStage.mjs';

function fixture({approved=true,amount=1950000,confirmed=true,paid=500000,amount_source='missing',supply_amount=null,trade=null}={}){
 const reads=[];
 const rows={
  sites:{status:'completed',contract_amount:amount,work_dates:['2020-01-01']},
  work_reports:[{review_status:approved?'approved':'pending',reviewed_at:approved?'2020-01-01T03:00:00Z':null}],
  site_receivable_balances:{confirmed,paid,amount_source,supply_amount},
  profiles:[{id:'owner'}],
  labor_personal_details:{bank_name:'테스트은행',account_number:'123-456-789',account_holder:'테스트 관리자'},
  company_estimate_defaults:{bank_account:'예전 견적서 계좌'},site_photos:[],
 };
 return {reads,db:{rpc:async(name,args)=>{reads.push(name);assert.deepEqual(args,{p_company:'company',p_site:'site'});return {data:trade,error:null};},from(table){
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
test('approved report fallback appears in customer page with VAT and unpaid balance',async()=>{
 const result=await loadCustomerStage(fixture({amount:null,paid:100000,amount_source:'approved_report',supply_amount:250000}).db,'company','site');
 assert.equal(result.amount,250000);assert.equal(result.vatAmount,25000);assert.equal(result.totalAmount,275000);assert.equal(result.outstanding,175000);
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

test('historic full payments use the actual agreed amount without inventing a VAT breakdown',async()=>{
 const {db}=fixture({amount:230000,paid:230000});const from=db.from;
 db.from=table=>{if(table!=='site_receivable_balances')return from(table);const query={then(resolve,reject){return Promise.resolve({data:{confirmed:true,paid:230000,amount_source:'contract',supply_amount:230000,contract_amount:230000,legacy_payment_complete:true},error:null}).then(resolve,reject);}};for(const method of ['select','eq','maybeSingle'])query[method]=()=>query;return query;};
 const state=await loadCustomerStage(db,'company','site');assert.equal(state.totalAmount,230000);assert.equal(state.vatAmount,null);assert.equal(state.paid,230000);assert.equal(state.outstanding,0);assert.equal(state.settled,true);
});

test('customer portal labels projections and calculates VAT-inclusive total without changing confirmed payment',async()=>{
 const trade={clientName:'거래처',previousTotal:80000,count:1,unknownCount:1,items:[],unknownItems:[{totalAmount:731500,paid:null}]};
 const {db}=fixture({trade});const result=await loadCustomerStage(db,'company','site');
 assert.equal(result.tradeReceivables.amounts.previous,811500);assert.equal(result.tradeReceivables.amounts.total,2456500);assert.equal(result.tradeReceivables.amounts.estimated,true);
 const pending=await loadCustomerStage(fixture({amount:422000,trade:{...trade,previousTotal:0,count:0},confirmed:false}).db,'company','site');
 assert.equal(pending.paid,null);assert.equal(pending.outstanding,null);assert.equal(pending.tradeReceivables.amounts.current,464200);
 assert.equal(pending.tradeReceivables.amounts.previous,731500);assert.equal(pending.tradeReceivables.amounts.total,1195700);
 const missing=await loadCustomerStage(fixture({trade:{...trade,unknownItems:[{totalAmount:null,paid:null}]}}).db,'company','site');
 assert.equal(missing.tradeReceivables.amounts.previous,null);assert.equal(missing.tradeReceivables.amounts.total,null);
 const paid=await loadCustomerStage(fixture({trade:{...trade,unknownItems:[{totalAmount:731500,paid:100000}]}}).db,'company','site');
 assert.equal(paid.tradeReceivables.amounts.previous,711500);
 const exact=await loadCustomerStage(fixture({trade:{...trade,unknownCount:0,unknownItems:[]}}).db,'company','site');
 assert.equal(exact.tradeReceivables.amounts.total,1725000);assert.equal(exact.tradeReceivables.amounts.estimated,false);
 assert.equal((await loadCustomerStage(fixture().db,'company','site')).tradeReceivables,null);
 const unapproved=fixture({trade,approved:false});await loadCustomerStage(unapproved.db,'company','site');assert.equal(unapproved.reads.includes('customer_trade_receivables'),false);
});
