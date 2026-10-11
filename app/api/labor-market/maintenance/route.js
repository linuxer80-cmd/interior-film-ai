import { createClient } from "@supabase/supabase-js";
import { dispatchLaborNotifications } from "../../../../lib/laborPush";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request) {
  if (
    !process.env.CRON_SECRET ||
    request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );

  const { error } = await db.rpc("expire_labor_jobs");

  if (error) {
    return Response.json(
      { error: "Recruitment maintenance failed" },
      { status: 503 },
    );
  }

  await dispatchLaborNotifications(db);

  return Response.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
