import { createClient } from "@supabase/supabase-js";
import { GET as profitGET } from "../admin/profit/route";

export const runtime = "nodejs";

const json = (body, status = 200) => Response.json(body, {
  status, headers: { "Cache-Control": "private, no-store" },
});
const LABOR = "완료보고/인건비:";

async function read(query) {
  const r = await query;
  if (r.error) throw r.error;
  return r.data;
}

export async function GET(request) {
  try {
    const siteId = new URL(request.url).searchParams.get("siteId");
    if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(siteId || "")) {
      return json({ error: "현장을 확인해주세요." }, 400);
    }

    const token = (request.headers.get("authorization") || "").match(/^Bearer (.+)$/i)?.[1];
    if (!token) return json({ error: "로그인이 필요합니다." }, 401);

    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
    const auth = await db.auth.getUser(token);
    if (auth.error || !auth.data?.user) {
      return json({ error: "다시 로그인해주세요." }, 401);
    }

    const op = await db.rpc("site_operations", {
      p_user: auth.data.user.id, p_site: siteId,
    });
    if (op.error || (!op.data.owner && !op.data.canReturn)) {
      return json({ error: "완료보고 작성 권한이 없습니다." }, 403);
    }

    const owner = op.data.owner;
    const site = await read(
      db.from("sites").select("company_id").eq("id", siteId).single()
    );
    const scoped = (table, columns) => db.from(table).select(columns)
      .eq("company_id", site.company_id).eq("site_id", siteId);

    const [report, planned, actual, expenses, photoCount] = await Promise.all([
      read(scoped(
        "work_reports", "id,work_region,work_summary,memo,review_status,updated_at"
      ).maybeSingle()),
      read(scoped("site_materials", "id,unit_price").eq("material_type", "planned")),
      read(scoped(
        "site_materials", "brand,product_code,product_name,quantity,unit,unit_price,memo"
      ).eq("material_type", "actual")),
      read(scoped(
        "site_expenses", "expense_type,amount,description,expense_date"
      ).order("id")),
      db.from("site_photos").select("id", { count: "exact", head: true })
        .eq("company_id", site.company_id).eq("site_id", siteId).eq("photo_type", "after"),
    ]);

    if (photoCount.error) throw photoCount.error;

    const reportExpenses = expenses.filter(e =>
      e.description?.startsWith("완료보고/") && !e.description.startsWith(LABOR)
    );
    const labor = expenses.filter(e => e.description?.startsWith(LABOR)).flatMap(e => {
      try {
        const x = JSON.parse(e.description.slice(LABOR.length));
        return [{
          worker_id: x.workerId, days: x.days,
          daily_wage: x.dailyWage, allowance: x.allowance,
        }];
      } catch {
        return [];
      }
    });

    let preview = null;
    let history = [];

    if (owner) {
      const url = new URL(request.url);
      url.pathname = "/api/admin/profit";
      const response = await profitGET(new Request(url, { headers: request.headers }));
      const result = await response.json();
      if (!response.ok) throw Error(result.error);

      const p = result.sites?.[0];
      if (p) {
        preview = {
          revenue: p.missingContract ? null : p.revenue,
          labor: p.labor,
          laborPending: p.laborPending,
          extraMaterial: expenses.filter(e =>
            !e.description?.startsWith("완료보고/") &&
            (e.expense_type === "material" || e.description?.startsWith("수익관리/자재비:"))
          ).reduce((s, e) => s + Number(e.amount), 0),
          expense: expenses.filter(e =>
            !e.description?.startsWith("완료보고/") &&
            e.expense_type !== "material" &&
            !e.description?.startsWith("수익관리/인건비:") &&
            !e.description?.startsWith("수익관리/자재비:")
          ).reduce((s, e) => s + Number(e.amount), 0),
        };
      }

      history = await read(scoped(
        "work_report_history",
        "id,event,actor_name,created_at,before_cost,after_cost,before_status,after_status,reason"
      ).order("created_at", { ascending: false }).limit(30));
    }

    return json({
      owner,
      operations: op.data,
      report,
      afterCount: photoCount.count || 0,
      missingPrices: op.data.materials.filter(m =>
        Number(m.issued) > 0 && planned.find(p => p.id === m.id)?.unit_price == null
      ).map(m => m.id),
      seed: {
        work_region: report?.work_region || "",
        work_summary: report?.work_summary || "",
        memo: report?.memo || "",
        materials: actual || [],
        expenses: reportExpenses.map(e => ({
          ...e, description: e.description.slice("완료보고/".length),
        })),
        labor,
      },
      preview,
      history,
    });
  } catch (error) {
    console.error("report support", error);
    return json({
      error: "완료보고 점검 정보를 불러오지 못했습니다. 다시 확인해주세요.",
    }, 500);
  }
}
