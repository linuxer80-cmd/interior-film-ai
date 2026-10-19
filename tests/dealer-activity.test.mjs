import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {dealerActivity} from '../lib/dealerActivity.mjs';
import {stockHistoryRange} from '../lib/stockHistory.mjs';
const dealers=[{id:'d',name:'테스트',is_test:true,user_id:null,status:'active'},{id:'real',name:'실제 대리점',is_test:false,user_id:'dealer-user',status:'active'}];
const order={id:'o',dealer_id:'d',buyer_id:'buyer',status:'assigned',created_at:'2026-10-19T00:00:00Z',shipping:{workflow:{phase:'review'}}};
test('summaries distinguish test dealers and current workflow states',()=>{
 const x=dealerActivity({dealers,orders:[order,{...order,id:'r',dealer_id:'real',status:'preparing'}],events:[],superUsers:[]},Date.parse('2026-10-19T03:00:00Z'));
 assert.equal(x.dealers[0].test,true);assert.equal(x.dealers[0].accountLinked,false);assert.equal(x.dealers[0].waiting,1);assert.equal(x.dealers[1].preparing,1);assert.equal(x.pending[0].hours,3);
});
test('super proxy work does not become the dealer account last activity',()=>{
 const x=dealerActivity({dealers,orders:[{...order,dealer_id:'real'}],events:[{id:'1',order_id:'o',actor_id:'dealer-user',action:'accept',created_at:'2026-10-19T01:00:00Z'},{id:'2',order_id:'o',actor_id:'super',action:'ready',created_at:'2026-10-19T02:00:00Z'}],superUsers:[{user_id:'super'}]});
 assert.equal(x.activities[0].actor,'슈퍼관리자 대신 처리');assert.equal(x.dealers[1].lastDealerActivity,'2026-10-19T01:00:00Z');assert.equal(x.dealers[1].delegated,1);
});
test('pre-reassignment history is not falsely attributed to current dealer',()=>{
 const x=dealerActivity({dealers,orders:[order],events:[{id:'a',order_id:'o',action:'assign',created_at:'2026-10-19T02:00:00Z',actor_id:'s'},{id:'b',order_id:'o',action:'accept',created_at:'2026-10-19T01:00:00Z',actor_id:'old'}],superUsers:[]});
 assert.equal(x.activities[1].dealerId,null);assert.match(x.activities[1].dealerName,/재배정 전/);assert.equal(x.dealers[0].lastDealerActivity,null);
});
const route=fs.readFileSync(new URL('../app/api/super-admin/dealer-activity/route.js',import.meta.url),'utf8');
function api(allowed){let readCount=0;const db={from(table){readCount++;return {select(){return this;},gte(){return this;},lt(){return this;},order(){return this;},limit(){return Promise.resolve({data:table==='material_pilot_dealers'?dealers:table==='material_pilot_orders'?[{...order,shipping:{recipient_phone:'secret',address_line1:'secret',workflow:{phase:'review'}}}]:[]});}};}};const GET=new Function('pilotIdentity','pilotRole','pilotJson','dealerActivity','stockHistoryRange',route.replace(/^import .*;$/gm,'').replace(/^export /gm,'')+';return GET;')(async()=>({db,user:{id:'u'}}),async(_db,_user,mode)=>{assert.equal(mode,'super');if(!allowed)throw Object.assign(Error('권한 없음'),{status:403});},(body,status=200)=>Response.json(body,{status}),dealerActivity,stockHistoryRange);return {GET,reads:()=>readCount};}
const req=()=>new Request('https://example.test/api/super-admin/dealer-activity?start=2026-10-19&end=2026-10-19');
test('API denies non-super users before reading any activity',async()=>{const x=api(false);assert.equal((await x.GET(req())).status,403);assert.equal(x.reads(),0);});
test('API returns monitoring data without recipient contacts and addresses',async()=>{const x=api(true);const r=await x.GET(req());assert.equal(r.status,200);const text=await r.text();assert.equal(text.includes('secret'),false);assert.equal(JSON.parse(text).dealers.length,2);});
