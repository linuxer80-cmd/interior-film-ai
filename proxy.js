import { checkAiRequestQuota } from "./lib/aiQuota";
import { NextResponse } from "next/server";
import {
  createHmac,
  randomUUID,
} from "node:crypto";

const features = {
  "/api/analyze": "ai_photo_analysis",
  "/api/estimate-analyze": "ai_photo_analysis",
  "/api/similar-estimate": "similar_image_search",
  "/api/virtual-install": "virtual_remodel",
  "/api/worker/cutting-notes": "cutting_ocr",
  "/api/dealer-receipts": "receipt_ocr",
  "/api/admin/site-screenshot": "consultation_ocr",
  "/api/admin/transcribe-site-call": "voice_transcription",
  "/api/admin/parse-site-call": "consultation_parse",
  "/api/admin/help-chat": "help_chat",
  "/api/quick-register/analyze": "quick_photo_analysis",
  "/api/embedding": "embedding",
  "/api/analyze-work-structure": "structure_analysis",
};

const publicPaths = new Set([
  "/api/analyze",
  "/api/estimate-analyze",
  "/api/similar-estimate",
  "/api/virtual-install",
]);

export async function proxy(request) {
  const headers = new Headers(request.headers);

  headers.delete("x-film-ai-context");
  headers.delete("x-film-ai-signature");

  const path = request.nextUrl.pathname.replace(
    /\/$/,
    ""
  );

  const feature = features[path];

  if (request.method !== "POST" || !feature) {
    return NextResponse.next({
      request: { headers },
    });
  }

  const secret =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!secret) {
    return NextResponse.json(
      {
        error: "AI 서버 설정을 확인해주세요.",
      },
      { status: 503 }
    );
  }

  try {
    let body;

    const type =
      request.headers.get("content-type") || "";

    // 실행 환경별 FormData 생성자 차이에 영향을 받지 않도록
    // 요청 형식으로 구분합니다.
    const isMultipart =
      type.includes("multipart/form-data");

    if (isMultipart) {
      body = await request.clone().formData();
    } else if (type.includes("application/json")) {
      body = await request.clone().json();
    }

    const field = (key) =>
      isMultipart
        ? body.get(key)
        : body?.[key];

    const files = isMultipart
      ? [...body.values()].filter(
          (value) =>
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
        {
          error: "사진을 나누어 분석해주세요.",
        },
        { status: 400 }
      );
    }

    const companySlug = String(
      field("company_slug") || ""
    )
      .trim()
      .toLowerCase();

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
      worker:
        path === "/api/worker/cutting-notes",
      siteId:
        request.nextUrl.searchParams.get(
          "siteId"
        ) || "",
      targetCompany:
        feature === "structure_analysis"
          ? String(
              field("company_id") || ""
            )
          : "",
    });

    headers.set(
      "x-film-ai-context",
      context
    );

    headers.set(
      "x-film-ai-signature",
      createHmac("sha256", secret)
        .update(context)
        .digest("hex")
    );

    await checkAiRequestQuota(headers);

    return NextResponse.next({
      request: { headers },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error.status
          ? error.message
          : "AI 요청 또는 횟수 설정을 확인해주세요.",
        code:
          error.code ||
          "AI_QUOTA_UNAVAILABLE",
      },
      {
        status: error.status || 503,
      }
    );
  }
}

export const config = {
  matcher: "/api/:path*",
};
