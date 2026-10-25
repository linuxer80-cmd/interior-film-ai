import {buildSiteMessage,dispatchSiteMessage} from './siteAlimtalk.mjs';

// Called only after a successful assignment transaction. One message per worker,
// containing that worker's current dates; role changes and removals use in-app notices.
export async function notifyAssignedWorkers({db,companyId,siteId,actorId,newRows}){
  if(!newRows.length)return null;
  const account=await db.from('alimtalk_accounts').select('enabled,available_count').eq('company_id',companyId).maybeSingle();
  if(account.error)throw account.error;
  if(!account.data?.enabled)return '시공자 알림톡은 업체 사용 설정 후 발송됩니다.';
  if(account.data.available_count<1)return '시공자 알림톡 잔여 횟수가 부족합니다.';
  const [site,company]=await Promise.all([
    db.from('sites').select('id,company_id,site_name,address,address_detail,status').eq('id',siteId).eq('company_id',companyId).single(),
    db.from('companies').select('id,company_name,phone').eq('id',companyId).single(),
  ]);
  if(site.error||company.error)throw site.error||company.error;
  const ids=[...new Set(newRows.map(row=>row.worker_id))];
  const reasons=[];
  // Bound concurrency, provider rate and request lifetime. Larger saves still retain
  // all assignments and in-app notices, with an explicit warning for the remainder.
  for(const workerId of ids.slice(0,10)){
    const worker=await db.from('workers').select('id,name,phone,is_active').eq('id',workerId).eq('company_id',companyId).eq('is_active',true).maybeSingle();
    if(worker.error)throw worker.error;if(!worker.data)continue;
    const assigned=await db.from('site_daily_assignments').select('work_date').eq('company_id',companyId).eq('site_id',siteId).eq('worker_id',workerId).order('work_date');
    if(assigned.error)throw assigned.error;
    const dates=[...new Set((assigned.data||[]).map(row=>row.work_date))];
    if(!dates.length)continue;
    const message=buildSiteMessage(site.data,company.data,{worker:worker.data,dates});
    const result=await dispatchSiteMessage({db,site:site.data,company:company.data,message,actorId,workerId});
    if(result.status!=='requested')reasons.push(result.reason);
  }
  if(ids.length>10)reasons.push('10명을 초과한 추가 시공자는 앱 알림으로 안내했습니다.');
  return reasons.length?[...new Set(reasons)].join(' '):null;
}
