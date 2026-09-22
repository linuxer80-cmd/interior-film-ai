import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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
 *
 * 사용량 기록에 실패해도
 * 이미 완료된 AI 분석 자체는 실패시키지 않습니다.
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
     * 업체 slug가 전달된 경우
     * 서버에서 실제 활성 업체인지 확인
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

    /*
     * 기존 단일 전후 이미지 방식도 지원
     */

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
       * 이미지 Data URL 변환
       */

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

      /*
       * AI 분석 프롬프트
       */

      const instruction = `
당신은 인테리어필름 전문 시공 분석가이다.

사용자가 한 시공건의 사진들을 여러 장 제공한다.

앞부분의 사진들은 모두 "시공 전 사진 묶음"이다.
뒷부분의 사진들은 모두 "시공 후 사진 묶음"이다.

중요:
사진 수가 서로 다를 수 있다.
사진 순서가 서로 정확히 대응하지 않을 수 있다.

따라서 사진 1장씩 억지로 짝을 맞추지 말고,
전체 시공 전 사진 묶음과 전체 시공 후 사진 묶음을 종합적으로 비교하라.

분석 규칙:

1. 여러 장의 사진 전체에서 반복적으로 확인되는 시공 부위를 파악한다.

2. 시공 전 사진 묶음과 시공 후 사진 묶음에서 실제로 확인되는 공통 변화를 분석한다.

3. 색상 변화, 밝기 변화, 표면 정돈감, 공간 통일감, 인테리어 분위기 변화를 설명한다.

4. 문, 문틀, 싱크대, 붙박이장, 신발장, 몰딩 등 실제 사진에서 보이는 시공 부위를 구체적으로 설명한다.

5. 사진 순서가 다르다고 해서 특정 전사진과 특정 후사진을 임의로 같은 물체라고 단정하지 않는다.

6. 사진에서 확인할 수 없는 과거 상태나 시공 내용을 지어내지 않는다.

7. 시공 후 사진은 이미 인테리어필름 시공이 완료된 상태로 판단한다.

8. "시공이 필요하다", "교체가 필요하다", "보수가 필요하다", "시공을 권장한다" 같은 표현은 사용하지 않는다.

9. 전후 차이가 명확하지 않은 부분은 단정하지 않는다.

10. 반드시 자연스러운 한국어만 사용한다.

11. 중국어, 일본어, 한자 혼합 표현을 사용하지 않는다.

12. "质감" 같은 혼합 문자를 절대 사용하지 않고 "질감"처럼 자연스러운 한국어만 사용한다.

13. 고객이 읽었을 때 이해하기 쉬운 설명을 작성한다.

description은
"한 시공건 전체의 시공 전후 변화"를 설명하는 문장으로 작성한다.

예시 표현:

"시공 전에는 짙은 색상의 방문과 문틀이 여러 공간에서 확인되었으나, 시공 후에는 밝은 우드 계열 필름으로 통일되어 전체 공간이 한층 밝고 정돈된 분위기로 변화했습니다. 여러 도어와 문틀에 동일 계열의 마감이 적용되어 공간 전체의 일체감도 높아졌습니다."

단, 예시는 문체 참고용이며 실제 사진에서 확인되는 내용만 작성한다.

반드시 JSON만 반환하라.

{
  "category": "대표 시공 부위",
  "sub_category": "구체적인 시공 부위",
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

      /*
       * OpenAI 입력 content
       */

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

      /*
       * OpenAI 호출
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

      /*
       * 결과 텍스트
       */

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

      /*
       * JSON 변환
       */

      let analysis;

      try {
        analysis =
          parseAnalysisJson(
            outputText
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

      /*
       * =====================================================
       * 사용량 기록
       *
       * AI 분석 성공 이후에만 기록합니다.
       * =====================================================
       */

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

      /*
       * 성공
       */

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
     * 이미지 변환
     */

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

반드시 시공 완료 상태를 중심으로 분석한다.

절대로 다음 표현을 사용하지 않는다.

- 시공이 필요하다
- 필름 시공이 필요하다
- 교체가 필요하다
- 보수가 필요하다
- 시공을 권장한다
- 추후 시공해야 한다

분석 내용:

1. 어떤 부위에 인테리어필름 시공이 완료되었는지
2. 현재 색상과 마감 상태
3. 공간의 밝기와 정돈감
4. 도어, 문틀, 가구 등의 색상 통일감
5. 필름 표면의 질감과 정돈감
6. 전체적인 인테리어 분위기
7. 사진에서 확인되는 시공 완료 상태

사진 한 장만으로 시공 전 상태는 정확히 알 수 없으므로
시공 전 상태를 지어내지 않는다.

반드시 자연스러운 한국어만 사용한다.
중국어, 일본어, 한자 혼합 표현을 사용하지 않는다.

반드시 아래 JSON 형식만 반환한다.

{
  "category": "대표 시공 부위",
  "sub_category": "구체적인 시공 부위",
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

사진에서 실제로 확인되는 내용만 분석한다.

분석 내용:

1. 시공 대상 부위
2. 기존 표면 상태
3. 오염, 변색, 스크래치, 찍힘
4. 기존 색상과 마감
5. 손잡이, 도어락, 경첩 등 부착물
6. 시공 시 주의할 부분
7. 구조적 특징

사진으로 알 수 없는 부분은 단정하지 않는다.

반드시 자연스러운 한국어만 사용한다.
중국어, 일본어, 한자 혼합 표현을 사용하지 않는다.

반드시 아래 JSON 형식만 반환한다.

{
  "category": "대표 시공 부위",
  "sub_category": "구체적인 시공 부위",
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

    /*
     * OpenAI 오류
     */

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

    /*
     * 응답 텍스트 추출
     */

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

    /*
     * JSON 파싱
     */

    let analysis;

    try {
      analysis =
        parseAnalysisJson(
          outputText
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
     *
     * 단일 사진 1장 성공 = quantity 1
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
     * 성공 응답
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
