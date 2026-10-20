// Keep company management records authoritative; foreign records are assigned-worker views only.
export function combineAdminPersonalSites(companySites = [], personalSites = [], companyId) {
 const result=companySites.map(site=>({...site}));
 const own=new Map(result.map(site=>[site.id,site]));
 const seen=new Set();
 for(const personal of personalSites){
  const id=personal.site_id||personal.id;
  if(!id||!personal.company_id||seen.has(id))continue;
  seen.add(id);
  const explicit=Array.isArray(personal.assigned_dates);
  const days=explicit?[...new Set(personal.assigned_dates.map(d=>d.work_date).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d||'')))].sort():null;
  if(explicit&&!days.length)continue;
  if(personal.company_id===companyId){
   const site=own.get(id);
   if(site){site.personal_assignment=true;site.personal_work_dates=days;site.personal_role=personal.my_role||personal.worker_role;}
   continue;
  }
  if(own.has(id))continue;
  const site={...personal,id,site_id:id,status:personal.site_status||personal.status||'scheduled',personal_only:true,personal_assignment:true,personal_work_dates:days,personal_role:personal.my_role||personal.worker_role,company_name:personal.company_name||'협력 업체',site_workers:[],...(days?{work_dates:days,schedule_start:days[0],schedule_end:days.at(-1)}:{})};
  result.push(site);own.set(id,site);
 }
 return result;
}
export function isPersonalWorkDay(site,day){return Boolean(site.personal_assignment&&(!day||!Array.isArray(site.personal_work_dates)||site.personal_work_dates.includes(day)));}
export function personalCalendarLabel(site,day){
 const name=site.site_name||site.customer_name||'이름 없는 현장';
 return site.personal_only?`${site.company_name} · ${name}`:isPersonalWorkDay(site,day)?`내 시공 · ${name}`:name;
}
