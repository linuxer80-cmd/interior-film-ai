import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILE_SIZE =
  10 * 1024 * 1024;

const MAX_SAMPLE_SIZE =
  10 * 1024 * 1024;


/*
 * =========================================================
 * 실제 필름 샘플 이미지 가져오기
 * =========================================================
 */

async function fetchSampleImage(
  sampleImageUrl,
  productCode
) {
  if (!sampleImageUrl) {
    return null;
  }

  try {
    const url =
      new URL(sampleImageUrl);

    /*
     * 보안을 위해
     * 현재 Supabase Storage 주소만 허용
     */
    const allowedHost =
      "gxtvvzysuhexhpljpswj.supabase.co";

    if (
      url.hostname !==
      allowedHost
    ) {
      console.warn(
        "허용되지 않은 샘플 이미지 주소:",
        url.hostname
      );

      return null;
    }

    const response =
      await fetch(
        url.toString(),
        {
          cache: "no-store",
        }
      );

    if (!response.ok) {
      console.error(
        "필름 샘플 이미지 로드 실패:",
        response.status,
        sampleImageUrl
      );

      return null;
    }

    const contentType =
      response.headers.get(
        "content-type"
      ) ||
      "image/jpeg";

    if (
      !contentType.startsWith(
        "image/"
      )
    ) {
      console.error(
        "필름 샘플 파일이 이미지가 아닙니다:",
        contentType
      );

      return null;
    }

    const arrayBuffer =
      await response.arrayBuffer();

    if (
      arrayBuffer.byteLength >
      MAX_SAMPLE_SIZE
    ) {
      console.error(
        "필름 샘플 이미지 용량 초과"
      );

      return null;
    }

    let extension = "jpg";

    if (
      contentType.includes(
        "png"
      )
    ) {
      extension = "png";
    } else if (
      contentType.includes(
        "webp"
      )
    ) {
      extension = "webp";
    }

    return new File(
      [arrayBuffer],
      `${
        productCode ||
        "film-sample"
      }.${extension}`,
      {
        type: contentType,
      }
    );
  } catch (error) {
    console.error(
      "필름 샘플 이미지 가져오기 오류:",
      error
    );

    return null;
  }
}


/*
 * =========================================================
 * POST
 * =========================================================
 */

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

    /*
     * 고객 원본사진
     */
    const image =
      requestData.get(
        "image"
      );

    if (
      !(image instanceof File)
    ) {
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
      image.size >
      MAX_FILE_SIZE
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

    /*
     * 제품정보
     */
    const brand =
      String(
        requestData.get(
          "brand"
        ) || ""
      );

    const productCode =
      String(
        requestData.get(
          "productCode"
        ) || ""
      );

    const productName =
      String(
        requestData.get(
          "productName"
        ) || ""
      );

    const texture =
      String(
        requestData.get(
          "texture"
        ) || ""
      );

    const colorFamily =
      String(
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

    const colorHex =
      String(
        requestData.get(
          "colorHex"
        ) || ""
      );

    const sampleImageUrl =
      String(
        requestData.get(
          "sampleImageUrl"
        ) || ""
      );


    /*
     * =====================================================
     * 실제 필름 샘플 이미지 로드
     * =====================================================
     */

    const sampleImage =
      await fetchSampleImage(
        sampleImageUrl,
        productCode
      );

    const sampleReferenceUsed =
      Boolean(sampleImage);


    /*
     * =====================================================
     * 프롬프트
     * =====================================================
     */

    const promptParts = [
      "Create a photorealistic virtual interior-film installation preview.",

      "IMAGE 1 is the customer's real interior photo and must remain the structural base image.",

      sampleReferenceUsed
        ? "IMAGE 2 is the actual reference sample of the selected interior film. Use IMAGE 2 as the visual reference for the new surface finish."
        : "No physical film sample image is available, so use the supplied product and color information as the finish reference.",

      "Identify the main cabinet, cabinet doors, interior door, door frame, molding, built-in furniture, or other clearly refinishable film surface in IMAGE 1.",

      "Change ONLY the finish of that installable surface.",

      "Preserve the exact room layout, camera position, perspective, dimensions, proportions, furniture geometry, panel divisions, handles, hinges, hardware, glass, appliances, walls, floor, ceiling, lighting, shadows, reflections, and surrounding objects from IMAGE 1.",

      "Do not redesign the furniture.",

      "Do not add or remove cabinet doors.",

      "Do not change handles or hardware.",

      "Do not add decorative objects.",

      "Do not change the architecture.",

      "Do not modify surfaces that would not normally receive interior film.",

      `Selected product: ${brand} ${productCode}.`,

      productName
        ? `Product name: ${productName}.`
        : "",

      texture
        ? `Material category or pattern: ${texture}.`
        : "",

      colorFamily
        ? `Color family: ${colorFamily}.`
        : "",

      colorDescription
        ? `Color description: ${colorDescription}.`
        : "",

      colorHex
        ? `Approximate digital color reference: ${colorHex}.`
        : "",

      sampleReferenceUsed
        ? "The actual film sample in IMAGE 2 has priority over the text color description and approximate HEX value."
        : "",

      sampleReferenceUsed
        ? "Match the dominant color, undertone, grain, pattern, texture, visual direction, contrast, and surface character of IMAGE 2 as closely as possible."
        : "",

      sampleReferenceUsed
        ? "For wood film, preserve the wood species appearance, grain direction, grain scale, light-dark variation, and natural pattern shown in IMAGE 2."
        : "",

      sampleReferenceUsed
        ? "For stone or marble film, preserve the vein style, pattern scale, contrast, and overall stone character shown in IMAGE 2."
        : "",

      sampleReferenceUsed
        ? "For metal film, preserve the metallic tone, directional texture, sheen character, and surface appearance shown in IMAGE 2 without turning it into mirror chrome unless the sample itself looks that way."
        : "",

      sampleReferenceUsed
        ? "For fabric or leather film, preserve the fine surface texture and pattern character of IMAGE 2 while keeping realistic scale."
        : "",

      "Adapt the reference material naturally to the perspective and geometry of the target surfaces.",

      "Keep realistic panel seams, corners, edges, highlights, shadows, and reflections.",

      "The result should look like the same real room after professional interior-film installation, not like newly generated or redesigned furniture.",

      "Return only the finished photorealistic interior image.",

      "Do not include text, labels, sample boards, split screens, borders, arrows, annotations, or watermarks.",
    ];

    const prompt =
      promptParts
        .filter(Boolean)
        .join(" ");


    /*
     * =====================================================
     * OpenAI 이미지 편집 요청
     * =====================================================
     */

    const openAIForm =
      new FormData();

    openAIForm.append(
      "model",
      process.env
        .OPENAI_IMAGE_MODEL ||
        "gpt-image-2.5-flare"
    );


    /*
     * IMAGE 1
     * 고객 원본사진
     */
    openAIForm.append(
      "image[]",
      image,
      image.name ||
        "interior.jpg"
    );


    /*
     * IMAGE 2
     * 실제 필름 샘플
     */
    if (sampleImage) {
      openAIForm.append(
        "image[]",
        sampleImage,
        sampleImage.name ||
          "film-sample.jpg"
      );
    }


    /*
     * 프롬프트
     */
    openAIForm.append(
      "prompt",
      prompt
    );


    /*
     * 현재 비용 절약을 위해
     * 기존 low 품질 유지
     */
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


    /*
     * =====================================================
     * OpenAI 요청
     * =====================================================
     */

    const response =
      await fetch(
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
        .catch(
          () => ({})
        );


    /*
     * =====================================================
     * 오류 처리
     * =====================================================
     */

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


    /*
     * =====================================================
     * 결과 이미지
     * =====================================================
     */

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


    /*
     * =====================================================
     * 성공
     * =====================================================
     */

    return NextResponse.json({
      success: true,

      imageUrl,

      productCode,

      sampleReferenceUsed,

      usage:
        result?.usage ||
        null,
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
