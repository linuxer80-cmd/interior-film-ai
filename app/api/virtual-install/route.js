import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 60;

function getAdminSupabase() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient(
    supabaseUrl,
    serviceRoleKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}

async function resolveCompanyBySlug(companySlug) {
  if (!companySlug) {
    return null;
  }

  const supabase = getAdminSupabase();

  if (!supabase) {
    console.error(
      "Supabase 서버 환경변수가 없습니다."
    );
    return null;
  }

  const { data, error } = await supabase
    .from("companies")
    .select(
      "id, company_name, slug, subscription_plan, is_active"
    )
    .eq("slug", companySlug)
    .maybeSingle();

  if (error) {
    console.error(
      "가상시공 회사 조회 오류:",
      error
    );
    return null;
  }

  if (!data || data.is_active === false) {
    return null;
  }

  return data;
}

async function checkVirtualRemodelLimit(company) {
  if (!company?.id) {
    return {
      ok: false,
      error: "업체 정보가 없습니다.",
    };
  }

  const supabase = getAdminSupabase();

  if (!supabase) {
    return {
      ok: false,
      error: "Supabase 서버 설정이 없습니다.",
    };
  }

  try {
    const planCode =
      company.subscription_plan || "basic";

    const {
      data: plan,
      error: planError,
    } = await supabase
      .from("subscription_plans")
      .select(
        "plan_code, plan_name, virtual_remodel_limit, is_active"
      )
      .eq("plan_code", planCode)
      .maybeSingle();

    if (planError) {
      console.error(
        "가상시공 요금제 조회 오류:",
        planError
      );

      return {
        ok: false,
        error:
          "요금제 정보를 확인할 수 없습니다.",
      };
    }

    if (!plan) {
      return {
        ok: false,
        error:
          "등록된 요금제를 찾을 수 없습니다.",
      };
    }

    if (plan.is_active === false) {
      return {
        ok: false,
        error:
          "현재 사용할 수 없는 요금제입니다.",
      };
    }

    const limit = Number(
      plan.virtual_remodel_limit || 0
    );

    // 0 이하 = 무제한
    if (limit <= 0) {
      return {
        ok: true,
        planCode: plan.plan_code,
        planName: plan.plan_name,
        used: 0,
        limit: 0,
        remaining: null,
        unlimited: true,
      };
    }

    // 한국시간 기준 현재 월 계산
    const now = new Date();

    const parts =
      new Intl.DateTimeFormat(
        "en-CA",
        {
          timeZone: "Asia/Seoul",
          year: "numeric",
          month: "2-digit",
        }
      ).formatToParts(now);

    const year = Number(
      parts.find(
        (item) =>
          item.type === "year"
      )?.value
    );

    const month = Number(
      parts.find(
        (item) =>
          item.type === "month"
      )?.value
    );

    // 한국시간 매월 1일 00:00
    const monthStart =
      new Date(
        Date.UTC(
          year,
          month - 1,
          1,
          -9,
          0,
          0,
          0
        )
      );

    const nextMonthStart =
      new Date(
        Date.UTC(
          month === 12
            ? year + 1
            : year,
          month === 12
            ? 0
            : month,
          1,
          -9,
          0,
          0,
          0
        )
      );

    const {
      data: usageRows,
      error: usageError,
    } = await supabase
      .from("usage_events")
      .select("quantity")
      .eq(
        "company_id",
        company.id
      )
      .eq(
        "event_type",
        "virtual_remodel"
      )
      .gte(
        "created_at",
        monthStart.toISOString()
      )
      .lt(
        "created_at",
        nextMonthStart.toISOString()
      );

    if (usageError) {
      console.error(
        "가상시공 사용량 조회 오류:",
        usageError
      );

      return {
        ok: false,
        error:
          "현재 사용량을 확인할 수 없습니다.",
      };
    }

    const used = (
      usageRows || []
    ).reduce(
      (sum, row) =>
        sum +
        Number(
          row.quantity || 0
        ),
      0
    );

    const remaining =
      Math.max(
        0,
        limit - used
      );

    if (used >= limit) {
      return {
        ok: false,
        limitReached: true,
        planCode:
          plan.plan_code,
        planName:
          plan.plan_name,
        used,
        limit,
        remaining: 0,
        error:
          `${plan.plan_name} 요금제의 이번 달 가상시공 사용 한도(${limit}회)를 모두 사용했습니다.`,
      };
    }

    return {
      ok: true,
      planCode:
        plan.plan_code,
      planName:
        plan.plan_name,
      used,
      limit,
      remaining,
      unlimited: false,
    };
  } catch (error) {
    console.error(
      "가상시공 한도 확인 오류:",
      error
    );

    return {
      ok: false,
      error:
        "가상시공 사용 한도를 확인할 수 없습니다.",
    };
  }
}

async function recordVirtualInstallUsage({
  company,
  model,
  size,
  quality,
  targetType,
  useSplitTone,
  productCode,
  sampleReferenceCount,
  openAIUsage,
}) {
  if (!company?.id) {
    return false;
  }

  const supabase =
    getAdminSupabase();

  if (!supabase) {
    console.error(
      "사용량 기록 실패: Supabase 서버 설정 없음"
    );
    return false;
  }

  const { error } =
    await supabase
      .from("usage_events")
      .insert({
        company_id:
          company.id,

        event_type:
          "virtual_remodel",

        quantity: 1,
        cost_krw: 0,
        provider: "openai",

        model:
          model || null,

        reference_id:
          productCode || null,

        metadata: {
          company_slug:
            company.slug,

          company_name:
            company.company_name,

          subscription_plan:
            company.subscription_plan,

          target_type:
            targetType,

          split_tone:
            Boolean(
              useSplitTone
            ),

          product_code:
            productCode ||
            null,

          image_size:
            size || null,

          image_quality:
            quality || null,

          sample_reference_count:
            Number(
              sampleReferenceCount ||
                0
            ),

          openai_usage:
            openAIUsage ||
            null,
        },
      });

  if (error) {
    console.error(
      "가상시공 사용량 기록 오류:",
      error
    );

    return false;
  }

  return true;
}

const MAX_IMAGE_SIZE =
  10 * 1024 * 1024;

const MAX_SAMPLE_SIZE =
  10 * 1024 * 1024;

const MAX_AREA_FILMS = 8;

function cleanText(
  value,
  maxLength = 300
) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function cleanHex(value) {
  const hex =
    cleanText(
      value,
      20
    );

  return /^#[0-9a-fA-F]{3,8}$/.test(
    hex
  )
    ? hex
    : "";
}

function getAllowedSampleHosts() {
  const hosts =
    new Set([
      "gxtvvzysuhexhpljpswj.supabase.co",
    ]);

  try {
    const supabaseUrl =
      process.env
        .NEXT_PUBLIC_SUPABASE_URL;

    if (supabaseUrl) {
      hosts.add(
        new URL(
          supabaseUrl
        ).hostname
      );
    }
  } catch (error) {
    console.error(
      "Supabase URL 오류:",
      error
    );
  }

  return hosts;
}

async function fetchSampleImage(
  sampleImageUrl,
  productCode,
  index
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
      url.protocol !==
        "https:" ||
      !getAllowedSampleHosts().has(
        url.hostname
      )
    ) {
      console.warn(
        "허용되지 않은 샘플 주소:",
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

          signal:
            AbortSignal.timeout(
              15000
            ),
        }
      );

    if (!response.ok) {
      console.error(
        "샘플 이미지 로드 실패:",
        response.status,
        productCode
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
      await response
        .arrayBuffer();

    if (
      !arrayBuffer.byteLength ||
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
      `film-${index}-${
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
      "필름 샘플 오류:",
      productCode,
      error
    );

    return null;
  }
}

function getPrimaryFilm(
  formData
) {
  return {
    areaKey: "all",

    areaLabel:
      "전체 시공 부위",

    brand:
      cleanText(
        formData.get(
          "brand"
        ),
        100
      ),

    productCode:
      cleanText(
        formData.get(
          "productCode"
        ),
        100
      ),

    productName:
      cleanText(
        formData.get(
          "productName"
        ),
        200
      ),

    texture:
      cleanText(
        formData.get(
          "texture"
        ),
        100
      ),

    colorFamily:
      cleanText(
        formData.get(
          "colorFamily"
        ),
        100
      ),

    colorDescription:
      cleanText(
        formData.get(
          "colorDescription"
        ),
        300
      ),

    colorHex:
      cleanHex(
        formData.get(
          "colorHex"
        )
      ),

    sampleImageUrl:
      cleanText(
        formData.get(
          "sampleImageUrl"
        ),
        2000
      ),
  };
}

function getAreaFilms(
  formData
) {
  const rawValue =
    formData.get(
      "areaFilms"
    );

  if (!rawValue) {
    return [];
  }

  try {
    const parsed =
      JSON.parse(
        String(
          rawValue
        )
      );

    if (
      !Array.isArray(
        parsed
      )
    ) {
      return [];
    }

    return parsed
      .slice(
        0,
        MAX_AREA_FILMS
      )
      .map(
        (item) => ({
          areaKey:
            cleanText(
              item?.areaKey,
              100
            ),

          areaLabel:
            cleanText(
              item?.areaLabel,
              100
            ),

          brand:
            cleanText(
              item?.brand,
              100
            ),

          productCode:
            cleanText(
              item?.productCode,
              100
            ),

          productName:
            cleanText(
              item?.productName,
              200
            ),

          texture:
            cleanText(
              item?.texture,
              100
            ),

          colorFamily:
            cleanText(
              item?.colorFamily,
              100
            ),

          colorDescription:
            cleanText(
              item
                ?.colorDescription,
              300
            ),

          colorHex:
            cleanHex(
              item?.colorHex
            ),

          sampleImageUrl:
            cleanText(
              item
                ?.sampleImageUrl,
              2000
            ),
        })
      )
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

function getTargetPrompt(
  targetType
) {
  if (
    targetType ===
    "kitchen"
  ) {
    return [
      "The installation target is KITCHEN CABINETRY ONLY.",

      "Apply interior film only to existing visible upper cabinet doors, lower cabinet doors, drawer fronts, refrigerator cabinet doors, tall cabinet doors, pantry cabinet doors, island cabinet doors and their visible film-finished side panels.",

      "Only modify a listed cabinet area when that area actually exists and is visible in IMAGE 1.",

      "Do not invent, add or extend a refrigerator cabinet, tall cabinet, pantry cabinet or island cabinet when it is not present in IMAGE 1.",

      "Do not apply film to any interior door or door frame visible in the kitchen photograph.",

      "Preserve all room doors and door frames exactly as they appear in IMAGE 1.",

      "Do not modify the countertop, backsplash, wall tiles, sink, faucet, cooktop, hood, appliances, refrigerator, window, wall, floor or ceiling.",
    ].join(" ");
  }

  if (
    targetType ===
    "door"
  ) {
    return [
      "The installation target is the EXISTING DOOR AND DOOR FRAME ONLY.",

      "Apply interior film only to the visible moving door leaf and the surrounding door frame, jamb and casing.",

      "Do not apply film to kitchen cabinets, built-in furniture, walls, floor, ceiling, glass, handles, locks, hinges, switches or other objects.",

      "Preserve the exact door shape, panel design, frame shape, opening direction and hardware.",

      "Do not create an additional door or change the doorway size.",
    ].join(" ");
  }

  return [
    "Apply interior film only to the explicitly identified existing target surfaces.",

    "Do not modify unrelated doors, cabinets, walls or furniture.",
  ].join(" ");
}

function getAreaInstruction(
  areaKey,
  areaLabel
) {
  const instructions = {
    kitchen_upper:
      "Apply this assigned film only to existing visible upper wall-mounted kitchen cabinet doors and their film-finished visible panels above the countertop.",

    kitchen_lower:
      "Apply this assigned film only to existing visible lower base cabinet doors and drawer fronts below the countertop.",

    fridge_cabinet:
      "If an actual refrigerator enclosure or refrigerator cabinet is visible, apply this assigned film only to its cabinet doors and film-finished enclosure panels. If it is absent, do nothing.",

    tall_cabinet:
      "If an actual tall cabinet is visible, apply this assigned film only to its doors and film-finished panels. If it is absent, do nothing.",

    pantry_cabinet:
      "If an actual pantry cabinet is visible, apply this assigned film only to its doors and film-finished panels. If it is absent, do nothing.",

    island_cabinet:
      "If an actual kitchen island cabinet is visible, apply this assigned film only to its cabinet doors, drawer fronts and film-finished side panels. Preserve its countertop. If it is absent, do nothing.",

    door_leaf:
      "Apply this assigned film only to the existing moving door leaf or door panel. Preserve the handle, lock, hinges and glass.",

    door_frame:
      "Apply this assigned film only to the existing surrounding door frame, jamb and casing. Do not apply it to the door leaf or wall.",
  };

  return (
    instructions[
      areaKey
    ] ||
    `Apply this assigned film only to the existing visible area identified as "${areaLabel}". If that area is absent, do nothing.`
  );
}

function getFilmKey(
  film
) {
  return [
    film.productCode,
    film.sampleImageUrl,
  ]
    .filter(Boolean)
    .join("|");
}

function getFilmDetails(
  film
) {
  return [
    `Selected film: ${[
      film.brand,
      film.productCode,
    ]
      .filter(Boolean)
      .join(" ")}.`,

    film.productName
      ? `Product name: ${film.productName}.`
      : "",

    film.texture
      ? `Texture or material: ${film.texture}.`
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
    "Create one photorealistic virtual interior-film installation preview.",

    "IMAGE 1 is the customer's original photograph and must remain the structural base image.",

    "Preserve the original room layout, camera angle, perspective, crop, dimensions and proportions.",

    "Preserve the exact number, size, position, shape and division of all doors, frames, cabinet doors, drawers and panels.",

    "Preserve handles, hinges, locks, rails, glass, appliances, fixtures, switches and all hardware.",

    "Change only the surface color and material finish of the specified installation targets.",

    "Do not add or remove objects.",

    "Do not redesign the room or furniture.",

    "Do not change cabinet divisions, door divisions or hardware.",

    "Do not move, enlarge or shrink any object.",

    "Do not remove boxes, appliances or objects from the original photograph.",

    "Do not clean up, stage or reorganize the room.",    "For wood film, preserve realistic grain direction, pattern scale and natural variation.",

    "For solid film, preserve realistic lighting, shadows, edges and reflections.",

    "For stone, marble, metal, fabric or leather film, preserve realistic material scale and texture.",

    "Adapt the selected film naturally to each target surface's perspective, seams, edges, corners, highlights and shadows.",

    "The result must look like the same real room photographed after professional interior-film installation.",

    "Return only one completed photorealistic image.",

    "Do not include text, labels, arrows, borders, sample boards, split screens, annotations or watermarks.",
  ].join(" ");
}

function getOpenAIError(
  result
) {
  const message =
    result?.error?.message ||
    result?.message ||
    "";

  if (!message) {
    return "OpenAI 이미지 생성 요청에 실패했습니다.";
  }

  const lower =
    message.toLowerCase();

  if (
    lower.includes("billing")
  ) {
    return "OpenAI API 잔액 또는 결제 설정을 확인해주세요.";
  }

  if (
    lower.includes(
      "rate limit"
    )
  ) {
    return "요청이 많습니다. 잠시 후 다시 시도해주세요.";
  }

  return message;
}

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

    const companySlug =
      cleanText(
        requestData.get(
          "company_slug"
        ),
        100
      );

    if (!companySlug) {
      return NextResponse.json(
        {
          error:
            "업체 정보가 없습니다. 업체 페이지에서 다시 시도해주세요.",
        },
        {
          status: 400,
        }
      );
    }

    const company =
      await resolveCompanyBySlug(
        companySlug
      );

    if (!company) {
      return NextResponse.json(
        {
          error:
            "사용 가능한 업체 정보를 찾을 수 없습니다.",
        },
        {
          status: 404,
        }
      );
    }

    /*
     * =========================================================
     * 요금제별 가상시공 사용 한도 확인
     * OpenAI 호출 전에 검사하여
     * 한도 초과 시 API 비용 발생 방지
     * =========================================================
     */

    const virtualLimit =
      await checkVirtualRemodelLimit(
        company
      );

    if (!virtualLimit.ok) {
      if (
        virtualLimit.limitReached
      ) {
        return NextResponse.json(
          {
            success: false,

            error:
              virtualLimit.error,

            code:
              "VIRTUAL_REMODEL_LIMIT_REACHED",

            planCode:
              virtualLimit.planCode,

            planName:
              virtualLimit.planName,

            used:
              virtualLimit.used,

            limit:
              virtualLimit.limit,

            remaining: 0,
          },
          {
            status: 429,
          }
        );
      }

      return NextResponse.json(
        {
          success: false,

          error:
            virtualLimit.error ||
            "사용 한도를 확인할 수 없습니다.",

          code:
            "VIRTUAL_REMODEL_LIMIT_CHECK_FAILED",
        },
        {
          status: 503,
        }
      );
    }

    const image =
      requestData.get("image");

    if (
      !(image instanceof File)
    ) {
      return NextResponse.json(
        {
          error:
            "가상시공할 사진이 없습니다.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !image.type?.startsWith(
        "image/"
      )
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
      image.size >
        MAX_IMAGE_SIZE
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

    const targetType =
      cleanText(
        requestData.get(
          "targetType"
        ),
        30
      );

    if (
      targetType !==
        "kitchen" &&
      targetType !== "door"
    ) {
      return NextResponse.json(
        {
          error:
            "싱크대·주방가구 또는 문·문틀을 선택해주세요.",
        },
        {
          status: 400,
        }
      );
    }

    const primaryFilm =
      getPrimaryFilm(
        requestData
      );

    if (
      !primaryFilm.productCode
    ) {
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
        requestData.get(
          "useSplitTone"
        ) || ""
      ) === "true";

    /*
     * 단일 컬러여도 부위 목록은 항상 받습니다.
     * 그래야 싱크대 사진의 문이 변경되는 것을 막을 수 있습니다.
     */
    let areaFilms =
      getAreaFilms(
        requestData
      );

    if (!areaFilms.length) {
      const defaultAreas =
        targetType === "kitchen"
          ? [
              {
                key:
                  "kitchen_upper",
                label: "상부장",
              },
              {
                key:
                  "kitchen_lower",
                label: "하부장",
              },
              {
                key:
                  "fridge_cabinet",
                label:
                  "냉장고장",
              },
              {
                key:
                  "tall_cabinet",
                label: "키큰장",
              },
              {
                key:
                  "pantry_cabinet",
                label:
                  "팬트리장",
              },
              {
                key:
                  "island_cabinet",
                label:
                  "아일랜드장",
              },
            ]
          : [
              {
                key:
                  "door_leaf",
                label: "문짝",
              },
              {
                key:
                  "door_frame",
                label: "문틀",
              },
            ];

      areaFilms =
        defaultAreas.map(
          (area) => ({
            ...primaryFilm,
            areaKey:
              area.key,
            areaLabel:
              area.label,
          })
        );
    }

    /*
     * 동일한 필름은 샘플 이미지를 한 번만 전송합니다.
     */
    const uniqueFilmMap =
      new Map();

    areaFilms.forEach(
      (film) => {
        const key =
          getFilmKey(film);

        if (
          !uniqueFilmMap.has(
            key
          )
        ) {
          uniqueFilmMap.set(
            key,
            film
          );
        }
      }
    );

    const uniqueFilms = [
      ...uniqueFilmMap.values(),
    ];

    const referenceFilms =
      [];

    for (
      let index = 0;
      index <
      uniqueFilms.length;
      index += 1
    ) {
      const film =
        uniqueFilms[index];

      const sampleImage =
        await fetchSampleImage(
          film.sampleImageUrl,
          film.productCode,
          index + 1
        );

      referenceFilms.push({
        ...film,
        sampleImage,
        imageNumber:
          sampleImage
            ? index + 2
            : null,
      });
    }

    function findReference(
      areaFilm
    ) {
      const key =
        getFilmKey(
          areaFilm
        );

      return (
        referenceFilms.find(
          (film) =>
            getFilmKey(
              film
            ) === key
        ) || null
      );
    }

    const promptParts = [
      getPreservationPrompt(),
      getTargetPrompt(
        targetType
      ),
    ];

    referenceFilms.forEach(
      (film) => {
        if (
          film.sampleImage &&
          film.imageNumber
        ) {
          promptParts.push(
            `REFERENCE IMAGE ${film.imageNumber} is the actual physical sample for ${film.brand} ${film.productCode}.`
          );

          promptParts.push(
            getFilmDetails(
              film
            )
          );

          promptParts.push(
            `REFERENCE IMAGE ${film.imageNumber} has priority over text descriptions and HEX values for this film.`
          );
        }
      }
    );

    areaFilms.forEach(
      (film) => {
        const reference =
          findReference(film);

        promptParts.push(
          `Target area: ${
            film.areaLabel ||
            film.areaKey
          }.`
        );

        promptParts.push(
          getAreaInstruction(
            film.areaKey,
            film.areaLabel
          )
        );

        promptParts.push(
          getFilmDetails(
            film
          )
        );

        if (
          reference
            ?.sampleImage &&
          reference
            ?.imageNumber
        ) {
          promptParts.push(
            `For ${
              film.areaLabel ||
              film.areaKey
            }, match REFERENCE IMAGE ${reference.imageNumber}.`
          );
        }
      }
    );

    if (useSplitTone) {
      promptParts.push(
        "This is a MULTI-TONE installation. Keep every assigned film restricted to its own target area. Do not swap, blend or mix finishes between different areas."
      );
    } else {
      promptParts.push(
        "This is a UNIFIED-COLOR installation. Apply the same selected film consistently to all existing visible target areas for the selected installation type."
      );
    }

    promptParts.push(
      targetType ===
        "kitchen"
        ? "Final check: kitchen cabinet surfaces may change, but every room door and door frame must remain unchanged."
        : "Final check: the selected door and door frame may change, but every kitchen cabinet and other piece of furniture must remain unchanged."
    );

    const prompt =
      promptParts
        .filter(Boolean)
        .join(" ");

    const openAIForm =
      new FormData();

    const openAIModel =
      process.env
        .OPENAI_IMAGE_MODEL ||
      "gpt-image-1.5";

    const openAIImageSize =
      process.env
        .OPENAI_IMAGE_SIZE ||
      "1024x1024";

    const openAIImageQuality =
      process.env
        .OPENAI_IMAGE_QUALITY ||
      "low";

    openAIForm.append(
      "model",
      openAIModel
    );

    openAIForm.append(
      "image[]",
      image,
      image.name ||
        "interior.jpg"
    );

    referenceFilms.forEach(
      (film) => {
        if (
          !film.sampleImage
        ) {
          return;
        }

        openAIForm.append(
          "image[]",
          film.sampleImage,
          film.sampleImage
            .name
        );
      }
    );

    openAIForm.append(
      "prompt",
      prompt
    );

    openAIForm.append(
      "size",
      openAIImageSize
    );

    openAIForm.append(
      "quality",
      openAIImageQuality
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

          signal:
            AbortSignal.timeout(
              55000
            ),
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
        "가상시공 API 오류:",
        result
      );

      return NextResponse.json(
        {
          error:
            getOpenAIError(
              result
            ),
        },
        {
          status:
            response.status >=
              400 &&
            response.status <
              600
              ? response.status
              : 502,
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

    const sampleReferenceCount =
      referenceFilms.filter(
        (film) =>
          Boolean(
            film.sampleImage
          )
      ).length;

    /*
     * OpenAI 이미지 생성이 성공한 경우에만
     * 가상시공 사용량 +1
     */
    const usageRecorded =
      await recordVirtualInstallUsage({
        company,
        model:
          openAIModel,
        size:
          openAIImageSize,
        quality:
          openAIImageQuality,
        targetType,
        useSplitTone,
        productCode:
          primaryFilm.productCode,
        sampleReferenceCount,
        openAIUsage:
          result?.usage ||
          null,
      });

    return NextResponse.json({
      success: true,

      imageUrl,

      targetType,

      useSplitTone,

      productCode:
        primaryFilm.productCode,

      appliedAreas:
        areaFilms.map(
          (film) => ({
            areaKey:
              film.areaKey,

            areaLabel:
              film.areaLabel,

            productCode:
              film.productCode,
          })
        ),

      sampleReferenceCount,

      usage:
        result?.usage ||
        null,

      usageRecorded,

      planUsage: {
        planCode:
          virtualLimit.planCode,

        planName:
          virtualLimit.planName,

        usedBefore:
          virtualLimit.used,

        usedAfter:
          virtualLimit.unlimited
            ? virtualLimit.used + 1
            : virtualLimit.used + 1,

        limit:
          virtualLimit.limit,

        remaining:
          virtualLimit.unlimited
            ? null
            : Math.max(
                0,
                virtualLimit.remaining -
                  1
              ),

        unlimited:
          Boolean(
            virtualLimit.unlimited
          ),
      },
    });
  } catch (error) {
    console.error(
      "가상시공 처리 오류:",
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
          "가상시공 이미지 생성 중 오류가 발생했습니다.",
      },
      {
        status: 500,
      }
    );
  }
}
