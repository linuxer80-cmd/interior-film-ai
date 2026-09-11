export async function POST(request) {
  try {
    const formData = await request.formData();
    const image = formData.get("image");

    if (!image) {
      return Response.json(
        { error: "사진이 없습니다." },
        { status: 400 }
      );
    }

    const bytes = await image.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64 = buffer.toString("base64");

    const mimeType = image.type || "image/jpeg";
    const imageData = `data:${mimeType};base64,${base64}`;

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-5.6-luna",
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `
이 사진은 인테리어필름 시공 견적용 현장 사진입니다.

사진을 보고 다음 항목을 분석하세요.

1. category:
싱크대, 방문, 문틀, 붙박이장, 신발장, 샷시, 몰딩,
아트월, 가구, 기타 중 가장 가까운 항목

2. sub_category:
사진에 보이는 시공 부위를 조금 더 구체적으로 설명

3. description:
사진에서 보이는 시공 대상과 상태를 한국어 2~3문장으로 설명

4. tags:
견적 비교에 도움이 되는 특징을 3~8개 작성

반드시 JSON 형식으로만 답하세요.

{
  "category": "싱크대",
  "sub_category": "주방 상부장 및 하부장",
  "description": "사진 분석 내용",
  "tags": ["주방", "싱크대", "상부장", "하부장"]
}
                `,
              },
              {
                type: "input_image",
                image_url: imageData,
              },
            ],
          },
        ],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("OpenAI error:", data);

      return Response.json(
        {
          error:
            data?.error?.message ||
            "AI 분석 요청 중 오류가 발생했습니다.",
        },
        { status: response.status }
      );
    }

    const text =
      data.output
        ?.flatMap((item) => item.content || [])
        ?.find((item) => item.type === "output_text")
        ?.text || "";

    let analysis;

    try {
      const cleaned = text
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();

      analysis = JSON.parse(cleaned);
    } catch {
      analysis = {
        category: "기타",
        sub_category: "",
        description: text,
        tags: [],
      };
    }

    return Response.json({
      success: true,
      analysis,
    });
  } catch (error) {
    console.error("Analyze route error:", error);

    return Response.json(
      {
        error: error.message || "서버 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  }
}
