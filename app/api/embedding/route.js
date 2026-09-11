export async function POST(request) {
  try {
    const body = await request.json();

    const text = body?.text;

    if (!text || !text.trim()) {
      return Response.json(
        {
          error: "임베딩할 텍스트가 없습니다.",
        },
        {
          status: 400,
        }
      );
    }

    const response = await fetch(
      "https://api.openai.com/v1/embeddings",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "text-embedding-3-small",
          input: text.trim(),
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("OpenAI embedding error:", data);

      return Response.json(
        {
          error:
            data?.error?.message ||
            "임베딩 생성 중 오류가 발생했습니다.",
        },
        {
          status: response.status,
        }
      );
    }

    const embedding = data?.data?.[0]?.embedding;

    if (!embedding) {
      return Response.json(
        {
          error: "임베딩 결과를 찾을 수 없습니다.",
        },
        {
          status: 500,
        }
      );
    }

    return Response.json({
      success: true,
      embedding,
      dimensions: embedding.length,
    });
  } catch (error) {
    console.error("Embedding route error:", error);

    return Response.json(
      {
        error:
          error?.message ||
          "서버 오류가 발생했습니다.",
      },
      {
        status: 500,
      }
    );
  }
}
