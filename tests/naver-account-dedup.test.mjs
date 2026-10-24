import test from 'node:test';
import assert from 'node:assert/strict';
import {loadNaverKeywordIndex} from '../lib/naverKeywordIndex.mjs';
import {expandNaverKeywords} from '../lib/naverKeywordExpansion.mjs';
const creds={customerId:'1051808',apiKey:'test-key',secretKey:'test-secret'};
const campaign={customerId:1051808,nccCampaignId:'cmp-one',campaignTp:'WEB_SITE',userLock:false,useDailyBudget:true,dailyBudget:30000};
const target={customerId:1051808,nccCampaignId:'cmp-one',nccAdgroupId:'grp-one',adgroupType:'WEB_SITE',name:'지역확장'};
function mock(){
 let added=false,fail=false;const calls=[];
 return {calls,add:()=>{added=true;},fail:()=>{fail=true;},fetcher:async(url,options)=>{
  const u=new URL(url);calls.push({url,options});
  if(u.pathname==='/ncc/campaigns')return Response.json([campaign]);
  if(u.pathname==='/ncc/adgroups/grp-one')return Response.json(target);
  if(u.pathname==='/ncc/adgroups')return Response.json([target,{...target,nccAdgroupId:'grp-other',name:'기존 시공',userLock:true}]);
  if(u.pathname==='/ncc/keywords'&&options.method==='GET'){
   const groupId=u.searchParams.get('nccAdgroupId');
   if(groupId==='grp-one')return Response.json([]);
   if(fail)return new Response('private-secret',{status:500});
   return Response.json([{nccKeywordId:'kw-one',nccAdgroupId:'grp-other',keyword:'인천 필름시공',userLock:true},...(added?[{nccKeywordId:'kw-two',nccAdgroupId:'grp-other',keyword:'부천시트지시공'}]:[])]);
  }
  if(options.method==='POST')return Response.json(JSON.parse(options.body).map(k=>({...k,nccKeywordId:'kw-created',nccAdgroupId:'grp-one'})));
  throw Error('unexpected');
 }};
}
const input={groupId:'grp-one',bidAmt:200,keywords:['인천필름시공','부천시트지시공']};
test('paused keywords in other groups are shown by group name and excluded from registration',async()=>{
 const m=mock(),index=await loadNaverKeywordIndex(creds,m.fetcher);
 assert.equal(index.groupCount,2);assert.deepEqual(index.byKeyword.get('인천필름시공'),[{id:'grp-other',name:'기존 시공',paused:true}]);
 const plan=await expandNaverKeywords(creds,input,false,m.fetcher);
 assert.deepEqual(plan.keywords,['부천시트지시공']);assert.deepEqual(plan.duplicates,['인천필름시공']);
 assert.equal(plan.duplicateGroups[0].groups[0].name,'기존 시공');
 const result=await expandNaverKeywords(creds,{...input,planId:plan.planId},true,m.fetcher);
 assert.equal(result.created.length,1);
 assert.deepEqual(JSON.parse(m.calls.find(c=>c.options.method==='POST').options.body).map(k=>k.keyword),['부천시트지시공']);
});
test('new duplicate in another group after preview prevents POST, as does incomplete account scan',async()=>{
 const m=mock(),plan=await expandNaverKeywords(creds,input,false,m.fetcher);m.add();
 await assert.rejects(()=>expandNaverKeywords(creds,{...input,planId:plan.planId},true,m.fetcher),/미리보기/);
 const failed=mock();failed.fail();await assert.rejects(()=>expandNaverKeywords(creds,input,false,failed.fetcher));
 assert.ok([...m.calls,...failed.calls].every(c=>c.options.method==='GET'));
});

test('an entirely registered batch returns no additions and never posts',async()=>{
 const m=mock(),only={...input,keywords:['인천 필름시공']};
 const plan=await expandNaverKeywords(creds,only,false,m.fetcher);
 assert.equal(plan.keywords.length,0);assert.equal(plan.duplicates.length,1);
 const result=await expandNaverKeywords(creds,{...only,planId:plan.planId},true,m.fetcher);
 assert.equal(result.created.length,0);assert.ok(m.calls.every(c=>c.options.method==='GET'));
});
