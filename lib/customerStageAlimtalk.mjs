import {stageTemplate,stageButton} from './customerStages.mjs';
import {customerStageState} from './customerStages.mjs';
import {phoneNumber,digest,solapiConfig,dispatchSiteMessage,workDates} from './siteAlimtalk.mjs';
import {koreanToday} from './aiScheduleDate.mjs';
import {alimtalkCompany} from './alimtalkCompany.mjs';
import {signPortal} from './customerPortal.mjs';
export const stageEnv={before:'SOLAPI_TEMPLATE_CUSTOMER_BEFORE',complete:'SOLAPI_TEMPLATE_CUSTOMER_COMPLETION_LINK',care:'SOLAPI_TEMPLATE_CUSTOMER_PAID'};
export async function customerStageContext(db,companyId,siteId,stage){
 if(!Object.hasOwn(stageEnv,stage))throw Error('안내 단계를 확인해주세요.');
 const [s,c,r,b]=await Promise.all([
 db.from('sites').select('*').eq('id',siteId).eq('company_id',companyId).maybeSingle(),
 db.from('companies').select('id,company_name,phone,is_active').eq('id',companyId).maybeSingle(),
 db.from('work_reports').select('review_status,reviewed_at').eq('company_id',companyId).eq('site_id',siteId),
 db.from('site_receivable_balances').select('confirmed,paid').eq('id',siteId).eq('company_id',companyId).maybeSingle()]);for(const x of [s,c,r,b])if(x.error)throw x.error;
 if(!s.data||!c.data?.is_active)throw Error('현장 또는 업체를 확인할 수 없습니다.');
 const site=s.data,company=await alimtalkCompany(db,c.data),dates=workDates(site),state=customerStageState({...site,work_dates:dates},r.data||[],b.data,koreanToday());
 const reasons=[];
 if(stage==='before'&&(!['scheduled','in_progress'].includes(site.status)||!dates.length||state.complete))reasons.push('확정된 시공 전 일정이 필요합니다.');
 if(stage==='complete'&&!state.complete)reasons.push('마지막 시공일 이후 완료보고서를 모두 검수 승인해주세요.');
 if(stage==='care'&&!state.settled)reasons.push('계약금액과 실제 입금 내역 확인을 완료해주세요.');
 if(['cancelled','canceled'].includes(site.status))reasons.push('취소 현장에는 발송하지 않습니다.');
 const config={...solapiConfig('customer_schedule'),templateId:process.env[stageEnv[stage]]?.trim()};
 const to=phoneNumber(site.customer_phone);if(!to)reasons.push('고객 휴대폰 번호를 확인해주세요.');
 let token='';
 // Only prepare a customer capability for an eligible owner-authorized stage.
 if(!reasons.length){
  const {error}=await db.from('customer_site_portals').upsert({site_id:site.id,company_id:company.id},{onConflict:'site_id',ignoreDuplicates:true});if(error)throw error;
  const expires=new Date(Date.now()+30*86400000).toISOString();
  const p=await db.from('customer_site_portals').update({expires_at:expires}).eq('site_id',site.id).eq('company_id',company.id).select('token_id').single();if(p.error)throw p.error;token=signPortal(p.data.token_id);
 }
 const variables={'#{업체명}':String(company.company_name||'').trim(),'#{고객명}':String(site.customer_name||site.site_name||'').trim(),'#{현장명}':String(site.site_name||'').trim(),'#{업체전화번호}':String(company.phone||'').trim(),'#{고객페이지토큰}':token};
 if(stage==='before')variables['#{시공일}']=dates.join(', ');
 for(const [key,value] of Object.entries(variables))if(!value&&key!=='#{고객페이지토큰}')reasons.push(key.slice(2,-1)+' 확인 필요');
 const text=stageTemplate(stage).replace(/#\{[^}]+\}/g,key=>variables[key]||'');
 const message={kind:'customer_portal_'+stage,stage,to,text,variables,missing:reasons,requiredButton:stageButton(stage),contentHash:digest({stage,to,variables})};
 return {site,company,message,config,reasons,state};
}
export async function notifyCustomerStage(db,companyId,siteId,actorId,stage){
 if(!process.env[stageEnv[stage]])return {status:'blocked',reason:'고객 '+({before:'시공 전',complete:'시공 완료',care:'입금 완료'})[stage]+' 링크형 템플릿 등록·승인이 필요합니다.'};
 try{const c=await customerStageContext(db,companyId,siteId,stage);if(c.reasons.length)return {status:'blocked',reason:c.reasons.join(' ')};
 return await dispatchSiteMessage({db,site:c.site,company:c.company,message:c.message,config:c.config,actorId});
 }catch(e){console.error('customer stage alimtalk',e.code||'failed');return {status:'blocked',reason:'고객 안내 발송 정보를 확인하지 못했습니다. 현장 상세에서 다시 확인해주세요.'};}
}
