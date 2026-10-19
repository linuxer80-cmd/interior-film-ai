import {
  privateAuth,
  privateJson as json,
  uuid,
} from "../../../../lib/workerPrivate";
import {
  ownerWorkDefaults,
  ownerWorkSettings,
  ownerWorkSchemaMissing,
  ownerWorkRows,
  isOwnerParticipant,
  scheduledOn,
  koreaDay,
} from "../../../../lib/ownerWork.mjs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const read = async (query) => {
  const r = await query;
  if (r.error) throw r.error;
  return r.data;
};
const failure = (error) =>
  json(
    {
      error: ownerWorkSchemaMissing(error)
        ? "직접 시공 기능의 데이터베이스 설정이 필요합니다."
        : error.status
          ? error.message
          : "직접 시공 정보를 처리하지 못했습니다. 다시 시도해주세요.",
      setupRequired: ownerWorkSchemaMissing(error),
    },
    error.status || (ownerWorkSchemaMissing(error) ? 503 : 500),
  );
async function settingsFor(db, companyId) {
  return (
    (await read(
      db
        .from("owner_work_settings")
        .select("mode,include_labor,daily_wage")
        .eq("company_id", companyId)
        .maybeSingle(),
    )) || ownerWorkDefaults
  );
}
export async function GET(request) {
  try {
    const a = await privateAuth(request);
    if (a.error) return json({ error: a.error }, a.status);
    const { db, companyId, user } = a;
    const siteId = new URL(request.url).searchParams.get("siteId");
    if (siteId && !uuid(siteId))
      return json({ error: "현장을 확인해주세요." }, 400);
    if (siteId && new URL(request.url).searchParams.get("cutting") === "1") {
      const site = await read(
        db
          .from("sites")
          .select("id,site_name,customer_name")
          .eq("company_id", companyId)
          .eq("id", siteId)
          .maybeSingle(),
      );
      if (!site) return json({ error: "접근 가능한 현장이 아닙니다." }, 404);
      const result = await db.rpc("site_operations", {
        p_user: user.id,
        p_site: siteId,
        p_action: "get",
        p_body: {},
      });
      if (result.error) throw result.error;
      return json({
        site: { ...site, site_id: site.id },
        actor: { id: user.id, user_id: user.id },
        materials: (result.data.materials || []).map((m) => ({
          ...m,
          material_id: m.id,
          product_code: m.code,
          product_name: m.name,
        })),
      });
    }
    const settings = await settingsFor(db, companyId);
    let query = db
      .from("sites")
      .select(
        "id,site_name,customer_name,status,schedule_start,schedule_end,work_dates,work_type,work_description",
      )
      .eq("company_id", companyId)
      .order("id");
    if (siteId) query = query.eq("id", siteId);
    const [sites, participation, records] = await Promise.all([
      ownerWorkRows(query),
      ownerWorkRows(
        db
          .from("owner_site_participation")
          .select("site_id,participating")
          .eq("company_id", companyId)
          .eq("user_id", user.id)
          .order("site_id"),
      ),
      ownerWorkRows(
        db
          .from("owner_work_days")
          .select("*")
          .eq("company_id", companyId)
          .eq("user_id", user.id)
          .gte("work_date", koreaDay().slice(0, 7) + "-01")
          .order("work_date", { ascending: false }),
      ),
    ]);
    if (siteId && !sites.length)
      return json({ error: "접근 가능한 현장이 아닙니다." }, 404);
    const ids = sites.map((s) => s.id),
      reports = [];
    for (let i = 0; i < ids.length; i += 100)
      reports.push(
        ...(await ownerWorkRows(
          db
            .from("work_reports")
            .select("site_id,review_status,updated_at,id")
            .eq("company_id", companyId)
            .in("site_id", ids.slice(i, i + 100))
            .order("updated_at", { ascending: false })
            .order("id", { ascending: false }),
        )),
      );
    const latest = new Map();
    for (const report of reports)
      if (!latest.has(report.site_id)) latest.set(report.site_id, report);
    return json({
      settings,
      records,
      today: koreaDay(),
      sites: sites.map((site) => ({
        ...site,
        participating: isOwnerParticipant(
          settings,
          site,
          participation.find((p) => p.site_id === site.id),
        ),
        today: scheduledOn(site),
        report: latest.get(site.id) || null,
      })),
    });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request) {
  try {
    const a = await privateAuth(request);
    if (a.error) return json({ error: a.error }, a.status);
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "입력 형식을 확인해주세요." }, 400);
    }
    const { db, user, companyId } = a;
    if (body?.action === "settings") {
      const settings = ownerWorkSettings(body);
      await read(
        db.from("owner_work_settings").upsert(
          {
            company_id: companyId,
            ...settings,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "company_id" },
        ),
      );
      return json({ success: true, settings });
    }
    if (
      !["participate", "in", "out"].includes(body?.action) ||
      !uuid(body.siteId)
    )
      return json({ error: "요청과 현장을 확인해주세요." }, 400);
    const site = await read(
      db
        .from("sites")
        .select("id,status,schedule_start,schedule_end,work_dates")
        .eq("id", body.siteId)
        .eq("company_id", companyId)
        .maybeSingle(),
    );
    if (!site) return json({ error: "접근 가능한 현장이 아닙니다." }, 404);
    const settings = await settingsFor(db, companyId);
    if (body.action === "participate") {
      if (typeof body.participating !== "boolean" || settings.mode === "manage")
        return json(
          { error: "먼저 업체 운영 방식을 직접 시공으로 설정해주세요." },
          400,
        );
      if (["consulting", "cancelled"].includes(site.status))
        return json({ error: "시공 예정 현장에서 참여를 설정해주세요." }, 409);
      await read(
        db.from("owner_site_participation").upsert(
          {
            company_id: companyId,
            user_id: user.id,
            site_id: site.id,
            participating: body.participating,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "company_id,user_id,site_id" },
        ),
      );
      return json({ success: true });
    }
    const day = koreaDay();
    const scope = (q) =>
      q.eq("company_id", companyId).eq("user_id", user.id).eq("work_date", day);
    if (body.action === "in") {
      const override = await read(
        db
          .from("owner_site_participation")
          .select("participating")
          .eq("company_id", companyId)
          .eq("user_id", user.id)
          .eq("site_id", site.id)
          .maybeSingle(),
      );
      if (
        !isOwnerParticipant(settings, site, override) ||
        !scheduledOn(site, day) ||
        site.status === "completed"
      )
        return json(
          {
            error: "오늘 직접 시공하는 예정·진행 현장에만 출근할 수 있습니다.",
          },
          409,
        );
      await read(
        db.from("owner_work_days").upsert(
          {
            company_id: companyId,
            user_id: user.id,
            site_id: site.id,
            work_date: day,
            labor_amount: settings.include_labor ? settings.daily_wage : 0,
          },
          {
            onConflict: "company_id,user_id,work_date",
            ignoreDuplicates: true,
          },
        ),
      );
    } else {
      await read(
        scope(
          db
            .from("owner_work_days")
            .update({ checked_out_at: new Date().toISOString() }),
        )
          .eq("site_id", site.id)
          .is("checked_out_at", null),
      );
    }
    const record = await read(
      scope(db.from("owner_work_days").select("*")).maybeSingle(),
    );
    if (!record || record.site_id !== site.id)
      return json(
        {
          error: "오늘 기록된 현장이 다릅니다. 기존 출근 기록을 확인해주세요.",
        },
        409,
      );
    if (body.action === "in") {
      await read(
        db
          .from("owner_site_participation")
          .upsert(
            {
              company_id: companyId,
              user_id: user.id,
              site_id: site.id,
              participating: true,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "company_id,user_id,site_id" },
          ),
      );
    }
    return json({ success: true, record });
  } catch (error) {
    return failure(error);
  }
}
