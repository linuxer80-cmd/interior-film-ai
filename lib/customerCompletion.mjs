import {notifyCustomerStage} from './customerStageAlimtalk.mjs';
import {customerCompletionTemplate} from './customerCompletionTemplate.mjs';
import {alimtalkCompany} from './alimtalkCompany.mjs';
import {phoneNumber,digest,workDates,solapiConfig,dispatchSiteMessage} from './siteAlimtalk.mjs';
import {koreanToday} from './aiScheduleDate.mjs';
export function completionMessage(site,company,account,completedDate){
 const to=phoneNumber(site.customer_phone),amount=site.contract_amount;
 const hasAmount=amount!==null&&amount!==undefined&&amount!==''&&Number.isFinite(Number(amount))&&Number(amount)>=0;
 const variables={'#{업체명}':String(company.company_name||'').trim(),'#{고객명}':String(site.customer_name||site.site_name||'').trim(),'#{현장명}':String(site.site_name||'').trim(),'#{완료일}':completedDate||'','#{입금계좌}':String(account||'').trim(),'#{업체전화번호}':String(company.phone||'').trim()};
 if(hasAmount)variables['#{계약금액}']=Number(amount).toLocaleString('ko-KR')+'원';
 const text=customerCompletionTemplate(hasAmount).replace(/#\{[^}]+\}/g,key=>variables[key]||'');
 const missing=Object.entries(variables).filter(([,v])=>!v).map(([k])=>k.slice(2,-1));if(!to)missing.push('고객 휴대폰 번호');if([...text].length>1000)missing.push('메시지 길이 1,000자 이내');
 return {kind:'customer_completion',to,variables,text,missing,hasAmount,contentHash:digest({to,variables})};
}
export function completionConfig(hasAmount,env=process.env){return {...solapiConfig('customer_schedule',env),templateId:(hasAmount?env.SOLAPI_TEMPLATE_CUSTOMER_COMPLETION_AMOUNT:env.SOLAPI_TEMPLATE_CUSTOMER_COMPLETION_ACCOUNT)?.trim()};}
export async function completionContext(db,companyId,siteId){
 const [site,company,defaults,reports]=await Promise.all([
 db.from('sites').select('*').eq('id',siteId).eq('company_id',companyId).maybeSingle(),
 db.from('companies').select('id,company_name,phone,is_active').eq('id',companyId).maybeSingle(),
 db.from('company_estimate_defaults').select('bank_account').eq('company_id',companyId).maybeSingle(),
 db.from('work_reports').select('review_status,completed_at').eq('company_id',companyId).eq('site_id',siteId),
 ]);for(const r of [site,company,defaults,reports])if(r.error)throw r.error;
 if(!site.data||!company.data?.is_active)throw Error('현장 또는 업체를 확인할 수 없습니다.');
 const reasons=[];if(['consulting','cancelled','canceled'].includes(site.data.status))reasons.push('시공 완료 대상 현장이 아닙니다.');
 if(!reports.data?.length||reports.data.some(r=>r.review_status!=='approved'))reasons.push('완료보고서 검수를 모두 승인한 후 발송할 수 있습니다.');
 const lastDate=workDates(site.data).at(-1);if(lastDate&&lastDate>koreanToday())reasons.push('마지막 시공일 이후 발송할 수 있습니다.');
 const completed=reports.data?.map(r=>r.completed_at ? new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(r.completed_at)) : null).filter(Boolean).sort().at(-1)||lastDate||koreanToday();
 const c=await alimtalkCompany(db,company.data),message=completionMessage(site.data,c,defaults.data?.bank_account,completed);
 return {site:site.data,company:c,message,config:completionConfig(message.hasAmount),reasons:[...reasons,...message.missing.map(x=>x+' 확인 필요')]};
}
export async function notifyCustomerCompletion(db,companyId,siteId,actorId){return notifyCustomerStage(db,companyId,siteId,actorId,'complete');}
