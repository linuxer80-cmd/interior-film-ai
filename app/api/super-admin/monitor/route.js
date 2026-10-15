import { privateAuth, uuid } from '../../../../lib/workerPrivate';
import { summarizeOperations, scheduleConflicts } from '../../../../lib/superMonitor.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store',Vary:'Authorization'}});
const fields={
 sites:'id,company_id,site_name,status,work_dates,schedule_date,schedule_start,schedule_end,created_at,updated_at',
 workers:'id,company_id,user_id,name,is_active,created_at',
 daily:'id,company_id,site_id,worker_id,work_date,role',
 legacy:'id,company_id,site_id,worker_id,role',
 reports:'id,company_id,site_id,review_status,completed_at,created_at,updated_at',
};
async function all(query) {
 const rows=[];
 for(let offset=0;offset<20000;offset+=500){
  const {data,error}=await query.range(offset,offset+499);
  if(error)throw error;
  rows.push(...(data||[]));
  if(!data||data.length<500)return rows;
 }
 throw Object.assign(Error('조회 자료가 많아 전체 집계를 완료하지 못했습니다. 운영자에게 조회 범위 조정을 요청해주세요.'),{status:422});
}
async function loadGroup(db,company,workerRows=null){
 const query=(table,columns)=>db.from(table).select(columns).eq('company_id',company.id).order('id');
 if(workerRows){
  const workerIds=workerRows.map(w=>w.id);
  const ownDaily=[],legacy=[];
  for(let i=0;i<workerIds.length;i+=100){
   const batch=workerIds.slice(i,i+100);
   const rows=await Promise.all([all(query('site_daily_assignments',fields.daily).in('worker_id',batch)),all(query('site_workers',fields.legacy).in('worker_id',batch))]);
   ownDaily.push(...rows[0]);legacy.push(...rows[1]);
  }
  const siteIds=[...new Set([...ownDaily,...legacy].map(r=>r.site_id))];
  const sites=[],reports=[],daily=[];
  for(let i=0;i<siteIds.length;i+=100){
   const ids=siteIds.slice(i,i+100);
   const rows=await Promise.all([all(query('sites',fields.sites).in('id',ids)),all(query('work_reports',fields.reports).in('site_id',ids)),all(query('site_daily_assignments',fields.daily).in('site_id',ids))]);
   sites.push(...rows[0]);reports.push(...rows[1]);daily.push(...rows[2]);
  }
  return {company,workers:workerRows,sites,reports,daily,legacy};
 }
 const [sites,workers,daily,legacy,reports]=await Promise.all([
  all(query('sites',fields.sites)),all(query('workers',fields.workers)),all(query('site_daily_assignments',fields.daily)),all(query('site_workers',fields.legacy)),all(query('work_reports',fields.reports)),
 ]);
 return {company,sites,workers,daily,legacy,reports};
}
export async function GET(request){
 try{
  const auth=await privateAuth(request,false);
  if(auth.error)return json({error:auth.error},auth.status);
  const {db,user}=auth;
  const allowed=await db.from('super_admins').select('user_id').eq('user_id',user.id).eq('is_active',true).maybeSingle();
  if(allowed.error)throw allowed.error;
  if(!allowed.data)return json({error:'슈퍼관리자만 운영 현황을 조회할 수 있습니다.'},403);
  const params=new URL(request.url).searchParams;
  const type=params.get('type'),id=params.get('id'),days=Number(params.get('days')||30);
  if(!['company','account','unlinked'].includes(type)||!uuid(id)||![30,90,180].includes(days))return json({error:'조회 대상과 기간을 확인해주세요.'},400);
  const now=new Date(),groups=[];
  let memberships=[];
  if(type==='company'){
   const result=await db.from('companies').select('id,company_name,is_active').eq('id',id).maybeSingle();
   if(result.error)throw result.error;
   if(!result.data)return json({error:'업체를 찾을 수 없습니다.'},404);
   const raw=await loadGroup(db,result.data);
   memberships=raw.workers;
   groups.push(summarizeOperations(raw,{days,now}));
  }else{
   let q=db.from('workers').select(fields.workers).order('id');
   q=type==='account'?q.eq('user_id',id):q.eq('id',id).is('user_id',null);
   memberships=await all(q);
   if(type==='unlinked'&&!memberships.length)return json({error:'미연결 명단이 없거나 계정에 연결되었습니다. 목록을 새로고침해주세요.'},404);
   const companyIds=[...new Set(memberships.map(w=>w.company_id).filter(Boolean))];
   for(let i=0;i<companyIds.length;i+=100){
    const companies=await all(db.from('companies').select('id,company_name,is_active').in('id',companyIds.slice(i,i+100)).order('id'));
    for(const company of companies){
     const own=memberships.filter(w=>w.company_id===company.id);
     groups.push(summarizeOperations(await loadGroup(db,company,own),{days,now,workerIds:own.map(w=>w.id)}));
    }
   }
  }
  const summary={};
  for(const g of groups)for(const [key,value] of Object.entries(g.summary)) summary[key]=(summary[key]||0)+value;
  summary.pastAssignmentDays=new Set(groups.flatMap(g=>g.pastDays)).size;
  summary.pastLeaderDays=new Set(groups.flatMap(g=>g.leaderDays)).size;
  summary.upcomingDays=new Set(groups.flatMap(g=>g.upcoming.map(r=>r.date))).size;
  const conflicts=scheduleConflicts(groups);
  const sites=groups.flatMap(g=>g.sites).sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))||a.id.localeCompare(b.id));
  const upcoming=groups.flatMap(g=>g.upcoming).sort((a,b)=>a.date.localeCompare(b.date)||a.key.localeCompare(b.key));
  return json({type,id,days,generatedAt:now.toISOString(),period:groups[0]?.period||null,summary,companies:groups.map(g=>g.company),memberships,sites,upcoming,conflicts});
 }catch(e){
  console.error('super-admin monitoring',e.code||e.status||'request failed');
  return json({error:e.status?e.message:'운영 현황을 조회하지 못했습니다. 조회 실패는 0건과 다릅니다. 잠시 후 다시 확인해주세요.'},e.status||503);
 }
}
