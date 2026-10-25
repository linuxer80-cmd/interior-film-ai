import {phoneNumber,digest,solapiConfig,approvedTemplate,dispatchSiteMessage} from './siteAlimtalk.mjs';
export function buildWorkerChangeMessage(event,site,company,worker) {
 const canceled=event.kind==='worker_canceled',to=phoneNumber(worker.phone);
 const variables={'#{업체명}':String(company.company_name||'').trim(),'#{시공자명}':String(worker.name||'').trim(),'#{현장명}':String(site.site_name||'').trim()};
 const v=name=>variables[`#{${name}}`]||'';
 if(canceled)variables['#{취소시공일}']=(event.removed_dates||[]).join(', ');
 else {variables['#{변경전시공일}']=(event.old_dates||[]).join(', ');variables['#{변경후시공일}']=(event.new_dates||[]).join(', ');variables['#{현장주소}']=[site.address,site.address_detail].filter(Boolean).join(' ').trim();variables['#{현장ID}']=site.id;}
 const text=canceled?`[필름장이 현장 배정 취소 안내]

${v('시공자명')}님, ${v('업체명')}에서 배정한 아래 현장의 배정이 취소되었습니다.

■ 현장명: ${v('현장명')}
■ 취소된 시공일: ${v('취소시공일')}

해당 일정에는 위 현장에 출근하지 않으셔도 됩니다. 다른 날짜에 배정된 일정은 유지됩니다.

본 메시지는 현장 취소 또는 시공자 배정 해제에 따라 발송되는 안내입니다.`:
 `[필름장이 시공 일정 변경 안내]

${v('시공자명')}님, ${v('업체명')}에서 배정한 현장의 시공 일정이 변경되었습니다.

■ 현장명: ${v('현장명')}
■ 변경 전 시공일: ${v('변경전시공일')}
■ 변경 후 시공일: ${v('변경후시공일')}
■ 현장주소: ${v('현장주소')}

변경된 일정과 작업 내용을 확인해 주세요.

본 메시지는 배정된 현장의 시공 일정 변경에 따라 발송되는 안내입니다.`;
 const missing=Object.entries(variables).filter(([,value])=>!value).map(([key])=>key.slice(2,-1));if(!to)missing.push('시공자 휴대폰 번호');if([...text].length>1000)missing.push('메시지 길이 1,000자 이내');
 return {kind:event.kind,to,variables,text,missing,contentHash:digest({kind:event.kind,to,variables})};
}
export async function processWorkerChangeAlerts(db,{companyId=null,siteId=null,fetcher=fetch}={}) {
 const counts={requested:0,blocked:0,unknown:0,rejected:0},approvals=new Map();
 let expiry=db.from('worker_assignment_alerts').update({status:'expired'}).eq('status','pending').lte('expires_at',new Date().toISOString());
 if(companyId)expiry=expiry.eq('company_id',companyId);if(siteId)expiry=expiry.eq('site_id',siteId);const expired=await expiry;if(expired.error)throw expired.error;
 const deadline=Date.now()+240000;let cursor=null;
 for(;;){
 let query=db.from('worker_assignment_alerts').select('*').eq('status','pending').gt('expires_at',new Date().toISOString()).order('id').limit(100);
 if(companyId)query=query.eq('company_id',companyId);if(siteId)query=query.eq('site_id',siteId);
 if(cursor)query=query.gt('id',cursor);
 const events=await query;if(events.error)throw events.error;
 if(!events.data.length)break;
 for(const event of events.data){
  if(Date.now()>deadline)return {...counts,deferred:true};
  const config=solapiConfig(event.kind);
  if(!approvals.has(event.kind))approvals.set(event.kind,await approvedTemplate(config,fetcher));
  const approval=approvals.get(event.kind);if(!approval.ready){counts.blocked++;continue;}
  const [site,company,worker]=await Promise.all([
   db.from('sites').select('id,site_name,address,address_detail,status').eq('id',event.site_id).eq('company_id',event.company_id).maybeSingle(),
   db.from('companies').select('id,company_name,is_active').eq('id',event.company_id).maybeSingle(),
   db.from('workers').select('id,name,phone,is_active').eq('id',event.worker_id).eq('company_id',event.company_id).maybeSingle(),
  ]);
  if(site.error||company.error||worker.error)throw site.error||company.error||worker.error;
  if(!site.data||!company.data?.is_active||!worker.data?.is_active){counts.blocked++;continue;}
  const message=buildWorkerChangeMessage(event,site.data,company.data,worker.data);
  const result=await dispatchSiteMessage({db,site:site.data,company:company.data,message,workerId:event.worker_id,changeEventId:event.id,config,approval,fetcher});
  counts[result.status]=(counts[result.status]||0)+1;
  if(result.id){const saved=await db.from('worker_assignment_alerts').update({status:result.status}).eq('id',event.id).eq('status','reserved');if(saved.error)throw saved.error;}
 }
 cursor=events.data.at(-1).id;
 }
 return counts;
}
export async function notifyWorkerChangeAlerts(db,companyId,siteId,actorId) {
 try {
  const counts=await processWorkerChangeAlerts(db,{companyId,siteId});
  if(!counts.blocked)return;
  const saved=await db.from('notifications').insert({company_id:companyId,recipient_type:'company_admin',recipient_user_id:actorId,type:'site_assignment',priority:'warning',title:'시공자 변경 알림톡 확인 필요',message:'변경은 저장됐지만 일부 알림톡이 발송되지 않았습니다. 템플릿 승인·연락처·알림톡 사용 설정을 확인해주세요.',link:'/admin?tab=sites&site='+siteId,reference_type:'site_assignment',reference_id:siteId,is_read:false,push_sent:false});
  if(saved.error)throw saved.error;
 }catch(error){console.error('시공자 변경 알림톡 오류',error.code||'request_failed');}
}
