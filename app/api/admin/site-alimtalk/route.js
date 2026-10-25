import {alimtalkCompany} from '../../../../lib/alimtalkCompany.mjs';
import {isOperatorCompany} from '../../../../lib/operatorCompany.mjs';
import { privateAuth, privateJson as json, uuid } from '../../../../lib/workerPrivate';
import { approvedTemplate,buildSiteMessage,dispatchSiteMessage,refreshDeliveries,solapiConfig,templateMatches } from '../../../../lib/siteAlimtalk.mjs';
export const runtime='nodejs';
export const maxDuration=60;

async function context(request,siteId){
  const auth=await privateAuth(request);
  if(auth.error)throw Object.assign(Error(auth.error),{status:auth.status});
  if(!uuid(siteId))throw Object.assign(Error('현장을 확인해주세요.'),{status:400});
  const [site,company]=await Promise.all([
    auth.db.from('sites').select('id,company_id,site_name,customer_name,customer_phone,address,address_detail,status,work_dates,schedule_start,schedule_end,schedule_date').eq('id',siteId).eq('company_id',auth.companyId).maybeSingle(),
    auth.db.from('companies').select('id,company_name,phone').eq('id',auth.companyId).single(),
  ]);
  if(site.error||company.error)throw site.error||company.error;
  if(!site.data)throw Object.assign(Error('현장을 찾을 수 없습니다.'),{status:404});
  return {...auth,site:site.data,company:await alimtalkCompany(auth.db,company.data)};
}
async function history(db,companyId,siteId){
  const result=await db.from('alimtalk_deliveries').select('id,kind,recipient_mask,status,accounting,credit_exempt,error_code,created_at,receipt_id,content_hash')
    .eq('company_id',companyId).eq('site_id',siteId).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(20);
  if(result.error)throw result.error;return result.data||[];
}
function fail(error){
  console.error('현장 알림톡 오류',error.code||error.status||'request_failed');
  return json({error:error.status?error.message:'알림톡 정보를 처리하지 못했습니다. 잠시 후 다시 확인해주세요.'},error.status||503);
}
export async function GET(request){
  try{
    const auth=await context(request,new URL(request.url).searchParams.get('siteId'));
    const {db,site,company,companyId}=auth;
    let rows=await history(db,companyId,site.id);
    let syncWarning=null;
    try{await refreshDeliveries(db,rows);}catch{syncWarning='발송 결과 갱신이 지연됩니다.';}
    rows=await history(db,companyId,site.id);
    const account=await db.from('alimtalk_accounts').select('enabled,available_count').eq('company_id',companyId).maybeSingle();
    if(account.error)throw account.error;
    const message=buildSiteMessage(site,company);
    const approval=await approvedTemplate(solapiConfig(message.kind));
    const matching=approval.ready&&templateMatches(approval.template,message);
    const reasons=[...message.missing.map(item=>item+' 확인 필요')];
    if(!approval.ready)reasons.push(approval.reason);
    else if(!matching)reasons.push('솔라피 템플릿 내용과 앱 안내문이 다릅니다.');
    if(!account.data?.enabled)reasons.push('업체 알림톡 사용 설정이 필요합니다.');
    if(!isOperatorCompany(companyId)&&!(account.data?.available_count>0))reasons.push('알림톡 충전이 필요합니다.');
    const latest=rows.find(row=>row.kind==='customer_schedule')||null;
    if(latest&&['reserved','requested','unknown'].includes(latest.status))reasons.push('기존 고객 알림톡의 처리 결과를 확인해주세요.');
    return json({to:message.to,customerName:site.customer_name,text:message.text,contentHash:message.contentHash,
      unlimited:isOperatorCompany(companyId),availableCount:account.data?.available_count||0,enabled:account.data?.enabled===true,ready:reasons.length===0,reasons,
      latestId:latest?.id||null,history:rows.map(({receipt_id,content_hash,...row})=>row),syncWarning});
  }catch(error){return fail(error);}
}
export async function POST(request){
  try{
    let body;try{body=await request.json();}catch{throw Object.assign(Error('발송 요청을 확인해주세요.'),{status:400});}
    if(!uuid(body.operationId)||typeof body.contentHash!=='string'||!/^[a-f0-9]{64}$/.test(body.contentHash)||
      (body.latestId!==null&&!uuid(body.latestId)))throw Object.assign(Error('발송 내용을 다시 확인해주세요.'),{status:400});
    const auth=await context(request,body.siteId),{db,site,company,user}=auth;
    const message=buildSiteMessage(site,company);
    if(message.contentHash!==body.contentHash)throw Object.assign(Error('고객 정보 또는 일정이 변경되었습니다. 새 미리보기를 확인해주세요.'),{status:409});
    if(body.latestId&&body.confirmResend!==true)throw Object.assign(Error('기존 발송 이력을 확인하고 재발송에 체크해주세요.'),{status:409});
    const result=await dispatchSiteMessage({db,site,company,message,actorId:user.id,expectedLatest:body.latestId,resend:Boolean(body.latestId),operationId:body.operationId});
    return json(result,result.status==='blocked'?409:200);
  }catch(error){return fail(error);}
}
