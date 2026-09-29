import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  checkUsageLimit,
  makeUsageLimitError,
} from "../../utils/serverUsageLimit";

import { FILM_TARGET_RULES, ESTIMATE_OBSERVATION_RULES } from "../../utils/visionRules";
import { normalizeAnalysisClassification } from "../../utils/categoryUtils";

export const runtime = "nodejs";
export const maxDuration = 60;

const AI_MODEL = "gpt-5.6-luna";

/*
 * =========================================================
 * Supabase 관리자 클라이언트
 * =========================================================
 */

function getAdminSupabase() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient(
    supabaseUrl,
    serviceRoleKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}

/*
 * =========================================================
 * 업체 조회
 * =========================================================
 */

async function resolveCompanyBySlug(
  companySlug
) {
  const normalizedSlug =
    String(companySlug || "")
      .trim()
      .toLowerCase();

  if (!normalizedSlug) {
    return null;
  }

  const supabase =
    getAdminSupabase();

  if (!supabase) {
    console.error(
      "AI 분석 회사 조회 실패: Supabase 서버 환경변수가 없습니다."
    );

    return null;
  }

  const {
    data,
    error,
  } = await supabase
    .from("companies")
    .select(
      `
        id,
        slug,
        company_name,
        subscription_plan,
        is_active
      `
    )
    .eq(
      "slug",
      normalizedSlug
    )
    .maybeSingle();

  if (error) {
    console.error(
      "AI 분석 회사 조회 오류:",
      error
    );

    return null;
  }

  if (
    !data ||
    data.is_active === false
  ) {
    return null;
  }

  return data;
}

/*
 * =========================================================
 * AI 사진 분석 사용량 기록
 * =========================================================
 */

async function recordPhotoAnalysisUsage({
  company,
  quantity = 1,
  photoType = "before",
  openaiUsage = null,
  beforeCount = null,
  afterCount = null,
}) {
  if (!company?.id) {
    return false;
  }

  const supabase =
    getAdminSupabase();

  if (!supabase) {
    console.error(
      "AI 사진분석 사용량 기록 실패: Supabase 서버 설정 없음"
    );

    return false;
  }

  try {
    const safeQuantity =
      Math.max(
        1,
        Number(quantity) || 1
      );

    const {
      error,
    } = await supabase
      .from("usage_events")
      .insert({
        company_id:
          company.id,

        event_type:
          "ai_photo_analysis",

        quantity:
          safeQuantity,

        cost_krw: 0,

        provider:
          "openai",

        model:
          AI_MODEL,

        reference_id:
          null,

        metadata: {
          company_slug:
            company.slug ||
            null,

          company_name:
            company.company_name ||
            null,

          subscription_plan:
            company.subscription_plan ||
            null,

          photo_type:
            photoType,

          before_count:
            beforeCount,

          after_count:
            afterCount,

          analyzed_photo_count:
            safeQuantity,

          openai_usage:
            openaiUsage ||
            null,
        },
      });

    if (error) {
      console.error(
        "AI 사진분석 사용량 기록 오류:",
        error
      );

      return false;
    }

    return true;
  } catch (error) {
    console.error(
      "AI 사진분석 사용량 기록 예외:",
      error
    );

    return false;
  }
}

/*
 * =========================================================
 * 이미지 파일 → Data URL
 * =========================================================
 */

async function fileToDataUrl(file) {
  const buffer =
    await file.arrayBuffer();

  const base64 =
    Buffer.from(buffer)
      .toString("base64");

  const mimeType =
    file.type ||
    "image/jpeg";

  return `data:${mimeType};base64,${base64}`;
}

/*
 * =========================================================
 * OpenAI 응답 텍스트 추출
 * =========================================================
 */

function extractOutputText(data) {
  if (
    typeof data?.output_text ===
      "string" &&
    data.output_text.trim()
  ) {
    return data.output_text.trim();
  }

  if (
    Array.isArray(
      data?.output
    )
  ) {
    for (
      const outputItem of
      data.output
    ) {
      if (
        !Array.isArray(
          outputItem?.content
        )
      ) {
        continue;
      }

      for (
        const contentItem of
        outputItem.content
      ) {
        if (
          typeof contentItem?.text ===
            "string" &&
          contentItem.text.trim()
        ) {
          return contentItem.text.trim();
        }
      }
    }
  }

  return "";
}

/*
 * =========================================================
 * AI JSON 파싱
 * =========================================================
 */

function parseAnalysisJson(
  outputText
) {
  let cleanedText =
    String(
      outputText || ""
    )
      .replace(
        /```json/gi,
        ""
      )
      .replace(
        /```/g,
        ""
      )
      .trim();

  const firstBrace =
    cleanedText.indexOf("{");

  const lastBrace =
    cleanedText.lastIndexOf("}");

  if (
    firstBrace !== -1 &&
    lastBrace !== -1 &&
    lastBrace > firstBrace
  ) {
    cleanedText =
      cleanedText.slice(
        firstBrace,
        lastBrace + 1
      );
  }

  return JSON.parse(
    cleanedText
  );
}

/*
 * =========================================================
 * 문자열 판정
 * =========================================================
 */

/*
 * =========================================================
 * 공통 분류 규칙
 * =========================================================
 */

function makeClassificationRules() {
  return `
${FILM_TARGET_RULES}
사진에서 실제 시공할 주 대상을 하나 정하고 배경에 보이는 물체와 구분한다.
출입문은 사람이 통과하는 개구부와 건축용 문틀이 근거다.
수납장의 손잡이/경첩은 출입문 근거가 아니다. 선반과 연속 수납 도어는 가구다.
붙박이장, 신발장, 냉장고장 문짝을 방문으로 분류하지 않는다.
붙박이장은 옷 수납 구조나 침실의 긴 장 등 근거가 필요하다. 흰색 문짝이라는 이유만으로 붙박이장으로 단정하지 않는다.
냉장고용 큰 빈 칸과 상단 수납장/측판이 보이면 냉장고장(kitchen_fridge) 후보이며 붙박이장과 구분한다.
현관 출입문 옆의 얕은 연속 수납장과 신발 선반은 신발장(shoe) 근거다. 장소만으로 확정하지 않는다.
싱크대는 상판·싱크볼·조리 공간 등 실제 근거를 확인한다.
상부장/하부장/냉장고장을 구분하고 보이지 않는 부위를 전체 시공으로 추정하지 않는다.
배경 물체나 "붙박이장 아님" 같은 부정 표현을 주 대상에 넣지 않는다.
대상이 여러 개라 결정할 수 없거나 사진이 불명확하면 confidence를 low로 둔다.
category, sub_category는 주 대상 이름만 적고 설명 문장을 넣지 않는다.
target_type은 door, middle_door, fire_door, kitchen, closet, shoe, vanity, window, molding, wall, other 중 하나다.
construction_scope는 kitchen_lower, kitchen_upper, kitchen_full, kitchen_fridge, unknown, whole 중 하나다.
kitchen_full은 상부장과 하부장 둘 다 확인될 때만, 비주방은 whole, 범위 불명확한 주방은 unknown이다.
classification_confidence는 high, medium, low 중 하나이며 확실하지 않으면 high로 단정하지 않는다.
classification_evidence는 주 대상의 실제 구조 근거만 한 문장으로 적는다.
한국어 JSON만 반환한다. description은 2문장 이내, tags는 5개 이내다.
`;
}

/*
 * =========================================================
 * POST
 * =========================================================
 */

export async function POST(
  request
) {
  try {
    const formData =
      await request.formData();

    const image =
      formData.get("image");

    /*
     * 업체 slug
     */

    const companySlug =
      String(
        formData.get(
          "company_slug"
        ) || ""
      )
        .trim()
        .toLowerCase();

    /*
     * 업체 확인
     */

    let company = null;

    if (companySlug) {
      company =
        await resolveCompanyBySlug(
          companySlug
        );

      if (!company) {
        return NextResponse.json(
          {
            success: false,
            error:
              "업체 정보를 확인할 수 없습니다.",
          },
          {
            status: 400,
          }
        );
      }
    }

    /*
     * =========================================================
     * 전후 비교용 이미지
     * =========================================================
     */

    const beforeImages =
      formData.getAll(
        "beforeImages"
      );

    const afterImages =
      formData.getAll(
        "afterImages"
      );

    const legacyBeforeImage =
      formData.get(
        "beforeImage"
      );

    const legacyAfterImage =
      formData.get(
        "afterImage"
      );

    const receivedPhotoType =
      String(
        formData.get(
          "photoType"
        ) || "before"
      )
        .trim()
        .toLowerCase();

    const photoType =
      receivedPhotoType ===
      "after"
        ? "after"
        : receivedPhotoType ===
            "compare"
          ? "compare"
          : "before";

    /*
     * =========================================================
     * 다중 전후 비교
     * =========================================================
     */

    if (
      photoType === "compare"
    ) {
      const allBeforeImages =
        beforeImages.length > 0
          ? beforeImages
          : legacyBeforeImage
            ? [
                legacyBeforeImage,
              ]
            : [];

      const allAfterImages =
        afterImages.length > 0
          ? afterImages
          : legacyAfterImage
            ? [
                legacyAfterImage,
              ]
            : [];

      if (
        allBeforeImages.length ===
          0 ||
        allAfterImages.length ===
          0
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              "전후 비교 분석에는 시공 전 사진과 시공 후 사진이 모두 필요합니다.",
          },
          {
            status: 400,
          }
        );
      }

      /*
       * 사용량 사전검사
       */

      if (company) {
        const requestedQuantity =
          allBeforeImages.length +
          allAfterImages.length;

        const limitCheck =
          await checkUsageLimit({
            company,
            eventType:
              "ai_photo_analysis",
            requestedQuantity,
          });

        if (!limitCheck.ok) {
          return NextResponse.json(
            makeUsageLimitError(
              limitCheck
            ),
            {
              status:
                limitCheck.status ||
                429,
            }
          );
        }
      }

      const beforeDataUrls =
        await Promise.all(
          allBeforeImages.map(
            (file) =>
              fileToDataUrl(
                file
              )
          )
        );

      const afterDataUrls =
        await Promise.all(
          allAfterImages.map(
            (file) =>
              fileToDataUrl(
                file
              )
          )
        );

      const instruction = `
당신은 인테리어필름 전문 시공 분석가이다.

사용자가 한 시공건의 사진들을 여러 장 제공한다.

앞부분의 사진들은 모두 "시공 전 사진 묶음"이다.
뒷부분의 사진들은 모두 "시공 후 사진 묶음"이다.

${makeClassificationRules()}

중요:

사진 수가 서로 다를 수 있다.
사진 순서가 서로 정확히 대응하지 않을 수 있다.

사진 한 장씩 억지로 짝을 맞추지 말고,
전체 시공 전 사진 묶음과
전체 시공 후 사진 묶음을 종합적으로 비교하라.

분석 규칙:

1. 가장 먼저 실제 시공 대상의 종류를 분류한다.

2. 여러 사진에서 반복적으로 보이는 시공 부위를 확인한다.

3. 시공 전과 시공 후에서 실제로 확인되는 변화를 분석한다.

4. 문, 문틀, 싱크대, 붙박이장, 신발장, 몰딩 등을
   사진에서 확인되는 구조에 따라 구분한다.

5. 문과 가구 도어를 혼동하지 않는다.

6. 사진 순서가 다르다고 해서
   임의로 같은 물체라고 단정하지 않는다.

7. 사진에서 확인할 수 없는 내용을 지어내지 않는다.

8. 시공 후 사진은
   이미 인테리어필름 시공이 완료된 상태로 판단한다.

9. "시공이 필요하다",
   "교체가 필요하다",
   "보수가 필요하다",
   "시공을 권장한다" 같은 표현은 사용하지 않는다.

10. 반드시 자연스러운 한국어만 사용한다.

11. 중국어, 일본어, 한자 혼합 표현을 사용하지 않는다.

반드시 JSON만 반환한다.

{
  "target_type": "door",
  "construction_scope": "whole",
  "category": "대표 시공 부위",
  "sub_category": "실제로 확인되는 구체적인 시공 부위",
  "classification_evidence": "사진에서 직접 확인되는 분류 근거",
  "classification_confidence": "high",
  "description": "여러 장의 시공 전후 사진을 종합 비교한 설명",
  "before_summary": "시공 전 사진 묶음에서 공통적으로 확인되는 상태",
  "after_summary": "시공 후 사진 묶음에서 공통적으로 확인되는 상태",
  "changes": [
    "실제로 확인되는 주요 변화 1",
    "실제로 확인되는 주요 변화 2"
  ],
  "tags": [
    "전후비교",
    "다중사진",
    "시공완료",
    "사진에서 확인되는 특징"
  ]
}
`;

      const content = [
        {
          type:
            "input_text",

          text:
            instruction,
        },

        {
          type:
            "input_text",

          text:
            `아래 ${beforeDataUrls.length}장의 이미지는 모두 시공 전 사진이다.`,
        },
      ];

      beforeDataUrls.forEach(
        (
          imageUrl,
          index
        ) => {
          content.push({
            type:
              "input_text",

            text:
              `시공 전 사진 ${
                index + 1
              }`,
          });

          content.push({
            type:
              "input_image",

            image_url:
              imageUrl,
          });
        }
      );

      content.push({
        type:
          "input_text",

        text:
          `아래 ${afterDataUrls.length}장의 이미지는 모두 시공 후 사진이다.`,
      });

      afterDataUrls.forEach(
        (
          imageUrl,
          index
        ) => {
          content.push({
            type:
              "input_text",

            text:
              `시공 후 사진 ${
                index + 1
              }`,
          });

          content.push({
            type:
              "input_image",

            image_url:
              imageUrl,
          });
        }
      );

      const openaiResponse =
        await fetch(
          "https://api.openai.com/v1/responses",
          {
            method:
              "POST",

            headers: {
              Authorization:
                `Bearer ${process.env.OPENAI_API_KEY}`,

              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                model:
                  AI_MODEL,
                text: { format: { type: "json_object" } },

                input: [
                  {
                    role:
                      "user",

                    content,
                  },
                ],
              }),
          }
        );

      const data =
        await openaiResponse.json();

      if (
        !openaiResponse.ok
      ) {
        console.error(
          "OpenAI compare error:",
          data
        );

        return NextResponse.json(
          {
            success: false,

            error:
              data?.error
                ?.message ||
              "다중 전후 비교 AI 분석 요청에 실패했습니다.",
          },
          {
            status:
              openaiResponse.status,
          }
        );
      }

      const outputText =
        extractOutputText(
          data
        );

      if (!outputText) {
        return NextResponse.json(
          {
            success: false,

            error:
              "AI 다중 전후 비교 분석 결과가 없습니다.",
          },
          {
            status: 500,
          }
        );
      }

      let analysis;

      try {
        analysis =
          parseAnalysisJson(
            outputText
          );

        analysis =
          normalizeAnalysisClassification(
            analysis
          );
      } catch (error) {
        console.error(
          "Compare JSON parse error:",
          outputText
        );

        return NextResponse.json(
          {
            success: false,

            error:
              "AI 다중 전후 비교 결과를 읽지 못했습니다.",
          },
          {
            status: 500,
          }
        );
      }

      const usageRecorded =
        await recordPhotoAnalysisUsage(
          {
            company,

            quantity:
              allBeforeImages.length +
              allAfterImages.length,

            photoType:
              "compare",

            beforeCount:
              allBeforeImages.length,

            afterCount:
              allAfterImages.length,

            openaiUsage:
              data?.usage ||
              null,
          }
        );

      return NextResponse.json(
        {
          success: true,

          photoType:
            "compare",

          beforeCount:
            allBeforeImages.length,

          afterCount:
            allAfterImages.length,

          analysis,

          usageRecorded,
        }
      );
    }

    /*
     * =========================================================
     * 단일 사진 분석
     * =========================================================
     */

    if (!image) {
      return NextResponse.json(
        {
          success: false,

          error:
            "이미지가 없습니다.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * 사용량 사전검사
     */

    if (company) {
      const limitCheck =
        await checkUsageLimit({
          company,
          eventType:
            "ai_photo_analysis",
          requestedQuantity: 1,
        });

      if (!limitCheck.ok) {
        return NextResponse.json(
          makeUsageLimitError(
            limitCheck
          ),
          {
            status:
              limitCheck.status ||
              429,
          }
        );
      }
    }

    const imageDataUrl =
      await fileToDataUrl(
        image
      );

    let analysisInstruction =
      "";

    /*
     * =========================================================
     * 시공 후 사진
     * =========================================================
     */

    if (
      photoType === "after"
    ) {
      analysisInstruction = `
이 사진은 인테리어필름 시공이 완료된 시공 후 사진이다.

당신은 인테리어필름 전문 시공 분석가이다.

${makeClassificationRules()}

가장 먼저
"사진 속 실제 시공 대상이 무엇인지"를 판단한 뒤
나머지 설명을 작성한다.

특히 문과 싱크대를 혼동하지 않는다.

문손잡이, 경첩, 문틀, 문턱, 출입구 구조가 확인되면
문/문틀 가능성을 우선 검토한다.

싱크대라고 판단하려면
싱크볼, 수전, 조리대,
상부장 또는 하부장처럼
명확한 주방 구조가 실제 사진에 보여야 한다.

상부장과 하부장이 모두 보이지 않는데
"싱크대 상부장과 하부장"이라고 작성하지 않는다.

분석 내용:

1. 실제 시공 대상 부위
2. 현재 색상과 마감 상태
3. 공간의 밝기와 정돈감
4. 도어, 문틀, 가구 등의 마감 상태
5. 필름 표면의 질감과 정돈감
6. 전체적인 인테리어 분위기
7. 사진에서 확인되는 시공 완료 상태

사진 한 장만으로
시공 전 상태를 지어내지 않는다.

절대로 다음 표현을 사용하지 않는다.

- 시공이 필요하다
- 필름 시공이 필요하다
- 교체가 필요하다
- 보수가 필요하다
- 시공을 권장한다
- 추후 시공해야 한다

반드시 자연스러운 한국어만 사용한다.
중국어, 일본어, 한자 혼합 표현을 사용하지 않는다.

반드시 JSON만 반환한다.

{
  "target_type": "door",
  "construction_scope": "whole",
  "category": "대표 시공 부위",
  "sub_category": "실제로 확인되는 구체적인 시공 부위",
  "classification_evidence": "사진에서 직접 확인되는 분류 근거",
  "classification_confidence": "high",
  "description": "인테리어필름 시공 완료 상태 설명",
  "tags": [
    "시공후",
    "사진에서 확인되는 특징"
  ]
}
`;
    } else {
      /*
       * =======================================================
       * 시공 전 사진
       * =======================================================
       */

      analysisInstruction = `
이 사진은 인테리어필름 시공 전 사진이다.

당신은 인테리어필름 전문 시공 분석가이다.

${makeClassificationRules()}

가장 먼저
"사진 속 실제 시공 대상이 무엇인지"를 정확하게 분류한다.

매우 중요:

문짝과 주방가구 도어를 혼동하지 않는다.

사진에 아래 특징이 보이면
문 또는 문틀 가능성을 우선 검토한다.

- 사람이 통과하는 출입구
- 문손잡이
- 경첩
- 문틀
- 문선
- 문턱
- 하나의 큰 세로형 문짝

특히
문손잡이 + 문틀,
경첩 + 문틀,
출입구 + 문짝
중 하나라도 명확하면
일반적인 싱크대 도어로 판단하지 않는다.

반대로 싱크대라고 판단하려면
아래와 같은 주방 근거가 실제로 보여야 한다.

- 싱크볼
- 수전
- 조리대
- 상판
- 상부장
- 하부장
- 여러 개의 연속된 주방 수납 도어
- 주방 조리 공간

이런 근거가 없으면
싱크대라고 추측하지 않는다.

특히 사진에 문 하나가 크게 보이는 경우
그 문짝의 사각 패널 모양만 보고
주방 가구로 분류하면 안 된다.

분석 내용:

1. 실제 시공 대상 부위
2. 기존 표면 상태
3. 오염, 변색, 스크래치, 찍힘
4. 기존 색상과 마감
5. 손잡이, 도어락, 경첩 등 부착물
6. 시공 시 주의할 부분
7. 구조적 특징

사진으로 알 수 없는 부분은 단정하지 않는다.

반드시 자연스러운 한국어만 사용한다.
중국어, 일본어, 한자 혼합 표현을 사용하지 않는다.

반드시 JSON만 반환한다.

{
  "target_type": "door",
  "construction_scope": "whole",
  "category": "대표 시공 부위",
  "sub_category": "실제로 확인되는 구체적인 시공 부위",
  "classification_evidence": "사진에서 직접 확인되는 분류 근거",
  "classification_confidence": "high",
  "description": "현재 상태 및 시공 전 특징 설명",
  "tags": [
    "시공전",
    "사진에서 확인되는 특징"
  ]
}
`;
    }

    if (formData.get("purpose") === "estimate") {
      analysisInstruction = `${makeClassificationRules()}
견적용 시공 부위 분류다. 오염/분위기/시공 권장사항은 쓰지 않는다.
${ESTIMATE_OBSERVATION_RULES}
출력 형식:
{"target_type":"door","construction_scope":"whole","category":"문 및 문틀","sub_category":"방문 및 문틀","classification_confidence":"medium","classification_evidence":"사진에서 확인한 구조 근거","view_completeness":"full","observable_structure":"문 개수, 배치, 개폐 방식, 측판과 거울 구성 중 보이는 사실","description":"주 대상의 시공 범위와 구조를 짧게 설명","tags":["핵심 구조"]}`;
    }

    /*
     * =========================================================
     * OpenAI 단일 사진 분석
     * =========================================================
     */

    const openaiResponse =
      await fetch(
        "https://api.openai.com/v1/responses",
        {
          method:
            "POST",

          headers: {
            Authorization:
              `Bearer ${process.env.OPENAI_API_KEY}`,

            "Content-Type":
              "application/json",
          },

          body:
            JSON.stringify({
              model:
                AI_MODEL,

              input: [
                {
                  role:
                    "user",

                  content: [
                    {
                      type:
                        "input_text",

                      text:
                        analysisInstruction,
                    },

                    {
                      type:
                        "input_image",

                      image_url:
                        imageDataUrl,
                      detail: "high",
                    },
                  ],
                },
              ],
            }),
        }
      );

    const data =
      await openaiResponse.json();

    if (
      !openaiResponse.ok
    ) {
      console.error(
        "OpenAI error:",
        data
      );

      return NextResponse.json(
        {
          success: false,

          error:
            data?.error
              ?.message ||
            "AI 분석 요청에 실패했습니다.",
        },
        {
          status:
            openaiResponse.status,
        }
      );
    }

    const outputText =
      extractOutputText(
        data
      );

    if (!outputText) {
      return NextResponse.json(
        {
          success: false,

          error:
            "AI 분석 결과가 없습니다.",
        },
        {
          status: 500,
        }
      );
    }

    let analysis;

    try {
      analysis =
        parseAnalysisJson(
          outputText
        );

      /*
       * AI 결과를 그대로 넘기지 않고
       * 문/문틀 오분류를 한 번 더 검사
       */

      analysis =
        normalizeAnalysisClassification(
          analysis
        );
    } catch (error) {
      console.error(
        "Single JSON parse error:",
        outputText
      );

      return NextResponse.json(
        {
          success: false,

          error:
            "AI 분석 결과를 읽지 못했습니다.",
        },
        {
          status: 500,
        }
      );
    }

    /*
     * =========================================================
     * AI 분석 사용량 기록
     * =========================================================
     */

    const usageRecorded =
      await recordPhotoAnalysisUsage(
        {
          company,

          quantity: 1,

          photoType,

          openaiUsage:
            data?.usage ||
            null,
        }
      );

    /*
     * =========================================================
     * 성공 응답
     * =========================================================
     */

    return NextResponse.json(
      {
        success: true,

        photoType,

        analysis,

        usageRecorded,
      }
    );
  } catch (error) {
    console.error(
      "Analyze API error:",
      error
    );

    return NextResponse.json(
      {
        success: false,

        error:
          error?.message ||
          "이미지 분석 중 오류가 발생했습니다.",
      },
      {
        status: 500,
      }
    );
  }
        }
