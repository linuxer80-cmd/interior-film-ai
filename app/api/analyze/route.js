import { NextResponse } from "next/server";

export const runtime = "nodejs";

function fileToDataUrl(file) {
  return file.arrayBuffer().then((buffer) => {
    const base64 = Buffer.from(buffer).toString("base64");
    const mimeType = file.type || "image/jpeg";
    return `data:${mimeType};base64,${base64}`;
  });
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
      if (!Array.isArray(outputItem?.content)) {
        continue;
      }

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

export async function POST(request) {
  try {
    const formData = await request.formData();

    const image = formData.get("image");
    const beforeImage = formData.get("beforeImage");
    const afterImage = formData.get("afterImage");

    const receivedPhotoType = String(
      formData.get("photoType") || "before"
    )
      .trim()
      .toLowerCase();

    const photoType =
      receivedPhotoType === "after"
        ? "after"
        : receivedPhotoType === "compare"
        ? "compare"
        : "before";

    // =========================================================
    // 전후 비교 모드
    // =========================================================
    if (photoType === "compare") {
      if (!beforeImage || !afterImage) {
        return NextResponse.json(
          {
            success: false,
            error:
              "전후 비교 분석에는 시공 전 사진과 시공 후 사진이 모두 필요합니다.",
          },
          { status: 400 }
        );
      }

      const beforeDataUrl = await fileToDataUrl(beforeImage);
      const afterDataUrl = await fileToDataUrl(afterImage);

      const instruction = `
당신은 인테리어필름 전문 시공 분석가이다.

첫 번째 사진은 "시공 전 사진"이고,
두 번째 사진은 "시공 후 사진"이다.

두 사진을 직접 비교해서 실제로 확인되는 변화만 분석하라.

가장 중요한 규칙:

1. 시공 전과 시공 후의 실제 차이를 비교한다.
2. 사진에서 확인할 수 없는 과거 상태나 공사 내용을 만들어내지 않는다.
3. 색상 변화, 밝기 변화, 표면 정돈감, 통일감, 공간 분위기 변화 등을 비교한다.
4. 도어, 문틀, 붙박이장, 싱크대, 가구 등 실제 시공 부위를 구체적으로 설명한다.
5. 시공 후 사진은 이미 인테리어필름 시공이 완료된 상태로 판단한다.
6. "시공이 필요하다", "교체가 필요하다", "보수가 필요하다" 같은 표현은 사용하지 않는다.
7. 사진에서 확인할 수 있는 범위에서만 시공 완성도를 설명한다.
8. 반드시 자연스러운 한국어만 사용한다.
9. 중국어, 일본어, 한자 혼합 표현을 절대로 사용하지 않는다.
10. "质감" 같은 혼합 문자를 사용하지 말고 반드시 "질감"처럼 자연스러운 한국어로 작성한다.

description은 고객에게 보여줄 수 있는 설명으로 작성한다.

좋은 예:

"시공 전에는 짙은 브라운 계열의 방문과 문틀로 인해 다소 어둡고 무거운 인상이었으나, 시공 후 밝은 우드 계열 인테리어필름으로 마감되어 전체 공간이 밝고 정돈된 분위기로 변화했습니다. 도어와 문틀의 색상을 동일 계열로 통일해 공간의 일체감이 높아졌으며, 주변 벽과 바닥 마감과도 자연스럽게 어우러집니다."

단, 실제 사진에서 확인되지 않는 변화는 설명하지 않는다.

반드시 JSON만 반환하라.

{
  "category": "대표 시공 부위",
  "sub_category": "구체적인 시공 부위",
  "description": "시공 전과 시공 후를 비교한 자연스러운 설명",
  "before_summary": "시공 전 상태 요약",
  "after_summary": "시공 후 상태 요약",
  "changes": [
    "실제로 확인되는 변화 1",
    "실제로 확인되는 변화 2"
  ],
  "tags": [
    "전후비교",
    "시공완료",
    "사진에서 확인되는 특징"
  ]
}
`;

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
                    text: instruction,
                  },
                  {
                    type: "input_text",
                    text: "첫 번째 이미지는 시공 전 사진이다.",
                  },
                  {
                    type: "input_image",
                    image_url: beforeDataUrl,
                  },
                  {
                    type: "input_text",
                    text: "두 번째 이미지는 시공 후 사진이다.",
                  },
                  {
                    type: "input_image",
                    image_url: afterDataUrl,
                  },
                ],
              },
            ],
          }),
        }
      );

      const data = await openaiResponse.json();

      if (!openaiResponse.ok) {
        console.error("OpenAI error:", data);

        return NextResponse.json(
          {
            success: false,
            error:
              data?.error?.message ||
              "전후 비교 AI 분석 요청에 실패했습니다.",
          },
          { status: openaiResponse.status }
        );
      }

      let outputText = extractOutputText(data);

      if (!outputText) {
        return NextResponse.json(
          {
            success: false,
            error: "AI 전후 비교 분석 결과가 없습니다.",
          },
          { status: 500 }
        );
      }

      let cleanedText = outputText
        .replace(/```json/gi, "")
        .replace(/```/g, "")
        .trim();

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

      let analysis;

      try {
        analysis = JSON.parse(cleanedText);
      } catch (error) {
        console.error("Compare JSON parse error:", cleanedText);

        return NextResponse.json(
          {
            success: false,
            error: "AI 전후 비교 결과를 읽지 못했습니다.",
            raw: cleanedText,
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        photoType: "compare",
        analysis,
      });
    }

    // =========================================================
    // 단일 사진 분석
    // =========================================================
    if (!image) {
      return NextResponse.json(
        {
          success: false,
          error: "이미지가 없습니다.",
        },
        { status: 400 }
      );
    }

    const imageDataUrl = await fileToDataUrl(image);

    let analysisInstruction = "";

    // =========================================================
    // 시공 후
    // =========================================================
    if (photoType === "after") {
      analysisInstruction = `
이 사진은 인테리어필름 시공이 완료된 "시공 후 사진"이다.

당신은 인테리어필름 전문 시공 분석가이다.

반드시 시공이 완료된 상태로 분석한다.

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
3. 공간이 밝고 정돈되어 보이는지
4. 도어, 문틀, 가구 등의 색상 통일감
5. 필름 표면의 질감과 정돈감
6. 전체적인 인테리어 분위기
7. 사진에서 확인되는 시공 완료 상태

중요:
사진 한 장만으로 시공 전 상태는 정확히 알 수 없으므로
과거 상태를 만들어내지 않는다.

반드시 자연스러운 한국어만 사용한다.
중국어, 일본어, 한자 혼합 표현을 사용하지 않는다.
예: "무광质감" 금지, "무광 질감"이라고 작성한다.

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
    }

    // =========================================================
    // 시공 전
    // =========================================================
    else {
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

    if (!openaiResponse.ok) {
      console.error("OpenAI error:", data);

      return NextResponse.json(
        {
          success: false,
          error:
            data?.error?.message ||
            "AI 분석 요청에 실패했습니다.",
        },
        { status: openaiResponse.status }
      );
    }

    let outputText = extractOutputText(data);

    if (!outputText) {
      return NextResponse.json(
        {
          success: false,
          error: "AI 분석 결과가 없습니다.",
        },
        { status: 500 }
      );
    }

    let cleanedText = outputText
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

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

    let analysis;

    try {
      analysis = JSON.parse(cleanedText);
    } catch (error) {
      console.error("JSON parse error:", cleanedText);

      return NextResponse.json(
        {
          success: false,
          error: "AI 분석 결과를 읽지 못했습니다.",
          raw: cleanedText,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      photoType,
      analysis,
    });
  } catch (error) {
    console.error("Analyze API error:", error);

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
