import test from 'node:test';
import assert from 'node:assert/strict';
import { canReceiveAndroidChat, dispatchAndroidChat, configuredSender } from '../lib/androidChatPushDispatch.mjs';

const ids={companyId:'11111111-1111-1111-1111-111111111111',targetId:'22222222-2222-2222-2222-222222222222',
 messageId:'33333333-3333-3333-3333-333333333333',recipientId:'44444444-4444-4444-4444-444444444444',senderId:'55555555-5555-5555-5555-555555555555',date:'2026-11-06'};
test('single service-account secret must match the configured project and account',()=>{
 const projectId='field-ai-assistant',clientEmail='account@field-ai-assistant.iam.gserviceaccount.com';
 const creds={type:'service_account',project_id:projectId,client_email:clientEmail,private_key:'test-key'};
 const env={FIREBASE_PROJECT_ID:projectId,FIREBASE_CLIENT_EMAIL:clientEmail,FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify(creds)};
 assert.equal(configuredSender(env,x=>x).privateKey,'test-key');
 assert.throws(()=>configuredSender({...env,FIREBASE_CLIENT_EMAIL:'different@example.com'},x=>x),/Invalid Firebase service account/);
 assert.throws(()=>configuredSender({...env,FIREBASE_SERVICE_ACCOUNT_JSON:'broken'},x=>x),/Invalid Firebase service account/);
 assert.equal(configuredSender({}),null);
});
function fixture() {
 const rows={account_deletion_blocks:[],companies:[{id:ids.companyId,is_active:true}],profiles:[{id:ids.recipientId,company_id:ids.companyId,role:'worker',is_active:true}],
  sites:[{id:ids.targetId,company_id:ids.companyId,status:'active',work_dates:[ids.date]}],
  worker_team_messages:[{id:ids.messageId,company_id:ids.companyId,site_id:ids.targetId,work_date:ids.date,sender_id:ids.senderId}],
  workers:[{id:'worker-1',company_id:ids.companyId,user_id:ids.recipientId,is_active:true}],
  site_daily_assignments:[{id:'assignment',company_id:ids.companyId,site_id:ids.targetId,work_date:ids.date,worker_id:'worker-1'}],
  android_chat_push_tokens:[{device_id:'device-1',user_id:ids.recipientId,token:'long-test-registration-token'}]};
 const db={from(table){let filters=[];let remove=false;let limit=Infinity;
  const q={select(){return q},delete(){remove=true;return q},eq(k,v){filters.push(r=>r[k]===v);return q},in(k,v){filters.push(r=>v.includes(r[k]));return q},limit(n){limit=n;return q},
   async maybeSingle(){return {data:(rows[table]||[]).filter(r=>filters.every(f=>f(r))).slice(0,limit)[0]||null,error:null}},
   then(resolve,reject){const selected=(rows[table]||[]).filter(r=>filters.every(f=>f(r))).slice(0,limit); if(remove) rows[table]=(rows[table]||[]).filter(r=>!selected.includes(r));return Promise.resolve({data:selected,error:null}).then(resolve,reject)}};return q;}};
 return {db,rows};
}
test('team push checks current assignment, active worker and message existence', async()=>{
 const {db,rows}=fixture(),metadata={...ids,kind:'team'};
 assert.equal(await canReceiveAndroidChat(db,metadata),true);
 rows.site_daily_assignments=[];assert.equal(await canReceiveAndroidChat(db,metadata),false);
 rows.site_daily_assignments=[{id:'assignment',company_id:ids.companyId,site_id:ids.targetId,work_date:ids.date,worker_id:'worker-1'}];
 rows.worker_team_messages=[];assert.equal(await canReceiveAndroidChat(db,metadata),false);
});
test('dispatch rechecks permission and removes only the expired registration', async()=>{
 const {db,rows}=fixture();let calls=0;
 const result=await dispatchAndroidChat(db,{...ids,kind:'team',recipients:[ids.recipientId]}, {send:async()=>{calls++;return {state:'unregistered'}}});
 assert.equal(calls,1);assert.equal(result.failed,0);assert.equal(rows.android_chat_push_tokens.length,0);
});
test('customer push is restricted to an active owner of the thread company', async()=>{
 const {db,rows}=fixture();rows.customer_chat_threads=[{id:ids.targetId,company_id:ids.companyId}];
 rows.customer_chat_messages=[{id:ids.messageId,thread_id:ids.targetId,sender:'customer'}];
 const metadata={...ids,senderId:null,kind:'customer'};
 assert.equal(await canReceiveAndroidChat(db,metadata),false);
 rows.profiles[0].role='owner';assert.equal(await canReceiveAndroidChat(db,metadata),true);
 rows.account_deletion_blocks=[{user_id:ids.recipientId}];assert.equal(await canReceiveAndroidChat(db,metadata),false);
});
