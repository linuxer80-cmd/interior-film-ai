import {alimtalkChargeAmount} from '../../../../lib/alimtalkPricing.mjs';
import {isOperatorCompany} from '../../../../lib/operatorCompany.mjs';
import {privateAuth,privateJson as json,uuid} from '../../../../lib/workerPrivate';
import {refreshDeliveries,settle,solapiConfig,solapiRequest} from '../../../../lib/siteAlimtalk.mjs';
export const runtime='nodejs';
export const maxDuration=60;
async function auth(request){
  const result=await privateAuth(request,false);
  if(result.error)throw Object.assign(Error(result.error),{status:result.status});
  const allowed=await result.db.from('super_admins').select('user_id').eq('user_id',result.user.id).eq('is_active',true).maybeSingle();
  if(allowed.error)throw allowed.error;
  if(!allowed.data)throw Object.assign(Error('슈퍼관리자 권한이 필요합니다.'),{status:403});
  return result;
}
function failure(error){console.error('알림톡 운영 설정 오류',error.code||error.status||'request_failed');return json({error:error.status?error.message:'알림톡 설정을 처리하지 못했습니다.'},error.status||503);}
export async function GET(request){
  try{
    const {db}=await auth(request);
    const companyId=new URL(request.url).searchParams.get('companyId');
    if(companyId&&!uuid(companyId))return json({error:'업체를 선택해주세요.'},400);
    const companies=await db.from('companies').select('id,company_name,is_active').order('company_name').limit(1000);
    if(companies.error)throw companies.error;
    if(!companyId)return json({companies:companies.data});
    let deliveries=await db.from('alimtalk_deliveries').select('id,site_id,kind,recipient_mask,status,accounting,credit_exempt,receipt_id,error_code,created_at').eq('company_id',companyId).order('created_at',{ascending:false}).limit(50);
    if(deliveries.error)throw deliveries.error;
    let syncWarning=null;
    try{await refreshDeliveries(db,deliveries.data);}catch{syncWarning='일부 발송 결과 갱신이 지연됩니다.';}
    const [account,entries,latest]=await Promise.all([
      db.from('alimtalk_accounts').select('enabled,available_count').eq('company_id',companyId).maybeSingle(),
      db.from('alimtalk_credit_entries').select('id,quantity,reason,created_at').eq('company_id',companyId).order('created_at',{ascending:false}).limit(20),
      db.from('alimtalk_deliveries').select('id,site_id,kind,recipient_mask,status,accounting,credit_exempt,receipt_id,error_code,created_at').eq('company_id',companyId).order('created_at',{ascending:false}).limit(50),
    ]);
    if(account.error||entries.error||latest.error)throw account.error||entries.error||latest.error;
    return json({companies:companies.data,account:{...(account.data||{enabled:false,available_count:0}),unlimited:isOperatorCompany(companyId)},entries:entries.data,deliveries:latest.data,syncWarning});
  }catch(error){return failure(error);}
}
export async function POST(request){
  try{
    const {db,user}=await auth(request);let body;
    try{body=await request.json();}catch{return json({error:'요청 형식을 확인해주세요.'},400);}
    if(!uuid(body.companyId))return json({error:'업체를 선택해주세요.'},400);
    const company=await db.from('companies').select('id,is_active').eq('id',body.companyId).maybeSingle();
    if(company.error)throw company.error;if(!company.data)return json({error:'업체를 찾을 수 없습니다.'},404);
    if(body.action==='enabled'&&typeof body.enabled==='boolean'){
      const result=await db.rpc('set_alimtalk_enabled',{p_company:body.companyId,p_actor:user.id,p_enabled:body.enabled});
      if(result.error)throw result.error;return json({success:true});
    }
    if(body.action==='grant'&&uuid(body.operationId)&&Number.isInteger(body.quantity)&&body.quantity>0&&body.quantity<=1000000&&typeof body.reason==='string'&&body.reason.trim().length>=3&&body.reason.length<=500){
      const amount=alimtalkChargeAmount(body.quantity);
      if(!['paid','grant'].includes(body.creditType)||body.creditType==='paid'&&body.paidAmount!==amount)return json({error:'충전 구분과 건당 30원 기준 입금액을 확인해주세요.'},400);
      const note=(body.creditType==='paid'?'입금 충전 '+amount+'원 / '+body.quantity+'건 · ':'별도 지급 · ')+body.reason.trim();
      if(note.length>500)return json({error:'지급 사유를 조금 줄여주세요.'},400);
      const result=await db.rpc('grant_alimtalk_credits',{p_id:body.operationId,p_company:body.companyId,p_quantity:body.quantity,p_reason:note,p_actor:user.id});
      if(result.error)throw result.error;return json({success:true,...result.data});
    }
    if(body.action==='reconcile'&&uuid(body.deliveryId)&&typeof body.receiptId==='string'&&/^M[A-Za-z0-9]{10,100}$/.test(body.receiptId)){
      const delivery=await db.from('alimtalk_deliveries').select('id,status,accounting').eq('id',body.deliveryId).eq('company_id',body.companyId).maybeSingle();
      if(delivery.error)throw delivery.error;if(!delivery.data)return json({error:'발송 이력을 찾을 수 없습니다.'},404);
      const config=solapiConfig('customer_schedule');
      const result=await solapiRequest('/messages/v4/list?'+new URLSearchParams({messageIds:JSON.stringify([body.receiptId])}),{config});
      const item=result.data?.messageList?.[body.receiptId];
      if(!result.ok||item?.customFields?.deliveryId!==body.deliveryId||item.type!=='ATA')return json({error:'해당 발송 요청과 일치하는 솔라피 메시지가 아닙니다.'},409);
      await settle(db,body.deliveryId,item.status==='COMPLETE'?(String(item.statusCode)==='4000'?'success':'failed'):'requested',body.receiptId,String(item.statusCode||''));
      return json({success:true});
    }
    return json({error:'요청 내용을 확인해주세요.'},400);
  }catch(error){return failure(error);}
}
