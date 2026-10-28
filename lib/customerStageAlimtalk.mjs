import {stageTemplate,stageButton,CUSTOMER_TEMPLATE_NAMES} from './customerStages.mjs';
import {customerStageState} from './customerStages.mjs';
import {phoneNumber,digest,solapiConfig,dispatchSiteMessage,workDates} from './siteAlimtalk.mjs';
import {koreanToday} from './aiScheduleDate.mjs';
import {alimtalkCompany} from './alimtalkCompany.mjs';
import {signPortal} from './customerPortal.mjs';
export const stageEnv={consultation:'SOLAPI_TEMPLATE_CUSTOMER_CONSULTATION',before:'SOLAPI_TEMPLATE_CUSTOMER_BEFORE',complete:'SOLAPI_TEMPLATE_CUSTOMER_COMPLETION_LINK',care:'SOLAPI_TEMPLATE_CUSTOMER_PAID'};
export function stageConfig(stage,env=process.env){
 if(!Object.hasOwn(stageEnv,stage))throw Error('안내 단계를 확인해주세요.');
 return {...solapiConfig('customer_schedule',env),templateId:env[stageEnv[stage]]?.trim(),templateName:CUSTOMER_TEMPLATE_NAMES[stage]};
}
export function buildCustomerStageMessage(site,company,stage,token,{kind=stage==='before'?'customer_schedule':'customer_portal_'+stage}={}){
 const to=phoneNumber(site.customer_phone),missing=[];
 const variables={'#{업체명}':String(company.company_name||'').trim(),'#{고객명}':String(site.customer_name||'').trim()||String(site.site_name||'').trim(),'#{현장명}':String(site.site_name||'').trim(),'#{업체전화번호}':String(company.phone||'').trim(),'#{고객페이지토큰}':token||''};
 if(stage==='before')variables['#{시공일}']=workDates(site).join(', ');
 if(!to)missing.push('고객 휴대폰 번호를 확인해주세요.');
 for(const [key,value] of Object.entries(variables))if(!value)missing.push(key.slice(2,-1)+' 확인 필요');
 const text=stageTemplate(stage).replace(/#\{[^}]+\}/g,key=>variables[key]||'');
 if([...text].length>1000)missing.push('메시지 길이 1,000자 이내');
 // Reuse the schedule reservation for both automatic confirmations and manual sends.
 return {kind,stage,to,text,variables,missing,requiredButton:stageButton(stage),contentHash:digest({kind,stage,to,variables})};
}
export async function customerStageContext(db,companyId,siteId,stage){
 if(!Object.hasOwn(stageEnv,stage))throw Error('안내 단계를 확인해주세요.');
 const [s,c,r,b]=await Promise.all([
 db.from('sites').select('*').eq('id',siteId).eq('company_id',companyId).maybeSingle(),
 db.from('companies').select('id,company_name,phone,is_active').eq('id',companyId).maybeSingle(),
 db.from('work_reports').select('review_status,reviewed_at').eq('company_id',companyId).eq('site_id',siteId),
 db.from('site_receivable_balances').select('confirmed,paid,amount_source,supply_amount,contract_amount,legacy_payment_complete').eq('id',siteId).eq('company_id',companyId).maybeSingle()]);for(const x of [s,c,r,b])if(x.error)throw x.error;
 if(!s.data||!c.data?.is_active)throw Object.assign(Error('현장 또는 업체를 확인할 수 없습니다.'),{status:404});
 const site=s.data,company=await alimtalkCompany(db,c.data),dates=workDates(site),state=customerStageState({...site,work_dates:dates},r.data||[],b.data,koreanToday());
 const reasons=[];
 if(stage==='consultation'&&site.status!=='consulting')reasons.push('상담중 현장에서 사용할 수 있는 안내입니다.');
 if(stage==='before'&&(!['scheduled','in_progress'].includes(site.status)||!dates.length||state.complete))reasons.push('확정된 시공 전 일정이 필요합니다.');
 if(stage==='complete'&&!state.complete)reasons.push('마지막 시공일 이후 완료보고서를 모두 검수 승인해주세요.');
 if(stage==='care'&&!state.settled)reasons.push('계약금액과 실제 입금 내역 확인을 완료해주세요.');
 if(['cancelled','canceled'].includes(site.status))reasons.push('취소 현장에는 발송하지 않습니다.');
 const config=stageConfig(stage);
 const to=phoneNumber(site.customer_phone);if(!to)reasons.push('고객 휴대폰 번호를 확인해주세요.');
 let token='';
 // Only prepare a customer capability for an eligible owner-authorized stage.
 if(!reasons.length){
  const {error}=await db.from('customer_site_portals').upsert({site_id:site.id,company_id:company.id},{onConflict:'site_id',ignoreDuplicates:true});if(error)throw error;
  const expires=new Date(Date.now()+30*86400000).toISOString();
  const p=await db.from('customer_site_portals').update({expires_at:expires}).eq('site_id',site.id).eq('company_id',company.id).select('token_id').single();if(p.error)throw p.error;token=signPortal(p.data.token_id);
 }
 const message=buildCustomerStageMessage(site,company,stage,token);
 reasons.push(...message.missing.filter(reason=>!reasons.includes(reason)));
 message.missing=reasons;
 return {site,company,message,config,reasons,state};
}
export async function notifyCustomerStage(db,companyId,siteId,actorId,stage,{context=customerStageContext,dispatch=dispatchSiteMessage}={}){
 try{const c=await context(db,companyId,siteId,stage);if(c.reasons.length)return {status:'blocked',reason:c.reasons.join(' ')};
 return await dispatch({db,site:c.site,company:c.company,message:c.message,config:c.config,actorId});
 }catch(e){console.error('customer stage alimtalk',e.code||'failed');return {status:'blocked',reason:'고객 안내 발송 정보를 확인하지 못했습니다. 현장 상세에서 다시 확인해주세요.'};}
}
