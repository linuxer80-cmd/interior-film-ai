import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 60;

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase 환경변수가 설정되지 않았습니다.");
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function getBearerToken(request) {
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) return null;
  const token = authorization.slice(7).trim();
  return token || null;
}

function cleanText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function parseAmount(value) {
  if (value === null || value === undefined || value === "") return null;
  const cleaned = String(value).replace(/,/g, "").replace(/원/g, "").trim();
  if (!cleaned) return null;
  const number = Number(cleaned);
  if (!Number.isFinite(number) || number < 0) return null;
  return number;
}

async function verifyAdmin(supabase, accessToken) {
  if (!accessToken) {
    return { ok: false, status: 401, error: "관리자 로그인이 필요합니다." };
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !userData?.user?.id) {
    console.error("관리자 인증 오류:", userError);
    return { ok: false, status: 401, error: "관리자 로그인 정보를 확인할 수 없습니다." };
  }

  const user = userData.user;
  const { data: profile, error: profileError } = await supabase.from("profiles")
    .select("id,company_id,role,is_active").eq("id", user.id).maybeSingle();

  if (profileError) {
    console.error("관리자 profile 조회 오류:", profileError);
    return { ok: false, status: 500, error: "관리자 업체 정보를 확인하지 못했습니다." };
  }
  if (!profile) {
    return { ok: false, status: 403, error: "관리자 업체 가입 정보가 없습니다." };
  }
  if (profile.role !== "owner") {
    return { ok: false, status: 403, error: "완료보고 검수는 업체 관리자만 할 수 있습니다." };
  }
  if (profile.is_active === false) {
    return { ok: false, status: 403, error: "비활성화된 관리자 계정입니다." };
  }
  if (!profile.company_id) {
    return { ok: false, status: 403, error: "관리자 계정에 업체가 연결되어 있지 않습니다." };
  }
  return { ok: true, user, profile };
}

export async function POST(request) {
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "요청 데이터를 확인할 수 없습니다." },
        { status: 400 }
      );
    }

    const siteId = cleanText(body?.siteId);
    const action = cleanText(body?.action);
    const reviewMemo = cleanText(body?.reviewMemo);
    const approvedAmount = parseAmount(body?.approvedAmount);

    if (!siteId) {
      return NextResponse.json(
        { success: false, error: "siteId가 필요합니다." }, { status: 400 }
      );
    }
    if (action !== "approve" && action !== "reject") {
      return NextResponse.json(
        { success: false, error: "올바른 검수 작업이 아닙니다." }, { status: 400 }
      );
    }
    if (action === "approve" && approvedAmount === null) {
      return NextResponse.json(
        { success: false, error: "실제 시공금액을 입력해주세요." }, { status: 400 }
      );
    }
    if (action === "reject" && !reviewMemo) {
      return NextResponse.json(
        { success: false, error: "보완 요청 사유를 입력해주세요." }, { status: 400 }
      );
    }

    const supabase = getAdminClient();
    const accessToken = getBearerToken(request);
    const authResult = await verifyAdmin(supabase, accessToken);
    if (!authResult.ok) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status || 403 }
      );
    }

    const { user, profile } = authResult;
    const companyId = profile.company_id;
    const { data: site, error: siteError } = await supabase.from("sites")
      .select("id,company_id,site_name,customer_name,status")
      .eq("id", siteId).eq("company_id", companyId).maybeSingle();

    if (siteError) {
      console.error("검수 현장 조회 오류:", siteError);
      return NextResponse.json(
        { success: false, error: "현장 정보를 확인하지 못했습니다." }, { status: 500 }
      );
    }
    if (!site) {
      return NextResponse.json(
        { success: false, error: "현장을 찾을 수 없거나 이 업체의 현장이 아닙니다." },
        { status: 404 }
      );
    }

    const { data: reportRows, error: reportError } = await supabase.from("work_reports")
      .select(
        "id,company_id,site_id,worker_id,work_region,work_summary,memo,completed_at,review_status,reviewed_at,reviewed_by,approved_amount,review_memo,created_at,updated_at"
      )
      .eq("company_id", companyId).eq("site_id", siteId)
      .order("updated_at", { ascending: false }).limit(1);

    if (reportError) {
      console.error("검수 완료보고 조회 오류:", reportError);
      return NextResponse.json(
        { success: false, error: "완료보고를 확인하지 못했습니다." }, { status: 500 }
      );
    }

    const report = Array.isArray(reportRows) && reportRows.length > 0 ? reportRows[0] : null;
    if (!report) {
      return NextResponse.json(
        { success: false, error: "검수할 완료보고가 없습니다." }, { status: 404 }
      );
    }

    const currentStatus = report.review_status || "pending";
    if (currentStatus === "approved") {
      return NextResponse.json(
        { success: false, error: "이미 승인된 완료보고입니다." }, { status: 409 }
      );
    }
    if (currentStatus === "rejected") {
      return NextResponse.json({
        success: false,
        error: "이미 보완 요청된 완료보고입니다. 시공자의 재제출을 기다려주세요.",
      }, { status: 409 });
    }
    if (currentStatus !== "pending") {
      return NextResponse.json({
        success: false, error: `처리할 수 없는 검수 상태입니다: ${currentStatus}`,
      }, { status: 409 });
    }

    const nextStatus = action === "approve" ? "approved" : "rejected";
    const updatePayload = {
      review_status: nextStatus,
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.id,
      review_memo: reviewMemo,
      approved_amount: action === "approve" ? approvedAmount : null,
      updated_at: new Date().toISOString(),
    };

    const { data: updatedRows, error: updateError } = await supabase.from("work_reports")
      .update(updatePayload).eq("id", report.id)
      .eq("company_id", companyId).eq("review_status", "pending")
      .select(
        "id,site_id,worker_id,work_summary,review_status,reviewed_at,reviewed_by,approved_amount,review_memo,updated_at"
      );

    if (updateError) {
      console.error("완료보고 검수 저장 오류:", updateError);
      return NextResponse.json(
        { success: false, error: "검수 결과를 저장하지 못했습니다." }, { status: 500 }
      );
    }

    const updatedReport = Array.isArray(updatedRows) && updatedRows.length > 0
      ? updatedRows[0] : null;
    if (!updatedReport) {
      return NextResponse.json({
        success: false,
        error: "검수 상태가 이미 변경되었습니다. 화면을 새로고침한 후 다시 확인해주세요.",
      }, { status: 409 });
    }

    return NextResponse.json({
      success: true,
      action,
      site: {
        id: site.id, siteName: site.site_name, customerName: site.customer_name,
      },
      report: updatedReport,
      review: {
        status: updatedReport.review_status,
        reviewedAt: updatedReport.reviewed_at,
        reviewedBy: updatedReport.reviewed_by,
        approvedAmount: updatedReport.approved_amount,
        memo: updatedReport.review_memo,
      },
      aiRegistered: false,
      message: action === "approve"
        ? "검수 승인이 저장되었습니다. 아직 AI 견적자료에는 등록되지 않았습니다."
        : "보완 요청이 저장되었습니다. 시공자가 내용을 수정하여 다시 제출할 수 있습니다.",
    });
  } catch (error) {
    console.error("관리자 완료보고 검수 처리 오류:", error);
    return NextResponse.json({
      success: false,
      error: error?.message || "검수 처리 중 오류가 발생했습니다.",
    }, { status: 500 });
  }
}
