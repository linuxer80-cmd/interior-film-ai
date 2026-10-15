// Only unsolicited recruitment is muted; application/assignment notices remain.
export function isRecruitmentNotice(notice) {
  return notice.title === '구인 제안';
}
export async function canReceiveRecruitment(db, userId) {
  const {data,error}=await db.rpc('worker_relationship_action',{
    p_actor:userId,p_action:'mine',p_body:{}
  });
  // Unknown relationship state must not silently opt the user into recruiting.
  if(error || !Array.isArray(data?.relationships)) return null;
  return !data.relationships.some(r=>r.relationship_type==='employee');
}


// Employer application notices stay in the manager inbox, including old rows.
export function scopeLaborNotifications(query, workerView) {
  if (!workerView) return query;
  return query.neq('title', '새로운 시공자 지원')
    .not('link', 'like', '/jobs?mine=1%');
}
