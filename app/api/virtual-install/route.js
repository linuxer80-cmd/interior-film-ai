import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const MAX_SAMPLE_SIZE = 10 * 1024 * 1024;
const MAX_AREA_FILMS = 8;

/*
 * 문자열 정리
 */
function cleanText(value, maxLength = 300) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

/*
 * HEX 색상값 검사
 */
function cleanHex(value) {
  const hex = cleanText(value, 20);

  if (/^#[0-9a-fA-F]{3,8}$/.test(hex)) {
    return hex;
  }

  return "";
}

/*
 * 허용할 필름 샘플 이미지 주소 검사
 *
 * Supabase 주소와 기존 프로젝트에서 사용한
 * Supabase 주소만 허용합니다.
 */
function getAllowedSampleHosts() {
  const hosts = new Set([
    "gxtvvzysuhexhpljpswj.supabase.co",
  ]);

  try {
    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL;

    if (supabaseUrl) {
      hosts.add(new URL(supabaseUrl).hostname);
    }
  } catch (error) {
    console.error(
      "Supabase URL 확인 오류:",
      error
    );
  }

  return hosts;
}

/*
 * 필름 샘플 이미지 다운로드
 */
async function fetchSampleImage(
  sampleImageUrl,
  productCode,
  index
) {
  if (!sampleImageUrl) {
    return null;
  }

  try {
    const url = new URL(sampleImageUrl);
    const allowedHosts = getAllowedSampleHosts();

    if (
      url.protocol !== "https:" ||
      !allowedHosts.has(url.hostname)
    ) {
      console.warn(
        "허용되지 않은 필름 샘플 주소:",
        url.hostname
      );

      return null;
    }

    const response = await fetch(
      url.toString(),
      {
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      }
    );

    if (!response.ok) {
      console.error(
        "필름 샘플 로드 실패:",
        response.status,
        productCode
      );

      return null;
    }

    const contentType =
      response.headers.get("content-type") ||
      "image/jpeg";

    if (!contentType.startsWith("image/")) {
      return null;
    }

    const arrayBuffer =
      await response.arrayBuffer();

    if (
      !arrayBuffer.byteLength ||
      arrayBuffer.byteLength > MAX_SAMPLE_SIZE
    ) {
      return null;
    }

    let extension = "jpg";

    if (contentType.includes("png")) {
      extension = "png";
    } else if (contentType.includes("webp")) {
      extension = "webp";
    }

    return new File(
      [arrayBuffer],
      `film-${index}-${productCode || "sample"}.${extension}`,
      {
        type: contentType,
      }
    );
  } catch (error) {
    console.error(
      "필름 샘플 이미지 오류:",
      productCode,
      error
    );

    return null;
  }
}

/*
 * 기본 필름 데이터 읽기
 */
function getPrimaryFilm(formData) {
  return {
    areaKey: "all",
    areaLabel: "전체 시공 부위",
    brand: cleanText(
      formData.get("brand"),
      100
    ),
    productCode: cleanText(
      formData.get("productCode"),
      100
    ),
    productName: cleanText(
      formData.get("productName"),
      200
    ),
    texture: cleanText(
      formData.get("texture"),
      100
    ),
    colorFamily: cleanText(
      formData.get("colorFamily"),
      100
    ),
    colorDescription: cleanText(
      formData.get("colorDescription"),
      300
    ),
    colorHex: cleanHex(
      formData.get("colorHex")
    ),
    sampleImageUrl: cleanText(
      formData.get("sampleImageUrl"),
      2000
    ),
  };
}

/*
 * 부위별 필름 JSON 읽기
 */
function getAreaFilms(formData) {
  const rawValue = formData.get("areaFilms");

  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(
      String(rawValue)
    );

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .slice(0, MAX_AREA_FILMS)
      .map((item) => ({
        areaKey: cleanText(
          item?.areaKey,
          100
        ),
        areaLabel: cleanText(
          item?.areaLabel,
          100
        ),
        brand: cleanText(
          item?.brand,
          100
        ),
        productCode: cleanText(
          item?.productCode,
          100
        ),
        productName: cleanText(
          item?.productName,
          200
        ),
        texture: cleanText(
          item?.texture,
          100
        ),
        colorFamily: cleanText(
          item?.colorFamily,
          100
        ),
        colorDescription: cleanText(
          item?.colorDescription,
          300
        ),
        colorHex: cleanHex(
          item?.colorHex
        ),
        sampleImageUrl: cleanText(
          item?.sampleImageUrl,
          2000
        ),
      }))
      .filter(
        (item) =>
          item.areaKey &&
          item.productCode
      );
  } catch (error) {
    console.error(
      "areaFilms JSON 오류:",
      error
    );

    return [];
  }
}

/*
 * 부위별 영문 시공지시
 */
function getAreaInstruction(area) {
  const key = area.areaKey;
  const label = area.areaLabel || key;

  const instructions = {
    door_leaf:
      "Apply this film ONLY to the moving door leaf or door panel. Do not apply it to the surrounding frame, jamb, casing, wall, glass, handle, lock, hinge or hardware.",

    door_frame:
      "Apply this film ONLY to the surrounding door frame, jamb and casing surfaces normally finished with interior film. Do not apply it to the moving door leaf, wall, glass, handle, lock, hinge or hardware.",

    kitchen_upper:
      "Apply this film ONLY to upper wall-mounted kitchen cabinet doors, upper drawer fronts and their visible film-finished cabinet surfaces above the countertop.",

    upper_cabinet:
      "Apply this film ONLY to upper wall-mounted kitchen cabinet doors and their visible film-finished cabinet surfaces above the countertop.",

    kitchen_lower:
      "Apply this film ONLY to lower base kitchen cabinet doors, drawer fronts and visible film-finished cabinet surfaces below the countertop.",

    lower_cabinet:
      "Apply this film ONLY to lower base cabinet doors, drawer fronts and visible film-finished surfaces below the countertop.",

    fridge_cabinet:
      "Apply this film ONLY to the refrigerator cabinet doors and refrigerator enclosure panels. Preserve the refrigerator and its hardware.",

    tall_cabinet:
      "Apply this film ONLY to tall cabinet doors and their visible film-finished side panels.",

    pantry_cabinet:
      "Apply this film ONLY to pantry cabinet doors and their visible film-finished surfaces.",

    island_cabinet:
      "Apply this film ONLY to island cabinet doors, drawer fronts and visible film-finished side panels. Preserve the countertop.",

    island:
      "Apply this film ONLY to island cabinet doors, drawer fronts and visible film-finished side panels. Preserve the countertop.",
  };

  return (
    instructions[key] ||
    `Apply this film ONLY to the area identified as "${label}". Do not apply it to unrelated surfaces.`
  );
}

/*
 * 선택 필름 설명
 */
function makeFilmDescription(
  film,
  imageNumber
) {
  return [
    `REFERENCE IMAGE ${imageNumber} is the actual physical sample for "${film.areaLabel || film.areaKey}".`,

    `Selected product: ${[
      film.brand,
      film.productCode,
    ]
      .filter(Boolean)
      .join(" ")}.`,

    film.productName
      ? `Product name: ${film.productName}.`
      : "",

    film.texture
      ? `Material or texture: ${film.texture}.`
      : "",

    film.colorFamily
      ? `Color family: ${film.colorFamily}.`
      : "",

    film.colorDescription
      ? `Color description: ${film.colorDescription}.`
      : "",

    film.colorHex
      ? `Approximate digital color: ${film.colorHex}.`
      : "",

    getAreaInstruction(film),

    `For "${film.areaLabel || film.areaKey}", REFERENCE IMAGE ${imageNumber} has priority over the text description and HEX value.`,

    "Match the sample's dominant color, undertone, grain, pattern, texture, direction, contrast and material character.",
  ]
    .filter(Boolean)
    .join(" ");
}

/*
 * 샘플 이미지가 없을 때 사용할 필름 설명
 */
function makeTextOnlyFilmDescription(
  film
) {
  return [
    `Target area: ${film.areaLabel || film.areaKey}.`,

    `Selected product: ${[
      film.brand,
      film.productCode,
    ]
      .filter(Boolean)
      .join(" ")}.`,

    film.productName
      ? `Product name: ${film.productName}.`
      : "",

    film.texture
      ? `Material or texture: ${film.texture}.`
      : "",

    film.colorFamily
      ? `Color family: ${film.colorFamily}.`
      : "",

    film.colorDescription
      ? `Color description: ${film.colorDescription}.`
      : "",

    film.colorHex
      ? `Approximate digital color: ${film.colorHex}.`
      : "",

    getAreaInstruction(film),
  ]
    .filter(Boolean)
    .join(" ");
}

/*
 * 공통 이미지 보존 지시문
 */
function getPreservationPrompt() {
  return [
    "Create one photorealistic virtual interior-film installation preview.",

    "IMAGE 1 is the customer's original real interior photo and must remain the structural base image.",

    "Preserve the original room layout, architecture, camera position, camera angle, perspective, dimensions and proportions.",

    "Preserve the exact number, size, position and shape of all cabinet doors, drawers, panels, door leaves and frames.",

    "Preserve handles, hinges, locks, rails, glass, appliances, fixtures, switches and all hardware.",

    "Preserve walls, floor, ceiling, countertop, backsplash, sink, faucet, cooktop, hood and appliances unless a surface is explicitly identified as an interior-film target.",

    "Change only the visible finish of the specifically identified installation surfaces.",

    "Do not add or remove any object.",

    "Do not redesign the room or furniture.",

    "Do not change cabinet divisions or door divisions.",

    "Do not change the size or position of any object.",

    "Do not replace handles or hardware.",

    "Do not turn solid panels into glass or glass into solid panels.",

    "Do not mix films assigned to different areas.",

    "For wood film, use realistic grain direction, scale and natural variation.",

    "For stone or marble film, preserve realistic pattern scale and vein character.",

    "For metal film, preserve its directional surface character and realistic sheen.",

    "For solid-color film, maintain a clean, uniform color while preserving realistic lighting, shadows and reflections.",

    "Adapt the film naturally to each surface's perspective, edges, corners, seams, highlights and shadows.",

    "The result must look like the same real room photographed after professional interior-film installation.",

    "Return only one completed photorealistic interior image.",

    "Do not include text, labels, arrows, sample boards, split screens, borders, annotations or watermarks.",
  ].join(" ");
}

/*
 * OpenAI 오류 메시지 정리
 */
function getOpenAIError(result) {
  const message =
    result?.error?.message ||
    result?.message ||
    "";

  if (!message) {
    return "OpenAI 이미지 생성 요청에 실패했습니다.";
  }

  if (
    message.toLowerCase().includes(
      "billing"
    )
  ) {
    return "OpenAI API 잔액 또는 결제 설정을 확인해주세요.";
  }

  if (
    message.toLowerCase().includes(
      "rate limit"
    )
  ) {
    return "요청이 많습니다. 잠시 후 다시 시도해주세요.";
  }

  return message;
}

/*
 * 가상 시공 API
 */
export async function POST(request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
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
      !image.type?.startsWith("image/")
    ) {
      return NextResponse.json(
        {
          error:
            "이미지 파일만 사용할 수 있습니다.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !image.size ||
      image.size > MAX_IMAGE_SIZE
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

    const primaryFilm =
      getPrimaryFilm(requestData);

    if (!primaryFilm.productCode) {
      return NextResponse.json(
        {
          error:
            "선택한 필름 정보가 없습니다.",
        },
        {
          status: 400,
        }
      );
    }

    const useSplitTone =
      String(
        requestData.get("useSplitTone") ||
          ""
      ) === "true";

    const parsedAreaFilms =
      useSplitTone
        ? getAreaFilms(requestData)
        : [];

    /*
     * 부위별 필름이 정상적으로 전달되면 부위별 목록을 사용하고,
     * 그렇지 않으면 기본 필름 한 개를 사용합니다.
     */
    const requestedFilms =
      useSplitTone &&
      parsedAreaFilms.length > 0
        ? parsedAreaFilms
        : [primaryFilm];

    /*
     * 동일 제품·샘플을 사용하는 부위가 있어도
     * 부위 지시문은 각각 유지합니다.
     */
    const filmsWithReferences = [];

    for (
      let index = 0;
      index < requestedFilms.length;
      index += 1
    ) {
      const film =
        requestedFilms[index];

      const sampleImage =
        await fetchSampleImage(
          film.sampleImageUrl,
          film.productCode,
          index + 1
        );

      filmsWithReferences.push({
        ...film,
        sampleImage,
      });
    }

    const promptParts = [
      getPreservationPrompt(),
    ];

    /*
     * IMAGE 1은 고객 사진입니다.
     * 샘플 이미지 번호는 IMAGE 2부터 시작합니다.
     */
    let nextImageNumber = 2;

    filmsWithReferences.forEach(
      (film) => {
        if (film.sampleImage) {
          promptParts.push(
            makeFilmDescription(
              film,
              nextImageNumber
            )
          );

          nextImageNumber += 1;
        } else {
          promptParts.push(
            makeTextOnlyFilmDescription(
              film
            )
          );
        }
      }
    );

    if (
      useSplitTone &&
      requestedFilms.length > 1
    ) {
      promptParts.push(
        "This is a MULTI-FINISH installation. Every selected film must be applied only to its assigned target area. Keep all assigned areas visually distinct and do not swap or blend their finishes."
      );
    } else {
      promptParts.push(
        "Apply the selected film only to the main clearly refinishable surface requested in the photo, such as cabinet doors, door leaf, door frame, molding or built-in furniture."
      );
    }

    const prompt =
      promptParts
        .filter(Boolean)
        .join(" ");

    const openAIForm =
      new FormData();

    openAIForm.append(
      "model",
      process.env.OPENAI_IMAGE_MODEL ||
        "gpt-image-1.5"
    );

    /*
     * IMAGE 1: 고객 원본 사진
     */
    openAIForm.append(
      "image[]",
      image,
      image.name || "interior.jpg"
    );

    /*
     * IMAGE 2 이후: 실제 필름 샘플
     */
    filmsWithReferences.forEach(
      (film) => {
        if (!film.sampleImage) {
          return;
        }

        openAIForm.append(
          "image[]",
          film.sampleImage,
          film.sampleImage.name
        );
      }
    );

    openAIForm.append(
      "prompt",
      prompt
    );

    openAIForm.append(
      "size",
      process.env.OPENAI_IMAGE_SIZE ||
        "1024x1024"
    );

    openAIForm.append(
      "quality",
      process.env.OPENAI_IMAGE_QUALITY ||
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
        signal: AbortSignal.timeout(55000),
      }
    );

    const result =
      await response
        .json()
        .catch(() => ({}));

    if (!response.ok) {
      console.error(
        "가상 시공 OpenAI 오류:",
        result
      );

      return NextResponse.json(
        {
          error:
            getOpenAIError(result),
        },
        {
          status:
            response.status >= 400 &&
            response.status < 600
              ? response.status
              : 502,
        }
      );
    }

    const resultItem =
      result?.data?.[0];

    const imageUrl =
      resultItem?.b64_json
        ? `data:image/webp;base64,${resultItem.b64_json}`
        : resultItem?.url;

    if (!imageUrl) {
      console.error(
        "생성 이미지 없음:",
        result
      );

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
      productCode:
        primaryFilm.productCode,
      useSplitTone:
        useSplitTone &&
        requestedFilms.length > 1,
      appliedAreas:
        requestedFilms.map(
          (film) => ({
            areaKey: film.areaKey,
            areaLabel:
              film.areaLabel,
            productCode:
              film.productCode,
          })
        ),
      sampleReferenceCount:
        filmsWithReferences.filter(
          (film) =>
            Boolean(
              film.sampleImage
            )
        ).length,
      usage:
        result?.usage || null,
    });
  } catch (error) {
    console.error(
      "가상 시공 처리 오류:",
      error
    );

    if (
      error?.name ===
        "TimeoutError" ||
      error?.name ===
        "AbortError"
    ) {
      return NextResponse.json(
        {
          error:
            "이미지 생성 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.",
        },
        {
          status: 504,
        }
      );
    }

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
