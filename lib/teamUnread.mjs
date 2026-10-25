export async function teamUnread(db, userId, site) {
  const result = await db.from('worker_team_message_reads')
    .select('message_id,worker_team_messages!inner(company_id,site_id,work_date)', { count: 'exact' })
    .eq('user_id', userId).is('read_at', null)
    .eq('worker_team_messages.company_id', site.company_id)
    .eq('worker_team_messages.site_id', site.id)
    .order('message_id').limit(1);
  if (result.error) throw result.error;
  return { count: result.count || 0, date: result.data?.[0]?.worker_team_messages?.work_date || null };
}
