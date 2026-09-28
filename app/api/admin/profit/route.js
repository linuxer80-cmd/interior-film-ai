import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
const TYPES = { labor: "인건비", material: "자재비", expense: "경비" };
const PREFIX = "수익관리/";
const json = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
const money = (value) => { const n = Number(value); return Number.isFinite(n) && n >= 0 ? n : 0; };
const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

async function admin(request) {
  const token = (request.headers.get("authorization") || "").match(/^Bearer (.+)$/i)?.[1];
  if (!token) return { error: "로그인이 필요합니다.", status: 401 };
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return { error: "서버 설정을 확인해주세요.", status: 503 };
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error } = await db.auth.getUser(token);
  if (error || !user) return { error: "로그인이 만료되었습니다.", status: 401 };
  const { data: profile, error: profileError } = await db.from("profiles").select("company_id,role,is_active").eq("id", user.id).maybeSingle();
  if (profileError) throw profileError;
  if (!profile?.company_id || profile.role !== "owner" || profile.is_active === false) return { error: "관리자 권한이 필요합니다.", status: 403 };
  const { data: company, error: companyError } = await db.from("companies").select("id,is_active").eq("id", profile.company_id).maybeSingle();
  if (companyError) throw companyError;
  if (!company || company.is_active === false) return { error: "업체를 확인할 수 없습니다.", status: 403 };
  return { db, companyId: profile.company_id, userId: user.id };
}

async function allRows(query) {
  const rows = [];
  for (let offset = 0; offset < 10000; offset += 500) {
    const { data, error } = await query.range(offset, offset + 499);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 500) return rows;
  }
  throw new Error("조회 결과가 너무 많습니다. 기간을 줄여주세요.");
}

export async function GET(request) {
  try {
    const auth = await admin(request);
    if (auth.error) return json({ error: auth.error }, auth.status);
    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from") || "";
    const to = searchParams.get("to") || "";
    const fromTime = Date.parse(`${from}T00:00:00Z`);
    const toTime = Date.parse(`${to}T00:00:00Z`);
    if (!validDate(from) || !validDate(to) || fromTime > toTime || toTime - fromTime > 366 * 86400000) return json({ error: "기간은 최대 1년으로 지정해주세요." }, 400);
    const { db, companyId } = auth;
    const sites = await allRows(db.from("sites").select("id,site_name,customer_name,schedule_start,contract_amount,status,site_workers(company_id,role,worker_id,workers(id,company_id,name,daily_wage))")
      .eq("company_id", companyId).gte("schedule_start", `${from}T00:00:00`).lt("schedule_start", new Date(toTime + 86400000).toISOString().slice(0, 10) + "T00:00:00").order("schedule_start", { ascending: true }));
    const materials = [];
    const expenses = [];
    for (let index = 0; index < sites.length; index += 100) {
      const ids = sites.slice(index, index + 100).map((site) => site.id);
      if (!ids.length) continue;
      const [materialRows, expenseRows] = await Promise.all([
        allRows(db.from("site_materials").select("site_id,brand,product_code,product_name,quantity,unit,unit_price,total_price").eq("company_id", companyId).eq("material_type", "actual").in("site_id", ids).order("site_id")),
        allRows(db.from("site_expenses").select("id,site_id,expense_type,amount,description,expense_date").eq("company_id", companyId).in("site_id", ids).order("site_id")),
      ]);
      materials.push(...materialRows);
      expenses.push(...expenseRows);
    }
    const materialBySite = new Map();
    for (const item of materials) materialBySite.set(item.site_id, (materialBySite.get(item.site_id) || 0) + money(item.total_price ?? (money(item.quantity) * money(item.unit_price))));
    const breakdown = { labor: [], material: [], expense: [] };
    const siteNames = new Map(sites.map((site) => [site.id, site.site_name || site.customer_name || "이름 없는 현장"]));
    const workerNames = new Map(sites.flatMap((site) => (site.site_workers || []).filter((row) => row.company_id === companyId && row.workers?.company_id === companyId).map((row) => [row.workers.name, row.workers.name])));
    for (const item of materials) breakdown.material.push({ siteId: item.site_id, siteName: siteNames.get(item.site_id), brand: item.brand?.trim() || "브랜드 미입력", product: [item.product_code, item.product_name].filter(Boolean).join(" · ") || "제품 미입력", quantity: money(item.quantity), unit: item.unit || "m", amount: money(item.total_price ?? (money(item.quantity) * money(item.unit_price))) });
    const costsBySite = new Map();
    for (const item of expenses) {
      const bucket = costsBySite.get(item.site_id) || { labor: 0, material: 0, expense: 0, entries: [] };
      const category = item.description?.startsWith(`${PREFIX}${TYPES.labor}:`) ? "labor" : (item.expense_type === "material" || item.description?.startsWith(`${PREFIX}${TYPES.material}:`)) ? "material" : "expense";
      bucket[category] += money(item.amount);
      const detail = item.description?.startsWith(PREFIX) ? item.description.slice(item.description.indexOf(":") + 1).trim() : (item.description?.trim() || "내용 미입력");
      if (category === "labor") {
        const name = [...workerNames.keys()].sort((a, b) => b.length - a.length).find((candidate) => detail === candidate || detail.startsWith(`${candidate} `));
        breakdown.labor.push({ siteId: item.site_id, siteName: siteNames.get(item.site_id), name: name || "시공자 미분류", description: detail, amount: money(item.amount) });
      } else if (category === "material") breakdown.material.push({ siteId: item.site_id, siteName: siteNames.get(item.site_id), brand: "브랜드 미입력", product: detail, quantity: null, unit: "", amount: money(item.amount) });
      else breakdown.expense.push({ siteId: item.site_id, siteName: siteNames.get(item.site_id), category: item.expense_type && item.expense_type !== "other" && item.expense_type !== "material" ? item.expense_type : (item.description?.startsWith(PREFIX) ? detail.split(":")[0].trim() : detail), description: detail, amount: money(item.amount) });
      if (item.description?.startsWith(PREFIX)) bucket.entries.push({ ...item, description: item.description.slice(item.description.indexOf(":") + 1).trim(), category });
      costsBySite.set(item.site_id, bucket);
    }
    const result = sites.map((site) => {
      const costs = costsBySite.get(site.id) || { labor: 0, material: 0, expense: 0, entries: [] };
      const revenue = money(site.contract_amount);
      const material = (materialBySite.get(site.id) || 0) + costs.material;
      const profit = revenue - costs.labor - material - costs.expense;
      const site_workers = (site.site_workers || [])
        .filter((assignment) => assignment.company_id === companyId && assignment.workers?.company_id === companyId)
        .map(({ role, worker_id, workers }) => ({ role, worker_id,
          workers: { id: workers.id, name: workers.name, daily_wage: workers.daily_wage } }));
      return { ...site, site_workers, revenue, labor: costs.labor, material, expense: costs.expense, profit, entries: costs.entries, missingContract: site.contract_amount == null || site.contract_amount === "" };
    });
    const totals = result.reduce((sum, item) => { for (const key of ["revenue", "labor", "material", "expense", "profit"]) sum[key] += item[key]; return sum; }, { revenue: 0, labor: 0, material: 0, expense: 0, profit: 0 });
    return json({ sites: result, totals, breakdown });
  } catch (error) { console.error("profit GET", error); return json({ error: "수익 자료를 불러오지 못했습니다." }, 500); }
}

export async function POST(request) {
  try {
    const auth = await admin(request);
    if (auth.error) return json({ error: auth.error }, auth.status);
    const body = await request.json().catch(() => ({}));
    const type = TYPES[body.type];
    const amount = Number(body.amount);
    const description = typeof body.description === "string" ? body.description.trim().slice(0, 120) : "";
    if (!type || !body.siteId || !Number.isFinite(amount) || amount <= 0 || amount > 1000000000 || !description) return json({ error: "구분, 현장, 금액, 내용을 확인해주세요." }, 400);
    const { db, companyId, userId } = auth;
    const { data: site, error: siteError } = await db.from("sites").select("id").eq("id", body.siteId).eq("company_id", companyId).maybeSingle();
    if (siteError) throw siteError;
    if (!site) return json({ error: "현장을 찾을 수 없습니다." }, 404);
    const { error } = await db.from("site_expenses").insert({ company_id: companyId, site_id: site.id, expense_type: body.type === "material" ? "material" : "other", amount, description: `${PREFIX}${type}: ${description}`, expense_date: new Date().toISOString().slice(0, 10), created_by: userId });
    if (error) throw error;
    return json({ success: true });
  } catch (error) { console.error("profit POST", error); return json({ error: "비용을 저장하지 못했습니다." }, 500); }
}

export async function DELETE(request) {
  try {
    const auth = await admin(request);
    if (auth.error) return json({ error: auth.error }, auth.status);
    const { id } = await request.json().catch(() => ({}));
    if (!id) return json({ error: "삭제할 내역을 선택해주세요." }, 400);
    const { error } = await auth.db.from("site_expenses").delete().eq("id", id).eq("company_id", auth.companyId).like("description", `${PREFIX}%`);
    if (error) throw error;
    return json({ success: true });
  } catch (error) { console.error("profit DELETE", error); return json({ error: "비용 내역을 삭제하지 못했습니다." }, 500); }
                                                             }
