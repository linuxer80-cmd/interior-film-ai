import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const MAX_SAMPLE_SIZE = 10 * 1024 * 1024;
const MAX_AREA_FILMS = 8;

const TARGET_LABELS = {
  artwall: "아트월·벽면",
  kitchen: "싱크대·주방가구",
  door: "문·문틀",
  built_in: "붙박이장",
  shoe_cabinet: "신발장",
  fridge_cabinet: "냉장고장",
  cabinet: "기타 장류",
};

const ALLOWED_TARGET_TYPES = new Set(
  Object.keys(TARGET_LABELS)
);

const MULTI_TONE_TARGET_TYPES = new Set([
  "kitchen",
  "door",
]);

const ALLOWED_AREAS = {
  artwall: new Set(["artwall_surface"]),
  kitchen: new Set([
    "kitchen_all",
    "kitchen_upper",
    "kitchen_lower",
    "fridge_cabinet",
    "tall_cabinet",
    "pantry_cabinet",
    "island_cabinet",
  ]),
  door: new Set([
    "door_all",
    "door_leaf",
    "door_frame",
  ]),
  built_in: new Set(["built_in"]),
  shoe_cabinet: new Set(["shoe_cabinet"]),
  fridge_cabinet: new Set(["fridge_cabinet"]),
  cabinet: new Set(["cabinet"]),
};

const AREA_LABELS = {
  artwall_surface: "아트월·벽면",
  kitchen_all: "싱크대·주방가구",
  kitchen_upper: "상부장",
  kitchen_lower: "하부장",
  fridge_cabinet: "냉장고장",
  tall_cabinet: "키큰장",
  pantry_cabinet: "팬트리장",
  island_cabinet: "아일랜드장",
  door_all: "문·문틀",
  door_leaf: "문짝",
  door_frame: "문틀",
  built_in: "붙박이장",
  shoe_cabinet: "신발장",
  cabinet: "수납장",
};

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) return null;

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function resolveCompanyBySlug(slug) {
  const supabase = getAdminSupabase();

  if (!supabase || !slug) return null;

  const { data, error } = await supabase
    .from("companies")
    .select(
      "id, company_name, slug, subscription_plan, is_active"
    )
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    console.error("가상시공 회사 조회 오류:", error);
    return null;
  }

  return data && data.is_active !== false
    ? data
    : null;
}

async function reserveUsage(company) {
  const db = getAdminSupabase();

  if (!db) {
    throw new Error("서버 설정을 확인해주세요.");
  }

  const { data, error } = await db.rpc(
    "reserve_virtual_remodel",
    {
      p_company_id: company.id,
      p_request_id: randomUUID(),
    }
  );

  if (error) throw error;

  if (!data || typeof data.ok !== "boolean") {
    throw new Error("사용량 예약 결과가 없습니다.");
  }

  return data;
}

async function finishUsage(
  companyId,
  reservationId,
  success,
  metadata = {}
) {
  const db = getAdminSupabase();

  if (!db) {
    throw new Error("서버 설정을 확인해주세요.");
  }

  const { data, error } = await db.rpc(
    "finish_virtual_remodel",
    {
      p_company_id: companyId,
      p_request_id: reservationId,
      p_success: success,
      p_metadata: metadata,
    }
  );

  if (error) throw error;

  if (data !== true) {
    throw new Error(
      "사용량 확정을 확인하지 못했습니다."
    );
  }
}

function cleanText(value, maxLength = 300) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function cleanHex(value) {
  const hex = cleanText(value, 20);

  return /^#[0-9a-fA-F]{3,8}$/.test(hex)
    ? hex
    : "";
}

function getAllowedSampleHosts() {
  const hosts = new Set([
    "gxtvvzysuhexhpljpswj.supabase.co",
  ]);

  try {
    if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
      hosts.add(
        new URL(
          process.env.NEXT_PUBLIC_SUPABASE_URL
        ).hostname
      );
    }
  } catch (error) {
    console.error("Supabase URL 오류:", error);
  }

  return hosts;
}

async function fetchSampleImage(
  urlValue,
  productCode,
  index
) {
  if (!urlValue) return null;

  try {
    const url = new URL(urlValue);

    if (
      url.protocol !== "https:" ||
      !getAllowedSampleHosts().has(url.hostname)
    ) {
      return null;
    }

    const response = await fetch(url.toString(), {
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) return null;

    const contentType =
      response.headers.get("content-type") ||
      "image/jpeg";

    if (!contentType.startsWith("image/")) {
      return null;
    }

    const buffer = await response.arrayBuffer();

    if (
      !buffer.byteLength ||
      buffer.byteLength > MAX_SAMPLE_SIZE
    ) {
      return null;
    }

    const extension = contentType.includes("png")
      ? "png"
      : contentType.includes("webp")
      ? "webp"
      : "jpg";

    return new File(
      [buffer],
      `film-${index}-${productCode || "sample"}.${extension}`,
      { type: contentType }
    );
  } catch (error) {
    console.error(
      "필름 샘플 조회 오류:",
      productCode,
      error
    );

    return null;
  }
}

function getPrimaryFilm(form) {
  return {
    areaKey: "all",
    areaLabel: "전체 시공 부위",
    brand: cleanText(form.get("brand"), 100),
    productCode: cleanText(
      form.get("productCode"),
      100
    ),
    productName: cleanText(
      form.get("productName"),
      200
    ),
    texture: cleanText(form.get("texture"), 100),
    colorFamily: cleanText(
      form.get("colorFamily"),
      100
    ),
    colorDescription: cleanText(
      form.get("colorDescription"),
      300
    ),
    colorHex: cleanHex(form.get("colorHex")),
    sampleImageUrl: cleanText(
      form.get("sampleImageUrl"),
      2000
    ),
  };
}

function getAreaFilms(form) {
  try {
    const parsed = JSON.parse(
      String(form.get("areaFilms") || "[]")
    );

    if (!Array.isArray(parsed)) return [];

    return parsed
      .slice(0, MAX_AREA_FILMS)
      .map((item) => ({
        areaKey: cleanText(item?.areaKey, 100),
        areaLabel: cleanText(item?.areaLabel, 100),
        brand: cleanText(item?.brand, 100),
        productCode: cleanText(
          item?.productCode,
          100
        ),
        productName: cleanText(
          item?.productName,
          200
        ),
        texture: cleanText(item?.texture, 100),
        colorFamily: cleanText(
          item?.colorFamily,
          100
        ),
        colorDescription: cleanText(
          item?.colorDescription,
          300
        ),
        colorHex: cleanHex(item?.colorHex),
        sampleImageUrl: cleanText(
          item?.sampleImageUrl,
          2000
        ),
      }))
      .filter(
        (item) => item.areaKey && item.productCode
      );
  } catch {
    return [];
  }
}

function getDefaultArea(targetType) {
  const keys = {
    artwall: "artwall_surface",
    kitchen: "kitchen_all",
    door: "door_all",
    built_in: "built_in",
    shoe_cabinet: "shoe_cabinet",
    fridge_cabinet: "fridge_cabinet",
    cabinet: "cabinet",
  };

  const key = keys[targetType];

  return {
    key,
    label: AREA_LABELS[key],
  };
}

function getTargetPrompt(targetType) {
  const prompts = {
    artwall: [
      "Edit only the EXISTING feature wall / art wall surface in IMAGE 1.",
      "Apply the selected interior film finish to this existing wall surface only.",
      "Preserve its silhouette, wall boundaries, panel layout, grout lines, joints, outlets, wires, lighting, perspective and room geometry.",
      "Leave the floor, ceiling, adjacent walls, existing doors and objects untouched.",
      "NEVER create a door, doorway, door frame, handle, window, cabinet or wall opening.",
      "Do not turn any wall panel into a door.",
      "Do not remove the existing wall seams or tile joints.",
      "If the target wall is absent, preserve the source image instead of inventing it.",
    ],
    kitchen: [
      "The target is EXISTING KITCHEN CABINETRY ONLY.",
      "Apply film only to existing visible cabinet fronts, drawer fronts and film-finished cabinet side panels.",
      "Modify only the requested cabinet areas that actually exist in IMAGE 1.",
      "Do not invent or extend cabinets.",
      "Preserve every architectural room door and door frame unchanged.",
      "Preserve countertops, backsplash, wall tiles, sink, faucet, cooktop, hood, appliances, refrigerator, windows, floor and ceiling.",
    ],
    door: [
      "The target is the EXISTING ARCHITECTURAL DOOR AND DOOR FRAME ONLY.",
      "Apply film only to the existing moving door leaf and surrounding frame, jamb and casing.",
      "Never create a door or frame where IMAGE 1 has none.",
      "Preserve the exact door shape, panel design, doorway dimensions and hardware.",
      "Do not modify cabinets, furniture, walls, floor, ceiling, glass, handles, locks or hinges.",
    ],
    built_in: [
      "The target is the EXISTING BUILT-IN CLOSET OR WARDROBE ONLY.",
      "It is furniture, NOT an architectural room door.",
      "Apply film only to existing closet fronts, drawer fronts and film-finished exposed panels.",
      "Preserve the exact panel count, divisions, gaps, grooves, rails, handles, moldings and dimensions.",
      "Never convert closet panels into room doors or create a doorway.",
    ],
    shoe_cabinet: [
      "The target is the EXISTING SHOE CABINET ONLY.",
      "It is storage furniture, NOT a room door.",
      "Apply film only to existing cabinet fronts and film-finished exposed panels.",
      "Preserve all divisions, handles, seams, gaps and dimensions.",
      "Never create an architectural door, doorway or frame.",
    ],
    fridge_cabinet: [
      "The target is the EXISTING REFRIGERATOR CABINET OR ENCLOSURE ONLY.",
      "Apply film only to its existing cabinet fronts and film-finished enclosure panels.",
      "Preserve the refrigerator and all appliances unchanged.",
      "Preserve cabinet dimensions, divisions, gaps, handles and hardware.",
      "Never create a room door, doorway or frame.",
    ],
    cabinet: [
      "The target is EXISTING STORAGE CABINET FURNITURE ONLY.",
      "Apply film only to existing fronts and film-finished exposed panels.",
      "Preserve furniture identity, dimensions, panel count, drawers, handles, seams and gaps.",
      "Never reinterpret furniture panels as room doors.",
      "Never create a doorway, frame or passage.",
    ],
  };

  return (prompts[targetType] || []).join(" ");
}

function getAreaInstruction(key, label) {
  const instructions = {
    artwall_surface:
      "Apply the assigned film only to the existing art wall surface. Preserve seams, joints, outlets, cables and boundaries. Never add a door, frame, handle or opening.",
    kitchen_all:
      "Apply film only to existing visible kitchen cabinet fronts and film-finished exposed panels. Preserve every non-cabinet surface.",
    kitchen_upper:
      "Apply this film only to existing visible upper kitchen cabinet doors and film-finished panels above the countertop.",
    kitchen_lower:
      "Apply this film only to existing lower cabinet doors and drawer fronts below the countertop.",
    fridge_cabinet:
      "Apply this film only to existing refrigerator-cabinet fronts and enclosure panels. Preserve the refrigerator and appliances. If the cabinet is absent, do nothing.",
    tall_cabinet:
      "Apply this film only to the existing tall cabinet fronts and film-finished panels. If absent, do nothing.",
    pantry_cabinet:
      "Apply this film only to the existing pantry cabinet fronts and film-finished panels. If absent, do nothing.",
    island_cabinet:
      "Apply this film only to existing island cabinet fronts and film-finished side panels. Preserve the countertop. If absent, do nothing.",
    door_all:
      "Apply this film only to the existing architectural door leaf and its existing surrounding frame. Never invent a door or frame.",
    door_leaf:
      "Apply this film only to the existing moving door leaf. Preserve the handle, lock, hinges and glass.",
    door_frame:
      "Apply this film only to the existing door frame, jamb and casing. Preserve the door leaf and surrounding wall.",
    built_in:
      "Apply this film only to the existing built-in wardrobe fronts and film-finished panels. Preserve divisions, handles and seams. Do not turn furniture into a room door.",
    shoe_cabinet:
      "Apply this film only to the existing shoe-cabinet fronts and film-finished panels. Preserve divisions, handles and seams. Do not turn furniture into a room door.",
    cabinet:
      "Apply this film only to the existing furniture-cabinet fronts and film-finished panels. Preserve divisions, handles and seams. Do not turn furniture into a room door.",
  };

  return (
    instructions[key] ||
    `Apply film only to the existing visible area "${label}". If absent, do nothing.`
  );
}

function getFilmKey(film) {
  return [
    film.brand,
    film.productCode,
    film.sampleImageUrl,
  ].join("|");
}

function getFilmDetails(film) {
  return [
    `Selected film: ${[
      film.brand,
      film.productCode,
    ].filter(Boolean).join(" ")}.`,
    film.productName
      ? `Product name: ${film.productName}.`
      : "",
    film.texture
      ? `Texture: ${film.texture}.`
      : "",
    film.colorFamily
      ? `Color family: ${film.colorFamily}.`
      : "",
    film.colorDescription
      ? `Color description: ${film.colorDescription}.`
      : "",
    film.colorHex
      ? `Approximate color: ${film.colorHex}.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function getPreservationPrompt() {
  return [
    "Create one photorealistic interior-film installation preview.",
    "IMAGE 1 is the customer's ORIGINAL photograph and the only source of room structure.",
    "Other images are material samples only. Never copy objects, room geometry or doors from material reference images.",
    "Preserve the original room layout, camera angle, crop, perspective and proportions.",
    "Preserve the exact identity, number, size, position and divisions of all existing objects.",
    "Preserve handles, hinges, locks, rails, glass, appliances, fixtures, switches, outlets and cables.",
    "Change only the color and material finish of the explicitly selected EXISTING target surfaces.",
    "Never add or remove objects.",
    "Never create new doors, doorways, frames, handles, windows, openings, cabinets, drawers or panels.",
    "Never reinterpret a wall or furniture panel as an architectural door.",
    "Do not move, enlarge, shrink, clean up, stage or reorganize the room.",
    "Preserve existing panel seams, joints, gaps, boundaries and hardware.",
    "Match the selected film naturally to the target perspective, lighting, shadows and reflections.",
    "Preserve realistic grain direction and material pattern scale.",
    "Return one completed photorealistic image only.",
    "Do not add text, labels, arrows, borders, comparison layouts or watermarks.",
  ].join(" ");
}

function getOpenAIError(result) {
  const message =
    result?.error?.message ||
    result?.message ||
    "";

  if (!message) {
    return "OpenAI 이미지 생성 요청에 실패했습니다.";
  }

  if (message.toLowerCase().includes("billing")) {
    return "OpenAI API 잔액 또는 결제 설정을 확인해주세요.";
  }

  if (message.toLowerCase().includes("rate limit")) {
    return "요청이 많습니다. 잠시 후 다시 시도해주세요.";
  }

  return message;
}

export async function POST(request) {
  let reservation = null;
  let generated = false;

  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        {
          error:
            "OPENAI_API_KEY가 설정되지 않았습니다.",
        },
        { status: 500 }
      );
    }

    const form = await request.formData();

    const companySlug = cleanText(
      form.get("company_slug"),
      100
    );

    if (!companySlug) {
      return NextResponse.json(
        {
          error:
            "업체 페이지에서 다시 시도해주세요.",
        },
        { status: 400 }
      );
    }

    const company = await resolveCompanyBySlug(
      companySlug
    );

    if (!company) {
      return NextResponse.json(
        {
          error:
            "사용 가능한 업체 정보를 찾을 수 없습니다.",
        },
        { status: 404 }
      );
    }

    const image = form.get("image");

    if (
      !(image instanceof File) ||
      !image.type?.startsWith("image/")
    ) {
      return NextResponse.json(
        {
          error:
            "가상시공할 원본 이미지가 없습니다.",
        },
        { status: 400 }
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
        { status: 400 }
      );
    }

    const targetType = cleanText(
      form.get("targetType"),
      30
    );

    if (!ALLOWED_TARGET_TYPES.has(targetType)) {
      return NextResponse.json(
        {
          error:
            "사용할 수 없는 가상시공 종류입니다.",
        },
        { status: 400 }
      );
    }

    const targetLabel = TARGET_LABELS[targetType];
    const primaryFilm = getPrimaryFilm(form);

    if (!primaryFilm.productCode) {
      return NextResponse.json(
        {
          error:
            "선택한 필름 정보가 없습니다.",
        },
        { status: 400 }
      );
    }

    const useSplitTone =
      MULTI_TONE_TARGET_TYPES.has(targetType) &&
      String(form.get("useSplitTone") || "") ===
        "true";

    let areaFilms = getAreaFilms(form);

    if (
      areaFilms.some(
        (film) =>
          !ALLOWED_AREAS[targetType].has(
            film.areaKey
          )
      )
    ) {
      return NextResponse.json(
        {
          error:
            "선택한 시공 종류와 세부 부위가 일치하지 않습니다. 다시 선택해주세요.",
        },
        { status: 400 }
      );
    }

    if (!areaFilms.length) {
      const area = getDefaultArea(targetType);

      areaFilms = [
        {
          ...primaryFilm,
          areaKey: area.key,
          areaLabel: area.label,
        },
      ];
    }

    areaFilms = areaFilms.map((film) => ({
      ...(useSplitTone ? film : primaryFilm),
      areaKey: film.areaKey,
      areaLabel: AREA_LABELS[film.areaKey],
    }));

    const uniqueFilms = [
      ...new Map(
        areaFilms.map((film) => [
          getFilmKey(film),
          film,
        ])
      ).values(),
    ];

    const referenceFilms = [];
    let imageNumber = 2;

    for (
      let index = 0;
      index < uniqueFilms.length;
      index += 1
    ) {
      const film = uniqueFilms[index];

      const sampleImage = await fetchSampleImage(
        film.sampleImageUrl,
        film.productCode,
        index + 1
      );

      referenceFilms.push({
        ...film,
        sampleImage,
        imageNumber: sampleImage
          ? imageNumber++
          : null,
      });
    }

    const promptParts = [
      getPreservationPrompt(),
      getTargetPrompt(targetType),
      `Selected installation category: ${targetLabel}.`,
    ];

    referenceFilms.forEach((film) => {
      if (film.sampleImage) {
        promptParts.push(
          `IMAGE ${film.imageNumber} is a material sample for ${film.brand} ${film.productCode}, not a room photograph.`,
          getFilmDetails(film),
          `Match IMAGE ${film.imageNumber} for material color and texture. It takes priority over text and HEX descriptions.`
        );
      }
    });

    areaFilms.forEach((film) => {
      const reference = referenceFilms.find(
        (item) =>
          getFilmKey(item) === getFilmKey(film)
      );

      promptParts.push(
        `Target area: ${film.areaLabel}.`,
        getAreaInstruction(
          film.areaKey,
          film.areaLabel
        ),
        getFilmDetails(film)
      );

      if (reference?.sampleImage) {
        promptParts.push(
          `For ${film.areaLabel}, match material reference IMAGE ${reference.imageNumber}.`
        );
      }
    });

    promptParts.push(
      useSplitTone
        ? "MULTI-TONE: Keep each film strictly within its own assigned existing area. Never swap or blend finishes between areas."
        : "UNIFIED COLOR: Apply the same film consistently only to the selected existing target surfaces. Leave unrelated objects unchanged.",
      "FINAL STRUCTURE CHECK: IMAGE 1 must remain structurally identical. Never create a new door, frame, handle or opening. Change only the selected existing surface finish."
    );

    const model =
      process.env.OPENAI_IMAGE_MODEL ||
      "gpt-image-1.5";

    const size =
      process.env.OPENAI_IMAGE_SIZE ||
      "1024x1024";

    const quality =
      process.env.OPENAI_IMAGE_QUALITY ||
      "low";

    const openAIForm = new FormData();

    openAIForm.append("model", model);
    openAIForm.append(
      "image[]",
      image,
      image.name || "original.jpg"
    );

    referenceFilms.forEach((film) => {
      if (film.sampleImage) {
        openAIForm.append(
          "image[]",
          film.sampleImage,
          film.sampleImage.name
        );
      }
    });

    openAIForm.append(
      "prompt",
      promptParts.filter(Boolean).join(" ")
    );
    openAIForm.append("size", size);
    openAIForm.append("quality", quality);
    openAIForm.append("output_format", "webp");
    openAIForm.append("output_compression", "70");

    // 유료 이미지 API 호출 전에 DB에서 1회를 예약합니다.
    const virtualLimit = await reserveUsage(company);

    if (!virtualLimit.ok) {
      return NextResponse.json(
        {
          success: false,
          error: virtualLimit.error,
          code: virtualLimit.limitReached
            ? "VIRTUAL_REMODEL_LIMIT_REACHED"
            : "VIRTUAL_REMODEL_LIMIT_CHECK_FAILED",
          planCode: virtualLimit.planCode,
          planName: virtualLimit.planName,
          used: virtualLimit.used,
          limit: virtualLimit.limit,
          remaining: virtualLimit.remaining,
        },
        {
          status: virtualLimit.limitReached
            ? 429
            : 503,
        }
      );
    }

    reservation = {
      companyId: company.id,
      id: virtualLimit.reservationId,
    };

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

    const result = await response
      .json()
      .catch(() => ({}));

    if (!response.ok) {
      console.error("가상시공 API 오류:", result);

      return NextResponse.json(
        {
          error: getOpenAIError(result),
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

    const item = result?.data?.[0];

    const imageUrl = item?.b64_json
      ? `data:image/webp;base64,${item.b64_json}`
      : item?.url;

    if (!imageUrl) {
      return NextResponse.json(
        {
          error:
            "생성된 이미지 데이터가 없습니다.",
        },
        { status: 502 }
      );
    }

    const sampleReferenceCount =
      referenceFilms.filter(
        (film) => Boolean(film.sampleImage)
      ).length;

    // 확정 응답이 유실되어도 성공 기록을 실패로 덮어쓰지 않습니다.
    generated = true;

    await finishUsage(
      company.id,
      reservation.id,
      true,
      {
        model,
        image_size: size,
        image_quality: quality,
        target_type: targetType,
        split_tone: Boolean(useSplitTone),
        product_code: primaryFilm.productCode,
        sample_reference_count:
          sampleReferenceCount,
        openai_usage: result?.usage || null,
      }
    );

    const usageRecorded = true;

    return NextResponse.json({
      success: true,
      imageUrl,
      targetType,
      targetLabel,
      useSplitTone,
      productCode: primaryFilm.productCode,
      appliedAreas: areaFilms.map((film) => ({
        areaKey: film.areaKey,
        areaLabel: film.areaLabel,
        productCode: film.productCode,
      })),
      sampleReferenceCount,
      usage: result?.usage || null,
      usageRecorded,
      planUsage: {
        planCode: virtualLimit.planCode,
        planName: virtualLimit.planName,
        usedBefore: virtualLimit.used,
        usedAfter: virtualLimit.used + 1,
        limit: virtualLimit.limit,
        remaining: virtualLimit.unlimited
          ? null
          : Math.max(
              0,
              virtualLimit.remaining - 1
            ),
        unlimited: Boolean(
          virtualLimit.unlimited
        ),
      },
    });
  } catch (error) {
    console.error("가상시공 처리 오류:", error);

    if (
      ["TimeoutError", "AbortError"].includes(
        error?.name
      )
    ) {
      return NextResponse.json(
        {
          error:
            "이미지 생성 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.",
        },
        { status: 504 }
      );
    }

    return NextResponse.json(
      {
        error:
          error?.message ||
          "가상시공 이미지 생성 중 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  } finally {
    // 이미지 생성 실패 시 예약한 사용량을 반환합니다.
    if (reservation && !generated) {
      try {
        await finishUsage(
          reservation.companyId,
          reservation.id,
          false
        );
      } catch (error) {
        console.error(
          "가상시공 예약 반환 오류:",
          error?.code || error?.name
        );
      }
    }
  }
}
