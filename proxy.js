import { checkAiRequestQuota } from "./lib/aiQuota";
import { NextResponse } from "next/server";
import { createHmac, randomUUID } from "node:crypto";

const features = {
  "/api/test/door-estimate": "ai_photo_analysis",
  "/api/analyze": "ai_photo_analysis",
  "/api/estimate-analyze": "ai_photo_analysis",
  "/api/similar-estimate": "similar_image_search",
  "/api/virtual-install": "virtual_remodel",
  "/api/worker/cutting-notes": "cutting_ocr",
  "/api/dealer-receipts": "receipt_ocr",
  "/api/dealer-price-ocr": "receipt_ocr",
  "/api/admin/site-screenshot": "consultation_ocr",
  "/api/admin/transcribe-site-call": "voice_transcription",
  "/api/admin/parse-site-call": "consultation_parse",
  "/api/admin/customer-chat/quote": "consultation_parse",
  "/api/admin/help-chat": "help_chat",
  "/api/quick-register/analyze": "quick_photo_analysis",
  "/api/embedding": "embedding",
  "/api/analyze-work-structure": "structure_analysis",
  "/api/super-admin/reclassify-doors": "structure_analysis",
  "/api/super-admin/photo-data": "structure_analysis",
  "/api/admin/photo-data": "structure_analysis",
};

const publicPaths = new Set([
  "/api/test/door-estimate",
  "/api/analyze",
  "/api/estimate-analyze",
  "/api/similar-estimate",
  "/api/virtual-install",
]);

export async function proxy(request) {
  const headers = new Headers(request.headers);

  // 外부에서 주입한 사용량 정보를 신뢰하지 않습니다.
  headers.delete("x-film-ai-context");
  headers.delete("x-film-ai-signature");

  const path = request.nextUrl.pathname.replace(/\/$/, "");
  const feature = features[path];

  // 일반 API와 GET 요청은 AI 횟수 제한을 적용하지 않습니다.
  // 출발 시간 예측은 자체 API에서 캐시 확인 후 별도 제한합니다.
  if (request.method !== "POST" || !feature) {
    return NextResponse.next({
      request: { headers },
    });
  }

  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!secret) {
    return NextResponse.json(
      { error: "AI 서버 설정을 확인해주세요." },
      { status: 503 }
    );
  }

  try {
    let body;
    const type = request.headers.get("content-type") || "";
    const isMultipart = type.includes("multipart/form-data");

    if (isMultipart) {
      body = await request.clone().formData();
    } else if (type.includes("application/json")) {
      body = await request.clone().json();
    }

    // Listing existing cases makes no AI call; route still verifies super-admin access.
    if (path === "/api/super-admin/reclassify-doors" && body && !body.work_id) {
      return NextResponse.next({ request: { headers } });
    }

    // Manual classification and price saves do not call AI.
    if (["/api/super-admin/photo-data", "/api/admin/photo-data"].includes(path) && (isMultipart ? body?.get("action") : body?.action) !== "analyze") {
      return NextResponse.next({ request: { headers } });
    }

    let metadata = null;

    if (isMultipart && path === "/api/similar-estimate") {
      const raw = String(body.get("metadata") || "{}");

      if (raw.length > 12000) {
        return NextResponse.json(
          { error: "비교 사진과 요청 정보를 확인해주세요." },
          { status: 400 }
        );
      }

      try {
        metadata = JSON.parse(raw);
      } catch {
        return NextResponse.json(
          { error: "비교 사진과 요청 정보를 확인해주세요." },
          { status: 400 }
        );
      }

      if (
        !metadata ||
        typeof metadata !== "object" ||
        Array.isArray(metadata)
      ) {
        return NextResponse.json(
          { error: "비교 사진과 요청 정보를 확인해주세요." },
          { status: 400 }
        );
      }
    }

    const field = key =>
      metadata !== null
        ? metadata[key]
        : isMultipart
          ? body.get(key)
          : body?.[key];

    const files = isMultipart
      ? [...body.values()].filter(
          value =>
            typeof value !== "string" &&
            value.type?.startsWith("image/")
        )
      : [];

    const imageFeatures = [
      "ai_photo_analysis",
      "quick_photo_analysis",
      "cutting_ocr",
      "receipt_ocr",
      "consultation_ocr",
    ];

    const units = imageFeatures.includes(feature)
      ? Math.max(1, files.length)
      : 1;

    if (units > 30) {
      return NextResponse.json(
        { error: "사진을 나누어 분석해주세요." },
        { status: 400 }
      );
    }

    const companySlug = String(
      field("company_slug") || ""
    ).trim().toLowerCase();

    if (
      publicPaths.has(path) &&
      !companySlug &&
      !headers.get("authorization")
    ) {
      return NextResponse.json(
        {
          error:
            "견적을 요청할 업체 정보가 없습니다. 업체 견적 링크에서 다시 시도해주세요.",
          code: "AI_COMPANY_REQUIRED",
        },
        { status: 400 }
      );
    }

    const context = JSON.stringify({
      version: 1,
      requestId: randomUUID(),
      createdAt: Date.now(),
      feature,
      units,
      public: publicPaths.has(path),
      companySlug,
      worker: path === "/api/worker/cutting-notes",
      siteId:
        request.nextUrl.searchParams.get("siteId") || "",
      targetCompany:
        feature === "structure_analysis"
          ? String(field("company_id") || "")
          : "",
    });

    headers.set("x-film-ai-context", context);
    headers.set(
      "x-film-ai-signature",
      createHmac("sha256", secret)
        .update(context)
        .digest("hex")
    );

    // 현재 요청의 기능만 확인합니다.
    // 다른 기능의 소진 여부나 전체 합산으로 차단하지 않습니다.
    await checkAiRequestQuota(headers);

    return NextResponse.next({
      request: { headers },
    });
  } catch (error) {
    const limited = error.status === 429;

    // 이 요청에만 오류를 반환합니다.
    // 회사 상태 변경, 로그아웃, 다른 기능 차단은 하지 않습니다.
    return NextResponse.json(
      {
        error: error.status
          ? error.message
          : "AI 요청 또는 횟수 설정을 확인해주세요.",
        code: error.code || "AI_QUOTA_UNAVAILABLE",
        feature,
        blockedFeature: limited ? feature : null,
        blockScope: limited ? "feature" : "request",
        otherFeaturesAvailable: limited ? true : undefined,
      },
      { status: error.status || 503 }
    );
  }
}

export const config = {
  matcher: "/api/:path*",
};

