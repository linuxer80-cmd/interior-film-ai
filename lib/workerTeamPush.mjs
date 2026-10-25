import webpush from 'web-push';

// Members must come from authorizedTeam, never from a client-supplied recipient list.
export async function dispatchTeamMessage(db, { members, senderId, siteId, date, messageId, body }, {
  transport = webpush,
  publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  privateKey = process.env.VAPID_PRIVATE_KEY,
} = {}) {
  const result = { accepted: 0, failed: 0, expired: 0, unsubscribed: 0 };
  if (!publicKey || !privateKey) return { ...result, state: 'unconfigured' };
  transport.setVapidDetails('https://interior-film-ai.vercel.app', publicKey, privateKey);
  const recipients = [...new Set(members.map(m => m.user_id).filter(id => id && id !== senderId))];
  await Promise.all(recipients.map(async userId => {
  const payload = JSON.stringify({
    title: '필름장이 · 팀원 새 메시지',
    body: String(body).slice(0, 120),
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

