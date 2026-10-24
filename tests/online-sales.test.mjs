import test from 'node:test';
import assert from 'node:assert/strict';
import {credentials,canUseOnlineSales,MARKETING_COMPANY_ID,reportingPeriod,summarize} from '../lib/onlineSales.mjs';
import {loadDaangnReport} from '../lib/daangnAds.mjs';
test('only fixed first-party company is allowed; names cannot authorize access',()=>{
 assert.equal(canUseOnlineSales(MARKETING_COMPANY_ID),true);
 for(const id of [null,undefined,'필름장이','0218fb05-b868-40d7-a7c7-ee0a76e1db53'])assert.equal(canUseOnlineSales(id),false);
});
test('credentials reject malformed headers and advertiser ids',()=>{
 assert.throws(()=>credentials({advertiserId:'1\nX-Test:1',apiKey:'abcdefgh'}));
 assert.throws(()=>credentials({advertiserId:'123',apiKey:'abcdefg\nhijk'}));
 assert.deepEqual(credentials({advertiserId:'123',apiKey:'abcdefgh'}),{advertiserId:'123',apiKey:'abcdefgh'});
});
test('Korea report covers previous seven complete calendar days across month boundary',()=>{
 assert.deepEqual(reportingPeriod(new Date('2026-10-31T15:10:00Z')),{start:'2026-10-25',end:'2026-10-31'});
 assert.deepEqual(reportingPeriod(new Date('2026-10-24T00:00:00Z')),{start:'2026-10-17',end:'2026-10-23'});
});
test('report adapter paginates, batches 50 ids and never calls ad mutation endpoints',async()=>{
 const calls=[];const campaigns=Array.from({length:51},(_,i)=>({id:String(i+1),title:`캠페인 ${i}`,advertiserId:'123'}));
 const fetcher=async(url,options)=>{
  calls.push([url,options]);
  if(url.includes('/campaigns'))return Response.json({campaigns: url.includes('pageNumber=0')?campaigns.slice(0,50):campaigns.slice(50),pagination:{totalPageCount:2}});
  const body=JSON.parse(options.body);
  assert.equal(body.analysisItem,'Campaign');assert.ok(body.ids.length<=50);assert.match(body.startDateTime,/\+09:00$/);
  return Response.json({performances:body.ids.map(id=>({id,impression:100,click:2,cost:'1200'}))});
 };
 const raw=await loadDaangnReport({advertiserId:'123',apiKey:'test-secret'}, {start:'2026-10-17',end:'2026-10-23'},fetcher);
 const result=summarize(raw.campaigns,raw.performances);
 assert.equal(calls.length,4);assert.equal(result.totals.cost,61200);assert.equal(result.totals.ctr,2);assert.equal(result.totals.cpc,600);
 assert.ok(calls.every(([url,o])=>url.startsWith('https://ads-openapi.kr.karrotmarket.com/') && (o.method==='GET'||url.endsWith('/v1/performance'))));
});
test('empty coverage is explicit and errors never leak provider response or key',async()=>{
 const raw=await loadDaangnReport({advertiserId:'123',apiKey:'test-secret'},{start:'2026-10-17',end:'2026-10-23'},async()=>Response.json({campaigns:[],pagination:{totalPageCount:0}}));
 assert.match(summarize(raw.campaigns,raw.performances).notes[0],/간편모드/);
 for(const status of [401,403,429,500])await assert.rejects(()=>loadDaangnReport({advertiserId:'123',apiKey:'test-secret'},{start:'a',end:'b'},async()=>new Response('test-secret',{status})),e=>!e.message.includes('test-secret'));
 assert.throws(()=>summarize([{id:'1'}],[{id:'1',impression:3,click:1,cost:'oops'}]));
 assert.throws(()=>summarize([{id:'1'}],[{id:'other',impression:3,click:1,cost:3}]));
});
