export function teamDate(value) {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T00:00:00Z'))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)throw Object.assign(Error('배정 날짜를 확인해주세요.'),{status:400});
  return value;
}
export function authorizedTeam(assignments, workers, userId, companyId, siteId, date) {
  const active=new Map(workers.filter(w=>w.company_id===companyId&&w.is_active===true).map(w=>[w.id,w]));
  const members=assignments.filter(a=>a.company_id===companyId&&a.site_id===siteId&&a.work_date===date&&active.has(a.worker_id)).map(a=>({...active.get(a.worker_id),role:a.role}));
  if(!members.some(w=>w.user_id===userId))throw Object.assign(Error('이 날짜·현장에 배정된 팀원만 이용할 수 있습니다.'),{status:403});
  return [...new Map(members.map(w=>[w.id,w])).values()];
}
export function teamMessage(value){
  if(typeof value!=='string'||!value.trim()||value.trim().length>2000)throw Object.assign(Error('메시지는 1~2000자로 입력해주세요.'),{status:400});
  return value.trim();
}
