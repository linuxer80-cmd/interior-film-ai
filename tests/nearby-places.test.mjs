import test from 'node:test';
import assert from 'node:assert/strict';
import {findNearbyPlaces} from '../lib/nearbyPlaces.mjs';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';

test('restaurant search uses site coordinates, radius and distance sort',async()=>{
 const urls=[];
 const result=await findNearbyPlaces({address:'현장 도로명 123',kind:'food',radius:1000,key:'test',fetcher:async url=>{
  urls.push(url);return {ok:true,json:async()=>urls.length===1?{meta:{total_count:1},documents:[{x:'126.7',y:'37.5'}]}:{meta:{is_end:true},documents:[{id:'123',place_name:'식당',distance:'120',place_url:'javascript:bad',phone:'032-123-4567'}]}};
 }});
 assert.equal(urls[0].searchParams.get('query'),'현장 도로명 123');
 assert.equal(urls[1].searchParams.get('category_group_code'),'FD6');
 assert.equal(urls[1].searchParams.get('x'),'126.7');
 assert.equal(urls[1].searchParams.get('radius'),'1000');
 assert.equal(urls[1].searchParams.get('sort'),'distance');
 assert.equal(result.places[0].mapUrl,'https://place.map.kakao.com/123');
 assert.equal(result.places[0].distance,120);
});
test('film search uses a fixed relevant keyword and returns empty results normally',async()=>{
 let calls=0;
 const result=await findNearbyPlaces({address:'주소',kind:'film',radius:5000,key:'test',fetcher:async url=>{
  calls++;if(calls===2)assert.equal(url.searchParams.get('query'),'인테리어필름');
  return {ok:true,json:async()=>calls===1?{meta:{total_count:1},documents:[{x:'127',y:'37'}]}:{meta:{is_end:true},documents:[]}};
 }});
 assert.deepEqual(result.places,[]);
});
test('ambiguous address stops before place search; provider errors are actionable',async()=>{
 let calls=0;
 await assert.rejects(findNearbyPlaces({address:'주소',kind:'film',radius:3000,key:'test',fetcher:async()=>{calls++;return {ok:true,json:async()=>({meta:{total_count:2},documents:[{},{}]})};}}),/도로명/);
 assert.equal(calls,1);
 await assert.rejects(findNearbyPlaces({address:'주소',kind:'food',radius:3000,key:'test',fetcher:async()=>({ok:false,status:429})}),/한도/);
});

const source=readFileSync(new URL('../app/api/worker/nearby/route.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replaceAll('export ','');
const siteId='11111111-1111-4111-8111-111111111111';
function endpoint(){
 let authorized=true,providerCalls=0,accessCalls=0;
 const context=vm.createContext({URL,Request,Response,createHash,process:{env:{KAKAO_REST_API_KEY:'test'}},uuid:s=>s===siteId,nearbyKinds:{film:'필름',food:'음식점'},json:(body,status=200)=>Response.json(body,{status}),
  mySitesGET:async()=>{accessCalls++;return authorized?Response.json({site:{site_id:siteId,address:'실제 현장 주소'}}):Response.json({error:'배정된 현장이 아닙니다.'},{status:403});},
  findNearbyPlaces:async({address})=>{providerCalls++;assert.equal(address,'실제 현장 주소');return {places:[]};}});
 vm.runInContext(source+'\nglobalThis.handler=GET;',context);
 return {deny(){authorized=false;},counts:()=>({providerCalls,accessCalls}),get:()=>context.handler(new Request('https://test/api/worker/nearby?siteId='+siteId+'&kind=food&radius=3000&address=forged'))};
}
test('cached results still require site authorization; client address is ignored',async()=>{
 const f=endpoint();assert.equal((await f.get()).status,200);assert.equal((await f.get()).status,200);
 assert.deepEqual(f.counts(),{providerCalls:1,accessCalls:2});
 f.deny();assert.equal((await f.get()).status,403);
 assert.deepEqual(f.counts(),{providerCalls:1,accessCalls:3});
});
