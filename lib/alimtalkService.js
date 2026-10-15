import { configuration, EVENT_KEYS, normalizePhone, bootpayRequest } from './bootpayAlimtalk.mjs';
export async function settleDelivery(db, id, status, receipt = null, code = null) {
  const r = await db.rpc('settle_alimtalk', {p_id:id,p_status:status,p_receipt:receipt,p_error:code});
  if(r.error) throw new Error('발송 결과 저장 실패');
  return r.data;
}
export async function sendDelivery(db, { id, companyId, notificationId=null, kind, phone, variables }, env=process.env) {
  const config=configuration(env), template=env[`BOOTPAY_ALIMTALK_TEMPLATE_${kind}`];
  if(!config.ready || !template) return {accepted:false,reason:'not_configured'};
  const to=normalizePhone(phone);
  if(!to) return {accepted:false,reason:'invalid_phone'};
  const reserved=await db.rpc('reserve_alimtalk',{p_id:id,p_company:companyId,p_notification:notificationId,p_kind:kind,p_mask:`${to.slice(0,3)}-****-${to.slice(-4)}`,p_template:template});
  if(reserved.error) throw new Error('발송 건수 확보 실패');
  if(!reserved.data?.accepted) return reserved.data;
  let result;
  try {
    result=await bootpayRequest('/alimtalk/send',{
      template_code:template,to,ref_id:id,sender_key:env.BOOTPAY_ALIMTALK_SENDER_KEY,
      webhook_url:'https://interior-film-ai.vercel.app/api/bootpay/alimtalk-webhook',variables,
    },{env});
  } catch(error) {
    await settleDelivery(db,id,error.rejected?'rejected':'unknown',null,error.providerCode || 'REQUEST_UNCERTAIN');
    return {accepted:true,status:error.rejected?'rejected':'unknown'};
  }
  await settleDelivery(db,id,result.status,result.receipt_id);
  return {accepted:true,status:result.status};
}
// Only authoritative DB rows can supply a recipient. Never trust webhook payload phone/content.
export async function dispatchNotificationAlimtalk(db, notificationId) {
  if(!configuration().ready || !notificationId) return;
  const {data:n,error}=await db.from('notifications').select('*').eq('id',notificationId).maybeSingle();
  if(error) throw new Error('알림 조회 실패');
  if(!n || n.recipient_type!=='worker' || !EVENT_KEYS[n.type] || !n.company_id) return;
  // Old notifications must not be replayed as newly billable messages.
  if(Date.now()-new Date(n.created_at).getTime()>15*60*1000) return;
  const [{data:worker,error:we},{data:company,error:ce}]=await Promise.all([
    db.from('workers').select('name,phone,user_id').eq('id',n.recipient_worker_id).eq('company_id',n.company_id).eq('is_active',true).maybeSingle(),
    db.from('companies').select('company_name').eq('id',n.company_id).eq('is_active',true).maybeSingle(),
  ]);
  if(we || ce) throw new Error('알림 수신자 조회 실패');
  if(!worker || !company || (n.recipient_user_id && worker.user_id!==n.recipient_user_id)) return;
  let siteName='현장';
  if(['site','sites','site_assignment','site_schedule','site_status'].includes(n.reference_type) && /^[0-9a-f-]{36}$/i.test(n.reference_id || '')) {
    const {data:site}=await db.from('sites').select('site_name').eq('id',n.reference_id).eq('company_id',n.company_id).maybeSingle();
    if(site?.site_name) siteName=site.site_name;
  }
  const path=typeof n.link==='string' && n.link.startsWith('/') && !n.link.startsWith('//') && !/[\\\r\n]/.test(n.link)? n.link:'/worker';
  await sendDelivery(db,{id:n.id,companyId:n.company_id,notificationId:n.id,kind:EVENT_KEYS[n.type],phone:worker.phone,
    variables:{company_name:company.company_name,user_name:worker.name || '시공자',site_name:siteName,notification_title:n.title || '현장 안내',notification_message:n.message || '현장 정보를 확인해주세요.',detail_url:`https://interior-film-ai.vercel.app${path}`},
  });
}
