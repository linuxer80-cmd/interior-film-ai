import test from 'node:test';
import assert from 'node:assert/strict';
import {customerStageState,stageTemplate,stageButton} from '../lib/customerStages.mjs';
import {dispatchSiteMessage} from '../lib/siteAlimtalk.mjs';
const site={status:'completed',contract_amount:1000000,work_dates:['2026-10-26']},reports=[{review_status:'approved',reviewed_at:'2026-10-26T03:00:00Z'}];
test('completion requires all reports approved and last work day reached',()=>{
 assert.equal(customerStageState(site,[],null,'2026-10-26').stage,'before');
 assert.equal(customerStageState(site,[...reports,{review_status:'pending'}],null,'2026-10-26').stage,'before');
 assert.equal(customerStageState(site,reports,null,'2026-10-25').stage,'before');
 assert.equal(customerStageState(site,reports,null,'2026-10-26').stage,'complete');
});
test('unknown report fallback or unconfirmed deposits are not exposed as customer amounts',()=>{
 const state=customerStageState({...site,contract_amount:null},reports,{confirmed:true,paid:250000,contract_amount:250000},'2026-10-26');
 assert.equal(state.amount,null);assert.equal(state.outstanding,null);assert.equal(state.settled,false);
 assert.equal(customerStageState(site,reports,{confirmed:false,paid:1000000},'2026-10-26').paid,null);
});
test('approved report supplies the customer settlement when the contract is missing',()=>{
 const reportBalance={confirmed:true,paid:100000,amount_source:'approved_report',supply_amount:250000};
 const state=customerStageState({...site,contract_amount:null},reports,reportBalance,'2026-10-26');
 assert.equal(state.amount,250000);assert.equal(state.vatAmount,25000);assert.equal(state.totalAmount,275000);assert.equal(state.outstanding,175000);
 assert.equal(customerStageState({...site,contract_amount:null},reports,{...reportBalance,paid:275000},'2026-10-26').settled,true);
 assert.equal(customerStageState(site,reports,reportBalance,'2026-10-26').amount,1000000);
 assert.equal(customerStageState({...site,contract_amount:null},[{review_status:'pending'}],reportBalance,'2026-10-26').amount,null);
 for(const value of [null,0,-1,'',undefined,'invalid'])assert.equal(customerStageState({...site,contract_amount:null},reports,{...reportBalance,supply_amount:value},'2026-10-26').amount,null);
});
test('partial payment, full payment and reversal determine current stage correctly',()=>{
 const partial=customerStageState(site,reports,{confirmed:true,paid:300000},'2026-10-26');assert.equal(partial.outstanding,800000);assert.equal(partial.stage,'complete');
 const supplyOnly=customerStageState(site,reports,{confirmed:true,paid:1000000},'2026-10-26');assert.equal(supplyOnly.outstanding,100000);assert.equal(supplyOnly.stage,'complete');
 assert.equal(customerStageState(site,reports,{confirmed:true,paid:1100000},'2026-10-26').stage,'care');
 assert.equal(customerStageState(site,reports,{confirmed:true,paid:900000},'2026-10-26').stage,'complete');
});
test('customer settlement itemizes 10 percent VAT and keeps unconfirmed payments unknown',()=>{
 const input={...site,contract_amount:'1950000.00'};
 const pending=customerStageState(input,reports,{confirmed:false,paid:0},'2026-10-26');
 assert.equal(pending.amount,1950000);assert.equal(pending.vatAmount,195000);assert.equal(pending.totalAmount,2145000);
 assert.equal(pending.paid,null);assert.equal(pending.outstanding,null);assert.equal(pending.settled,false);
 assert.equal(customerStageState(input,reports,{confirmed:true,paid:500000},'2026-10-26').outstanding,1645000);
 assert.equal(customerStageState(input,reports,{confirmed:true,paid:2145000},'2026-10-26').settled,true);
 assert.equal(customerStageState(input,reports,{confirmed:true,paid:2200000},'2026-10-26').outstanding,0);
 assert.equal(customerStageState(input,reports,{confirmed:true,paid:1950000},'2026-10-26').settled,false);
 assert.equal(customerStageState({...site,contract_amount:10005},reports,null,'2026-10-26').vatAmount,1001);
 for(const amount of [null,undefined,'',0,-1,'invalid',Infinity]){
  const state=customerStageState({...site,contract_amount:amount},reports,{confirmed:true,paid:0},'2026-10-26');
  for(const key of ['amount','vatAmount','totalAmount','outstanding'])assert.equal(state[key],null);
  assert.equal(state.settled,false);
 }
});
test('each registration template has only service information and a scoped link button',()=>{
 for(const stage of ['before','complete','care']){assert.ok(stageTemplate(stage).includes('#{현장명}'));assert.equal(stageButton(stage).linkMo,'https://interior-film-ai.vercel.app/customer/site/#{고객페이지토큰}?stage='+stage);assert.equal(stageButton(stage).linkPc,stageButton(stage).linkMo);}
});
test('wrong or missing link button blocks before charging or sending',async()=>{
 let charged=false;
 const result=await dispatchSiteMessage({db:{rpc:async()=>{charged=true;}},message:{text:'안내',missing:[],variables:{},requiredButton:stageButton('complete')},config:{},approval:{ready:true,template:{content:'안내',buttons:[]}}});
 assert.equal(result.status,'blocked');assert.equal(charged,false);
});

test('customer photos exclude other sites, late uploads, request photos and traversal paths',async()=>{
 const {customerPhotoRows}=await import('../lib/customerStages.mjs');const make=(path,type='after',date='2026-10-26T01:00:00Z')=>({storage_path:path,photo_type:type,created_at:date});
 const rows=[make('sites/company/site/after/a.jpg'),make('sites/company/other/after/a.jpg'),make('sites/company/site/after/b.jpg','after','2026-10-26T05:00:00Z'),make('sites/company/site/request/c.jpg','request'),make('sites/company/site/../other/a.jpg')];
 assert.deepEqual(customerPhotoRows(rows,'company','site','2026-10-26T03:00:00Z'),[rows[0]]);
});

test('consultation message opens the same preparation page without claiming a confirmed date',()=>{
 assert.equal(stageButton('consultation').linkMo,stageButton('before').linkMo);
 assert.ok(stageTemplate('consultation').includes('상담 후 확정'));
 assert.equal(stageTemplate('consultation').includes('일정이 확정되었습니다'),false);
 assert.equal(stageTemplate('consultation').includes('#{시공일}'),false);
});
