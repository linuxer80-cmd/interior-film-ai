import {customerStageContext} from './customerStageAlimtalk.mjs';
import {dispatchSiteMessage,workDates} from './siteAlimtalk.mjs';
import {koreanToday} from './aiScheduleDate.mjs';

// Database events contain only committed date changes. Never infer a resend from a page visit.
export async function processCustomerScheduleChanges(db,{companyId=null,siteId=null,actorId=null,
 context=customerStageContext,dispatch=dispatchSiteMessage,fetcher=fetch,clock=()=>new Date()}={}) {
 const counts={requested:0,blocked:0,unknown:0,rejected:0};
 const deadline=clock().getTime()+240000;
 let cursor=null,handled=false,status='skipped';
 for(;;){
  let query=db.from('customer_schedule_alerts').select('id,company_id,site_id,new_dates,expires_at')
   .eq('status','pending').order('id').limit(100);
  if(companyId)query=query.eq('company_id',companyId);
  if(siteId)query=query.eq('site_id',siteId);
  if(cursor)query=query.gt('id',cursor);
  const batch=await query;if(batch.error)throw batch.error;
  if(!batch.data?.length)break;
  for(const event of batch.data){
   if(clock().getTime()>deadline)return {handled,status,...counts,deferred:true};
   const mark=async next=>{
    const result=await db.from('customer_schedule_alerts').update({status:next})
     .eq('id',event.id).eq('company_id',event.company_id).eq('site_id',event.site_id).eq('status','pending');
    if(result.error)throw result.error;
   };
   if(new Date(event.expires_at)<=clock()){await mark('expired');continue;}
   // Read live dates before preparing a signed customer link; reservation checks again atomically.
   const current=await db.from('sites').select('*').eq('id',event.site_id).eq('company_id',event.company_id).maybeSingle();
   if(current.error)throw current.error;
   const dates=workDates(current.data||{});
   if(!['scheduled','in_progress'].includes(current.data?.status)||!dates.length||dates.at(-1)<koreanToday(clock())||JSON.stringify(dates)!==JSON.stringify(event.new_dates)){
    await mark('superseded');continue;
   }
   handled=true;
   try {
    const c=await context(db,event.company_id,event.site_id,'before');
    if(c.reasons.length){status='blocked';counts.blocked++;continue;}
    // Preserve the approved before template verbatim, including its customer-page button.
    const result=await dispatch({db,site:c.site,company:c.company,message:c.message,config:c.config,
     actorId,customerScheduleEventId:event.id,customerScheduleDates:event.new_dates,fetcher});
    status=result.status;counts[status]=(counts[status]||0)+1;
    if(result.id){
     const saved=await db.from('customer_schedule_alerts').update({status:result.status})
      .eq('id',event.id).eq('company_id',event.company_id).eq('site_id',event.site_id).eq('status','reserved');
     if(saved.error)throw saved.error;
    }
   }catch(error){status='blocked';counts.blocked++;console.error('Customer schedule change alimtalk',error.code||'request_failed');}
  }
  cursor=batch.data.at(-1).id;
 }
 return {handled,status,...counts};
}
