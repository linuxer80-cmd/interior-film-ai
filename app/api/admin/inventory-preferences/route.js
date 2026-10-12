import {
  privateAuth,
  privateJson as json,
} from "../../../../lib/workerPrivate";

export const runtime = "nodejs";

export async function GET(request) {
  try {
    const a = await privateAuth(request);

    if (a.error) {
      return json({ error: a.error }, a.status);
    }

    const result = await a.db
      .from("company_inventory_preferences")
      .select("enabled")
      .eq("company_id", a.companyId)
      .maybeSingle();

    if (result.error) throw result.error;

    return json({
      enabled: result.data?.enabled === true,
    });
  } catch {
    return json(
      {
        error: "재고관리 설정 SQL 적용 여부를 확인해주세요.",
      },
      503
    );
  }
}

export async function POST(request) {
  try {
    const a = await privateAuth(request);

    if (a.error) {
      return json({ error: a.error }, a.status);
    }

    const body = await request.json();

    if (typeof body.enabled !== "boolean") {
      return json(
        { error: "사용 여부를 선택해주세요." },
        400
      );
    }

    const result = await a.db
      .from("company_inventory_preferences")
      .upsert(
        {
          company_id: a.companyId,
          enabled: body.enabled,
          updated_by: a.user.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "company_id" }
      );

    if (result.error) throw result.error;

    return json({ ok: true });
  } catch {
    return json(
      {
        error: "재고관리 설정을 저장하지 못했습니다.",
      },
      503
    );
  }
}
