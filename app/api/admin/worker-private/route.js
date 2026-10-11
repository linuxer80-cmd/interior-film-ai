import {
  cleanPrivate,
  privateAuth,
  privateError,
  privateFields,
  privateJson as json,
  uuid,
} from "../../../../lib/workerPrivate";

export const runtime = "nodejs";

export async function GET(request) {
  try {
    const auth = await privateAuth(request);

    if (auth.error) {
      return json({ error: auth.error }, auth.status);
    }

    const workerId = new URL(request.url)
      .searchParams.get("workerId");

    if (!workerId) {
      const ready = await auth.db
        .from("worker_private_details")
        .select("worker_id")
        .eq("company_id", auth.companyId)
        .limit(0);

      if (ready.error) throw ready.error;

      return json({ ready: true });
    }

    if (!uuid(workerId)) {
      return json(
        { error: "시공자를 확인해주세요." },
        400,
      );
    }

    const worker = await auth.db
      .from("workers")
      .select("id")
      .eq("id", workerId)
      .eq("company_id", auth.companyId)
      .maybeSingle();

    if (worker.error) throw worker.error;

    if (!worker.data) {
      return json(
        { error: "시공자를 찾지 못했습니다." },
        404,
      );
    }

    const result = await auth.db
      .from("worker_private_details")
      .select(privateFields.join(","))
      .eq("worker_id", workerId)
      .eq("company_id", auth.companyId)
      .maybeSingle();

    if (result.error) throw result.error;

    return json({
      details:
        result.data ||
        Object.fromEntries(
          privateFields.map(field => [field, ""]),
        ),
    });
  } catch (error) {
    return json({ error: privateError(error) }, 500);
  }
}

export async function PUT(request) {
  try {
    const auth = await privateAuth(request);

    if (auth.error) {
      return json({ error: auth.error }, auth.status);
    }

    const body = await request.json();

    if (!uuid(body.workerId)) {
      return json(
        { error: "시공자를 확인해주세요." },
        400,
      );
    }

    let details;

    try {
      details = cleanPrivate(body);
    } catch (error) {
      return json({ error: error.message }, 400);
    }

    const worker = await auth.db
      .from("workers")
      .select("id")
      .eq("id", body.workerId)
      .eq("company_id", auth.companyId)
      .maybeSingle();

    if (worker.error) throw worker.error;

    if (!worker.data) {
      return json(
        { error: "시공자를 찾지 못했습니다." },
        404,
      );
    }

    const result = await auth.db
      .from("worker_private_details")
      .upsert(
        {
          worker_id: body.workerId,
          company_id: auth.companyId,
          ...details,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "worker_id",
        },
      );

    if (result.error) throw result.error;

    return json({ success: true });
  } catch (error) {
    return json({ error: privateError(error) }, 500);
  }
}
