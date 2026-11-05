import webpush from 'web-push';

// Members must come from authorizedTeam, never from a client-supplied recipient list.
export async function dispatchTeamMessage(db, { members, senderId, siteId, date, messageId }, {
  transport = webpush,
  publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  privateKey = process.env.VAPID_PRIVATE_KEY,
} = {}) {
  const result = { accepted: 0, failed: 0, expired: 0, unsubscribed: 0, suppressed: 0 };
  if (!publicKey || !privateKey) return { ...result, state: 'unconfigured' };
  transport.setVapidDetails('https://interior-film-ai.vercel.app', publicKey, privateKey);
  const recipients = [...new Set(members.map(m => m.user_id).filter(id => id && id !== senderId))];
  await Promise.all(recipients.map(async userId => {
  const payload = JSON.stringify({
    title: '필름장이 · 팀원 새 메시지',
    // Never enqueue chat content: deletion can race even the final database check.
    body: '새 팀 메시지가 있습니다. 앱에서 확인해 주세요.',
    url: members.some(m => m.user_id === userId && m.role === 'owner')
      ? `/admin?tab=sites&site=${encodeURIComponent(siteId)}&section=chat&teamDate=${encodeURIComponent(date)}`
      : `/worker/site/${encodeURIComponent(siteId)}?section=chat&teamDate=${encodeURIComponent(date)}`,
    tag: `team-${messageId}`,
  });

    const subscriptions = await db.from('push_subscriptions').select('id,endpoint,p256dh,auth').eq('user_id', userId).limit(100);
    if (subscriptions.error) { result.failed++; return; }
    if (!subscriptions.data?.length) { result.unsubscribed++; return; }
    await Promise.all(subscriptions.data.map(async sub => {
      try {
        // Recheck at delivery time, not when the API schedules this callback.
        const current = await db.from('worker_team_messages').select('id')
          .eq('id', messageId).eq('sender_id', senderId).eq('site_id', siteId)
          .eq('work_date', date).maybeSingle();
        if (current.error) { result.failed++; return; }
        if (!current.data) { result.suppressed++; return; }
        const blocked = await db.from('account_deletion_blocks').select('user_id')
          .in('user_id', [senderId, userId]).limit(1);
        if (blocked.error) { result.failed++; return; }
        if (!Array.isArray(blocked.data)) { result.failed++; return; }
        if (blocked.data.length) { result.suppressed++; return; }
        await transport.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, { timeout: 5000, TTL: 3600 });
        result.accepted++;
      } catch (error) {
        if ([404, 410].includes(error.statusCode)) {
          result.expired++;
          const removed = await db.from('push_subscriptions').delete().eq('id', sub.id).eq('user_id', userId);
          if (removed.error) result.failed++;
        } else result.failed++;
      }
    }));
  }));
  return { ...result, state: 'attempted' };
}

