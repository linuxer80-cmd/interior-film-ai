import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {researchNaverKeywords,researchHints,normalizeRelated} from '../lib/naverKeywordResearch.mjs';
const creds={customerId:'1051808',apiKey:'test-key',secretKey:'test-secret'};
const period={start:'2026-10-17',end:'2026-10-23'};
const raw={relKeyword:'인천 필름시공',monthlyPcQcCnt:'< 10',monthlyMobileQcCnt:'250',monthlyAvePcClkCnt:0,monthlyAveMobileClkCnt:2.5,monthlyAvePcCtr:0,monthlyAveMobileCtr:'1.25',compIdx:'high'};
test('research keeps censored search counts and missing metrics distinct from zero; actual CTR is never market CTR',()=>{
 const rows=normalizeRelated([raw,{...raw,relKeyword:'인천필름시공'},{relKeyword:'누수탐지'},{relKeyword:'부천시트지시공'}],{keywords:[{keyword:'인천필름시공',impressions:100,clicks:10,ctr:10}]});
 assert.equal(rows.length,2);assert.equal(rows[0].pcSearches,'< 10');assert.equal(rows[0].mobileSearches,250);assert.equal(rows[0].pcClicks,0);assert.equal(rows[0].competition,'높음');assert.equal(rows[0].actual.ctr,10);assert.equal(rows[0].mobileCtr,1.25);assert.equal(rows[1].mobileSearches,null);assert.equal(rows[1].actual,null);
});
test('hint limits and non-service registration are explicit',()=>{
 assert.deepEqual(researchHints('인천 필름시공,부천시트지시공,인천필름시공'),['인천필름시공','부천시트지시공']);
 for(const value of ['',null,'a,b,c,d,e,f','a&x=2','가'.repeat(26)])assert.throws(()=>researchHints(value));
 const rows=normalizeRelated([{relKeyword:'인테리어필름'},{relKeyword:'필름시공'},{relKeyword:'필름시공'+'가'.repeat(30)}],{keywords:[]});
 assert.ok(rows[0].registrationReason);assert.equal(rows[1].registrationReason,null);assert.ok(rows[2].registrationReason);
});
function mock({failure=false,wrong=false,malformed=false}={}){
 const calls=[];return {calls,fetcher:async(url,options)=>{
 const u=new URL(url);calls.push({url,options});assert.equal(options.method,'GET');assert.equal(options.headers['X-Signature'],createHmac('sha256',creds.secretKey).update(`${options.headers['X-Timestamp']}.GET.${u.pathname}`).digest('base64'));
 if(u.pathname==='/keywordstool')return failure?new Response('secret-private-provider-error',{status:403}):Response.json(malformed?{}:{keywordList:[raw]});
 if(u.pathname.startsWith('/ncc/adgroups/'))return Response.json({customerId:wrong?9:1051808,nccAdgroupId:'grp-one',adgroupType:'WEB_SITE',name:'지역 시공'});
 if(u.pathname==='/ncc/keywords')return Response.json([{nccAdgroupId:'grp-one',nccKeywordId:'nkw-one',keyword:'인천필름시공'}]);
 if(u.pathname==='/stats')return Response.json({data:[{id:'nkw-one',impCnt:100,clkCnt:10}]});
 throw Error('unexpected endpoint');
 }};
}
test('signed keyword tool and group stats join on normalized keyword, no mutations',async()=>{
 const m=mock(),value=await researchNaverKeywords(creds,{query:'인천 필름시공',groupId:'grp-one'},period,m.fetcher);
 assert.equal(value.rows[0].registered,true);assert.equal(value.rows[0].actual.ctr,10);assert.deepEqual(value.period,period);
 const u=new URL(m.calls.find(c=>new URL(c.url).pathname==='/keywordstool').url);assert.equal(u.searchParams.get('showDetail'),'1');assert.equal(u.searchParams.get('hintKeywords'),'인천필름시공');
});
test('wrong accounts, malformed data and provider errors cannot return fabricated research or leak secrets',async()=>{
 for(const options of [{wrong:true},{failure:true},{malformed:true}]){
 const m=mock(options);await assert.rejects(()=>researchNaverKeywords(creds,{query:'인천필름시공',groupId:'grp-one'},period,m.fetcher),e=>!e.message.includes('secret-private'));
 }
 await assert.rejects(()=>researchNaverKeywords({...creds,customerId:'9'},{query:'인천필름시공',groupId:'grp-one'},period));
});

test('market research works without a group and never claims unverified registration or loads group stats',async()=>{
 const calls=[];
 const result=await researchNaverKeywords(creds,{query:'인천인테리어'},period,async(url,options)=>{
  calls.push({url,options});assert.equal(new URL(url).pathname,'/keywordstool');
  return Response.json({keywordList:[raw]});
 });
 assert.equal(calls.length,1);assert.equal(result.groupId,null);assert.equal(result.groupName,null);
 assert.equal(result.rows[0].registered,null);assert.equal(result.rows[0].actual,null);assert.equal(result.rows[0].mobileSearches,250);
});
test('optional group still rejects invalid group ids before any provider call',async()=>{
 let calls=0;
 await assert.rejects(()=>researchNaverKeywords(creds,{query:'인천필름시공',groupId:'bad'},period,async()=>{calls++;}));
 assert.equal(calls,0);
});
