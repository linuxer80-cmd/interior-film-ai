import { createHash, createHmac, randomBytes } from 'node:crypto';

export const ALIMTALK_STATUS = {reserved:'접수 확인 중',requested:'발송 요청됨',unknown:'결과 확인 필요',success:'발송 완료',failed:'발송 실패',rejected:'접수 거절',canceled:'발송 취소'};
export function phoneNumber(value) {
  let number=String(value||'').trim().replace(/[\s()-]/g,'');
  if(number.startsWith('+82'))number='0'+number.slice(3);
  return /^01[016789]\d{7,8}$/.test(number)?number:'';
}
export const maskPhone = phone => phone ? phone.slice(0,3)+'-****-'+phone.slice(-4) : '';
export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function deliveryId(value) {
  const h=digest(value).slice(0,32);
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
function day(value) {
  if(!value)return '';
  const d=new Date(/^\d{4}-\d{2}-\d{2}$/.test(value)?value+'T00:00:00Z':value);
  if(!Number.isFinite(d.getTime()))return '';
  return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
}
export function workDates(site) {
  if(Array.isArray(site.work_dates))return [...new Set(site.work_dates.filter(v=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&day(v)===v))].sort();
  const first=day(site.schedule_start||site.schedule_date),last=day(site.schedule_end)||first;
  if(!first||last<first)return [];
  const result=[],d=new Date(first+'T00:00:00Z');
  while(result.length<366&&d.toISOString().slice(0,10)<=last){result.push(d.toISOString().slice(0,10));d.setUTCDate(d.getUTCDate()+1);}
  return result;
}
export function buildSiteMessage(site,company,{worker=null,dates=null}={}) {
  const kind=worker?'site_assigned':'customer_schedule';
  const to=phoneNumber(worker?worker.phone:site.customer_phone);
  const selected=dates||workDates(site);
  const variables={
    '#{업체명}':String(company.company_name||'').trim(),
    '#{현장명}':String(site.site_name||'').trim(),
    '#{시공일}':selected.join(', '),
    '#{현장주소}':[site.address,site.address_detail].filter(Boolean).join(' ').trim(),
    [worker?'#{시공자명}':'#{고객명}']:String(worker?worker.name:site.customer_name||'').trim(),
  };
  if(worker)variables['#{현장ID}']=site.id;
  else variables['#{업체전화번호}']=String(company.phone||'').trim();
  const missing=[];
  if(!to)missing.push(worker?'시공자 휴대폰 번호':'고객 휴대폰 번호');
  for(const [key,value] of Object.entries(variables))if(!value)missing.push(key.slice(2,-1));
  if(['cancelled','canceled','completed'].includes(site.status))missing.push('시공 예정 또는 시공 중인 현장');
  const v=name=>variables[`#{${name}}`]||'';
  const text=worker?`[필름장이 현장 배정 안내]\n\n${v('시공자명')}님, ${v('업체명')}에서 시공 현장을 배정했습니다.\n\n■ 현장명: ${v('현장명')}\n■ 시공일: ${v('시공일')}\n■ 현장주소: ${v('현장주소')}\n\n아래 ‘배정 현장 확인’ 버튼을 눌러 상세 일정과 작업 내용을 확인해 주세요.\n\n이 메시지는 소속 또는 협력 업체의 현장 배정에 따라 발송되는 안내입니다.`:
    `[${v('업체명')} 시공 일정 안내]\n\n${v('고객명')}님, 상담하신 인테리어필름 시공 일정이 확정되어 안내드립니다.\n\n■ 현장명: ${v('현장명')}\n■ 시공일: ${v('시공일')}\n■ 현장주소: ${v('현장주소')}\n\n일정 변경이나 문의사항은 아래 연락처로 연락해 주세요.\n\n■ 업체 연락처: ${v('업체전화번호')}\n\n본 메시지는 고객님이 요청하신 시공 서비스의 일정 안내입니다.`;
  if([...text].length>1000)missing.push('메시지 길이 1,000자 이내');
  return {kind,to,variables,text,missing,contentHash:digest({kind,to,variables})};
}
export function solapiConfig(kind,env=process.env) {
  return {apiKey:env.SOLAPI_API_KEY,secret:env.SOLAPI_API_SECRET,pfId:env.SOLAPI_KAKAO_PF_ID,
    templateId:kind==='worker_schedule_changed'?env.SOLAPI_TEMPLATE_WORKER_SCHEDULE_CHANGED:kind==='worker_canceled'?env.SOLAPI_TEMPLATE_WORKER_CANCELED:['site_assigned','worker_reminder'].includes(kind)?env.SOLAPI_TEMPLATE_SITE_ASSIGNED:env.SOLAPI_TEMPLATE_CUSTOMER_SCHEDULE};
}
export function authHeader(config,date=new Date().toISOString(),salt=randomBytes(16).toString('hex')) {
  const signature=createHmac('sha256',config.secret).update(date+salt).digest('hex');
  return `HMAC-SHA256 apiKey=${config.apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
}
export async function solapiRequest(path,{config,body,fetcher=fetch}={}) {
  const response=await fetcher('https://api.solapi.com'+path,{method:body?'POST':'GET',headers:{Authorization:authHeader(config),'Content-Type':'application/json'},
    ...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',signal:AbortSignal.timeout(12000)});
  const data=await response.json();
  return {ok:response.ok,status:response.status,data};
}
export async function approvedTemplate(config,fetcher=fetch) {
  if(!config.apiKey||!config.secret||!config.pfId||!config.templateId)return {ready:false,reason:'알림톡 서버 설정이 필요합니다.'};
  try {
    const result=await solapiRequest('/kakao/v2/templates/sendable?'+new URLSearchParams({channelId:config.pfId,templateId:config.templateId}),{config,fetcher});
    const template=Array.isArray(result.data)?result.data.find(t=>t.templateId===config.templateId&&t.channelId===config.pfId&&t.status==='APPROVED'):null;
    return template?{ready:true,template}:{ready:false,reason:result.ok?'템플릿 승인 또는 채널 상태를 확인해주세요.':'솔라피 API 인증과 이용 상태를 확인해주세요.'};
  }catch{return {ready:false,reason:'템플릿 승인 상태를 확인하지 못했습니다. 잠시 후 다시 확인해주세요.'};}
}
export function templateMatches(template,message) {
  const replace=text=>String(text||'').replace(/#\{[^}]+\}/g,key=>message.variables[key]??key).replace(/\r\n/g,'\n').trim();
  return replace(template.content)===message.text.trim()&&!template.extra&&!template.ad;
}
export function providerResult(result) {
  const item=result.data?.messageList?.[0];
  const failed=result.data?.failedMessageList?.[0];
  if(result.ok&&item?.messageId&&String(item.statusCode)==='2000')return {status:'requested',receipt:item.messageId};
  if(result.ok&&failed&&!item)return {status:'rejected',code:String(failed.statusCode||'provider_rejected')};
  // A timeout, malformed response or server error may have accepted a message.
  if(!result.ok&&result.status>=400&&result.status<500&&result.status!==408)return {status:'rejected',code:String(result.data?.errorCode||'provider_rejected').slice(0,80)};
  return {status:'unknown',receipt:item?.messageId||null,code:'provider_result_unknown'};
}
export async function settle(db,id,status,receipt=null,code=null) {
  const result=await db.rpc('settle_alimtalk',{p_id:id,p_status:status,p_receipt:receipt,p_error:code});
  if(result.error)throw result.error;
}
export async function dispatchSiteMessage({db,site,company,message,actorId,workerId=null,expectedLatest=null,resend=false,operationId=null,config=solapiConfig(message.kind),fetcher=fetch,approval:cachedApproval=null,reminderDate=null,changeEventId=null}) {
  if(message.missing.length)return {status:'blocked',reason:'누락 정보: '+message.missing.join(', ')};
  const approval=cachedApproval||await approvedTemplate(config,fetcher);
  if(!approval.ready)return {status:'blocked',reason:approval.reason};
  if(!templateMatches(approval.template,message))return {status:'blocked',reason:'등록된 템플릿 내용이 다릅니다. 솔라피 템플릿을 확인해주세요.'};
  const workerReminder=message.kind==='worker_reminder'&&reminderDate&&workerId;
  const id=changeEventId?deliveryId(['worker_change_event',changeEventId]):workerReminder?deliveryId([company.id,site.id,workerId,'worker_reminder',reminderDate]):reminderDate?deliveryId([company.id,site.id,'customer_reminder',reminderDate]):deliveryId([company.id,site.id,workerId,message.contentHash,resend?operationId:'initial']);
  const reserved=changeEventId?await db.rpc('reserve_worker_change_alert',{p_event:changeEventId,p_id:id,p_mask:maskPhone(message.to),p_template:config.templateId,p_hash:message.contentHash}):workerReminder?await db.rpc('reserve_worker_reminder',{p_id:id,p_company:company.id,p_site:site.id,p_worker:workerId,p_work_date:reminderDate,p_mask:maskPhone(message.to),p_template:config.templateId,p_hash:message.contentHash}):reminderDate?await db.rpc('reserve_customer_reminder',{p_id:id,p_company:company.id,p_site:site.id,p_work_date:reminderDate,p_mask:maskPhone(message.to),p_template:config.templateId,p_hash:message.contentHash}):await db.rpc('reserve_site_alimtalk',{p_id:id,p_company:company.id,p_site:site.id,p_actor:actorId,p_worker:workerId,p_kind:message.kind,
    p_mask:maskPhone(message.to),p_template:config.templateId,p_hash:message.contentHash,p_expected:expectedLatest,p_resend:resend});
  if(reserved.error)throw reserved.error;
  if(!reserved.data?.accepted)return {status:'blocked',reason:({duplicate:'이미 발송 요청한 내용입니다.',stale:'새 발송 이력이 있습니다. 다시 확인해주세요.',pending:'기존 발송 결과를 확인한 후 재발송해주세요.',disabled:'업체 알림톡 사용 설정이 꺼져 있습니다.',insufficient:'알림톡 잔여 횟수가 부족합니다.',inactive:'업체 상태를 확인해주세요.'})[reserved.data?.reason]||'발송 정보를 다시 확인해주세요.'};
  let outcome;
  try {
    outcome=providerResult(await solapiRequest('/messages/v4/send-many/detail',{config,fetcher,body:{messages:[{to:message.to,type:'ATA',country:'82',
      customFields:{deliveryId:id},kakaoOptions:{pfId:config.pfId,templateId:config.templateId,variables:message.variables,disableSms:true}}],allowDuplicates:false,showMessageList:true}}));
  }catch{outcome={status:'unknown',code:'provider_result_unknown'};}
  await settle(db,id,outcome.status,outcome.receipt||null,outcome.code||null);
  return {id,status:outcome.status,reason:outcome.status==='requested'?'알림톡 발송을 요청했습니다.':outcome.status==='rejected'?'발송이 거절되어 1회가 복구되었습니다.':'접수 여부를 확인 중입니다. 중복 발송하지 말고 결과를 확인해주세요.'};
}
export async function refreshDeliveries(db,rows,config=solapiConfig('customer_schedule'),fetcher=fetch) {
  const pending=rows.filter(r=>r.accounting==='reserved'&&r.receipt_id);
  if(!pending.length||!config.apiKey||!config.secret)return;
  const result=await solapiRequest('/messages/v4/list?'+new URLSearchParams({messageIds:JSON.stringify(pending.map(r=>r.receipt_id)),limit:'100'}),{config,fetcher});
  if(!result.ok)return;
  for(const row of pending){
    const item=result.data?.messageList?.[row.receipt_id];
    if(item?.status==='COMPLETE'&&item.type==='ATA')await settle(db,row.id,String(item.statusCode)==='4000'?'success':'failed',row.receipt_id,String(item.statusCode||'provider_failed'));
  }
}
