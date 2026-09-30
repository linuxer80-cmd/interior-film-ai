import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { koreanDay } from "../../../utils/workerCalendar";
import { payAmount, payDate } from "../../../utils/workerPay";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !serviceKey || !anonKey) throw new Error("Supabase 설정을 확인해주세요.");

    const db = createClient(url, serviceKey, { auth: { persistSession: false } });
    const scoped = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });
    const { data: auth, error: authError } = await db.auth.getUser(token);
    if (authError || !auth?.user) return NextResponse.json({ error: "로그인을 다시 해주세요." }, { status: 401 });

    const { data: membership, error: membershipError } = await scoped.rpc("get_my_company");
    const company = Array.isArray(membership) ? membership[0] : membership;
    if (membershipError || !company?.company_id || company.is_active === false) {
      return NextResponse.json({ error: "관리자 권한이 없습니다." }, { status: 403 });
    }

    const body = await request.json();
    const { data: linked, error: linkedError } = await db.from("workers")
      .select("id,company_id").eq("user_id", auth.user.id).limit(2);
    if (linkedError) throw linkedError;
    if (linked?.length) {
      return NextResponse.json({ error: "이미 시공자 계정이 연결되어 있습니다." }, { status: 409 });
    }

    if (body.workerId) {
      const { data, error } = await db.from("workers")
        .update({ user_id: auth.user.id })
        .eq("id", body.workerId).eq("company_id", company.company_id)
        .eq("is_active", true).is("user_id", null)
        .select("id,name").maybeSingle();
      if (error) throw error;
      if (!data) return NextResponse.json({ error: "연결 가능한 시공자를 찾지 못했습니다." }, { status: 409 });
      return NextResponse.json({ worker: data });
    }

    const name = String(body.name || "").trim();
    const phone = String(body.phone || "").trim();
    const wage = payAmount(body.daily_wage);
    const allowance = payAmount(body.leader_allowance ?? 0);
    const effectiveFrom = payDate(body.pay_rate_effective_from || koreanDay());
    if (wage === null || allowance === null || !effectiveFrom || effectiveFrom > koreanDay()) {
      return NextResponse.json({ error: "일당, 팀장수당과 적용 시작일을 확인해주세요." }, { status: 400 });
    }
    if (!name || !phone || !Number.isSafeInteger(wage) || wage < 0) {
      return NextResponse.json({ error: "이름, 전화번호, 기본 일당을 확인해주세요." }, { status: 400 });
    }
    const { data, error } = await db.from("workers").insert({
      company_id: company.company_id, user_id: auth.user.id,
      name, phone, daily_wage: wage, leader_allowance: allowance, pay_rate_effective_from: effectiveFrom, is_active: true,
      position: null, specialties: [], memo: null,
    }).select("id,name").single();
    if (error) throw error;
    return NextResponse.json({ worker: data });
  } catch (error) {
    console.error("관리자 시공자 연결:", error);
    return NextResponse.json({ error: error?.message || "처리하지 못했습니다." }, { status: 500 });
  }
}
