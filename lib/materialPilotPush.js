import webpush from "web-push";

export async function dispatchMaterialNotifications(db, orderId) {
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
    .from("material_pilot_notifications")
    .select("id,user_id,title,message,link")
    .is("push_sent_at", null)
    .order("created_at")
    .limit(20);

  if (orderId) query = query.eq("order_id", orderId);

  const { data: notices, error } = await query;
  if (error || !notices?.length) return;

  await Promise.all(notices.map(async notice => {
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
              tag: `material-${notice.id}`,
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
        .from("material_pilot_notifications")
        .update({ push_sent_at: new Date().toISOString() })
        .eq("id", notice.id);
    }
  }));
}
