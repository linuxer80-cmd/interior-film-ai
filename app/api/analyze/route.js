import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  checkUsageLimit,
  makeUsageLimitError,
} from "../../utils/serverUsageLimit";

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

function includesAny(
  text,
  words
) {
  const normalized =
    String(text || "")
      .replace(/\s+/g, "")
      .toLowerCase();

  return words.some(
    (word) =>
      normalized.includes(
        String(word)
          .replace(/\s+/g, "")
          .toLowerCase()
      )
  );
}

/*
 * =========================================================
 * AI 결과 후처리
 *
 * AI가 설명에서는 "방문/문틀"이라고 정확하게 봤는데
 * category만 잘못 주방으로 반환하는 경우를 한 번 더 보정합니다.
 * =========================================================
 */

function normalizeAnalysisClassification(
  analysis
) {
  if (
    !analysis ||
    typeof analysis !== "object"
  ) {
    return analysis;
  }

  const tags =
    Array.isArray(
      analysis.tags
    )
      ? analysis.tags
      : [];

  const fullText = [
    analysis.category,
    analysis.sub_category,
    analysis.description,
    analysis.classification_evidence,
    ...tags,
  ]
    .filter(Boolean)
    .join(" ");

  /*
   * 매우 강한 문 계열 특징
   *
   * 단순 "문"이라는 글자만 사용하지 않습니다.
   * 붙박이장문, 신발장문 같은 오판을 피하기 위해
   * 방문/문틀/방화문/현관문 등의 명확한 단어만 사용합니다.
   */

  const strongDoor =
    includesAny(
      fullText,
      [
        "방문",
        "문틀",
        "도어프레임",
        "도어 프레임",
        "방화문",
        "현관문",
        "중문",
        "출입문",
        "door frame",
        "doorframe",
        "fire door",
        "entrance door",
      ]
    );

  /*
   * 명확한 주방 특징
   */

  const strongKitchen =
    includesAny(
      fullText,
      [
        "싱크대",
        "싱크볼",
        "조리대",
        "상부장",
        "하부장",
        "주방가구",
        "주방 가구",
        "아일랜드장",
        "키큰장",
        "팬트리장",
        "kitchen cabinet",
        "upper cabinet",
        "lower cabinet",
      ]
    );

  /*
   * 문 근거가 존재하고
   * AI 설명 자체에 확실한 주방 구조 근거가 없다면
   * 문/문틀로 교정
   */

  if (
    strongDoor &&
    !strongKitchen
  ) {
    return {
      ...analysis,

      category:
        "문 및 문틀",

      sub_category:
        includesAny(
          fullText,
          [
            "중문",
            "슬라이딩도어",
            "슬라이딩 도어",
          ]
        )
          ? "중문"
          : includesAny(
                fullText,
                [
                  "방화문",
                  "현관문",
                ]
              )
            ? "방화문 및 문틀"
            : "방문 및 문틀",
    };
  }

  return analysis;
}

/*
 * =========================================================
 * 공통 분류 규칙
 * =========================================================
 */

function makeClassificationRules() {
  return `
가장 중요한 작업은 먼저 "사진 속 실제 시공 대상"을 정확히 분류하는 것이다.

아래 기준을 반드시 지켜라.

[1. 문 및 문틀]

다음 특징이 보이면 문/문틀 가능성이 매우 높다.

- 사람이 통과하는 출입구에 설치된 세로형 문짝
- 문손잡이
- 문고리
- 도어락
- 경첩
- 문틀
- 문선
- 문턱
- 방 안과 복도 또는 화장실 등을 구분하는 출입문
- 하나의 큰 세로형 도어 패널
- 벽의 출입구 안에 설치된 문짝
- 방문
- 방화문
- 현관문
- 중문
- 슬라이딩 도어

특히
"문짝 + 문틀 + 손잡이 또는 경첩"이 확인되면
주방가구가 아니라 "문 및 문틀"을 우선 선택한다.

문 표면에 사각 패널이나 몰딩이 있어도
그것을 싱크대 문짝으로 판단하지 않는다.

문 아래쪽만 확대 촬영된 사진이라도
경첩, 문틀, 문턱, 출입문 구조가 확인되면
문으로 판단한다.

[2. 주방 가구 / 싱크대]

주방 가구로 판단하려면
사진에서 주방이라는 근거가 실제로 확인되어야 한다.

예:

- 싱크볼
- 수전
- 조리대 또는 상판
- 상판 아래에 연속으로 배치된 하부장
- 벽에 연속으로 설치된 상부장
- 여러 개의 작은 가구 도어가 반복되는 구조
- 주방 조리 공간
- 아일랜드
- 키큰장
- 냉장고장
- 명확한 싱크대 구조

중요:

큰 직사각형 판 하나가 보인다는 이유만으로
싱크대나 주방가구라고 판단하지 않는다.

문손잡이, 경첩, 문틀, 출입구가 보이는 경우에는
주방가구보다 문/문틀 판정을 우선한다.

싱크볼, 조리대, 상부장, 하부장 등의
명확한 주방 근거가 보이지 않으면
"싱크대 상부장과 하부장"이라고 추측하지 않는다.

상부장과 하부장이 둘 다 실제로 확인되지 않으면
"상부장과 하부장"이라고 작성하지 않는다.

하부장만 보이면 "싱크대 하부장",
상부장만 보이면 "싱크대 상부장"으로 작성한다.

[3. 붙박이장]

- 벽면을 따라 설치된 큰 수납장
- 바닥부터 천장 가까이 이어지는 다수의 수납 도어
- 옷장 구조
- 붙박이 수납 구조

출입용 방문과 혼동하지 않는다.

[4. 신발장]

- 현관에 설치된 수납장
- 여러 개의 수납 도어
- 신발 수납 구조

현관문 자체와 신발장을 구분한다.

[5. 냉장고장]

- 냉장고 주변을 둘러싼 수납장
- 냉장고 설치 공간과 함께 구성된 장

[6. 샷시 및 창틀]

- 창문 프레임
- 샷시
- 창틀

[7. 몰딩]

- 천장 몰딩
- 걸레받이
- 벽체 마감 몰딩

[8. 벽면]

- 벽체
- 아트월
- 대형 벽면 패널

분류 우선순위:

1. 실제 물체의 용도와 구조를 본다.
2. 손잡이, 경첩, 문틀, 싱크볼, 조리대 등
   기능을 증명하는 요소를 확인한다.
3. 단순한 색상이나 사각형 형태만으로 판단하지 않는다.
4. 사진에 없는 물체를 추측하지 않는다.
5. 확실하지 않으면 세부 부위를 과도하게 구체화하지 않는다.

category는 가능하면 아래 명칭 중 하나를 사용한다.

- 문 및 문틀
- 주방 가구
- 붙박이장
- 신발장
- 냉장고장
- 샷시 및 창틀
- 몰딩
- 벽면
- 기타

classification_evidence에는
왜 그 부위라고 판단했는지
사진에서 직접 확인되는 핵심 근거만 짧게 작성한다.

classification_confidence는 다음 중 하나만 사용한다.

- high
- medium
- low
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
