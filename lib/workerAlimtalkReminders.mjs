import {workDates,buildSiteMessage,digest,approvedTemplate,solapiConfig,dispatchSiteMessage} from './siteAlimtalk.mjs';
import {reminderWindow} from './customerReminders.mjs';
export function workerReminderMessage(site,company,worker,date) {
 if(!['scheduled','in_progress'].includes(site.status)||!workDates(site).includes(date)||worker.is_active!==true)return null;
 const message=buildSiteMessage(site,company,{worker,dates:[date]});
 message.kind='worker_reminder';message.contentHash=digest({kind:message.kind,to:message.to,variables:message.variables});return message;
}
export function assignedReminderWorkers(daily,legacy,date) {
 return [...new Set((daily.length?daily.filter(row=>row.work_date===date):legacy).map(row=>row.worker_id))];
}
async function allRows(query) {
 const rows=[];for(let offset=0;;offset+=500){const result=await query.range(offset,offset+499);if(result.error)throw result.error;rows.push(...(result.data||[]));if(!result.data||result.data.length<500)return {data:rows};}
}
export async function runWorkerAlimtalkReminders(db,{clock=()=>new Date(),fetcher=fetch}={}) {
 const window=reminderWindow(clock()),counts={requested:0,blocked:0,unknown:0,rejected:0};
 if(!window.open)return {...counts,skipped:'outside_lunch_hour'};
 const config=solapiConfig('worker_reminder'),approval=await approvedTemplate(config,fetcher);
 if(!approval.ready)return {...counts,skipped:'template_unavailable'};
 let cursor=null;
 for(;;){
  let query=db.from('sites').select('id,company_id,site_name,address,address_detail,status,work_dates,schedule_start,schedule_end,schedule_date').in('status',['scheduled','in_progress']).or(`work_dates.cs.{${window.tomorrow}},work_dates.is.null`).order('id').limit(100);
  if(cursor)query=query.gt('id',cursor);
  const batch=await query;if(batch.error)throw batch.error;if(!batch.data.length)break;
  for(const candidate of batch.data){
   if(!reminderWindow(clock()).open)return {...counts,skipped:'lunch_hour_ended'};
   if(!workDates(candidate).includes(window.tomorrow))continue;
   const [fresh,company,daily]=await Promise.all([
    db.from('sites').select('*').eq('id',candidate.id).eq('company_id',candidate.company_id).single(),
    db.from('companies').select('id,company_name,phone,is_active').eq('id',candidate.company_id).single(),
    allRows(db.from('site_daily_assignments').select('worker_id,work_date').eq('company_id',candidate.company_id).eq('site_id',candidate.id).order('id')),
   ]);
   if(fresh.error||company.error||daily.error)throw fresh.error||company.error||daily.error;
   if(!company.data?.is_active)continue;
   // Any dated assignment disables the old site-wide fallback, even on other days.
   let legacy=[];
   if(!daily.data.length){const result=await allRows(db.from('site_workers').select('worker_id').eq('company_id',candidate.company_id).eq('site_id',candidate.id).order('id'));if(result.error)throw result.error;legacy=result.data;}
   const ids=assignedReminderWorkers(daily.data,legacy,window.tomorrow);
   for(let offset=0;offset<ids.length;offset+=4){
    if(!reminderWindow(clock()).open)return {...counts,skipped:'lunch_hour_ended'};
    await Promise.all(ids.slice(offset,offset+4).map(async workerId=>{
     const worker=await db.from('workers').select('id,name,phone,is_active').eq('id',workerId).eq('company_id',candidate.company_id).eq('is_active',true).maybeSingle();
     if(worker.error)throw worker.error;if(!worker.data){counts.blocked++;return;}
     const message=workerReminderMessage(fresh.data,company.data,worker.data,window.tomorrow);if(!message)return;
     const result=await dispatchSiteMessage({db,site:fresh.data,company:company.data,message,workerId,reminderDate:window.tomorrow,config,approval,fetcher});
     counts[result.status]=(counts[result.status]||0)+1;
    }));
   }
  }
  cursor=batch.data.at(-1).id;
 }
 return counts;
}
