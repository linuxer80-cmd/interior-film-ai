import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRecentRanks,normalizePositionBids,loadKeywordRankDetails,loadTopClickedKeywords,sortClickKeywords} from '../lib/naverKeywordRanks.mjs';
const creds={customerId:'1051808',apiKey:'test-license',secretKey:'test-secret'};
test('recent device ranks preserve missing values and never reuse historical avgRnk as recent',()=>{
 const result=parseRecentRanks({data:[{id:'nkw-a',avgRnk:4.5,breakdowns:[{name:'PC',recentAvgRnk:2.5},{name:'MOBILE',avgRnk:7.5,recentAvgRnk:0}]}]},['nkw-a']).get('nkw-a');
 assert.equal(result.recentAverageRank,null);assert.equal(result.todayAverageRank,4.5);assert.equal(result.devices.PC.recentAverageRank,2.5);assert.equal(result.devices.MOBILE.recentAverageRank,null);assert.equal(result.devices.MOBILE.todayAverageRank,7.5);
 assert.throws(()=>parseRecentRanks({data:[{id:'other'}]},['nkw-a']));assert.throws(()=>parseRecentRanks({data:[{id:'nkw-a'},{id:'nkw-a'}]},['nkw-a']));
});
test('click ranking sorts across groups; missing clicks stay below measured clicks',()=>{
 assert.deepEqual(sortClickKeywords([{id:'a',clicks:null},{id:'b',clicks:3},{id:'c',clicks:8},{id:'d',clicks:0}]).map(k=>k.id),['c','b','d','a']);
});
test('bid reference response rejects unrelated keyword, device and duplicate positions',()=>{
 const response={device:'PC',estimate:[{keyword:'인테리어필름',position:3,bid:900}]};assert.deepEqual(normalizePositionBids(response,'인테리어필름','PC'),[{position:3,bid:900}]);
 assert.throws(()=>normalizePositionBids(response,'다른키워드','PC'));assert.throws(()=>normalizePositionBids(response,'인테리어필름','MOBILE'));assert.throws(()=>normalizePositionBids({...response,estimate:[...response.estimate,...response.estimate]},'인테리어필름','PC'));
});
function detailFetcher({recentFails=false,estimateFails=false,foreign=false}={}){
 const calls=[];return {calls,fetcher:async(url,options)=>{
  const u=new URL(url);calls.push({u,options});let data;
  if(u.pathname==='/ncc/keywords/nkw-a')data={customerId:foreign?2:1051808,nccKeywordId:'nkw-a',nccAdgroupId:'grp-a',keyword:'인테리어필름',bidAmt:70,useGroupBidAmt:true};
  else if(u.pathname==='/ncc/adgroups/grp-a')data={customerId:1051808,nccAdgroupId:'grp-a',adgroupType:'WEB_SITE',bidAmt:900};
  else if(u.pathname==='/stats'){if(recentFails)return {ok:false,status:400,json:async()=>({})};assert.equal(u.searchParams.get('datePreset'),'today');data={data:[{id:'nkw-a',breakdowns:[{name:'MOBILE',recentAvgRnk:4}]}]};}
  else if(u.pathname==='/estimate/average-position-bid/keyword'){
   assert.equal(options.method,'POST');const body=JSON.parse(options.body);assert.equal(body.items.length,5);
   if(estimateFails)return {ok:false,status:429};data={device:body.device,estimate:body.items.map(i=>({keyword:i.key,position:i.position,bid:2000-i.position*100}))};
  }else throw Error('Unexpected endpoint');
  return {ok:true,json:async()=>data};
 }};
}
test('detail lookup reads current effective bid and actual recent stats; only estimate POSTs are sent',async()=>{
 const f=detailFetcher();const result=await loadKeywordRankDetails(creds,{keywordId:'nkw-a',groupId:'grp-a'},f.fetcher);
 assert.equal(result.bidAmt,900);assert.equal(result.recent.devices.MOBILE.recentAverageRank,4);assert.equal(result.estimates.length,2);assert.equal(f.calls.length,5);assert.ok(f.calls.every(c=>c.options.method==='GET'||c.u.pathname.startsWith('/estimate/')));
});
test('missing recent stats and bid estimates remain explicit errors, never fabricated ranks',async()=>{
 const f=detailFetcher({recentFails:true,estimateFails:true});const r=await loadKeywordRankDetails(creds,{keywordId:'nkw-a',groupId:'grp-a'},f.fetcher);assert.equal(r.recent,null);assert.ok(r.recentError);assert.ok(r.estimates.every(e=>e.error&&e.positions.length===0));
 const other=detailFetcher({foreign:true});await assert.rejects(loadKeywordRankDetails(creds,{keywordId:'nkw-a',groupId:'grp-a'},other.fetcher));assert.equal(other.calls.length,2);
});
test('top click list includes all positive groups and marks missing group metrics',async()=>{
 const f=async(url,options)=>{const u=new URL(url);assert.equal(options.method,'GET');let data;
 if(u.pathname==='/ncc/campaigns')data=[{customerId:1051808,nccCampaignId:'cmp-a',campaignTp:'WEB_SITE'}];
 else if(u.pathname==='/ncc/adgroups')data=['a','b','c'].map(id=>({customerId:1051808,nccCampaignId:'cmp-a',nccAdgroupId:'grp-'+id,adgroupType:'WEB_SITE',name:id,bidAmt:900}));
 else if(u.pathname.startsWith('/ncc/adgroups/')){const id=u.pathname.split('/').at(-1);data={customerId:1051808,nccCampaignId:'cmp-a',nccAdgroupId:id,adgroupType:'WEB_SITE',name:id,bidAmt:900};}
 else if(u.pathname==='/ncc/keywords'){const group=u.searchParams.get('nccAdgroupId');data=[{customerId:1051808,nccAdgroupId:group,nccKeywordId:'nkw-'+group,keyword:group,bidAmt:900,useGroupBidAmt:false}];}
 else if(u.pathname==='/stats'){
  const ids=u.searchParams.get('ids').split(',');data={data:ids.filter(id=>id!=='grp-c').map(id=>u.searchParams.get('datePreset')?{id,breakdowns:[{name:'PC',recentAvgRnk:3}]}:{id,clkCnt:id.endsWith('a')?2:7,impCnt:100,salesAmt:500,avgRnk:4})};
 }else throw Error('Unexpected path');return {ok:true,json:async()=>data};};
 const r=await loadTopClickedKeywords(creds,{start:'2026-10-18',end:'2026-10-24'},f);assert.deepEqual(r.keywords.map(k=>k.groupId),['grp-b','grp-a']);assert.equal(r.coverage.missingGroups,1);assert.equal(r.coverage.complete,false);assert.equal(r.keywords[0].recent.devices.PC.recentAverageRank,3);
});
