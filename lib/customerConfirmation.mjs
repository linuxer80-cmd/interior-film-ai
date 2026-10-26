import {alimtalkCompany} from './alimtalkCompany.mjs';
import {buildSiteMessage,dispatchSiteMessage,workDates} from './siteAlimtalk.mjs';
import {koreanToday} from './aiScheduleDate.mjs';

export async function notifyCustomerConfirmation(db,companyId,siteId,actorId,{dispatch=dispatchSiteMessage}={}) {
 try {
  const site=await db.from('sites').select('*').eq('id',siteId).eq('company_id',companyId).maybeSingle();
  if(site.error)throw site.error;
  if(!site.data||site.data.status!=='scheduled'||!workDates(site.data).length||workDates(site.data)[0]<koreanToday())return {status:'skipped'};
  const previous=await db.from('alimtalk_deliveries').select('id').eq('company_id',companyId).eq('site_id',siteId).eq('kind','customer_schedule').limit(1);
  if(previous.error)throw previous.error;
  if(previous.data?.length)return {status:'already_sent'};
  const company=await db.from('companies').select('id,company_name,phone,is_active').eq('id',companyId).single();
  if(company.error)throw company.error;
  if(!company.data?.is_active)return {status:'skipped'};
  const details=await alimtalkCompany(db,company.data);
  const message=buildSiteMessage(site.data,details);
  // The existing reservation RPC atomically rejects concurrent sends and any prior manual send.
  const result=await dispatch({db,site:site.data,company:details,message,actorId,expectedLatest:null});
  if(['blocked','rejected','unknown'].includes(result.status))console.warn('Customer confirmation alimtalk', {status:result.status});
  return result;
 }catch(error){console.error('Customer confirmation alimtalk',error.code||'request_failed');return {status:'error'};}
}
