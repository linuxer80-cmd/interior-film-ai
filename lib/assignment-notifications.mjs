// One person's changes from one save become one notice. Never echo the
// administrator's own action, even when they are also a worker on the site.
export function assignmentNotifications({ changes, workers, actorId, companyId, siteId, now = Date.now() }) {
  const directory = new Map(workers.map(worker => [worker.id, worker]));
  const byUser = new Map();
  for (const change of changes) {
    const worker = directory.get(change.row.worker_id);
    if (!worker?.user_id || worker.user_id === actorId) continue;
    const group = byUser.get(worker.user_id) || { worker, changes: [] };
    group.changes.push(change);
    byUser.set(worker.user_id, group);
  }
  return [...byUser.values()].map(({ worker, changes: items }) => {
    items.sort((a, b) => a.row.work_date.localeCompare(b.row.work_date));
    const labels = { added: '신규 배정', removed: '배정 해제', role_changed: '역할 변경' };
    const kinds = [...new Set(items.map(item => item.kind))];
    const title = kinds.length === 1 ? `현장 ${labels[kinds[0]]}` : '현장 배정 변경';
    const lines = items.slice(0, 3).map(item => {
      const role = item.row.role === 'leader' ? '팀장' : '팀원';
      return `${item.row.work_date} · ${role} · ${labels[item.kind]}`;
    });
    if (items.length > 3) lines.push(`외 ${items.length - 3}건 · 현장 일정을 확인해주세요.`);
    return {
      company_id: companyId, recipient_type: 'worker', recipient_user_id: worker.user_id,
      recipient_worker_id: worker.id, type: 'site_assignment', priority: 'success', title,
      message: lines.join('\n'), link: `/worker/site/${siteId}`,
      reference_type: 'site_assignment', reference_id: siteId,
      dedupe_key: ['assignment', siteId, worker.user_id, now].join(':'), is_read: false, push_sent: false,
    };
  });
}
