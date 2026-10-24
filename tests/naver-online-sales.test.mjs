import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,createCipheriv,hkdfSync} from 'node:crypto';
import {naverCredentials,naverHeaders,loadNaverReport,loadNaverKeywords,statMetrics} from '../lib/naverAds.mjs';
import {sealKey,openKey} from '../lib/onlineSalesCrypto.mjs';
import {MARKETING_COMPANY_ID} from '../lib/onlineSales.mjs';
const creds={customerId:'1051808',apiKey:'test-access-license',secretKey:'test-secret-key'},period={start:'2026-10-17',end:'2026-10-23'};
const campaign={nccCampaignId:'cmp-one',customerId:1051808,campaignTp:'WEB_SITE',name:'필름쟁이',useDailyBudget:true,dailyBudget:30000};
const group={nccAdgroupId:'grp-one',nccCampaignId:'cmp-one',customerId:1051808,adgroupType:'WEB_SITE',name:'인천 필름',bidAmt:400};
const row=id=>({id,impCnt:100,clkCnt:5,salesAmt:2500,avgRnk:3.2});
test('Naver credentials fixed account, header injection rejected, HMAC matches official algorithm',()=>{
 assert.deepEqual(naverCredentials(creds),creds);
 assert.throws(()=>naverCredentials({...creds,customerId:'123'}));
 assert.throws(()=>naverCredentials({...creds,customerId:'2149941'}));
 assert.throws(()=>naverCredentials({...creds,apiKey:'license\r\nx-test:value'}));
 const h=naverHeaders(creds,'/ncc/campaigns','123456789');
 assert.equal(h['X-Signature'],createHmac('sha256',creds.secretKey).update('123456789.GET./ncc/campaigns').digest('base64'));
 assert.equal(h['X-Customer'],'1051808');assert.ok(!Object.values(h).includes(creds.secretKey));
});
test('platform-bound ciphertext preserves legacy Daangn and rejects cross-account/platform or tamper',()=>{
 process.env.MARKETING_TOKEN_ENCRYPTION_KEY='test-root-with-at-least-32-characters';
 const encrypted=sealKey(JSON.stringify(creds),'1051808','naver');
 assert.deepEqual(JSON.parse(openKey(encrypted,'1051808','naver')),creds);
 assert.throws(()=>openKey(encrypted,'1051808','daangn'));
 assert.throws(()=>openKey(encrypted,'3136168','naver'));
 const parts=encrypted.split('.');const body=Buffer.from(parts[3],'base64url');body[0]^=1;parts[3]=body.toString('base64url');assert.throws(()=>openKey(parts.join('.'),'1051808','naver'));
 const iv=Buffer.alloc(12,2),key=Buffer.from(hkdfSync('sha256',process.env.MARKETING_TOKEN_ENCRYPTION_KEY,'filmjang-online-sales-v1','daangn-api-key',32));
 const old=createCipheriv('aes-256-gcm',key,iv);old.setAAD(Buffer.from(`${MARKETING_COMPANY_ID}:daangn:3136168`));
 const oldBody=Buffer.concat([old.update('old-daangn-secret'),old.final()]);
 const fixture=['v1',iv.toString('base64url'),old.getAuthTag().toString('base64url'),oldBody.toString('base64url')].join('.');
 assert.equal(openKey(fixture,'3136168'),'old-daangn-secret');
});
test('report uses explicit KST range, GET only, and totals never double count group spend',async()=>{
 const urls=[];
 const fetcher=async(url,options)=>{
  const u=new URL(url);urls.push(u);assert.equal(options.method,'GET');assert.equal(options.redirect,'error');
  if(u.pathname==='/ncc/campaigns'){assert.equal(u.searchParams.has('selector'),false);return Response.json([campaign]);}
  if(u.pathname==='/ncc/adgroups')return Response.json([group]);
  assert.equal(u.pathname,'/stats');assert.equal(u.searchParams.get('timeIncrement'),'allDays');assert.deepEqual(JSON.parse(u.searchParams.get('timeRange')),{since:period.start,until:period.end});
  const ids=u.searchParams.get('ids').split(',');assert.equal(new Set(ids.map(id=>id.split('-')[0])).size,1);return Response.json({data:ids.map(row)});
 };
 const result=await loadNaverReport(creds,period,fetcher);
 assert.equal(result.totals.cost,2500);assert.equal(result.groups[0].cost,2500);assert.equal(result.totals.ctr,5);assert.equal(result.totals.cpc,500);assert.equal(urls.length,4);
 assert.ok(!JSON.stringify(result).includes(creds.apiKey));
});
test('missing stats remain unknown and do not fabricate zero-cost or rank data',async()=>{
 const fetcher=async url=>Response.json(url.includes('/campaigns')?[campaign]:url.includes('/adgroups')?[group]:{data:[]});
 const result=await loadNaverReport(creds,period,fetcher);
 assert.equal(result.totals.cost,null);assert.equal(result.complete,false);assert.equal(result.groups[0].averageRank,null);
 assert.equal(statMetrics({impCnt:0,clkCnt:0,salesAmt:0,avgRnk:0}).averageRank,null);
 assert.match(result.notes.join(' '),/0으로 계산하지/);
});
test('keywords paginate a full 1000-item page, batch 100 ids and reflect group bid',async()=>{
 let keywordRequests=0,statRequests=0;
 const fetcher=async(url,options)=>{
  assert.equal(options.method,'GET');const u=new URL(url);
  if(u.pathname==='/ncc/adgroups/grp-one')return Response.json(group);
  if(u.pathname==='/ncc/keywords'){
   keywordRequests++;
   if(keywordRequests===1)return Response.json(Array.from({length:1000},(_,i)=>({nccKeywordId:`kw-${i}`,nccAdgroupId:'grp-one',customerId:1051808,keyword:`인천필름${i}`,useGroupBidAmt:true,bidAmt:70})));
   assert.equal(u.searchParams.get('baseSearchId'),'kw-999');assert.equal(u.searchParams.get('selector'),'NEXT');return Response.json([{nccKeywordId:'kw-last',nccAdgroupId:'grp-one',keyword:'부천필름',useGroupBidAmt:false,bidAmt:500}]);
  }
  statRequests++;const ids=u.searchParams.get('ids').split(',');assert.ok(ids.length<=100);return Response.json({data:ids.map(row)});
 };
 const result=await loadNaverKeywords(creds,'grp-one',period,fetcher);
 assert.equal(keywordRequests,2);assert.equal(statRequests,11);assert.equal(result.keywords.length,1001);assert.equal(result.keywords[0].bidAmt,400);assert.equal(result.keywords.at(-1).bidAmt,500);
});
test('cross-account, wrong group, duplicate pagination, and malformed stats fail closed',async()=>{
 await assert.rejects(()=>loadNaverReport(creds,period,async()=>Response.json([{...campaign,customerId:999}])));
 await assert.rejects(()=>loadNaverKeywords(creds,'grp-one',period,async()=>Response.json({...group,nccAdgroupId:'grp-other'})));
 const duplicates=Array.from({length:1000},()=>campaign);
 await assert.rejects(()=>loadNaverReport(creds,period,async()=>Response.json(duplicates)));
 await assert.rejects(()=>loadNaverReport(creds,period,async url=>Response.json(url.includes('/campaigns')?[campaign]:url.includes('/adgroups')?[group]:{data:[row('unexpected')]})));
});
test('provider failures never return raw body or secrets; 429 has no automatic retries',async()=>{
 for(const status of [401,403,429,500]){
  let calls=0;
  await assert.rejects(()=>loadNaverReport(creds,period,async()=>{calls++;return new Response('test-secret-key',{status});}),e=>!e.message.includes('test-secret-key')&&(status!==429||e.status===429));
  assert.equal(calls,1);
 }
});
