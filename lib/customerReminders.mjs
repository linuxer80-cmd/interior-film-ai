import {alimtalkCompany} from './alimtalkCompany.mjs';
import {workDates,buildSiteMessage,digest,approvedTemplate,solapiConfig,dispatchSiteMessage} from './siteAlimtalk.mjs';
export function reminderWindow(now=new Date()) {
 const parts=Object.fromEntries(new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
 const d=new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+1);
 return {tomorrow:d.toISOString().slice(0,10),open:parts.hour==='12'};
}
export function reminderMessage(site,company,tomorrow) {
 if(!['scheduled','in_progress'].includes(site.status)||workDates(site)[0]!==tomorrow)return null;
 const message=buildSiteMessage(site,company);message.kind='customer_reminder';message.contentHash=digest({kind:message.kind,to:message.to,variables:message.variables});return message;
}
export async function runCustomerReminders(db,now=new Date(),fetcher=fetch) {
 const window=reminderWindow(now),counts={requested:0,blocked:0,unknown:0,rejected:0};
 if(!window.open)return {...counts,skipped:'outside_lunch_hour'};
 const config=solapiConfig('customer_reminder'),approval=await approvedTemplate(config,fetcher);
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
   if(!reminderWindow(new Date()).open)return {...counts,skipped:'lunch_hour_ended'};
   if(workDates(candidate)[0]!==window.tomorrow)continue;
   // Re-read immediately before reservation, including cancellation and schedule edits.
   const [fresh,company]=await Promise.all([db.from('sites').select('*').eq('id',candidate.id).single(),db.from('companies').select('id,company_name,phone,is_active').eq('id',candidate.company_id).single()]);
   if(fresh.error||company.error||!company.data?.is_active){counts.blocked++;continue;}
   const message=reminderMessage(fresh.data,await alimtalkCompany(db,company.data),window.tomorrow);if(!message)continue;
   const result=await dispatchSiteMessage({db,site:fresh.data,company:company.data,message,reminderDate:window.tomorrow,config,approval,fetcher});counts[result.status]=(counts[result.status]||0)+1;
  }
  cursor=batch.data.at(-1).id;
 }
 return counts;
}
