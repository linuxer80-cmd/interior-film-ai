import {canReceiveRecruitment,isRecruitmentNotice} from './laborNotificationPolicy.mjs';
import webpush from "web-push";

export async function dispatchLaborNotifications(db, jobId) {
  if (
    !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
    !process.env.VAPID_PRIVATE_KEY
  ) return;

  webpush.setVapidDetails(
    "https://interior-film-ai.vercel.app",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );

  let query = db
    .from("labor_notifications")
    .select("id,user_id,title,message,link")
    .is("push_sent_at", null)
    .order("created_at")
    .limit(20);

  if (jobId) query = query.eq("job_id", jobId);

  const { data: notices, error } = await query;
  if (error || !notices?.length) return;

  const preferences=new Map();
  await Promise.all(notices.map(async notice => {
    if(isRecruitmentNotice(notice)) {
      if(!preferences.has(notice.user_id)) preferences.set(notice.user_id,canReceiveRecruitment(db,notice.user_id));
      const allowed=await preferences.get(notice.user_id);
      if(allowed!==true) {
        // Consume deliberately muted invitations so they cannot block later notices.
        // Unknown states are left pending for retry.
        if(allowed===false) await db.from('labor_notifications').update({push_sent_at:new Date().toISOString()}).eq('id',notice.id);
        return;
      }
    }
    const { data: subscriptions, error: subscriptionError } = await db
      .from("push_subscriptions")
      .select("id,endpoint,p256dh,auth")
      .eq("user_id", notice.user_id)
      .limit(20);

    if (subscriptionError) return;

    const results = await Promise.allSettled(
      (subscriptions || []).map(async subscription => {
        try {
          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: {
                p256dh: subscription.p256dh,
                auth: subscription.auth,
              },
            },
            JSON.stringify({
              title: notice.title,
              body: notice.message,
              url: notice.link,
              tag: `labor-${notice.id}`,
            }),
            { timeout: 5000 },
          );
        } catch (error) {
          if ([404, 410].includes(error.statusCode)) {
            await db
              .from("push_subscriptions")
              .delete()
              .eq("id", subscription.id)
              .eq("user_id", notice.user_id);
          } else {
            throw error;
          }
        }
      }),
    );

    if (results.every(result => result.status === "fulfilled")) {
      await db
        .from("labor_notifications")
        .update({ push_sent_at: new Date().toISOString() })
        .eq("id", notice.id);
    }
  }));
}
