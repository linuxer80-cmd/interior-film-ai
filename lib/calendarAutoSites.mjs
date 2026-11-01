import { rows, companySites, siteFields, localDay } from './workerSiteAssignments.mjs';
import { assignedDays } from './googleCalendar.mjs';

// An active owner can export their own company's schedules. Other companies
// remain limited to the user's active worker assignments.
export async function calendarSites(db,userId,from,to) {
  const [profile,linked]=await Promise.all([
    db.from('profiles').select('role,company_id,is_active').eq('id',userId).maybeSingle(),
    rows(db.from('workers').select('id,company_id').eq('user_id',userId).eq('is_active',true).order('id')),
  ]);
  if(profile.error)throw profile.error;
  if(profile.data?.is_active===false)return [];
  const ownerCompany=profile.data?.role==='owner' ? profile.data.company_id : null;
  const companyIds=[...new Set([...linked.map(w=>w.company_id),ownerCompany].filter(Boolean))];
  if(!companyIds.length)return [];
  const companies=await rows(db.from('companies').select('id,company_name,is_active').in('id',companyIds).order('id'));
  const result=[];
  for(const company of companies.filter(c=>c.is_active!==false)) {
    const workerIds=linked.filter(w=>w.company_id===company.id).map(w=>w.id);
    const isOwner=company.id===ownerCompany;
    const [assigned,ownSites]=await Promise.all([
      workerIds.length ? companySites(db,company.id,workerIds,null,true) : [],
      isOwner ? rows(db.from('sites').select(`${siteFields},memo`).eq('company_id',company.id).order('id')) : [],
    ]);
    const byId=new Map(assigned.map(site=>[site.site_id,site]));
    const candidates=isOwner ? ownSites.map(site=>{
      const mine=byId.get(site.id);
      const myDays=mine ? assignedDays(mine,from,to) : [];
      const calendar_roles=myDays.map(work_date=>({work_date,role:mine.assigned_dates?.find(d=>d.work_date===work_date)?.role||mine.my_role}));
      return {...site,site_id:site.id,calendar_admin:true,calendar_roles,
        schedule_start:localDay(site.schedule_start),schedule_end:localDay(site.schedule_end)};
    }) : assigned;
    const sites=candidates.filter(s=>assignedDays(s,from,to).length);
    if(sites.length>300)throw Error('자동 동기화 대상 현장이 너무 많습니다.');
    for(let i=0;i<sites.length;i+=100) {
      const batch=sites.slice(i,i+100);
      const materials=await rows(db.from('site_materials').select('id,site_id,brand,product_code,product_name,memo,price_type').eq('company_id',company.id).eq('material_type','planned').in('site_id',batch.map(s=>s.site_id)).order('id'));
      result.push(...batch.map(site=>({...site,company_name:company.company_name,calendar_materials:materials.filter(m=>m.site_id===site.site_id)})));
    }
  }
  return result;
}
