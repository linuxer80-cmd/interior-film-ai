import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {noticeRowAllowed} from '../lib/androidNoticePushDispatch.mjs';
const uid='11111111-1111-1111-1111-111111111111',id='22222222-2222-2222-2222-222222222222';
for(const [label,file,fn,table] of [
 ['labor','laborPush.js','dispatchLaborNotifications','labor_notifications'],
 ['material','materialPilotPush.js','dispatchMaterialNotifications','material_pilot_notifications']
]) {
 const source=(await readFile(new URL('../lib/'+file,import.meta.url),'utf8')).replace(/^import .*;$/gm,'').replaceAll('export ','');
 function make(appAccepted,webReady=true) {
  const row={id,user_id:uid,title:'알림',message:'새 알림',link:'/',push_sent_at:null};
  const rows={[table]:[row],push_subscriptions:[{id:'subscription',user_id:uid,endpoint:'browser',p256dh:'p',auth:'a'}]};
  const db={from(name){let filters=[],update;const q={select(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},is(k,v){filters.push(r=>r[k]===v);return q},order(){return q},limit(){return q},update(v){update=v;return q},
   async maybeSingle(){return {data:(rows[name]||[]).filter(r=>filters.every(f=>f(r)))[0]||null}},
   then(resolve,reject){let data=(rows[name]||[]).filter(r=>filters.every(f=>f(r)));if(update)data.forEach(r=>Object.assign(r,update));return Promise.resolve({data,error:null}).then(resolve,reject)}};return q;}};
  let web=0;const native=async (_db,input,{allowed})=>{assert.equal(await allowed(uid),true);assert.deepEqual(input.recipients,[uid]);return {acceptedUserIds:appAccepted?[uid]:[]}};
  const transport={setVapidDetails(){},async sendNotification(){web++}};
  const process={env:webReady?{NEXT_PUBLIC_VAPID_PUBLIC_KEY:'p',VAPID_PRIVATE_KEY:'v'}:{}};
  const dispatch=new Function('process','webpush','dispatchAndroidNotice','noticeRowAllowed','canReceiveRecruitment','isRecruitmentNotice',source+';return '+fn+';')(
   process,transport,native,noticeRowAllowed,async()=>true,()=>false);
  return {db,row,dispatch,web:()=>web};
 }
 test(`${label}: accepted app gets notification with no duplicate browser push`,async()=>{const f=make(true);await f.dispatch(f.db);assert.equal(f.web(),0);assert.ok(f.row.push_sent_at)});
 test(`${label}: unavailable app falls back to browser`,async()=>{const f=make(false);await f.dispatch(f.db);assert.equal(f.web(),1);assert.ok(f.row.push_sent_at)});
 test(`${label}: app still works without browser credentials`,async()=>{const f=make(true,false);await f.dispatch(f.db);assert.equal(f.web(),0);assert.ok(f.row.push_sent_at)});
}
