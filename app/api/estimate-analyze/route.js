import {resolvePortal} from '../../../lib/customerPortal.mjs';
import { NextResponse } from "next/server";
import { getUsageAdminSupabase, checkUsageLimit, makeUsageLimitError } from "../../utils/serverUsageLimit";
import { ESTIMATE_ANALYSIS_MODEL } from "../../../lib/estimatePhotoAnalysis";
import { analyzeEstimateHierarchy as analyzeEstimatePhotos } from "../../../lib/server/analyzeEstimateHierarchy";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request) {
  try {
    const form = await request.formData();
    const slug = String(form.get("company_slug") || "").trim().toLowerCase();
    const customerToken=form.get('customer_token');
    if(customerToken){const portal=await resolvePortal(customerToken);if(!portal||portal.company.slug!==slug)return NextResponse.json({error:'고객 링크가 만료되었습니다. 업체에 새 링크를 요청해주세요.'},{status:403});}
    const files = form.getAll("images");
    let targetChoices;
    try { targetChoices=JSON.parse(String(form.get("target_choices")||"[]")); } catch { return NextResponse.json({error:"시공 대상 선택을 확인해주세요."},{status:400}); }
    if (!Array.isArray(targetChoices)||targetChoices.length>10||targetChoices.some(x=>typeof x!=="string"||x.length>40)) return NextResponse.json({error:"시공 대상 선택을 확인해주세요."},{status:400});
    if (!/^[a-z0-9-]+$/.test(slug) || files.length < 1 || files.length > 10 ||
      files.some((file) => !["image/jpeg", "image/png", "image/webp"].includes(file.type) || !file.size || file.size > 2_000_000) ||
      files.reduce((sum, file) => sum + file.size, 0) > 4_000_000) {
      return NextResponse.json({ error: "사진은 최대 10장, 합계 4MB 이하로 분석해주세요." }, { status: 400 });
    }
    const supabase = getUsageAdminSupabase();
    if (!supabase || !process.env.OPENAI_API_KEY) return NextResponse.json({ error: "사진 분석 설정을 확인해주세요." }, { status: 503 });
    const { data: company, error } = await supabase.from("companies")
      .select("id, slug, company_name, subscription_plan, is_active").eq("slug", slug).eq("is_active", true).maybeSingle();
    if (error || !company) return NextResponse.json({ error: "업체 정보를 확인할 수 없습니다." }, { status: 404 });
    const limit = await checkUsageLimit({ company, eventType: "ai_photo_analysis", requestedQuantity: files.length, supabase });
    if (!limit.ok) return NextResponse.json(makeUsageLimitError(limit), { status: limit.status || 429 });
    const result = await analyzeEstimatePhotos(files, process.env.OPENAI_API_KEY, undefined, targetChoices);
    const { data: usage, error: usageError } = await supabase.from("usage_events").insert({
      company_id: company.id, event_type: "ai_photo_analysis", quantity: files.length, cost_krw: 0,
      provider: "openai", model: ESTIMATE_ANALYSIS_MODEL, reference_id: null,
      metadata: { company_slug: company.slug, photo_type: "estimate_batch", analyzed_photo_count: files.length,
        hierarchy_photos: result.photos.map(({index,analysis})=>({index,targets:analysis.hierarchy_targets||[]})),
        openai_usage: result.usage, photos: result.photos.map(({ index, analysis }) => ({ index,
          target_type: analysis.target_type, door_count: analysis.door_count, object_key: analysis.object_key,
          object_confidence: analysis.object_confidence, object_evidence: analysis.object_evidence,
          construction_scope: analysis.construction_scope, view_completeness: analysis.view_completeness,
          classification_confidence: analysis.classification_confidence, classification_evidence: analysis.classification_evidence,
          requires_confirmation: analysis.requires_confirmation, confirmation_reason: analysis.confirmation_reason,
        })) },
    }).select("id").single();
    if (usageError) { console.error("Estimate analysis usage record failed:", usageError.code); return NextResponse.json({error:"분석 결과를 저장하지 못했습니다. 다시 시도해주세요."},{status:503}); }
    return NextResponse.json({ success: true, analysis_id: usage?.id || null, photos: result.photos });
  } catch (error) {
    console.warn("Estimate photo analysis failed:", {
      code: error.analysisCode || "internal",
      providerStatus: error.providerStatus,
      providerCode: error.providerCode,
    });
    if (error.analysisCode) {
      return NextResponse.json({ error: error.message, code: error.analysisCode }, { status: error.status || 502 });
    }
    return NextResponse.json({ error: "사진을 함께 분석하지 못했습니다. 잠시 후 다시 시도해주세요." }, { status: 502 });
  }
}
