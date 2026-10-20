import test from 'node:test';
import assert from 'node:assert/strict';
import {findNearbyPlaces} from '../lib/nearbyPlaces.mjs';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createHash,randomUUID} from 'node:crypto';

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
function endpoint({quotaOk=true,quotaError=null,empty=false}={}){
 let authorized=true,providerCalls=0,accessCalls=0,quotaCalls=0,activityCalls=0;
 const context=vm.createContext({URL,Request,Response,createHash,randomUUID,process:{env:{KAKAO_REST_API_KEY:'test'}},uuid:s=>s===siteId,nearbyKinds:{film:'필름',food:'음식점'},json:(body,status=200)=>Response.json(body,{status}),
  privateAuth:async()=>({user:{id:'worker'},db:{rpc:async(name,args)=>{quotaCalls++;assert.equal(name,'reserve_commute_quota');assert.equal(args.p_company_id,'company');return {data:{ok:quotaOk},error:quotaError};}}}),
  recordWorkerActivity:async(_db,user,feature)=>{activityCalls++;assert.equal(user,'worker');assert.equal(feature,'nearby_food');},
  mySitesGET:async()=>{accessCalls++;return authorized?Response.json({site:{site_id:siteId,company_id:'company',address:'실제 현장 주소'}}):Response.json({error:'배정된 현장이 아닙니다.'},{status:403});},
  findNearbyPlaces:async({address})=>{providerCalls++;assert.equal(address,'실제 현장 주소');return {places:empty?[]:[{id:'123'}]};}});
 vm.runInContext(source+'\nglobalThis.handler=GET;',context);
 return {activity:()=>activityCalls,deny(){authorized=false;},counts:()=>({providerCalls,accessCalls,quotaCalls}),get:()=>context.handler(new Request('https://test/api/worker/nearby?siteId='+siteId+'&kind=food&radius=3000&address=forged'))};
}
test('cached results still require site authorization; client address is ignored',async()=>{
 const f=endpoint();assert.equal((await f.get()).status,200);assert.equal((await f.get()).status,200);
 assert.deepEqual(f.counts(),{providerCalls:1,accessCalls:2,quotaCalls:1});
 f.deny();assert.equal((await f.get()).status,403);
 assert.deepEqual(f.counts(),{providerCalls:1,accessCalls:3,quotaCalls:1});
});

test('exhausted quota blocks all external map calls',async()=>{
 const f=endpoint({quotaOk:false});assert.equal((await f.get()).status,429);
 assert.deepEqual(f.counts(),{providerCalls:0,accessCalls:1,quotaCalls:1});
});
test('quota database failure blocks external calls',async()=>{
 const f=endpoint({quotaError:{code:'42883'}});assert.equal((await f.get()).status,503);
 assert.equal(f.counts().providerCalls,0);
});
test('simultaneous same searches share one reservation',async()=>{
 const f=endpoint();const results=await Promise.all([f.get(),f.get()]);
 assert.ok(results.every(r=>r.status===200));
 assert.equal(f.counts().quotaCalls,1);assert.equal(f.counts().providerCalls,1);
});

test('successful cache reads count as usage without another map call; empty results do not',async()=>{
 const f=endpoint();await f.get();await f.get();assert.equal(f.activity(),2);assert.equal(f.counts().providerCalls,1);
 const blank=endpoint({empty:true});await blank.get();assert.equal(blank.activity(),0);
 const blocked=endpoint({quotaOk:false});await blocked.get();assert.equal(blocked.activity(),0);
});

test('apartment unit suffix uses one exact building location after address miss',async()=>{
 const urls=[];
 const result=await findNearbyPlaces({address:'청라한일베라체아파트 463-204',kind:'food',radius:3000,key:'test',fetcher:async url=>{
  urls.push(url);return {ok:true,json:async()=>urls.length===1?{meta:{total_count:0},documents:[]}:urls.length===2?{meta:{is_end:true},documents:[{place_name:'청라한일베라체 아파트',x:'126.6',y:'37.5'}]}:{meta:{is_end:true},documents:[]}};
 }});
 assert.equal(urls[1].searchParams.get('query'),'청라한일베라체아파트');
 assert.equal(urls[2].searchParams.get('x'),'126.6');
 assert.deepEqual(result.places,[]);
});
test('building cleanup preserves road and lot numbers',async()=>{
 const {buildingQuery}=await import('../lib/nearbyPlaces.mjs');
 assert.equal(buildingQuery('서울시 가로 463-204'),'서울시 가로 463-204');
 assert.equal(buildingQuery('아파트 463동 204호'),'아파트');
});
test('same named buildings are not guessed',async()=>{
 let count=0;
 await assert.rejects(findNearbyPlaces({address:'한일아파트 101-202',kind:'film',radius:3000,key:'test',fetcher:async()=>({ok:true,json:async()=>++count===1?{meta:{total_count:0},documents:[]}:{meta:{is_end:true},documents:[{place_name:'한일아파트',x:'126',y:'37'},{place_name:'한일아파트',x:'127',y:'38'}]}})}),/하나로/);
 assert.equal(count,2);
});


test('convenience stores use site radius and nearest sorting',async()=>{
 const urls=[];
 const result=await findNearbyPlaces({address:'주소',kind:'convenience',radius:3000,key:'test',fetcher:async url=>{
  urls.push(url);return {ok:true,json:async()=>urls.length===1?{meta:{total_count:1},documents:[{x:'127',y:'37'}]}:{meta:{is_end:true},documents:[{id:'42',place_name:'편의점',distance:'50'}]}};
 }});
 assert.equal(urls[1].searchParams.get('query'),'편의점');
 assert.equal(urls[1].searchParams.get('radius'),'3000');
 assert.equal(urls[1].searchParams.get('sort'),'distance');
 assert.equal(result.kind,'convenience');assert.equal(result.places[0].name,'편의점');
});
