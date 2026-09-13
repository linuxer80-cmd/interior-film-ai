import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const formData = await request.formData();

    const image = formData.get("image");

    // before = 시공 전
    // after = 시공 후
    // 값이 없으면 기존 동작을 위해 before 처리
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

    const imageDataUrl =
      `data:${mimeType};base64,${base64}`;

    let analysisInstruction = "";

    // =========================================================
    // 시공 후 사진 분석
    // =========================================================

    if (photoType === "after") {
      analysisInstruction = `
이 사진은 인테리어필름 시공이 완료된 "시공 후 사진"이다.

당신은 인테리어필름 전문 시공 분석가이다.

이 사진을 보고 이미 시공이 완료된 상태를 분석하라.

절대로 다음과 같은 표현을 사용하지 마라.

- 시공이 필요하다
- 필름 시공이 필요하다
- 교체가 필요하다
- 보수가 필요하다
- 시공을 권장한다
- 추후 시공해야 한다

이 사진은 반드시 "시공 완료 상태"로 판단해야 한다.

분석의 핵심은 아래와 같다.

1. 어떤 부위에 인테리어필름 시공이 완료되었는지
2. 시공 후 색상과 분위기가 어떻게 보이는지
3. 기존 공간 대비 어떤 시각적 변화가 예상되는지
4. 도어, 문틀, 싱크대, 붙박이장 등 마감의 통일감
5. 표면이 얼마나 깔끔하고 정돈되어 보이는지
6. 인테리어필름으로 인해 공간이 밝아졌는지, 현대적으로 바뀌었는지 등
7. 시공 완료 상태에서 확인되는 마감 특징

description은 고객에게 보여줄 수 있는 자연스러운 한국어로 작성한다.

좋은 예:

"주방 상부장과 하부장에 밝은 화이트 계열 인테리어필름 시공이 완료된 상태입니다. 기존 마감보다 밝고 깔끔한 분위기로 변화했으며, 도어와 서랍 전면의 색상과 질감이 통일되어 주방 전체가 정돈되고 현대적인 느낌으로 바뀌었습니다."

또 다른 예:

"현관 방화문과 문틀에 인테리어필름 시공이 완료되었습니다. 기존 노후된 표면이 깔끔한 마감으로 정리되면서 현관 전체가 밝고 새로운 분위기로 변화했습니다."

사진에 보이지 않는 내용을 확정적으로 만들어내지 말고,
사진에서 확인할 수 있는 범위에서 설명하라.

반드시 아래 JSON 형식만 반환하라.

{
  "category": "대표 시공 부위",
  "sub_category": "구체적인 시공 부위",
  "description": "인테리어필름 시공 완료 상태와 시공 후 변화 설명",
  "tags": [
    "시공후",
    "사진에서 확인되는 특징"
  ]
}
`;
    }

    // =========================================================
    // 시공 전 사진 분석
    // =========================================================

    else {
      analysisInstruction = `
이 사진은 인테리어필름을 시공하기 전의 "시공 전 사진"이다.

당신은 인테리어필름 전문 시공 분석가이다.

사진에서 실제로 확인되는 내용을 중심으로 분석하라.

분석의 핵심은 아래와 같다.

1. 시공 대상 부위가 무엇인지
2. 현재 표면 상태
3. 오염, 변색, 스크래치, 찍힘, 노후 정도
4. 기존 색상과 마감 상태
5. 손잡이, 도어락, 경첩 등 부착물 존재 여부
6. 시공 시 주의할 부분
7. 인테리어필름 시공 대상의 구조적 특징

사진만으로 알 수 없는 부분은 단정하지 마라.

description은 시공자가 이해하기 쉬운 자연스러운 한국어로 작성한다.

좋은 예:

"현관 방화문과 문틀의 기존 아이보리색 표면이 노후되어 있으며 생활 오염과 잔기스가 확인됩니다. 디지털 도어락과 도어클로저 등 부착물이 있어 필름 시공 시 부분 철거 및 재부착 작업이 필요할 수 있습니다."

반드시 아래 JSON 형식만 반환하라.

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

    const outputText =
      data?.output_text ||
      data?.output?.[0]?.content?.[0]?.text ||
      "";

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
