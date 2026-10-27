import {customerStageContext} from '../../../../lib/customerStageAlimtalk.mjs';
import {isOperatorCompany} from '../../../../lib/operatorCompany.mjs';
import { privateAuth, privateJson as json, uuid } from '../../../../lib/workerPrivate';
import { approvedTemplate,dispatchSiteMessage,refreshDeliveries,templateMatches,templateButtonMatches } from '../../../../lib/siteAlimtalk.mjs';
export const runtime='nodejs';
export const maxDuration=60;

async function context(request,siteId){
  const auth=await privateAuth(request);
  if(auth.error)throw Object.assign(Error(auth.error),{status:auth.status});
  if(!uuid(siteId))throw Object.assign(Error('현장을 확인해주세요.'),{status:400});
  return {...auth,...await customerStageContext(auth.db,auth.companyId,siteId,'before')};
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
    const {db,site,companyId,message,config}=auth;
    let rows=await history(db,companyId,site.id);
    let syncWarning=null;
    try{await refreshDeliveries(db,rows);}catch{syncWarning='발송 결과 갱신이 지연됩니다.';}
    rows=await history(db,companyId,site.id);
    const account=await db.from('alimtalk_accounts').select('enabled,available_count').eq('company_id',companyId).maybeSingle();
    if(account.error)throw account.error;
    const approval=await approvedTemplate(config);
    const matching=approval.ready&&templateMatches(approval.template,message)&&templateButtonMatches(approval.template,message);
    const reasons=[...message.missing];
    if(!approval.ready)reasons.push(approval.reason);
    else if(!matching)reasons.push('솔라피 템플릿 문구 또는 고객페이지 버튼 설정을 확인해주세요.');
    if(!account.data?.enabled)reasons.push('업체 알림톡 사용 설정이 필요합니다.');
    if(!isOperatorCompany(companyId)&&!(account.data?.available_count>0))reasons.push('알림톡 충전이 필요합니다.');
    const latest=rows.find(row=>row.kind==='customer_schedule')||null;
    if(latest&&['reserved','requested','unknown'].includes(latest.status))reasons.push('기존 고객 알림톡의 처리 결과를 확인해주세요.');
    const token=message.variables['#{고객페이지토큰}'];
    return json({to:message.to,customerName:site.customer_name||site.site_name,text:message.text,contentHash:message.contentHash,path:token?'/customer/site/'+token+'?stage=before':null,
      unlimited:isOperatorCompany(companyId),availableCount:account.data?.available_count||0,enabled:account.data?.enabled===true,ready:reasons.length===0,reasons,
      latestId:latest?.id||null,history:rows.map(({receipt_id,content_hash,...row})=>row),syncWarning});
  }catch(error){return fail(error);}
}
export async function POST(request){
  try{
    let body;try{body=await request.json();}catch{throw Object.assign(Error('발송 요청을 확인해주세요.'),{status:400});}
    if(!uuid(body.operationId)||typeof body.contentHash!=='string'||!/^[a-f0-9]{64}$/.test(body.contentHash)||
      (body.latestId!==null&&!uuid(body.latestId)))throw Object.assign(Error('발송 내용을 다시 확인해주세요.'),{status:400});
    const auth=await context(request,body.siteId),{db,site,company,user,message,config}=auth;
    if(message.contentHash!==body.contentHash)throw Object.assign(Error('고객 정보 또는 일정이 변경되었습니다. 새 미리보기를 확인해주세요.'),{status:409});
    if(body.latestId&&body.confirmResend!==true)throw Object.assign(Error('기존 발송 이력을 확인하고 재발송에 체크해주세요.'),{status:409});
    const result=await dispatchSiteMessage({db,site,company,message,config,actorId:user.id,expectedLatest:body.latestId,resend:Boolean(body.latestId),operationId:body.operationId});
    return json(result,result.status==='blocked'?409:200);
  }catch(error){return fail(error);}
}
