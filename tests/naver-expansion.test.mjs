import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {expandNaverKeywords,validateExpansion} from '../lib/naverKeywordExpansion.mjs';
const creds={customerId:'1051808',apiKey:'test-license',secretKey:'test-secret'};
const input={groupId:'grp-one',bidAmt:200,keywords:['인천방문필름시공','인천 방문필름시공','부천싱크대필름시공']};
const group={nccAdgroupId:'grp-one',nccCampaignId:'cmp-one',customerId:1051808,adgroupType:'WEB_SITE',name:'필름',userLock:false};
const campaign={nccCampaignId:'cmp-one',customerId:1051808,campaignTp:'WEB_SITE',userLock:false,useDailyBudget:true,dailyBudget:30000};
function mock({budget=30000,count=1,wrong=false,failPost=false}={}){
 const calls=[];return {calls,fetcher:async(url,options)=>{const u=new URL(url);calls.push({url,options});
 if(u.pathname==='/ncc/adgroups/grp-one')return Response.json({...group,...(wrong?{customerId:9}:{})});
 if(u.pathname==='/ncc/campaigns')return Response.json([{...campaign,dailyBudget:budget}]);
 if(options.method==='POST'){
  assert.equal(options.headers['X-Signature'],createHmac('sha256',creds.secretKey).update(`${options.headers['X-Timestamp']}.POST./ncc/keywords`).digest('base64'));
  if(failPost)throw Error('network');
  return Response.json(JSON.parse(options.body).map((k,i)=>({...k,nccKeywordId:`new-${i}`,nccAdgroupId:'grp-one',inspectStatus:'UNDER_REVIEW'})));
 }
 return Response.json(Array.from({length:count},(_,i)=>({keyword:i?'인천시트지시공'+i:'인천방문필름시공',nccKeywordId:'kw-'+i,nccAdgroupId:'grp-one',customerId:1051808})));
 }};
}
test('preview excludes spacing variants; POST is signed once and bounded with explicit individual bid',async()=>{
 const m=mock(),plan=await expandNaverKeywords(creds,input,false,m.fetcher);
 assert.deepEqual(plan.keywords,['부천싱크대필름시공']);assert.equal(plan.duplicates.length,2);assert.ok(m.calls.every(c=>c.options.method==='GET'));
 const result=await expandNaverKeywords(creds,{...input,planId:plan.planId},true,m.fetcher);
 assert.equal(result.created.length,1);const posts=m.calls.filter(c=>c.options.method==='POST');assert.equal(posts.length,1);
 assert.deepEqual(JSON.parse(posts[0].options.body),[{keyword:'부천싱크대필름시공',bidAmt:200,useGroupBidAmt:false,userLock:false}]);
});
test('overbudget, cross account and stale preview cannot mutate',async()=>{
 for(const config of [{budget:30001},{wrong:true},{}]){const m=mock(config);await assert.rejects(()=>expandNaverKeywords(creds,{...input,planId:'stale'},true,m.fetcher));assert.ok(m.calls.every(c=>c.options.method==='GET'));}
});
test('group capacity stops overflow and uncertain POST never retries',async()=>{
 const full=mock({count:999}),plan=await expandNaverKeywords(creds,{...input,keywords:['부천싱크대필름시공','일산문틀필름시공']},false,full.fetcher);
 assert.equal(plan.keywords.length,1);assert.equal(plan.overflow.length,1);
 const m=mock({failPost:true}),p=await expandNaverKeywords(creds,input,false,m.fetcher);
 await assert.rejects(()=>expandNaverKeywords(creds,{...input,planId:p.planId},true,m.fetcher),/일부 등록/);
 assert.equal(m.calls.filter(c=>c.options.method==='POST').length,1);
});
test('invalid amounts, irrelevant keywords and oversize batches rejected before network',()=>{
 for(const patch of [{bidAmt:310},{bidAmt:75},{keywords:['누수탐지']},{keywords:Array(101).fill('인천필름시공')},{groupId:'bad'}])assert.throws(()=>validateExpansion({...input,...patch}));
});
