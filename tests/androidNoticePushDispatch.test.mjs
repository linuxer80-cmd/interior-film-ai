import test from 'node:test';
import assert from 'node:assert/strict';
import {dispatchAndroidNotice,noticeRowAllowed} from '../lib/androidNoticePushDispatch.mjs';

const U1='11111111-1111-1111-1111-111111111111',U2='22222222-2222-2222-2222-222222222222',N='33333333-3333-3333-3333-333333333333';
function fixture() {
 const rows={account_deletion_blocks:[],labor_notifications:[{id:N,user_id:U1}],android_chat_push_tokens:[
  {device_id:'1',user_id:U1,token:'token-1',native_general_ready:true},
  {device_id:'2',user_id:U2,token:'token-2',native_general_ready:false}]};
 const db={from(table){const filters=[];let deleting=false;let maximum=Infinity;
  const q={select(){return q},delete(){deleting=true;return q},eq(k,v){filters.push(row=>row[k]===v);return q},limit(n){maximum=n;return q},
   async maybeSingle(){return {data:(rows[table]||[]).filter(row=>filters.every(f=>f(row)))[0]||null}},
   then(resolve,reject){const matching=(rows[table]||[]).filter(row=>filters.every(f=>f(row))).slice(0,maximum);
    if(deleting)rows[table]=rows[table].filter(row=>!matching.includes(row));return Promise.resolve({data:matching,error:null}).then(resolve,reject)}};return q;}};
 return {db,rows};
}
const meta={noticeId:N,title:'일정',body:'알림',recipients:[U1,U2]};
test('only recipients with a permitted, accepted app skip browser fallback',async()=>{
 const {db}=fixture();const called=[];
 const r=await dispatchAndroidNotice(db,meta,{allowed:async()=>true,send:async m=>{called.push(m.recipientId);return {state:'accepted'}}});
 assert.deepEqual(called,[U1]);assert.deepEqual(r.acceptedUserIds,[U1]);
 assert.deepEqual(meta.recipients.filter(id=>!r.acceptedUserIds.includes(id)),[U2]);
});
test('failed, expired, unconfigured, blocked, and revoked routes leave browser available',async()=>{
 for(const state of ['failed','unregistered']) {const {db}=fixture();const r=await dispatchAndroidNotice(db,meta,{allowed:async()=>true,send:async()=>({state})});assert.deepEqual(r.acceptedUserIds,[]);}
 {const {db}=fixture();assert.deepEqual((await dispatchAndroidNotice(db,meta,{allowed:async()=>true,send:null})).acceptedUserIds,[])}
 {const {db,rows}=fixture();rows.account_deletion_blocks.push({user_id:U1});const r=await dispatchAndroidNotice(db,meta,{allowed:async()=>true,send:async()=>({state:'accepted'})});assert.deepEqual(r.acceptedUserIds,[]);}
 {const {db}=fixture();const r=await dispatchAndroidNotice(db,meta,{allowed:async()=>false,send:async()=>({state:'accepted'})});assert.deepEqual(r.acceptedUserIds,[]);}
});
test('recipient authorization is based on the stored notice, not the caller',async()=>{
 const {db}=fixture(),allowed=noticeRowAllowed(db,'labor_notifications',N);
 assert.equal(await allowed(U1),true);assert.equal(await allowed(U2),false);
 assert.throws(()=>noticeRowAllowed(db,'arbitrary_table',N));
});
