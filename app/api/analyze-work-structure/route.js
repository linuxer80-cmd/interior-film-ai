import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 60;

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}

function extractOutputText(data) {
  if (
    typeof data?.output_text === "string" &&
    data.output_text.trim()
  ) {
    return data.output_text.trim();
  }

  if (Array.isArray(data?.output)) {
    for (const outputItem of data.output) {
      if (!Array.isArray(outputItem?.content)) continue;

      for (const contentItem of outputItem.content) {
        if (
          typeof contentItem?.text === "string" &&
          contentItem.text.trim()
        ) {
          return contentItem.text.trim();
        }
      }
    }
  }

  return "";
}

function parseJson(text) {
  let cleaned = String(text || "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");

  if (
    firstBrace !== -1 &&
    lastBrace !== -1 &&
    lastBrace > firstBrace
  ) {
    cleaned = cleaned.slice(
      firstBrace,
      lastBrace + 1
    );
  }

  return JSON.parse(cleaned);
}

function getPublicImageUrl(photo) {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (photo?.photo_url) {
    const url = String(photo.photo_url);

    if (
      url.startsWith("http://") ||
      url.startsWith("https://") ||
      url.startsWith("data:")
    ) {
      return url;
    }
  }

  if (!photo?.storage_path || !supabaseUrl) {
    return null;
  }

  let path = String(photo.storage_path)
    .replace(/^\/+/, "");

  if (path.startsWith("work-photos/")) {
    path = path.slice("work-photos/".length);
  }

  return `${supabaseUrl}/storage/v1/object/public/work-photos/${path}`;
}

async function getImageDataUrl(photo) {
  const imageUrl = getPublicImageUrl(photo);

  if (!imageUrl) {
    throw new Error("사진 URL을 찾을 수 없습니다.");
  }

  const response = await fetch(imageUrl);

  if (!response.ok) {
    throw new Error(
      `사진 다운로드 실패 (${response.status})`
    );
  }

  const contentType =
    response.headers.get("content-type") ||
    "image/jpeg";

  const arrayBuffer =
    await response.arrayBuffer();

  const base64 =
    Buffer.from(arrayBuffer).toString("base64");

  return `data:${contentType};base64,${base64}`;
}

function makeInstruction(photo) {
  const existingCategory =
    photo?.category || "";

  const existingSubCategory =
    photo?.sub_category || "";

  return `
당신은 인테리어필름 시공 견적 데이터 분석가이다.

이 사진은 과거 인테리어필름 시공 데이터이다.

이 분석의 목적은
"사진의 색상이 비슷한가"를 판단하는 것이 아니라
"인테리어필름 시공 견적 관점에서 구조와 작업량이 비슷한가"를
판단하기 위한 구조화 데이터를 만드는 것이다.

현재 DB에 저장된 참고 정보:

category:
${existingCategory || "없음"}

sub_category:
${existingSubCategory || "없음"}

중요 규칙:

1. 기존 필름 색상은 견적 유사도 판단에서 제외한다.
2. 화이트, 아이보리, 베이지, 브라운, 그레이 등의 색상을
   visual_features와 estimate_search_text에 기록하지 않는다.
3. 사진의 밝기, 조명, 벽지색, 바닥색, 주변 인테리어 색상도 제외한다.
4. 시공 대상의 구조, 형태, 크기, 구성, 작업 난이도를 중심으로 분석한다.
5. 사진에서 확인할 수 없는 특징은 추측하지 않는다.
6. 확실하지 않은 값은 null로 반환한다.
7. 기존 category와 sub_category는 참고하되
   이 API에서는 기존 DB category/sub_category를 수정하지 않는다.
8. 반드시 JSON만 반환한다.

분류 시 특히 다음 특징을 확인한다.

[문 / 문틀 / 중문]

- 일반 방문인지
- 평문인지
- 패널형인지
- 유리가 있는지
- 유리 간살이 있는지
- 슬라이딩인지
- 여닫이인지
- 중문인지
- 방화문인지
- 문짝 수
- 2연동 / 3연동 등 연동 구조
- 문틀 포함 여부
- 몰딩이나 굴곡 여부
- 손잡이 / 도어락 등 부착물
- 시공 난이도

[싱크대 / 주방가구]

- 일자형
- ㄱ자형
- ㄷ자형
- 기타 구조
- 상부장 존재 여부
- 하부장 존재 여부
- 냉장고장 존재 여부
- 키큰장 존재 여부
- 팬트리장 존재 여부
- 아일랜드장 존재 여부
- 대략적인 문짝 수
- 전체 규모
- 굴곡이나 복잡한 구조
- 시공 난이도

[붙박이장 / 신발장 / 냉장고장 / 기타 가구]

- 가구 종류
- 문짝 수
- 여닫이 / 슬라이딩
- 유리 포함 여부
- 프레임 구조
- 전체 규모
- 굴곡
- 시공 난이도

scale 값은 다음 중 하나를 사용한다.

small
medium
large

complexity 값은 다음 중 하나를 사용한다.

low
medium
high

사진만으로 판단할 수 없으면 null.

반드시 아래 형식의 JSON만 반환한다.

{
  "visual_features": {
    "object_type": null,
    "object_subtype": null,

    "style": null,
    "layout": null,
    "opening_type": null,

    "panel_count": null,
    "door_count_estimate": null,

    "glass": null,
    "grid": null,
    "frame": null,
    "molding": null,

    "upper": null,
    "lower": null,
    "fridge": null,
    "tall": null,
    "pantry": null,
    "island": null,

    "scale": null,
    "complexity": null,

    "special_features": []
  },

  "estimate_search_text":
    "색상 표현 없이 시공부위, 구조, 규모, 구성, 난이도만 한국어로 간결하게 설명"
}
`;
}

async function analyzePhoto(photo) {
  const imageDataUrl =
    await getImageDataUrl(photo);

  const instruction =
    makeInstruction(photo);

  const response = await fetch(
    "https://api.openai.com/v1/responses",
    {
      method: "POST",

      headers: {
        Authorization:
          `Bearer ${process.env.OPENAI_API_KEY}`,

        "Content-Type":
          "application/json",
      },

      body: JSON.stringify({
        model: "gpt-5.6-luna",

        input: [
          {
            role: "user",

            content: [
              {
                type: "input_text",
                text: instruction,
              },
              {
                type: "input_image",
                image_url: imageDataUrl,
              },
            ],
          },
        ],
      }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
        "AI 구조분석 요청 실패"
    );
  }

  const outputText =
    extractOutputText(data);

  if (!outputText) {
    throw new Error(
      "AI 구조분석 결과가 없습니다."
    );
  }

  const result =
    parseJson(outputText);

  if (
    !result ||
    typeof result !== "object"
  ) {
    throw new Error(
      "AI 구조분석 결과 형식 오류"
    );
  }

  return result;
}

export async function POST(request) {
  try {
    const supabase =
      getSupabase();

    let body = {};

    try {
      body = await request.json();
    } catch {
      body = {};
    }

    /*
     * 한 번에 너무 많은 사진을 처리하면
     * Vercel timeout 위험이 있으므로
     * 기본 3장씩 처리
     */
    const requestedLimit =
      Number(body?.limit || 3);

    const limit =
      Math.max(
        1,
        Math.min(
          requestedLimit,
          5
        )
      );

    /*
     * 전체 사진 수
     */
    const {
      count: total,
      error: totalError,
    } =
      await supabase
        .from("work_photos")
        .select(
          "id",
          {
            count: "exact",
            head: true,
          }
        );

    if (totalError) {
      throw totalError;
    }

    /*
     * 아직 구조분석하지 않은 사진 수
     */
    const {
      count: remainingBefore,
      error: remainingError,
    } =
      await supabase
        .from("work_photos")
        .select(
          "id",
          {
            count: "exact",
            head: true,
          }
        )
        .is(
          "structure_analyzed_at",
          null
        );

    if (remainingError) {
      throw remainingError;
    }

    /*
     * 분석 대상 조회
     */
    const {
      data: photos,
      error: photoError,
    } =
      await supabase
        .from("work_photos")
        .select(`
          id,
          photo_url,
          storage_path,
          photo_type,
          category,
          sub_category,
          ai_description,
          ai_tags,
          visual_features,
          estimate_search_text,
          structure_analyzed_at,
          created_at
        `)
        .is(
          "structure_analyzed_at",
          null
        )
        .order(
          "created_at",
          {
            ascending: true,
          }
        )
        .limit(limit);

    if (photoError) {
      throw photoError;
    }

    if (
      !photos ||
      photos.length === 0
    ) {
      return NextResponse.json({
        success: true,
        finished: true,

        total:
          total || 0,

        completed:
          total || 0,

        remaining: 0,

        processed: 0,

        failed: 0,

        results: [],
      });
    }

    const results = [];

    let processed = 0;
    let failed = 0;

    /*
     * 순차 처리
     *
     * 동시에 여러 AI 요청을 보내는 것보다
     * Vercel / OpenAI 오류 관리가 쉬움
     */
    for (const photo of photos) {
      try {
        const analysis =
          await analyzePhoto(photo);

        const visualFeatures =
          analysis?.visual_features &&
          typeof analysis.visual_features ===
            "object"
            ? analysis.visual_features
            : {};

        const estimateSearchText =
          String(
            analysis?.estimate_search_text ||
              ""
          ).trim();

        if (!estimateSearchText) {
          throw new Error(
            "견적 검색용 구조 설명이 없습니다."
          );
        }

        const {
          error: updateError,
        } =
          await supabase
            .from("work_photos")
            .update({
              visual_features:
                visualFeatures,

              estimate_search_text:
                estimateSearchText,

              structure_version: 1,

              structure_analyzed_at:
                new Date().toISOString(),
            })
            .eq(
              "id",
              photo.id
            );

        if (updateError) {
          throw updateError;
        }

        processed += 1;

        results.push({
          id: photo.id,
          success: true,

          category:
            photo.category,

          sub_category:
            photo.sub_category,

          visual_features:
            visualFeatures,

          estimate_search_text:
            estimateSearchText,
        });
      } catch (error) {
        failed += 1;

        console.error(
          "Structure analysis failed:",
          photo.id,
          error
        );

        /*
         * 실패한 사진은 analyzed_at을
         * 채우지 않는다.
         *
         * 다음 실행에서 다시 시도 가능.
         */
        results.push({
          id: photo.id,
          success: false,

          error:
            error?.message ||
            "구조분석 실패",
        });
      }
    }

    /*
     * 실제 남은 개수 다시 확인
     */
    const {
      count: remainingAfter,
      error: countError,
    } =
      await supabase
        .from("work_photos")
        .select(
          "id",
          {
            count: "exact",
            head: true,
          }
        )
        .is(
          "structure_analyzed_at",
          null
        );

    if (countError) {
      throw countError;
    }

    const completed =
      Math.max(
        0,
        Number(total || 0) -
          Number(
            remainingAfter || 0
          )
      );

    return NextResponse.json({
      success: true,

      finished:
        Number(
          remainingAfter || 0
        ) === 0,

      total:
        total || 0,

      completed,

      remaining:
        remainingAfter || 0,

      processed,

      failed,

      results,
    });
  } catch (error) {
    console.error(
      "Analyze work structure API error:",
      error
    );

    return NextResponse.json(
      {
        success: false,

        error:
          error?.message ||
          "기존 시공사진 구조분석 중 오류가 발생했습니다.",
      },
      {
        status: 500,
      }
    );
  }
}
