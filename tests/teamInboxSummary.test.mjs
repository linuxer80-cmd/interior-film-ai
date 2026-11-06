import test from 'node:test';
import assert from 'node:assert/strict';
import { teamInboxSummary } from '../lib/teamInboxSummary.mjs';

function fakeDb(messages,reads,readError=null) {
  const calls=[];
  return { calls, from(table) {
    const call={table,filters:[],limit:null,operations:[]};calls.push(call);
    const q={
      select(columns){call.operations.push(['select',columns]);return q},
      eq(key,value){call.filters.push(['eq',key,value]);return q},
      is(key,value){call.filters.push(['is',key,value]);return q},
      in(key,value){call.filters.push(['in',key,value]);return Promise.resolve({data:reads,error:readError})},
      order(key,value){call.operations.push(['order',key,value]);return q},
      limit(value){call.limit=value;return Promise.resolve({data:messages,error:null})},
    };return q;
  }};
}
const request={companyId:'company-a',siteId:'site-a',date:'2026-11-06',userId:'user-a'};
test('summary scopes messages and unread rows to the site, date and current recipient',async()=>{
  const db=fakeDb([{id:'m2',body:'최근 메시지',created_at:'2026-11-06T03:00:00Z'},{id:'m1',body:'이전',created_at:'2026-11-06T02:00:00Z'}],[{message_id:'m1'}]);
  assert.deepEqual(await teamInboxSummary(db,request),{lastMessage:'최근 메시지',lastAt:'2026-11-06T03:00:00Z',unreadCount:1,unreadHasOlder:false,readReady:true});
  assert.deepEqual(db.calls[0].filters,[['eq','company_id','company-a'],['eq','site_id','site-a'],['eq','work_date','2026-11-06']]);
  assert.equal(db.calls[0].limit,101);
  assert.deepEqual(db.calls[1].filters,[['eq','user_id','user-a'],['is','read_at',null],['in','message_id',['m2','m1']]]);
});
test('summaries bound unread queries to the 100 newest messages and indicate older history',async()=>{
  const db=fakeDb(Array.from({length:101},(_,i)=>({id:`m${i}`,body:'a'.repeat(120),created_at:'2026-11-06T03:00:00Z'})),[]);
  const result=await teamInboxSummary(db,request);
  assert.equal(result.lastMessage.length,100);assert.equal(result.unreadCount,0);assert.equal(result.unreadHasOlder,true);
  assert.equal(db.calls[1].filters.at(-1)[2].length,100);
});
test('empty conversation does not query read records',async()=>{
  const db=fakeDb([],[]);assert.equal((await teamInboxSummary(db,request)).unreadCount,0);assert.equal(db.calls.length,1);
});
test('missing read tracking is reported as unavailable rather than zero',async()=>{
  const db=fakeDb([{id:'m1',body:'test'}],null,{code:'42P01'});const result=await teamInboxSummary(db,request);
  assert.equal(result.unreadCount,null);assert.equal(result.readReady,false);
});
test('unexpected read errors are surfaced',async()=>{
  const db=fakeDb([{id:'m1',body:'test'}],null,{code:'XX000'});
  await assert.rejects(teamInboxSummary(db,request),{code:'XX000'});
});
