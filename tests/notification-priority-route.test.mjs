import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {siteTargetForNotice} from '../lib/androidNoticePushDispatch.mjs';
const source=(await readFile(new URL('../app/api/send-push/route.js',import.meta.url),'utf8')).replace(/^import .*;$/gm,'').replaceAll('export ','');
const u1='11111111-1111-1111-1111-111111111111',u2='22222222-2222-2222-2222-222222222222';
const notice={id:'33333333-3333-3333-3333-333333333333',company_id:'44444444-4444-4444-4444-444444444444',reference_type:'site',reference_id:'55555555-5555-5555-5555-555555555555',recipient_type:'company_admin',type:'site_update',title:'현장 알림',message:'일정이 바뀌었습니다.'};
function fixture(accepted) {
 const rows={notifications:[{...notice}],profiles:[u1,u2].map(id=>({id,company_id:notice.company_id,role:'owner',is_active:true})),
  push_subscriptions:[u1,u2].map(user_id=>({id:user_id,user_id,endpoint:user_id,p256dh:'key',auth:'key'}))};
 const db={from(table){let filters=[],update=null;const q={select(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},in(k,v){filters.push(r=>v.includes(r[k]));return q},update(v){update=v;return q},
  async maybeSingle(){return {data:(rows[table]||[]).filter(r=>filters.every(f=>f(r)))[0]||null,error:null}},
  then(resolve,reject){const data=(rows[table]||[]).filter(r=>filters.every(f=>f(r)));if(update)data.forEach(row=>Object.assign(row,update));return Promise.resolve({data,error:null}).then(resolve,reject)}};return q;}};
 const web=[];const process={env:{PUSH_WEBHOOK_SECRET:'secret',NEXT_PUBLIC_VAPID_PUBLIC_KEY:'public',VAPID_PRIVATE_KEY:'private',NEXT_PUBLIC_SUPABASE_URL:'url',SUPABASE_SERVICE_ROLE_KEY:'key'}};
 const push={setVapidDetails(){},async sendNotification(sub){web.push(sub.endpoint)}};
 const native=async (_db,input,{allowed})=>{assert.deepEqual(input.recipients,[u1,u2]);assert.deepEqual(input.siteTarget,{companyId:notice.company_id,siteId:notice.reference_id});assert.equal(await allowed(u1),true);return {sent:accepted.length,failed:0,acceptedUserIds:accepted}};
 const post=new Function('process','Response','webpush','createClient','REPORT_REMINDER_TYPE','reminderWindow','notificationDestination','dispatchAndroidNotice','dispatchAndroidChat','siteTargetForNotice',source+';return POST;')(
  process,Response,push,()=>db,'work_report_reminder',()=>true,()=>'/super-admin',native,async()=>{throw Error('unexpected')},siteTargetForNotice);
 return {post,web,rows};
}
for(const [name,accepted,expected] of [['installed',[u1],[u2]],['no app',[],[u1,u2]],['both installed',[u1,u2],[]]]) {
 test(`webhook sends browser notifications only as fallback: ${name}`,async()=>{
  const f=fixture(accepted);const response=await f.post(new Request('https://film.example/api/send-push',{method:'POST',headers:{'x-push-secret':'secret'},body:JSON.stringify({record:notice})}));
  const data=await response.json();assert.equal(response.status,200);assert.deepEqual(f.web,expected);assert.equal(data.sent,2);assert.equal(f.rows.notifications[0].push_sent,true);
 });
}
