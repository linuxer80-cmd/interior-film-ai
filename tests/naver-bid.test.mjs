import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {updateNaverKeywordBid,validateBidChange} from '../lib/naverKeywordBid.mjs';
const credentials={customerId:'1051808',apiKey:'test-license',secretKey:'test-secret'};
const input={groupId:'grp-test',keywordId:'nkw-test',bidAmt:990,expectedBidAmt:900,expectedUseGroupBidAmt:false};
function fixture({keyword={},group={},campaigns,failPut=false,failVerify=false,unchanged=false}={}){
 let puts=0,reads=0; const calls=[];
 const fetcher=async(url,options)=>{
  const u=new URL(url);calls.push({u,options});
  assert.equal(options.headers['X-Customer'],'1051808');
  assert.equal(options.headers['X-Signature'],createHmac('sha256',credentials.secretKey).update(`${options.headers['X-Timestamp']}.${options.method}.${u.pathname}`).digest('base64'));
  let data;
  if(options.method==='PUT'){
   puts++;assert.equal(u.pathname,'/ncc/keywords');assert.equal(u.searchParams.get('fields'),'bidAmt');
   assert.deepEqual(JSON.parse(options.body),[{nccKeywordId:'nkw-test',nccAdgroupId:'grp-test',bidAmt:input.bidAmt,useGroupBidAmt:false}]);
   if(failPut)throw Error('network');data=[];
  }else if(u.pathname==='/ncc/keywords/nkw-test'){
   reads++;if(reads>1&&failVerify)throw Error('network');
   data={customerId:1051808,nccKeywordId:'nkw-test',nccAdgroupId:'grp-test',keyword:'인테리어필름',bidAmt:reads>1&&!unchanged?input.bidAmt:900,useGroupBidAmt:false,...keyword};
  }else if(u.pathname==='/ncc/adgroups/grp-test')data={customerId:1051808,nccAdgroupId:'grp-test',nccCampaignId:'cmp-test',adgroupType:'WEB_SITE',bidAmt:900,...group};
  else if(u.pathname==='/ncc/campaigns')data=campaigns||[{customerId:1051808,nccCampaignId:'cmp-test',campaignTp:'WEB_SITE',userLock:false,useDailyBudget:true,dailyBudget:30000}];
  else throw Error('Unexpected path');
  return {ok:true,json:async()=>data};
 };
 return {fetcher,calls,get puts(){return puts;}};
}
test('signed single keyword PUT and independent read-back confirm the saved bid',async()=>{
 const f=fixture();const result=await updateNaverKeywordBid(credentials,input,f.fetcher);
 assert.equal(result.verified,true);assert.equal(result.previousBidAmt,900);assert.equal(result.bidAmt,990);assert.equal(result.useGroupBidAmt,false);assert.equal(f.puts,1);assert.equal(f.calls.length,5);
});
test('invalid amount, ID, type and >10% change are rejected before any provider call',async()=>{
 for(const change of [{bidAmt:1000},{bidAmt:995},{bidAmt:'990'},{bidAmt:60},{keywordId:'../other'},{expectedUseGroupBidAmt:'false'}]){
  const f=fixture();await assert.rejects(updateNaverKeywordBid(credentials,{...input,...change},f.fetcher));assert.equal(f.calls.length,0);
 }
 assert.doesNotThrow(()=>validateBidChange({...input,expectedBidAmt:70,bidAmt:80}));
});
test('foreign keyword/group/campaign, wrong association and stale state cannot mutate',async()=>{
 for(const options of [{keyword:{customerId:2}},{group:{customerId:2}},{keyword:{nccAdgroupId:'grp-other'}},{group:{adgroupType:'SHOPPING'}},{keyword:{bidAmt:1000}},{keyword:{useGroupBidAmt:true}},{campaigns:[{customerId:2}]}]){
  const f=fixture(options);await assert.rejects(updateNaverKeywordBid(credentials,input,f.fetcher));assert.equal(f.puts,0);
 }
});
test('uncapped, overbudget and inactive campaign block the write',async()=>{
 for(const campaign of [{dailyBudget:30010},{useDailyBudget:false},{userLock:true}]){
  const f=fixture({campaigns:[{customerId:1051808,nccCampaignId:'cmp-test',campaignTp:'WEB_SITE',dailyBudget:30000,useDailyBudget:true,...campaign}]});await assert.rejects(updateNaverKeywordBid(credentials,input,f.fetcher));assert.equal(f.puts,0);
 }
});
test('group inherited bid is compared against group value and converted only for this keyword',async()=>{
 let reads=0;const f=fixture();const fetcher=async(url,options)=>{
  const response=await f.fetcher(url,options);const data=await response.json();
  if(new URL(url).pathname==='/ncc/keywords/nkw-test'&&++reads===1)return {ok:true,json:async()=>({...data,bidAmt:70,useGroupBidAmt:true})};
  return {ok:true,json:async()=>data};
 };
 const result=await updateNaverKeywordBid(credentials,{...input,expectedUseGroupBidAmt:true},fetcher);assert.equal(result.previousBidAmt,900);assert.equal(result.previousUseGroupBidAmt,true);assert.equal(result.useGroupBidAmt,false);
});
test('uncertain write, failed verification and unchanged provider value never report success or retry PUT',async()=>{
 for(const options of [{failPut:true},{failVerify:true},{unchanged:true}]){
  const f=fixture(options);await assert.rejects(updateNaverKeywordBid(credentials,input,f.fetcher),/재조회|다시 조회/);assert.equal(f.puts,1);
 }
});
