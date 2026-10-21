import { createClient } from "@supabase/supabase-js";
import { buildClosingTasks } from "../../../../lib/adminClosingTasks.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store", Vary: "Authorization" } });

async function allRows(query) {
  const rows = [];
  for (let offset = 0; offset < 20000; offset += 500) {
    const { data, error } = await query.range(offset, offset + 499);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 500) return rows;
  }
  throw new Error("정리 현장 조회 범위를 초과했습니다.");
}

export async function GET(request) {
  try {
    const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
    if (!token) return json({ error: "관리자 로그인이 필요합니다." }, 401);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return json({ error: "서버 설정을 확인해주세요." }, 503);
    const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: userData, error: authError } = await db.auth.getUser(token);
    if (authError || !userData?.user) return json({ error: "로그인이 만료되었습니다. 다시 로그인해주세요." }, 401);
    const { data: profile, error: profileError } = await db.from("profiles").select("company_id,role,is_active").eq("id", userData.user.id).maybeSingle();
    if (profileError) throw profileError;
    if (!profile?.company_id || profile.role !== "owner" || profile.is_active === false) return json({ error: "관리자 권한이 필요합니다." }, 403);
    const companyId = profile.company_id;
    const { data: company, error: companyError } = await db.from("companies").select("id,is_active").eq("id", companyId).maybeSingle();
    if (companyError) throw companyError;
    if (!company || company.is_active === false) return json({ error: "업체를 확인할 수 없습니다." }, 403);
    const scoped=(table,columns)=>db.from(table).select(columns).eq("company_id",companyId);
    const [sites,reports]=await Promise.all([
      allRows(scoped("sites","id,site_name,customer_name,status").order("id")),
      allRows(scoped("work_reports","id,site_id,review_status,updated_at,created_at").order("id")),
    ]);
    const reported=new Set(reports.map(r=>r.site_id));
    const ids=sites.filter(s=>s.status!=="cancelled"&&reported.has(s.id)).map(s=>s.id);
    async function matching(table,columns,key,actual=false){
      const rows=[];
      for(let index=0;index<ids.length;index+=100){
        let query=scoped(table,columns).in(key,ids.slice(index,index+100));
        if(actual)query=query.eq("material_type","actual");
        rows.push(...await allRows(query.order("id")));
      }
      return rows;
    }
    const [balances,trips,materials]=await Promise.all([
      matching("site_receivable_balances","id,confirmed,contract_amount,outstanding","id"),
      matching("film_stock_trips","id,site_id,returned","site_id"),
      matching("site_materials","id,site_id,quantity,unit_price,brand,product_code,product_name","site_id",true),
    ]);
    return json({...buildClosingTasks({sites,reports,balances,trips,materials}),updatedAt:new Date().toISOString()});
  } catch (error) {
    console.error("admin closing-tasks", error?.code || error?.message);
    return json({ error: "정리가 필요한 현장을 불러오지 못했습니다. 다시 확인해주세요." }, 500);
  }
}
