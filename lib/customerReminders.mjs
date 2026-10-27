import {customerStageContext,stageConfig,buildCustomerStageMessage} from './customerStageAlimtalk.mjs';
import {workDates,approvedTemplate,dispatchSiteMessage} from './siteAlimtalk.mjs';
export function reminderWindow(now=new Date()) {
 const parts=Object.fromEntries(new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
 const d=new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+1);
 return {tomorrow:d.toISOString().slice(0,10),open:parts.hour==='12'};
}
export function reminderMessage(site,company,tomorrow,token) {
 if(!['scheduled','in_progress'].includes(site.status)||workDates(site)[0]!==tomorrow)return null;
 return buildCustomerStageMessage(site,company,'before',token,{kind:'customer_reminder'});
}
export async function runCustomerReminders(db,now=new Date(),fetcher=fetch,{context=customerStageContext,dispatch=dispatchSiteMessage,clock=()=>new Date()}={}) {
 const window=reminderWindow(now),counts={requested:0,blocked:0,unknown:0,rejected:0};
 if(!window.open)return {...counts,skipped:'outside_lunch_hour'};
 const config=stageConfig('before'),approval=await approvedTemplate(config,fetcher);
 if(!approval.ready)return {...counts,skipped:'template_unavailable'};
 // Stable key pagination avoids the default 1,000 row limit and offset drift.
 let cursor=null;
 const start=new Date(window.tomorrow+'T00:00:00+09:00'),end=new Date(start.getTime()+86400000);
 const candidates=`work_dates.cs.{${window.tomorrow}},and(work_dates.is.null,schedule_start.gte.${start.toISOString()},schedule_start.lt.${end.toISOString()}),and(work_dates.is.null,schedule_start.is.null,schedule_date.eq.${window.tomorrow})`;
 for(;;){
  let query=db.from('sites').select('id,company_id,site_name,customer_name,customer_phone,address,address_detail,status,schedule_start,schedule_end,schedule_date,work_dates').in('status',['scheduled','in_progress']).or(candidates).order('id').limit(100);
  if(cursor)query=query.gt('id',cursor);
  const batch=await query;if(batch.error)throw batch.error;if(!batch.data.length)break;
  for(const candidate of batch.data){
   if(!reminderWindow(clock()).open)return {...counts,skipped:'lunch_hour_ended'};
   if(workDates(candidate)[0]!==window.tomorrow)continue;
   // Re-read immediately before reservation, including cancellation and schedule edits.
   try{
    const c=await context(db,candidate.company_id,candidate.id,'before');
    if(c.reasons.length){counts.blocked++;continue;}
    const message=reminderMessage(c.site,c.company,window.tomorrow,c.message.variables['#{고객페이지토큰}']);if(!message)continue;
    const result=await dispatch({db,site:c.site,company:c.company,message,reminderDate:window.tomorrow,config,approval,fetcher});counts[result.status]=(counts[result.status]||0)+1;
   }catch(error){counts.blocked++;console.error('Customer reminder context',error.code||'request_failed');}
  }
  cursor=batch.data.at(-1).id;
 }
 return counts;
}
