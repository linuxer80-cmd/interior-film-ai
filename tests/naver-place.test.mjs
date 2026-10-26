import test from 'node:test';
import assert from 'node:assert/strict';
import {loadPlaceSearch,placeCredentials,PLACE_QUERY} from '../lib/naverPlace.mjs';
import {sealKey,openKey} from '../lib/onlineSalesCrypto.mjs';
const creds={clientId:'fixture-client',clientSecret:'fixture-secret-not-real'};
test('official read-only endpoint, fixed query and safe result fields',async()=>{
  const report=await loadPlaceSearch(creds,{now:new Date('2026-10-26T00:00:00Z'),fetchImpl:async(url,options)=>{
    assert.equal(url.origin,'https://naverapihub.apigw.ntruss.com');assert.equal(url.pathname,'/search/v1/local');assert.equal(url.searchParams.get('query'),PLACE_QUERY);assert.equal(options.method,'GET');assert.equal(options.redirect,'error');
    assert.equal(options.headers['X-NCP-APIGW-API-KEY'],creds.clientSecret);
    return Response.json({total:2,items:[{title:'<b>기분좋은공간</b>',roadAddress:'인천',link:'javascript:alert(1)',telephone:'do-not-persist'},{title:'동명업체',link:'https://example.com/'}]});
  }});
  assert.equal(report.queriedAt,'2026-10-26T00:00:00.000Z');assert.equal(report.items[0].title,'기분좋은공간');assert.equal(report.items[0].link,null);assert.equal(report.items[0].telephone,undefined);assert.equal(report.rank,undefined);assert.equal(report.items.length,2);
});
test('authentication error never includes remote message or credential',async()=>{
  await assert.rejects(loadPlaceSearch(creds,{fetchImpl:async()=>Response.json({error:{message:creds.clientSecret}},{status:401})}),e=>e.status===502&&!e.message.includes(creds.clientSecret));
  await assert.rejects(loadPlaceSearch(creds,{fetchImpl:async()=>{throw Error(creds.clientSecret);}}),e=>!e.message.includes(creds.clientSecret));
});
test('missing items is an error, genuine empty response stays empty',async()=>{
  await assert.rejects(loadPlaceSearch(creds,{fetchImpl:async()=>Response.json({total:0})}));
  const result=await loadPlaceSearch(creds,{fetchImpl:async()=>Response.json({total:0,items:[]})});assert.deepEqual(result.items,[]);
  assert.throws(()=>placeCredentials({clientId:'fixture-client',clientSecret:'bad\r\nheader'}));
});
test('place credentials are bound to platform and place ID',()=>{
  process.env.MARKETING_TOKEN_ENCRYPTION_KEY='fixture-encryption-key-only-for-test-123456';
  const sealed=sealKey(JSON.stringify(creds),'1035554754','naver_place');
  assert.deepEqual(JSON.parse(openKey(sealed,'1035554754','naver_place')),creds);
  assert.throws(()=>openKey(sealed,'1051808','naver'));
  delete process.env.MARKETING_TOKEN_ENCRYPTION_KEY;
});
