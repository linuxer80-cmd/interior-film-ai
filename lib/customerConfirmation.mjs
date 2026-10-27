import {customerStageContext} from './customerStageAlimtalk.mjs';
import {dispatchSiteMessage,workDates} from './siteAlimtalk.mjs';
import {koreanToday} from './aiScheduleDate.mjs';

export async function notifyCustomerConfirmation(db,companyId,siteId,actorId,{dispatch=dispatchSiteMessage,context=customerStageContext}={}) {
 try {
  const site=await db.from('sites').select('*').eq('id',siteId).eq('company_id',companyId).maybeSingle();
  if(site.error)throw site.error;
  if(!site.data||site.data.status!=='scheduled'||!workDates(site.data).length||workDates(site.data)[0]<koreanToday())return {status:'skipped'};
  const previous=await db.from('alimtalk_deliveries').select('id').eq('company_id',companyId).eq('site_id',siteId).eq('kind','customer_schedule').limit(1);
  if(previous.error)throw previous.error;
  if(previous.data?.length)return {status:'already_sent'};
  const c=await context(db,companyId,siteId,'before');
  if(c.reasons.length)return {status:'blocked',reason:c.reasons.join(' ')};
  if(c.site.status!=='scheduled'||workDates(c.site)[0]<koreanToday())return {status:'skipped'};
  // The existing reservation RPC atomically rejects concurrent sends and any prior manual send.
  const result=await dispatch({db,site:c.site,company:c.company,message:c.message,config:c.config,actorId,expectedLatest:null});
  if(['blocked','rejected','unknown'].includes(result.status))console.warn('Customer confirmation alimtalk', {status:result.status});
  return result;
 }catch(error){console.error('Customer confirmation alimtalk',error.code||'request_failed');return {status:'error'};}
}
