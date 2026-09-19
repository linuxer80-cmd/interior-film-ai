import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILE_SIZE =
  10 * 1024 * 1024;

const MAX_SAMPLE_SIZE =
  10 * 1024 * 1024;

const ALLOWED_SAMPLE_HOST =
  "gxtvvzysuhexhpljpswj.supabase.co";


/*
 * =========================================================
 * 필름 샘플 가져오기
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
      new URL(
        sampleImageUrl
      );

    if (
      url.hostname !==
      ALLOWED_SAMPLE_HOST
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
          cache:
            "no-store",
        }
      );

    if (!response.ok) {
      console.error(
        "필름 샘플 이미지 로드 실패:",
        response.status
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
      return null;
    }

    const arrayBuffer =
      await response.arrayBuffer();

    if (
      arrayBuffer.byteLength >
      MAX_SAMPLE_SIZE
    ) {
      return null;
    }

    let extension =
      "jpg";

    if (
      contentType.includes(
        "png"
      )
    ) {
      extension =
        "png";
    } else if (
      contentType.includes(
        "webp"
      )
    ) {
      extension =
        "webp";
    }

    return new File(
      [arrayBuffer],
      `${
        productCode ||
        "sample"
      }.${extension}`,
      {
        type:
          contentType,
      }
    );
  } catch (error) {
    console.error(
      "샘플 이미지 오류:",
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

export async function POST(
  request
) {
  try {
    if (
      !process.env
        .OPENAI_API_KEY
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
     * =====================================================
     * 기본 필름
     * =====================================================
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
     * 부분 시공
     * =====================================================
     */

    const useSplitTone =
      String(
        requestData.get(
          "useSplitTone"
        ) || ""
      ) === "true";

    const splitType =
      String(
        requestData.get(
          "splitType"
        ) || ""
      );


    /*
     * =====================================================
     * 두 번째 필름
     * =====================================================
     */

    const secondaryBrand =
      String(
        requestData.get(
          "secondaryBrand"
        ) || ""
      );

    const secondaryProductCode =
      String(
        requestData.get(
          "secondaryProductCode"
        ) || ""
      );

    const secondaryProductName =
      String(
        requestData.get(
          "secondaryProductName"
        ) || ""
      );

    const secondaryTexture =
      String(
        requestData.get(
          "secondaryTexture"
        ) || ""
      );

    const secondaryColorFamily =
      String(
        requestData.get(
          "secondaryColorFamily"
        ) || ""
      );

    const secondaryColorDescription =
      String(
        requestData.get(
          "secondaryColorDescription"
        ) || ""
      );

    const secondaryColorHex =
      String(
        requestData.get(
          "secondaryColorHex"
        ) || ""
      );

    const secondarySampleImageUrl =
      String(
        requestData.get(
          "secondarySampleImageUrl"
        ) || ""
      );


    /*
     * =====================================================
     * 샘플 다운로드
     * =====================================================
     */

    const sampleImage =
      await fetchSampleImage(
        sampleImageUrl,
        productCode
      );

    let secondarySampleImage =
      null;

    if (
      useSplitTone &&
      secondaryProductCode
    ) {
      secondarySampleImage =
        await fetchSampleImage(
          secondarySampleImageUrl,
          secondaryProductCode
        );
    }

    const sampleReferenceUsed =
      Boolean(
        sampleImage
      );

    const splitReferenceUsed =
      Boolean(
        useSplitTone &&
        sampleImage &&
        secondarySampleImage
      );


    /*
     * =====================================================
     * 부위별 지시문
     * =====================================================
     */

    let splitInstruction =
      "";

    if (
      useSplitTone &&
      splitType ===
        "kitchen"
    ) {
      splitInstruction = `
This is a TWO-FINISH kitchen installation.

IMAGE 2 is the actual film reference for the UPPER CABINETS.

IMAGE 3 is the actual film reference for the LOWER CABINETS.

Apply IMAGE 2 ONLY to the upper wall-mounted cabinet doors and their film-finished visible cabinet surfaces.

Apply IMAGE 3 ONLY to the lower base cabinet doors, drawer fronts, and their film-finished visible cabinet surfaces.

Correctly distinguish upper cabinets from lower cabinets using their physical position relative to the countertop.

Do not apply either film to the countertop, backsplash, wall tiles, sink, faucet, appliances, cooktop, hood, glass, floor, ceiling, or other non-cabinet surfaces.

Do not mix the two reference finishes.

Upper cabinets must visually match IMAGE 2.

Lower cabinets must visually match IMAGE 3.
`;
    }

    if (
      useSplitTone &&
      splitType ===
        "door"
    ) {
      splitInstruction = `
This is a TWO-FINISH interior door installation.

IMAGE 2 is the actual film reference for the DOOR LEAF.

IMAGE 3 is the actual film reference for the DOOR FRAME.

Apply IMAGE 2 ONLY to the actual moving door leaf or door panel.

Apply IMAGE 3 ONLY to the surrounding door frame, jamb, and casing surfaces that are normally finished with interior film.

Do not confuse the door leaf with the surrounding frame.

Preserve handles, locks, hinges, glass, hardware, walls, floor, ceiling, and adjacent surfaces.

Do not mix the two finishes.

The door leaf must visually match IMAGE 2.

The door frame must visually match IMAGE 3.
`;
    }


    /*
     * =====================================================
     * 프롬프트
     * =====================================================
     */

    const prompt = [
      "Create a photorealistic virtual interior-film installation preview.",

      "IMAGE 1 is the customer's original real interior photo. IMAGE 1 must remain the structural base image.",

      sampleImage
        ? "IMAGE 2 is an actual physical reference sample of the primary selected interior film."
        : "",

      splitReferenceUsed
        ? "IMAGE 3 is an actual physical reference sample of the secondary selected interior film."
        : "",

      splitInstruction,

      !useSplitTone
        ? "Apply the primary selected film only to the main clearly refinishable cabinet, door, door-frame, molding, built-in furniture, or similar interior-film surface."
        : "",

      "Preserve the original room layout and architecture.",

      "Preserve the exact camera angle, perspective, dimensions, proportions, cabinet geometry, panel divisions and object positions.",

      "Preserve handles, hinges, locks, rails, hardware, glass, appliances and fixtures.",

      "Preserve walls, floor, ceiling, countertop, backsplash, sink and faucet unless they are explicitly identified as the film installation target.",

      "Do not add objects.",

      "Do not remove objects.",

      "Do not redesign furniture.",

      "Do not change cabinet door count or panel divisions.",

      "Do not change the size or position of any object.",

      `Primary selected product: ${brand} ${productCode}.`,

      productName
        ? `Primary product name: ${productName}.`
        : "",

      texture
        ? `Primary material category: ${texture}.`
        : "",

      colorFamily
        ? `Primary color family: ${colorFamily}.`
        : "",

      colorDescription
        ? `Primary color description: ${colorDescription}.`
        : "",

      colorHex
        ? `Primary approximate digital color: ${colorHex}.`
        : "",

      useSplitTone &&
      secondaryProductCode
        ? `Secondary selected product: ${secondaryBrand} ${secondaryProductCode}.`
        : "",

      useSplitTone &&
      secondaryProductName
        ? `Secondary product name: ${secondaryProductName}.`
        : "",

      useSplitTone &&
      secondaryTexture
        ? `Secondary material category: ${secondaryTexture}.`
        : "",

      useSplitTone &&
      secondaryColorFamily
        ? `Secondary color family: ${secondaryColorFamily}.`
        : "",

      useSplitTone &&
      secondaryColorDescription
        ? `Secondary color description: ${secondaryColorDescription}.`
        : "",

      useSplitTone &&
      secondaryColorHex
        ? `Secondary approximate digital color: ${secondaryColorHex}.`
        : "",

      sampleImage
        ? "For the primary finish, IMAGE 2 has priority over text descriptions and HEX values."
        : "",

      secondarySampleImage
        ? "For the secondary finish, IMAGE 3 has priority over text descriptions and HEX values."
        : "",

      "Match the reference film's dominant color, undertone, grain, pattern, texture, direction, contrast and material character as closely as possible.",

      "For wood film, preserve realistic wood grain direction, scale and natural light-dark variation.",

      "For stone or marble film, preserve realistic vein style, pattern scale and contrast.",

      "For metal film, preserve metallic tone, directional surface character and realistic sheen.",

      "For fabric or leather film, preserve the fine material texture at realistic scale.",

      "Adapt each film naturally to the perspective and geometry of the target surface.",

      "Keep realistic seams, corners, edges, highlights, shadows and reflections.",

      "The finished image must look like the same real room after professional interior-film installation.",

      "Do not create a different kitchen, different door, or redesigned furniture.",

      "Return only one finished photorealistic interior image.",

      "Do not include text, labels, sample boards, split screens, borders, arrows, annotations or watermarks.",
    ]
      .filter(Boolean)
      .join(" ");


    /*
     * =====================================================
     * OpenAI
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
     */
    openAIForm.append(
      "image[]",
      image,
      image.name ||
        "interior.jpg"
    );


    /*
     * IMAGE 2
     */
    if (sampleImage) {
      openAIForm.append(
        "image[]",
        sampleImage,
        sampleImage.name ||
          "primary-film.jpg"
      );
    }


    /*
     * IMAGE 3
     */
    if (
      useSplitTone &&
      secondarySampleImage
    ) {
      openAIForm.append(
        "image[]",
        secondarySampleImage,
        secondarySampleImage.name ||
          "secondary-film.jpg"
      );
    }


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


    /*
     * =====================================================
     * 요청
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

          body:
            openAIForm,
        }
      );

    const result =
      await response
        .json()
        .catch(
          () => ({})
        );


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
     * 결과
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


    return NextResponse.json({
      success: true,

      imageUrl,

      productCode,

      secondaryProductCode:
        secondaryProductCode ||
        null,

      splitType:
        useSplitTone
          ? splitType
          : null,

      sampleReferenceUsed,

      splitReferenceUsed,

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
