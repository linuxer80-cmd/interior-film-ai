import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {koreaDay,reminderWindow,finalWorkDay,reportReminderLeaders,reportReminderNotice,currentReportReminder,queueReportReminder} from '../lib/workReportReminders.mjs';
const site={id:'11111111-1111-4111-8111-111111111111',company_id:'c',site_name:'철산대림',status:'in_progress',work_dates:['2026-10-15','2026-10-13','2026-10-14']};
const daily=[
 {id:'a',site_id:site.id,company_id:'c',worker_id:'old',role:'leader',work_date:'2026-10-13'},
 {id:'b',site_id:site.id,company_id:'c',worker_id:'old',role:'leader',work_date:'2026-10-14'},
 {id:'c',site_id:site.id,company_id:'c',worker_id:'new',role:'leader',work_date:'2026-10-15'},
 {id:'d',site_id:site.id,company_id:'c',worker_id:'member',role:'member',work_date:'2026-10-15'},
];
const workers=['old','new','member'].map(id=>({id,user_id:'u-'+id,company_id:'c',is_active:true}));
const legacy=[{site_id:site.id,company_id:'c',worker_id:'old',role:'leader'}];
const input={site,daily,workers,legacy,date:'2026-10-15'};
test('18:00 Korean time is 09:00 UTC, never send early',()=>{
 assert.equal(koreaDay(new Date('2026-10-15T15:00:00Z')),'2026-10-16');
 assert.equal(reminderWindow(new Date('2026-10-15T08:59:59Z')),false);
 assert.equal(reminderWindow(new Date('2026-10-15T09:00:00Z')),true);
 const config=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
 assert.equal(config.crons.find(c=>c.path==='/api/worker/report-reminders').schedule,'0 9 * * *');
});
test('changed leader: only the final day leader, not earlier leader or member',()=>{
 assert.deepEqual(reportReminderLeaders(input).map(w=>w.id),['new']);
 assert.deepEqual(reportReminderLeaders({...input,date:'2026-10-14'}),[]);
});
test('cancelled, submitted, approved and future extended sites are excluded',()=>{
 for(const review_status of ['pending','approved','accepted']) assert.deepEqual(reportReminderLeaders({...input,report:{review_status}}),[]);
 assert.deepEqual(reportReminderLeaders({...input,report:{review_status:null}}),[]);
 assert.deepEqual(reportReminderLeaders({...input,site:{...site,status:'cancelled'}}),[]);
 assert.deepEqual(reportReminderLeaders({...input,site:{...site,work_dates:[...site.work_dates,'2026-10-16']}}),[]);
 assert.equal(reportReminderLeaders({...input,report:{review_status:'rejected'}}).length,1);
});
test('missing final day leader never falls back to an earlier or stale legacy leader',()=>{
 assert.deepEqual(reportReminderLeaders({...input,daily:daily.filter(d=>d.worker_id!=='new')}),[]);
 assert.deepEqual(reportReminderLeaders({...input,site:{...site,work_dates:[]}}),[]);
});
test('inactive, unlinked and foreign-company workers are excluded',()=>{
 for(const changes of [{is_active:false},{user_id:null},{company_id:'other'}])
  assert.deepEqual(reportReminderLeaders({...input,workers:workers.map(w=>w.id==='new'?{...w,...changes}:w)}),[]);
});
test('legacy sites use schedule end and legacy leader; partial daily assignment cannot end site early',()=>{
 const oldSite={...site,work_dates:null,schedule_end:'2026-10-15'};
 assert.equal(finalWorkDay(oldSite,daily.slice(0,1)),'2026-10-15');
 assert.deepEqual(reportReminderLeaders({...input,site:oldSite,daily:[]}).map(w=>w.id),['old']);
 assert.deepEqual(reportReminderLeaders({...input,site:oldSite,daily:daily.slice(0,1)}),[]);
});
test('same user with multiple worker memberships is notified once; duplicate key stays stable',()=>{
 const duplicate={...workers[1],id:'duplicate'};
 const leaders=reportReminderLeaders({...input,workers:[...workers,duplicate],daily:[...daily,{...daily[2],worker_id:duplicate.id}]});
 assert.equal(leaders.length,1);
 const notice=reportReminderNotice(site,leaders[0],input.date);
 assert.equal(notice.link,`/worker/site/${site.id}?section=report`);
 assert.equal(notice.recipient_user_id,'u-new');
 assert.equal(notice.dedupe_key,reportReminderNotice(site,duplicate,input.date).dedupe_key);
});
function fakeDB({disabled=false}={}){
 const tables={sites:[site],companies:[{id:'c',is_active:true}],site_daily_assignments:daily,site_workers:legacy,workers,
  work_reports:[],profiles:[{id:'u-new',is_active:!disabled}],notifications:[]};
 const queries=[];
 return {tables,queries,from(table){let data=[...(tables[table]||[])],error=null,single=false;queries.push(table);
  const q={select(){return q},eq(k,v){data=data.filter(r=>r[k]===v);return q},in(k,v){data=data.filter(r=>v.includes(r[k]));return q},
   order(){return q},limit(n){data=data.slice(0,n);return q},range(a,b){data=data.slice(a,b+1);return q},maybeSingle(){single=true;return q},
   insert(row){if(tables.notifications.some(n=>n.dedupe_key===row.dedupe_key))error={code:'23505'};
    else tables.notifications.push({...row,id:'notice'});return q},
   then(resolve){return Promise.resolve({data:single?data[0]||null:data,error}).then(resolve)}};return q;
 }};
}
test('server queries re-evaluate assignments and report status before enqueue',async()=>{
 const db=fakeDB();
 assert.deepEqual((await currentReportReminder(db,site.id,input.date)).leaders.map(w=>w.id),['new']);
 db.tables.work_reports.push({company_id:'c',site_id:site.id,review_status:'pending'});
 assert.deepEqual((await currentReportReminder(db,site.id,input.date)).leaders,[]);
 assert.deepEqual((await currentReportReminder(fakeDB({disabled:true}),site.id,input.date)).leaders,[]);
});
test('repeated cron enqueue creates one notification',async()=>{
 const db=fakeDB(),notice=reportReminderNotice(site,workers[1],input.date);
 assert.equal(await queueReportReminder(db,notice),true);
 assert.equal(await queueReportReminder(db,notice),false);
 assert.equal(db.tables.notifications.length,1);
});
test('login redirect preserves report tab and rejects external destinations',()=>{
 const source=readFileSync(new URL('../app/utils/workerSites.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replaceAll('export ','');
 const destination=new Function(source+';return workerDestination;')();
 const link=`/worker/site/${site.id}?section=report`;
 assert.equal(destination(link),link);
 assert.equal(destination(`https://evil.example${link}`),'/worker');
 assert.equal(destination(`${link}&next=https://evil.example`),'/worker');
 assert.equal(destination(`/worker/site/${site.id}`),`/worker/site/${site.id}`);
});
test('push payload and service worker notification click retain direct report URL',async()=>{
 const source=readFileSync(new URL('../app/api/send-push/route.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replaceAll('export ','');
 const build=new Function(source+';return buildNotificationUrl;')();
 const notice=reportReminderNotice(site,workers[1],input.date);
 assert.equal(build(notice),notice.link);
 const handlers={},opened=[];
 const self={location:{origin:'https://film.example'},addEventListener:(type,fn)=>handlers[type]=fn,clients:{matchAll:async()=>[],openWindow:async url=>opened.push(url)}};
 vm.runInNewContext(readFileSync(new URL('../public/sw.js',import.meta.url),'utf8'),{self,URL});
 let work;
 handlers.notificationclick({notification:{close(){},data:{url:notice.link}},waitUntil(p){work=p}});
 await work;
 assert.deepEqual(opened,['https://film.example'+notice.link]);
});
test('unauthenticated cron cannot query or create reminders',async()=>{
 const source=readFileSync(new URL('../app/api/worker/report-reminders/route.js',import.meta.url),'utf8').replace(/^import[\s\S]*?from [^;]+;\n/gm,'').replaceAll('export ','');
 const GET=new Function('process','Response','createClient',source+';return GET;')({env:{CRON_SECRET:'secret'}},Response,()=>{throw Error('must not query')});
 assert.equal((await GET(new Request('https://film.example/api/worker/report-reminders'))).status,401);
});
test('authorized 18:00 cron queues final leader and rerun does not duplicate',async()=>{
 const source=readFileSync(new URL('../app/api/worker/report-reminders/route.js',import.meta.url),'utf8').replace(/^import[\s\S]*?from [^;]+;\n/gm,'').replaceAll('export ','');
 const helpers=await import('../lib/workReportReminders.mjs');
 const db=fakeDB();
 // Cron listing includes an .in(status, ...) predicate supported by fakeDB.
 class Clock extends Date {constructor(...args){super(...(args.length?args:['2026-10-15T09:00:00Z']));}}
 const names=['process','Response','Date','createClient',...Object.keys(helpers)];
 const GET=new Function(...names,source+';return GET;')({env:{CRON_SECRET:'secret',NEXT_PUBLIC_SUPABASE_URL:'url',SUPABASE_SERVICE_ROLE_KEY:'key'}},Response,Clock,()=>db,...Object.values(helpers));
 const request=()=>new Request('https://film.example/api/worker/report-reminders',{headers:{authorization:'Bearer secret'}});
 const first=await GET(request());assert.equal(first.status,200);assert.equal((await first.json()).queued,1);
 const second=await GET(request());assert.equal((await second.json()).duplicates,1);
 assert.equal(db.tables.notifications[0].recipient_worker_id,'new');
});
test('webhook drops a report reminder after leader reassignment or report submission',async()=>{
 const source=readFileSync(new URL('../app/api/send-push/route.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replaceAll('export ','');
 const notice=reportReminderNotice(site,workers[1],input.date);
 const POST=new Function('process','Response','webpush','createClient','REPORT_REMINDER_TYPE','koreaDay','reminderWindow','currentReportReminder','reportReminderNotice',source+';return POST;')(
  {env:{PUSH_WEBHOOK_SECRET:'secret',NEXT_PUBLIC_VAPID_PUBLIC_KEY:'public',VAPID_PRIVATE_KEY:'private',NEXT_PUBLIC_SUPABASE_URL:'url',SUPABASE_SERVICE_ROLE_KEY:'key'}},Response,
  {setVapidDetails(){},sendNotification(){throw Error('must not send')}},()=>({}), 'work_report_reminder',()=>input.date,()=>true,async()=>({site,leaders:[]}),reportReminderNotice);
 const response=await POST(new Request('https://film.example/api/send-push',{method:'POST',headers:{'x-push-secret':'secret'},body:JSON.stringify({record:notice})}));
 assert.equal((await response.json()).skipped,'report_or_assignment_changed');
});
