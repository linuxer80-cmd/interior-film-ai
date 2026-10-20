import { resolveWorkerSite } from './workerSiteAccess.mjs';
const deny=()=>Object.assign(Error('본인 업체의 활성 관리자 또는 배정된 시공자만 이용할 수 있습니다.'),{status:403});
export async function resolveTeamSite(db,userId,siteId){
 if(typeof siteId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(siteId))throw deny();
 const p=await db.from('profiles').select('id,role,company_id,is_active').eq('id',userId).maybeSingle();
 if(p.error)throw p.error;
 if(p.data?.is_active===false)throw deny();
 if(p.data?.role==='owner'&&p.data.company_id){
  const s=await db.from('sites').select('id,company_id,site_name,status,work_dates,schedule_start,schedule_end').eq('id',siteId).eq('company_id',p.data.company_id).maybeSingle();
  if(s.error)throw s.error;
  if(s.data){
   const c=await db.from('companies').select('id,is_active').eq('id',p.data.company_id).maybeSingle();
   if(c.error)throw c.error;if(!c.data||c.data.is_active===false)throw deny();
   return {site:s.data,ownerAccess:true};
  }
 }
 const result=await resolveWorkerSite(db,userId,siteId);
 return {...result,ownerAccess:false};
}

