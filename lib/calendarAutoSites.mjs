import { rows, companySites } from './workerSiteAssignments.mjs';
import { assignedDays } from './googleCalendar.mjs';
// Only active, company-scoped worker memberships authorize export. Owners are
// included through their assigned worker membership, never through owner role.
export async function calendarSites(db,userId,from,to) {
  const [profile,linked]=await Promise.all([
    db.from('profiles').select('is_active').eq('id',userId).maybeSingle(),
    rows(db.from('workers').select('id,company_id').eq('user_id',userId).eq('is_active',true).order('id')),
  ]);
  if(profile.error)throw profile.error;
  if(profile.data?.is_active===false || !linked.length)return [];
  const companies=await rows(db.from('companies').select('id,company_name,is_active').in('id',[...new Set(linked.map(w=>w.company_id))]).order('id'));
  const result=[];
  for(const company of companies.filter(c=>c.is_active!==false)) {
    const sites=(await companySites(db,company.id,linked.filter(w=>w.company_id===company.id).map(w=>w.id),null,true)).filter(s=>assignedDays(s,from,to).length);
    if(sites.length>300)throw Error('자동 동기화 대상 현장이 너무 많습니다.');
    for(let i=0;i<sites.length;i+=100) {
      const batch=sites.slice(i,i+100);
      const materials=await rows(db.from('site_materials').select('id,site_id,brand,product_code,product_name,memo,price_type').eq('company_id',company.id).eq('material_type','planned').in('site_id',batch.map(s=>s.site_id)).order('id'));
      result.push(...batch.map(site=>({...site,company_name:company.company_name,calendar_materials:materials.filter(m=>m.site_id===site.site_id)})));
    }
  }
  return result;
}
