import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePushRegistration, updatePushRegistration } from '../lib/androidChatPushRegistration.mjs';

const input={deviceId:'11111111-1111-4111-8111-111111111111',token:'valid-registration-token-123'};
test('registration rejects malformed identifiers and tokens', () => {
  assert.deepEqual(validatePushRegistration(input),input);
  assert.throws(()=>validatePushRegistration({...input,deviceId:'invalid'}));
  assert.throws(()=>validatePushRegistration({...input,token:'bad'}));
  assert.throws(()=>validatePushRegistration({...input,chatReady:'true'}));
  assert.deepEqual(validatePushRegistration({deviceId:input.deviceId},true),{deviceId:input.deviceId});
});
test('logout deletion is scoped to both device and authenticated user', async () => {
  const filters=[];
  const db={from:()=>({delete:()=>({eq(key,value) { filters.push([key,value]); return filters.length===2 ? Promise.resolve({error:null}) : this; }})})};
  await updatePushRegistration(db,'user-one',input,true);
  assert.deepEqual(filters,[['device_id',input.deviceId],['user_id','user-one']]);
});
test('blocked accounts cannot register devices', async () => {
  let writes=0;
  const db={from:table=>table==='account_deletion_blocks' ? {select:()=>({eq:()=>({maybeSingle:async()=>({data:{user_id:'user-one'}})})})} : {upsert:()=>{writes++;}}};
  await assert.rejects(updatePushRegistration(db,'user-one',input), /사용할 수 없는 계정/);
  assert.equal(writes,0);
});

test('old app registrations default to disabled and staged schema fallback stays compatible',async()=>{
 const writes=[];const db={from(table){if(table==='account_deletion_blocks')return {select:()=>({eq:()=>({maybeSingle:async()=>({data:null})})})};
 return {upsert:async row=>{writes.push(row);return writes.length===1?{error:{code:'PGRST204'}}:{error:null}}};}};
 await updatePushRegistration(db,'user-one',input);
 assert.equal(writes[0].native_chat_ready,false);assert.equal(writes[0].native_general_ready,false);
 assert.equal('native_chat_ready' in writes[1],false);
});
