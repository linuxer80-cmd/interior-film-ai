import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatchTeamMessage } from '../lib/workerTeamPush.mjs';
function fixture(subscriptions, failures={}, safety={}) {
 const sent=[],deleted=[],looked=[];
 const db={from(table){
 if(table==='worker_team_messages'){const filters={};const q={select(){return q},eq(k,v){filters[k]=v;return q},async maybeSingle(){if(safety.messageError)return {error:Error('lookup failed')};const row=safety.message===undefined?{id:'message',sender_id:'sender',site_id:'site',work_date:'2026-10-20'}:safety.message;return {data:row&&Object.entries(filters).every(([k,v])=>row[k]===v)?{id:row.id}:null}}};return q;}
 if(table==='account_deletion_blocks'){let ids=[];const q={select(){return q},in(k,v){ids=v;return q},async limit(){return safety.blockError?{error:Error('lookup failed')}:{data:(safety.blocked||[]).filter(id=>ids.includes(id)).map(user_id=>({user_id}))}}};return q;}
 assert.equal(table,'push_subscriptions');let user,id;const q={select(){return q},limit(){return q},delete(){q.removing=true;return q},eq(k,v){if(k==='user_id')user=v;else if(k==='id')id=v;return q},then(resolve){if(q.removing){deleted.push([id,user]);return Promise.resolve({error:null}).then(resolve)}looked.push(user);return Promise.resolve({data:subscriptions[user]||[]}).then(resolve)}};return q}};
 const transport={setVapidDetails(){},async sendNotification(sub,payload){sent.push({sub,payload:JSON.parse(payload)});if(failures[sub.endpoint])throw {statusCode:failures[sub.endpoint]}}};
 return {db,transport,sent,deleted,looked};
}
const message={members:[{user_id:'sender'},{user_id:'other'},{user_id:'other'},{user_id:null}],senderId:'sender',siteId:'site',date:'2026-10-20',messageId:'message',body:'hello'};
const sub={id:'sub',endpoint:'endpoint',p256dh:'p',auth:'a'};
const options=f=>({transport:f.transport,publicKey:'public',privateKey:'private'});
test('push only goes to distinct other team users with a matching conversation link',async()=>{const f=fixture({other:[sub]});const r=await dispatchTeamMessage(f.db,message,options(f));assert.equal(r.accepted,1);assert.deepEqual(f.looked,['other']);assert.equal(f.sent[0].payload.url,'/worker/site/site?section=chat&teamDate=2026-10-20');assert.equal(f.sent[0].payload.tag,'team-message');});
test('no subscription is not reported as successful delivery',async()=>{const f=fixture({});const r=await dispatchTeamMessage(f.db,message,options(f));assert.equal(r.accepted,0);assert.equal(r.unsubscribed,1);});
test('expired subscription is removed only for its recipient',async()=>{const f=fixture({other:[sub]},{endpoint:410});const r=await dispatchTeamMessage(f.db,message,options(f));assert.equal(r.accepted,0);assert.equal(r.expired,1);assert.deepEqual(f.deleted,[['sub','other']]);});
test('transient push failure is reported without deleting subscription',async()=>{const f=fixture({other:[sub]},{endpoint:503});const r=await dispatchTeamMessage(f.db,message,options(f));assert.equal(r.failed,1);assert.deepEqual(f.deleted,[]);});
test('missing configuration does not report or attempt a delivery',async()=>{const f=fixture({other:[sub]});const r=await dispatchTeamMessage(f.db,message,{...options(f),privateKey:''});assert.equal(r.state,'unconfigured');assert.equal(r.accepted,0);assert.equal(f.sent.length,0);});

test('manager recipients get admin site chat link and remain deduplicated',async()=>{
 const f=fixture({other:[sub]});
 const r=await dispatchTeamMessage(f.db,{...message,members:[{user_id:'sender'},{user_id:'other',role:'owner'},{user_id:'other',role:'member'}]},options(f));
 assert.equal(r.accepted,1);
 assert.equal(f.sent[0].payload.url,'/admin?tab=sites&site=site&section=chat&teamDate=2026-10-20');
});


test('new and previously delivered worker chat links select the conversation directly',async()=>{
 const {readFile}=await import('node:fs/promises');
 const source=await readFile(new URL('../app/worker/site/[siteId]/WorkerSiteDetail.js',import.meta.url),'utf8');
 const logic=source.slice(source.indexOf('  const teamDate ='),source.indexOf('  const [loading,'));
 const resolve=new Function('searchParams','initialSection','initialDate','menus',logic+'return {teamDate,requestedSection};');
 const menus=[{id:'info'},{id:'chat'},{id:'film'}];
 for(const section of ['info','chat'])assert.deepEqual(resolve(new URLSearchParams({section,teamDate:'2026-10-26'}),null,null,menus),{teamDate:'2026-10-26',requestedSection:'chat'});
 assert.equal(resolve(new URLSearchParams('section=info'),null,null,menus).requestedSection,'info');
 assert.equal(resolve(new URLSearchParams('section=chat&teamDate=2026-10-26'),'film',null,menus).requestedSection,'film');
});

for (const [name,safety] of Object.entries({missing:{message:null},scrubbed:{message:{id:'message',sender_id:null,site_id:'site',work_date:'2026-10-20'}},senderDeleting:{blocked:['sender']},recipientDeleting:{blocked:['other']}})) {
 test(`pending push is suppressed when ${name}`,async()=>{const f=fixture({other:[sub]},{},safety);const r=await dispatchTeamMessage(f.db,message,options(f));assert.equal(r.suppressed,1);assert.equal(r.accepted,0);assert.equal(f.sent.length,0);});
}
for(const safety of [{messageError:true},{blockError:true}])test('privacy lookup failure prevents sending',async()=>{const f=fixture({other:[sub]},{},safety);const r=await dispatchTeamMessage(f.db,message,options(f));assert.equal(r.failed,1);assert.equal(f.sent.length,0);});
test('push payload never contains captured private message content',async()=>{const f=fixture({other:[sub]});await dispatchTeamMessage(f.db,{...message,body:'private phone 010-1234-5678'},options(f));assert.equal(f.sent[0].payload.body,'새 팀 메시지가 있습니다. 앱에서 확인해 주세요.');assert.ok(!JSON.stringify(f.sent).includes('010-1234-5678'));});
