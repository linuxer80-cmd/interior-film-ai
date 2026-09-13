import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const formData = await request.formData();

    const image = formData.get("image");
    const photoType = formData.get("photoType") || "before";

    if (!image) {
      return NextResponse.json(
        {
          success: false,
          error: "이미지가 없습니다.",
        },
        { status: 400 }
      );
    }

    const arrayBuffer = await image.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    const mimeType = image.type || "image/jpeg";

    const imageDataUrl = `data:${mimeType};base64,${base64}`;

    let analysisInstruction = "";

    // =========================================================
    // 시공 후 사진
    // =========================================================
    if (photoType === "after") {
      analysisInstruction = `
이 사진은 인테리어필름 시공이 이미 완료된 "시공 후 사진"이다.

당신은 인테리어필름 전문 시공 분석가이다.

매우 중요:
이 사진은 시공 전 사진이 아니다.
반드시 인테리어필름 시공이 완료된 결과물로 분석한다.

절대로 다음 표현을 사용하지 마라.

- 시공이 필요하다
- 필름 시공이 필요하다
- 교체가 필요하다
- 보수가 필요하다
- 시공을 권장한다
- 추후 시공해야 한다
- 노후되어 시공이 필요하다

분석할 내용:

1. 어떤 부위에 인테리어필름 시공이 완료되어 있는지
2. 현재 시공 완료된 색상과 마감
3. 공간 전체의 밝기와 분위기
4. 도어, 서랍, 문틀, 붙박이장 등의 색상 통일감
5. 필름 표면의 정돈된 느낌
6. 시공 후 현대적이고 깔끔해진 시각적 효과
7. 사진에서 확인되는 마감 특징

중요:
사진 한 장만으로 실제 시공 전 상태를 정확히 알 수 없으므로
시공 전 상태를 임의로 만들어내지 마라.

예를 들어

"기존에 갈색이었던 가구가 흰색으로 바뀌었다"

처럼 사진에서 확인할 수 없는 과거 상태를 확정하지 마라.

대신 다음과 같이 표현한다.

"밝은 화이트 계열 필름으로 마감되어 공간 전체가 밝고 정돈된 분위기로 완성되어 있습니다."

description은 고객에게 보여줄 수 있는 자연스러운 한국어로 작성한다.

반드시 JSON만 반환한다.

{
  "category": "대표 시공 부위",
  "sub_category": "구체적인 시공 부위",
  "description": "인테리어필름 시공 완료 상태와 시공 후 공간의 특징",
  "tags": [
    "시공후",
    "사진에서 확인되는 특징"
  ]
}
`;
    }

    // =========================================================
    // 시공 전 사진
    // =========================================================
    else {
      analysisInstruction = `
이 사진은 인테리어필름을 시공하기 전의 "시공 전 사진"이다.

당신은 인테리어필름 전문 시공 분석가이다.

사진에서 실제로 확인되는 내용을 중심으로 분석한다.

분석할 내용:

1. 시공 대상 부위
2. 현재 표면 상태
3. 오염, 변색, 스크래치, 찍힘, 노후 정도
4. 기존 색상과 마감 상태
5. 손잡이, 도어락, 경첩 등 부착물
6. 필름 시공 시 주의할 부분
7. 시공 대상의 구조적 특징

사진으로 알 수 없는 부분은 확정적으로 말하지 않는다.

description은 인테리어필름 시공자가 이해하기 쉬운
자연스러운 한국어로 작성한다.

반드시 JSON만 반환한다.

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

    // =========================================================
    // OpenAI 요청
    // =========================================================
    const openaiResponse = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",

        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          model: "gpt-5.6-luna",

          input: [
            {
              role: "user",

              content: [
                {
                  type: "input_text",
                  text: analysisInstruction,
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

    const data = await openaiResponse.json();

    // =========================================================
    // OpenAI 오류
    // =========================================================
    if (!openaiResponse.ok) {
      console.error(
        "OpenAI error:",
        JSON.stringify(data, null, 2)
      );

      return NextResponse.json(
        {
          success: false,
          error:
            data?.error?.message ||
            "AI 분석 요청에 실패했습니다.",
        },
        {
          status: openaiResponse.status,
        }
      );
    }

    // =========================================================
    // AI 응답 텍스트 찾기
    //
    // GPT Responses API에서는 output[0]이 reasoning일 수 있고
    // 실제 message가 output[1], output[2] 등에 있을 수 있다.
    // 따라서 모든 output/content를 검사한다.
    // =========================================================

    let outputText = "";

    // 혹시 top-level output_text가 있는 경우
    if (
      typeof data?.output_text === "string" &&
      data.output_text.trim()
    ) {
      outputText = data.output_text.trim();
    }

    // output 전체 탐색
    if (!outputText && Array.isArray(data?.output)) {
      for (const outputItem of data.output) {
        if (!Array.isArray(outputItem?.content)) {
          continue;
        }

        for (const contentItem of outputItem.content) {
          if (
            contentItem?.type === "output_text" &&
            typeof contentItem?.text === "string" &&
            contentItem.text.trim()
          ) {
            outputText = contentItem.text.trim();
            break;
          }

          // 혹시 type 이름이 달라도 text가 있으면 사용
          if (
            !outputText &&
            typeof contentItem?.text === "string" &&
            contentItem.text.trim()
          ) {
            outputText = contentItem.text.trim();
            break;
          }
        }

        if (outputText) {
          break;
        }
      }
    }

    // =========================================================
    // 그래도 결과가 없는 경우
    // =========================================================
    if (!outputText) {
      console.error(
        "AI output not found:",
        JSON.stringify(data, null, 2)
      );

      return NextResponse.json(
        {
          success: false,
          error: "AI 분석 결과가 없습니다.",
        },
        { status: 500 }
      );
    }

    // =========================================================
    // ```json 제거
    // =========================================================

    let cleanedText = outputText
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    // AI가 JSON 앞뒤에 설명을 붙이는 경우 대비
    const firstBrace = cleanedText.indexOf("{");
    const lastBrace = cleanedText.lastIndexOf("}");

    if (
      firstBrace !== -1 &&
      lastBrace !== -1 &&
      lastBrace > firstBrace
    ) {
      cleanedText = cleanedText.slice(
        firstBrace,
        lastBrace + 1
      );
    }

    // =========================================================
    // JSON 변환
    // =========================================================

    let analysis;

    try {
      analysis = JSON.parse(cleanedText);
    } catch (error) {
      console.error(
        "JSON parse error:",
        cleanedText
      );

      return NextResponse.json(
        {
          success: false,
          error: "AI 분석 결과를 읽지 못했습니다.",
          raw: cleanedText,
        },
        { status: 500 }
      );
    }

    // =========================================================
    // 기본 검증
    // =========================================================

    if (
      !analysis ||
      typeof analysis !== "object"
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "AI 분석 데이터 형식이 올바르지 않습니다.",
        },
        { status: 500 }
      );
    }

    // =========================================================
    // 성공
    // =========================================================

    return NextResponse.json({
      success: true,
      photoType,
      analysis: {
        category: analysis.category || "",
        sub_category: analysis.sub_category || "",
        description: analysis.description || "",
        tags: Array.isArray(analysis.tags)
          ? analysis.tags
          : [],
      },
    });
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
      { status: 500 }
    );
  }
  }
