import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILE_SIZE =
  10 * 1024 * 1024;

export async function POST(request) {
  try {
    if (
      !process.env.OPENAI_API_KEY
    ) {
      return NextResponse.json(
        {
          error:
            "OPENAI_API_KEY가 설정되지 않았습니다.",
        },
        {
          status: 500,
        }
      );
    }

    const requestData =
      await request.formData();

    const image =
      requestData.get("image");

    if (!(image instanceof File)) {
      return NextResponse.json(
        {
          error:
            "가상 시공할 사진이 없습니다.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      image.size > MAX_FILE_SIZE
    ) {
      return NextResponse.json(
        {
          error:
            "사진은 10MB 이하만 사용할 수 있습니다.",
        },
        {
          status: 400,
        }
      );
    }

    const brand = String(
      requestData.get("brand") ||
        ""
    );

    const productCode = String(
      requestData.get(
        "productCode"
      ) || ""
    );

    const texture = String(
      requestData.get("texture") ||
        ""
    );

    const colorFamily = String(
      requestData.get(
        "colorFamily"
      ) || ""
    );

    const colorDescription =
      String(
        requestData.get(
          "colorDescription"
        ) || ""
      );

    const colorHex = String(
      requestData.get("colorHex") ||
        ""
    );

    const prompt = [
      "Edit this real interior photo into a photorealistic virtual interior-film installation preview.",

      "Apply the selected interior film only to the main cabinet, door, door-frame, molding, or furniture surface that is clearly intended for refinishing.",

      "Preserve the original room layout, camera angle, perspective, lighting, shadows, handles, hardware, glass, walls, floor, ceiling, appliances, and all object shapes.",

      "Do not add, remove, resize, or redesign any objects.",

      "Change only the finish of the installable surface.",

      `Selected product: ${brand} ${productCode}.`,

      `Pattern: ${texture}. Color family: ${colorFamily}.`,

      `Color description: ${colorDescription}. Approximate color: ${colorHex}.`,

      "Keep realistic seams, edges, reflections, and material texture.",

      "Return a clean realistic result without text, labels, borders, or watermarks.",
    ].join(" ");

    const openAIForm =
      new FormData();

    openAIForm.append(
      "model",
      process.env
        .OPENAI_IMAGE_MODEL ||
        "gpt-image-2.5-flare"
    );

    openAIForm.append(
      "image[]",
      image,
      image.name ||
        "interior.jpg"
    );

    openAIForm.append(
      "prompt",
      prompt
    );

    openAIForm.append(
      "size",
      "1024x1024"
    );

    openAIForm.append(
      "quality",
      "low"
    );

    openAIForm.append(
      "output_format",
      "webp"
    );

    openAIForm.append(
      "output_compression",
      "70"
    );

    const response = await fetch(
      "https://api.openai.com/v1/images/edits",
      {
        method: "POST",
        headers: {
          Authorization:
            `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: openAIForm,
      }
    );

    const result =
      await response
        .json()
        .catch(() => ({}));

    if (!response.ok) {
      console.error(
        "Virtual install API error:",
        result
      );

      return NextResponse.json(
        {
          error:
            result?.error
              ?.message ||
            "OpenAI 이미지 생성 요청에 실패했습니다.",
        },
        {
          status:
            response.status,
        }
      );
    }

    const item =
      result?.data?.[0];

    const imageUrl =
      item?.b64_json
        ? `data:image/webp;base64,${item.b64_json}`
        : item?.url;

    if (!imageUrl) {
      return NextResponse.json(
        {
          error:
            "생성된 이미지 데이터가 없습니다.",
        },
        {
          status: 502,
        }
      );
    }

    return NextResponse.json({
      success: true,
      imageUrl,
      productCode,
      usage:
        result?.usage || null,
    });
  } catch (error) {
    console.error(
      "Virtual install route error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error?.message ||
          "가상 시공 이미지 생성 중 오류가 발생했습니다.",
      },
      {
        status: 500,
      }
    );
  }
}
