export function assignmentChanges(before = {}, after = {}) {
  const changes = {};
  for (const date of Object.keys(after).sort()) {
    const old = before[date] || {leaderId:'',memberIds:[]};
    const next = after[date] || {leaderId:'',memberIds:[]};
    const parts = [];
    if (old.leaderId !== next.leaderId) parts.push(next.leaderId ? old.leaderId ? '팀장 변경' : '팀장 배정' : '팀장 배정 해제');
    const added = new Set((next.memberIds || []).filter(id => !(old.memberIds || []).includes(id)));
    const removed = new Set((old.memberIds || []).filter(id => !(next.memberIds || []).includes(id)));
    if (added.size) parts.push(`팀원 ${added.size}명 추가`);
    if (removed.size) parts.push(`팀원 ${removed.size}명 제외`);
    if (parts.length) changes[date] = parts.join(' · ');
  }
  return changes;
}
export function applyTeamToDates(assignments, sourceDate, targets) {
  const source = assignments[sourceDate];
  if (!source) return assignments;
  const next = {...assignments};
  for (const date of new Set(targets)) {
    if (!Object.hasOwn(assignments,date)) continue;
    next[date] = {leaderId:source.leaderId || '', memberIds:[...new Set(source.memberIds || [])].filter(id => id !== source.leaderId)};
  }
  return next;
}
