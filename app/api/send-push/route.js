import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const secret = request.headers.get("x-push-secret");

    if (
      !process.env.PUSH_WEBHOOK_SECRET ||
      secret !== process.env.PUSH_WEBHOOK_SECRET
    ) {
      return Response.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;

    if (
      !supabaseUrl ||
      !serviceRoleKey ||
      !publicKey ||
      !privateKey
    ) {
      throw new Error("서버 환경 변수가 설정되지 않았습니다.");
    }

    webpush.setVapidDetails(
      "https://interior-film-ai.vercel.app",
      publicKey,
      privateKey
    );

    const body = await request.json().catch(() => ({}));
    const record = body.record || body;

    const customerName =
      record.customer_name || "새 고객";

    const region =
      record.region ? ` · ${record.region}` : "";

    const supabase = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    const { data: subscriptions, error } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth");

    if (error) throw error;

    if (!subscriptions?.length) {
      return Response.json({
        success: true,
        sent: 0,
        message: "등록된 휴대폰이 없습니다.",
      });
    }

    const payload = JSON.stringify({
      title: "🔴 기분좋은공간 신규 상담",
      body: `${customerName}${region} 고객의 상담이 들어왔습니다.`,
      url: "/admin",
      tag: `lead-${record.id || Date.now()}`,
    });

    let sent = 0;

    for (const item of subscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: item.endpoint,
            keys: {
              p256dh: item.p256dh,
              auth: item.auth,
            },
          },
          payload
        );

        sent += 1;
      } catch (pushError
