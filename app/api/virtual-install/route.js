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
 * 한 번에 너무 많은 샘플을 보내는 것을 방지
 *
 * 고객사진 1장 + 필름 샘플 최대 6장
 */

const MAX_AREA_FILMS = 6;

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
 * JSON 안전 파싱
 * =========================================================
 */

function safeParseJson(
  value,
  fallback
) {
  try {
    if (!value) {
      return fallback;
    }

    return JSON.parse(
      String(value)
    );
  } catch {
    return fallback;
  }
}

/*
 * =========================================================
 * 부위별 AI 지시문
 * =========================================================
 */

function getAreaInstruction(
  areaLabel,
  imageNumber
) {
  const label =
    String(
      areaLabel || ""
    );

  /*
   * 상부장
   */

  if (
    label.includes("상부장")
  ) {
    return `
IMAGE ${imageNumber} is the actual film reference for the UPPER KITCHEN CABINETS.

Apply IMAGE ${imageNumber} ONLY to the upper wall-mounted cabinet doors, upper cabinet fronts, and visible film-finished surfaces belonging to those upper cabinets.

Upper cabinets are cabinets physically located above the countertop.

Do not apply this finish to lower cabinets, refrigerator cabinets, tall cabinets, countertop, backsplash, appliances, sink, faucet, walls, floor, ceiling, glass or hardware.
`;
  }

  /*
   * 하부장
   */

  if (
    label.includes("하부장")
  ) {
    return `
IMAGE ${imageNumber} is the actual film reference for the LOWER KITCHEN CABINETS.

Apply IMAGE ${imageNumber} ONLY to the lower base cabinet doors, drawer fronts, and visible film-finished surfaces belonging to the lower cabinets.

Lower cabinets are cabinets physically located below the countertop.

Do not apply this finish to upper cabinets, refrigerator cabinets, tall cabinets, countertop, backsplash, appliances, sink, faucet, walls, floor, ceiling, glass or hardware.
`;
  }

  /*
   * 냉장고장
   */

  if (
    label.includes(
      "냉장고장"
    )
  ) {
    return `
IMAGE ${imageNumber} is the actual film reference for the REFRIGERATOR CABINET / REFRIGERATOR SURROUND.

Apply IMAGE ${imageNumber} ONLY to the built-in cabinet panels, doors, side panels and visible film-finished trim that structurally belong to the refrigerator cabinet or refrigerator surround.

Do NOT apply the film to the refrigerator appliance itself unless an existing furniture-style cabinet panel clearly covers it.

Do not apply this finish to upper cabinets, lower cabinets, tall pantry cabinets, walls, floor, ceiling, countertop, backsplash or unrelated furniture.
`;
  }

  /*
   * 키큰장
   */

  if (
    label.includes(
      "키큰장"
    )
  ) {
    return `
IMAGE ${imageNumber} is the actual film reference for the TALL KITCHEN CABINET.

Apply IMAGE ${imageNumber} ONLY to the tall floor-to-upper-height cabinet doors, panels and visible film-finished surfaces that belong to the tall cabinet.

Do not confuse the tall cabinet with the refrigerator cabinet.

Do not apply this finish to upper cabinets, lower cabinets, appliances, walls, countertop, backsplash, floor or ceiling.
`;
  }

  /*
   * 팬트리장
   */

  if (
    label.includes(
      "팬트리"
    )
  ) {
    return `
IMAGE ${imageNumber} is the actual film reference for the PANTRY CABINET.

Apply IMAGE ${imageNumber} ONLY to the pantry cabinet doors, panels and visible film-finished surfaces.

Do not apply this finish to unrelated kitchen cabinets, appliances, walls, floor, ceiling, countertop or backsplash.
`;
  }

  /*
   * 아일랜드
   */

  if (
    label.includes(
      "아일랜드"
    )
  ) {
    return `
IMAGE ${imageNumber} is the actual film reference for the KITCHEN ISLAND CABINET.

Apply IMAGE ${imageNumber} ONLY to the film-finished cabinet doors, drawer fronts, side panels and visible furniture surfaces belonging to the kitchen island.

Do not apply the film to the island countertop or unrelated surrounding surfaces.
`;
  }

  /*
   * 문짝
   */

  if (
    label.includes("문짝")
  ) {
    return `
IMAGE ${imageNumber} is the actual film reference for the DOOR LEAF.

Apply IMAGE ${imageNumber} ONLY to the moving door leaf or door panel.

Do not apply this finish to the surrounding door frame, jamb, casing, wall, glass, handle, lock, hinge, floor or ceiling.
`;
  }

  /*
   * 문틀
   */

  if (
    label.includes("문틀")
  ) {
    return `
IMAGE ${imageNumber} is the actual film reference for the DOOR FRAME.

Apply IMAGE ${imageNumber} ONLY to the surrounding door frame, jamb and casing surfaces normally finished with interior film.

Do not apply this finish to the moving door leaf, wall, glass, hardware, floor or ceiling.
`;
  }

  /*
   * 기타
   */

  return `
IMAGE ${imageNumber} is the actual film reference for the installation area named "${label}".

Apply IMAGE ${imageNumber} ONLY to the clearly identifiable film-finished surfaces belonging to "${label}".

Do not apply this finish to unrelated objects or architectural surfaces.
`;
}

/*
 * =========================================================
 * 필름 설명
 * =========================================================
 */

function getFilmDescription(
  areaFilm,
  imageNumber
) {
  const lines = [];

  lines.push(
    `Installation area: ${areaFilm.areaLabel || areaFilm.areaKey || "target area"}.`
  );

  lines.push(
    `Reference image for this area: IMAGE ${imageNumber}.`
  );

  if (
    areaFilm.brand ||
    areaFilm.productCode
  ) {
    lines.push(
      `Selected product for this area: ${areaFilm.brand || ""} ${areaFilm.productCode || ""}.`
    );
  }

  if (
    areaFilm.productName
  ) {
    lines.push(
      `Product name: ${areaFilm.productName}.`
    );
  }

  if (
    areaFilm.texture
  ) {
    lines.push(
      `Material category: ${areaFilm.texture}.`
    );
  }

  if (
    areaFilm.colorFamily
  ) {
    lines.push(
      `Color family: ${areaFilm.colorFamily}.`
    );
  }

  if (
    areaFilm.colorDescription
  ) {
    lines.push(
      `Color description: ${areaFilm.colorDescription}.`
    );
  }

  if (
    areaFilm.colorHex
  ) {
    lines.push(
      `Approximate digital color: ${areaFilm.colorHex}.`
    );
  }

  lines.push(
    `IMAGE ${imageNumber} has priority over text descriptions and HEX values for this area's finish.`
  );

  return lines.join(" ");
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
     * 부분톤
     * =====================================================
     */

    const useSplitTone =
      String(
        requestData.get(
          "useSplitTone"
        ) || ""
      ) === "true";

    let areaFilms =
      safeParseJson(
        requestData.get(
          "areaFilms"
        ),
        []
      );

    if (
      !Array.isArray(
        areaFilms
      )
    ) {
      areaFilms = [];
    }

    areaFilms =
      areaFilms
        .filter(
          (item) =>
            item &&
            typeof item ===
              "object"
        )
        .slice(
          0,
          MAX_AREA_FILMS
        );

    /*
     * =====================================================
     * 일반 단일필름
     * =====================================================
     */

    if (
      !useSplitTone ||
      areaFilms.length < 2
    ) {
      const sampleImage =
        await fetchSampleImage(
          sampleImageUrl,
          productCode
        );

      const sampleReferenceUsed =
        Boolean(
          sampleImage
        );

      const prompt = [
        "Create a photorealistic virtual interior-film installation preview.",

        "IMAGE 1 is the customer's original real interior photo. IMAGE 1 must remain the structural base image.",

        sampleImage
          ? "IMAGE 2 is the actual physical reference sample of the selected interior film."
          : "",

        "Apply the selected film only to the main clearly refinishable cabinet, door, door-frame, molding, built-in furniture, or similar interior-film surface.",

        "Preserve the original room layout and architecture.",

        "Preserve the exact camera angle, perspective, dimensions, proportions, cabinet geometry, panel divisions and object positions.",

        "Preserve handles, hinges, locks, rails, hardware, glass, appliances and fixtures.",

        "Preserve walls, floor, ceiling, countertop, backsplash, sink and faucet unless they are explicitly identified as the film installation target.",

        "Do not add objects.",

        "Do not remove objects.",

        "Do not redesign furniture.",

        "Do not change cabinet door count or panel divisions.",

        "Do not change the size or position of any object.",

        `Selected product: ${brand} ${productCode}.`,

        productName
          ? `Product name: ${productName}.`
          : "",

        texture
          ? `Material category: ${texture}.`
          : "",

        colorFamily
          ? `Color family: ${colorFamily}.`
          : "",

        colorDescription
          ? `Color description: ${colorDescription}.`
          : "",

        colorHex
          ? `Approximate digital color: ${colorHex}.`
          : "",

        sampleImage
          ? "IMAGE 2 has priority over text descriptions and HEX values."
          : "",

        "Match the reference film's dominant color, undertone, grain, pattern, texture, direction, contrast and material character as closely as possible.",

        "For wood film, preserve realistic wood grain direction, scale and natural light-dark variation.",

        "For stone or marble film, preserve realistic vein style, pattern scale and contrast.",

        "For metal film, preserve metallic tone, directional surface character and realistic sheen.",

        "For fabric or leather film, preserve the fine material texture at realistic scale.",

        "Adapt the film naturally to the perspective and geometry of the target surface.",

        "Keep realistic seams, corners, edges, highlights, shadows and reflections.",

        "The finished image must look like the same real room after professional interior-film installation.",

        "Do not create a different kitchen, different door, or redesigned furniture.",

        "Return only one finished photorealistic interior image.",

        "Do not include text, labels, sample boards, split screens, borders, arrows, annotations or watermarks.",
      ]
        .filter(Boolean)
        .join(" ");

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

      if (sampleImage) {
        openAIForm.append(
          "image[]",
          sampleImage,
          sampleImage.name ||
            "primary-film.jpg"
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

        sampleReferenceUsed,

        multiReferenceUsed:
          false,

        referenceCount:
          sampleReferenceUsed
            ? 1
            : 0,

        usage:
          result?.usage ||
          null,
      });
    }

    /*
     * =====================================================
     * 다중 부위 부분톤
     * =====================================================
     */

    const preparedAreas = [];

    for (
      let index = 0;
      index <
      areaFilms.length;
      index += 1
    ) {
      const areaFilm =
        areaFilms[index];

      const sample =
        await fetchSampleImage(
          areaFilm.sampleImageUrl,
          areaFilm.productCode
        );

      preparedAreas.push({
        ...areaFilm,
        sample,
      });
    }

    /*
     * 실제 샘플이 없는 제품이 있더라도
     * 텍스트 정보는 유지한다.
     *
     * 이미지 번호는 실제 첨부된 이미지 기준으로
     * 다시 부여한다.
     */

    let nextImageNumber = 2;

    const areasWithImageNumbers =
      preparedAreas.map(
        (area) => {
          if (area.sample) {
            const imageNumber =
              nextImageNumber;

            nextImageNumber += 1;

            return {
              ...area,
              imageNumber,
            };
          }

          return {
            ...area,
            imageNumber: null,
          };
        }
      );

    const referenceCount =
      areasWithImageNumbers.filter(
        (area) =>
          area.sample
      ).length;

    /*
     * =====================================================
     * 부위별 지시문
     * =====================================================
     */

    const areaInstructions =
      areasWithImageNumbers
        .map((area) => {
          if (
            area.imageNumber
          ) {
            return [
              getAreaInstruction(
                area.areaLabel,
                area.imageNumber
              ),

              getFilmDescription(
                area,
                area.imageNumber
              ),
            ].join("\n");
          }

          /*
           * 샘플 이미지가 없는 경우
           */

          return `
Installation area: ${area.areaLabel || area.areaKey || "target area"}.

Apply the selected product ${area.brand || ""} ${area.productCode || ""} only to this installation area.

Product name: ${area.productName || ""}.
Material category: ${area.texture || ""}.
Color family: ${area.colorFamily || ""}.
Color description: ${area.colorDescription || ""}.
Approximate digital color: ${area.colorHex || ""}.

Keep this area's finish visually separate from every other installation area.
`;
        })
        .join("\n\n");

    /*
     * =====================================================
     * 다중 부위 프롬프트
     * =====================================================
     */

    const prompt = [
      "Create a photorealistic virtual interior-film installation preview using the customer's real interior photo and the supplied physical film samples.",

      "IMAGE 1 is the customer's original real interior photo. IMAGE 1 must remain the structural and geometric base image.",

      `This installation contains ${areaFilms.length} separately controlled finish areas.`,

      "Each installation area may use a different interior-film finish.",

      "You must keep the finish assignments separate. Never swap, merge, blend or mix the assigned finishes between areas.",

      areaInstructions,

      "IMPORTANT AREA SEGMENTATION RULES:",

      "Identify every target area from its physical location and architectural function in IMAGE 1.",

      "Upper cabinets are wall-mounted cabinets above the countertop.",

      "Lower cabinets are base cabinets below the countertop.",

      "A refrigerator cabinet is the built-in furniture enclosure, side panel, overhead cabinet or surround associated with the refrigerator location. Do not treat the refrigerator appliance itself as cabinet furniture.",

      "A tall cabinet is a tall furniture cabinet extending from near the floor toward upper-cabinet height. Do not confuse it with a refrigerator enclosure.",

      "A pantry cabinet is a storage cabinet area distinct from upper and lower cabinet runs.",

      "An island cabinet is the cabinetry underneath or around a freestanding kitchen island. Do not alter the countertop.",

      "A door leaf is the moving door panel. A door frame is the fixed surrounding jamb and casing.",

      "Preserve the original room layout and architecture.",

      "Preserve the exact camera angle, perspective, dimensions, proportions and object positions.",

      "Preserve the exact cabinet geometry.",

      "Preserve the exact number, size and position of cabinet doors and drawer fronts.",

      "Preserve panel divisions and gaps.",

      "Preserve handles, hinges, locks, rails, hardware, glass, appliances and fixtures.",

      "Do not change the refrigerator, oven, microwave, cooktop, hood, sink, faucet or any other appliance.",

      "Do not apply cabinet film to appliances.",

      "Preserve walls, floor, ceiling, countertop, backsplash and wall tiles.",

      "Do not add objects.",

      "Do not remove objects.",

      "Do not redesign the kitchen or furniture.",

      "Do not change cabinet dimensions.",

      "Do not change the size or position of any object.",

      "For every supplied physical film reference image, that image has priority over product text, color descriptions and HEX values.",

      "Match each assigned reference film's dominant color, undertone, grain, pattern, texture, direction, contrast and material character as closely as possible.",

      "For wood film, preserve realistic wood grain direction, pattern scale and natural light-dark variation.",

      "For solid film, preserve a clean uniform finish while retaining realistic lighting, shadows and surface geometry.",

      "For stone or marble film, preserve realistic vein style, pattern scale and contrast.",

      "For metal film, preserve metallic tone, directional surface character and realistic sheen.",

      "For fabric or leather film, preserve the fine material texture at realistic scale.",

      "Adapt each assigned film naturally to the perspective and geometry of its specific target surface.",

      "Preserve realistic seams, corners, edges, highlights, shadows and reflections.",

      "The finished image must look like the exact same real room after professional interior-film installation.",

      "Do not create a different kitchen, different cabinet arrangement, different door or redesigned furniture.",

      "Return only one finished photorealistic interior image.",

      "Do not include text, labels, sample boards, split screens, borders, arrows, annotations or watermarks.",
    ]
      .filter(Boolean)
      .join(" ");

    /*
     * =====================================================
     * OpenAI FormData
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
     * IMAGE 2 ~
     */

    for (
      const area
      of areasWithImageNumbers
    ) {
      if (!area.sample) {
        continue;
      }

      openAIForm.append(
        "image[]",
        area.sample,
        area.sample.name ||
          `${area.areaKey || "area"}-${area.productCode || "film"}.jpg`
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

      useSplitTone: true,

      areas:
        areasWithImageNumbers.map(
          (area) => ({
            areaKey:
              area.areaKey,

            areaLabel:
              area.areaLabel,

            productCode:
              area.productCode,

            sampleUsed:
              Boolean(
                area.sample
              ),

            imageNumber:
              area.imageNumber,
          })
        ),

      sampleReferenceUsed:
        referenceCount > 0,

      multiReferenceUsed:
        referenceCount >= 2,

      referenceCount,

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
