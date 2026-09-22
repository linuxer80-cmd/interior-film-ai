import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 60;

const BUCKET_NAME = "work-photos";

/* =========================================================
   Supabase Service Role
========================================================= */

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}

/* =========================================================
   요청자의 Supabase 클라이언트
========================================================= */

function getUserSupabase(accessToken) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}

/* =========================================================
   슈퍼관리자 확인

   - Bearer 토큰 확인
   - 로그인 사용자 확인
   - get_super_admin_status RPC 확인
========================================================= */

async function requireSuperAdmin(request) {
  const authHeader =
    request.headers.get("authorization") || "";

  if (
    !authHeader
      .toLowerCase()
      .startsWith("bearer ")
  ) {
    const error =
      new Error("로그인이 필요합니다.");

    error.status = 401;

    throw error;
  }

  const accessToken =
    authHeader.slice(7).trim();

  if (!accessToken) {
    const error =
      new Error("로그인이 필요합니다.");

    error.status = 401;

    throw error;
  }

  const userSupabase =
    getUserSupabase(accessToken);

  const {
    data: userData,
    error: userError,
  } =
    await userSupabase.auth.getUser();

  if (
    userError ||
    !userData?.user?.id
  ) {
    const error =
      new Error(
        "로그인 정보를 확인할 수 없습니다.",
      );

    error.status = 401;

    throw error;
  }

  const {
    data: statusData,
    error: statusError,
  } =
    await userSupabase.rpc(
      "get_super_admin_status",
    );

  if (statusError) {
    const error =
      new Error(
        `슈퍼관리자 확인 실패: ${
          statusError.message ||
          "알 수 없는 오류"
        }`,
      );

    error.status = 403;

    throw error;
  }

  const status =
    Array.isArray(statusData)
      ? statusData[0]
      : statusData;

  if (
    !status?.is_super_admin
  ) {
    const error =
      new Error(
        "슈퍼관리자만 구조분석을 실행할 수 있습니다.",
      );

    error.status = 403;

    throw error;
  }

  return {
    user: userData.user,
    status,
  };
}

/* =========================================================
   회사 확인
========================================================= */

async function getTargetCompany(
  supabase,
  companyId,
) {
  if (!companyId) {
    const error =
      new Error(
        "분석할 업체를 선택해주세요.",
      );

    error.status = 400;

    throw error;
  }

  const {
    data,
    error,
  } =
    await supabase
      .from("companies")
      .select(`
        id,
        company_name,
        slug,
        subscription_plan,
        is_active
      `)
      .eq("id", companyId)
      .maybeSingle();

  if (error) {
    throw new Error(
      `업체 조회 실패: ${
        error.message ||
        "알 수 없는 오류"
      }`,
    );
  }

  if (!data?.id) {
    const targetError =
      new Error(
        "선택한 업체를 찾을 수 없습니다.",
      );

    targetError.status = 404;

    throw targetError;
  }

  return data;
}

/* =========================================================
   OpenAI 응답 텍스트 추출
========================================================= */

function extractOutputText(data) {
  if (
    typeof data?.output_text ===
      "string" &&
    data.output_text.trim()
  ) {
    return data.output_text.trim();
  }

  if (
    Array.isArray(data?.output)
  ) {
    for (
      const outputItem
      of data.output
    ) {
      if (
        !Array.isArray(
          outputItem?.content,
        )
      ) {
        continue;
      }

      for (
        const contentItem
        of outputItem.content
      ) {
        if (
          typeof contentItem?.text ===
            "string" &&
          contentItem.text.trim()
        ) {
          return contentItem.text.trim();
        }
      }
    }
  }

  return "";
}

/* =========================================================
   JSON 파싱
========================================================= */

function parseJson(text) {
  let cleaned =
    String(text || "")
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

  const firstBrace =
    cleaned.indexOf("{");

  const lastBrace =
    cleaned.lastIndexOf("}");

  if (
    firstBrace !== -1 &&
    lastBrace !== -1 &&
    lastBrace > firstBrace
  ) {
    cleaned =
      cleaned.slice(
        firstBrace,
        lastBrace + 1,
      );
  }

  return JSON.parse(cleaned);
}

/* =========================================================
   Storage 경로 정리
========================================================= */

function normalizeStoragePath(
  storagePath,
) {
  if (!storagePath) {
    return "";
  }

  let path =
    String(storagePath).trim();

  if (!path) {
    return "";
  }

  path =
    path.replace(/^\/+/, "");

  if (
    path.startsWith(
      `${BUCKET_NAME}/`,
    )
  ) {
    path =
      path.slice(
        `${BUCKET_NAME}/`.length,
      );
  }

  const publicMarker =
    `/storage/v1/object/public/${BUCKET_NAME}/`;

  const signedMarker =
    `/storage/v1/object/sign/${BUCKET_NAME}/`;

  if (
    path.includes(publicMarker)
  ) {
    path =
      path.split(
        publicMarker,
      )[1] || "";
  }

  if (
    path.includes(signedMarker)
  ) {
    path =
      path.split(
        signedMarker,
      )[1] || "";

    path =
      path.split("?")[0];
  }

  try {
    path =
      decodeURIComponent(path);
  } catch {}

  return path.replace(
    /^\/+/,
    "",
  );
}

/* =========================================================
   Signed URL 생성
========================================================= */

async function createPhotoSignedUrl(
  supabase,
  photo,
) {
  const storagePath =
    normalizeStoragePath(
      photo?.storage_path,
    );

  if (storagePath) {
    const {
      data,
      error,
    } =
      await supabase.storage
        .from(BUCKET_NAME)
        .createSignedUrl(
          storagePath,
          300,
        );

    if (
      !error &&
      data?.signedUrl
    ) {
      return {
        url: data.signedUrl,
        source: "storage_path",
        storagePath,
      };
    }

    console.error(
      "Signed URL 생성 실패:",
      photo?.id,
      storagePath,
      error,
    );
  }

  if (photo?.photo_url) {
    const photoUrl =
      String(
        photo.photo_url,
      ).trim();

    if (
      photoUrl.startsWith(
        "https://",
      ) ||
      photoUrl.startsWith(
        "http://",
      ) ||
      photoUrl.startsWith(
        "data:",
      )
    ) {
      return {
        url: photoUrl,
        source: "photo_url",
        storagePath,
      };
    }
  }

  if (storagePath) {
    throw new Error(
      `Storage Signed URL 생성 실패: ${storagePath}`,
    );
  }

  throw new Error(
    "storage_path와 사용 가능한 photo_url이 없습니다.",
  );
}

/* =========================================================
   사진 다운로드 → Data URL
========================================================= */

async function getImageDataUrl(
  supabase,
  photo,
) {
  const imageSource =
    await createPhotoSignedUrl(
      supabase,
      photo,
    );

  let response;

  try {
    response =
      await fetch(
        imageSource.url,
        {
          method: "GET",
          cache: "no-store",
        },
      );
  } catch (error) {
    throw new Error(
      `사진 다운로드 연결 실패: ${
        error?.message ||
        "fetch 실패"
      }`,
    );
  }

  if (!response.ok) {
    throw new Error(
      `사진 다운로드 실패 HTTP ${response.status} (${imageSource.source})`,
    );
  }

  const contentType =
    response.headers.get(
      "content-type",
    ) || "";

  if (
    contentType &&
    !contentType
      .toLowerCase()
      .startsWith("image/")
  ) {
    throw new Error(
      `사진 파일 형식 오류: ${contentType}`,
    );
  }

  const arrayBuffer =
    await response.arrayBuffer();

  if (
    !arrayBuffer?.byteLength
  ) {
    throw new Error(
      "다운로드된 사진 파일이 비어 있습니다.",
    );
  }

  const maxBytes =
    20 * 1024 * 1024;

  if (
    arrayBuffer.byteLength >
    maxBytes
  ) {
    throw new Error(
      `사진 파일이 너무 큽니다 (${Math.round(
        arrayBuffer.byteLength /
          1024 /
          1024,
      )}MB)`,
    );
  }

  const finalContentType =
    contentType.startsWith(
      "image/",
    )
      ? contentType
      : "image/jpeg";

  const base64 =
    Buffer.from(
      arrayBuffer,
    ).toString("base64");

  return {
    dataUrl:
      `data:${finalContentType};base64,${base64}`,

    source:
      imageSource.source,

    storagePath:
      imageSource.storagePath,

    size:
      arrayBuffer.byteLength,

    contentType:
      finalContentType,
  };
}

/* =========================================================
   AI 구조분석 프롬프트
========================================================= */

function makeInstruction(photo) {
  const existingCategory =
    photo?.category || "";

  const existingSubCategory =
    photo?.sub_category || "";

  return `
당신은 인테리어필름 시공 견적 데이터 분석가이다.

이 사진은 과거 인테리어필름 시공 데이터이다.

이 분석의 목적은
"사진의 색상이 비슷한가"를 판단하는 것이 아니라
"인테리어필름 시공 견적 관점에서 구조와 작업량이 비슷한가"를
판단하기 위한 구조화 데이터를 만드는 것이다.

현재 DB에 저장된 참고 정보:

category:
${existingCategory || "없음"}

sub_category:
${existingSubCategory || "없음"}

중요 규칙:

1. 기존 필름 색상은 견적 유사도 판단에서 제외한다.
2. 화이트, 아이보리, 베이지, 브라운, 그레이 등의 색상을
   visual_features와 estimate_search_text에 기록하지 않는다.
3. 사진의 밝기, 조명, 벽지색, 바닥색, 주변 인테리어 색상도 제외한다.
4. 시공 대상의 구조, 형태, 크기, 구성, 작업 난이도를 중심으로 분석한다.
5. 사진에서 확인할 수 없는 특징은 추측하지 않는다.
6. 확실하지 않은 값은 null로 반환한다.
7. 기존 category와 sub_category는 참고하되
   이 API에서는 기존 DB category/sub_category를 수정하지 않는다.
8. 반드시 JSON만 반환한다.

분류 시 특히 다음 특징을 확인한다.

[문 / 문틀 / 중문]

- 일반 방문인지
- 평문인지
- 패널형인지
- 유리가 있는지
- 유리 간살이 있는지
- 슬라이딩인지
- 여닫이인지
- 중문인지
- 방화문인지
- 문짝 수
- 2연동 / 3연동 등 연동 구조
- 문틀 포함 여부
- 몰딩이나 굴곡 여부
- 손잡이 / 도어락 등 부착물
- 시공 난이도

[싱크대 / 주방가구]

- 일자형
- ㄱ자형
- ㄷ자형
- 기타 구조
- 상부장 존재 여부
- 하부장 존재 여부
- 냉장고장 존재 여부
- 키큰장 존재 여부
- 팬트리장 존재 여부
- 아일랜드장 존재 여부
- 대략적인 문짝 수
- 전체 규모
- 굴곡이나 복잡한 구조
- 시공 난이도

[붙박이장 / 신발장 / 냉장고장 / 기타 가구]

- 가구 종류
- 문짝 수
- 여닫이 / 슬라이딩
- 유리 포함 여부
- 프레임 구조
- 전체 규모
- 굴곡
- 시공 난이도

scale 값은 다음 중 하나를 사용한다.

small
medium
large

complexity 값은 다음 중 하나를 사용한다.

low
medium
high

사진만으로 판단할 수 없으면 null.

반드시 아래 형식의 JSON만 반환한다.

{
  "visual_features": {
    "object_type": null,
    "object_subtype": null,

    "style": null,
    "layout": null,
    "opening_type": null,

    "panel_count": null,
    "door_count_estimate": null,

    "glass": null,
    "grid": null,
    "frame": null,
    "molding": null,

    "upper": null,
    "lower": null,
    "fridge": null,
    "tall": null,
    "pantry": null,
    "island": null,

    "scale": null,
    "complexity": null,

    "special_features": []
  },

  "estimate_search_text":
    "색상 표현 없이 시공부위, 구조, 규모, 구성, 난이도만 한국어로 간결하게 설명"
}
`;
}

/* =========================================================
   visual_features 기본 정리
========================================================= */

function normalizeVisualFeatures(
  value,
) {
  const source =
    value &&
    typeof value ===
      "object" &&
    !Array.isArray(value)
      ? value
      : {};

  return {
    object_type:
      source.object_type ??
      null,

    object_subtype:
      source.object_subtype ??
      null,

    style:
      source.style ??
      null,

    layout:
      source.layout ??
      null,

    opening_type:
      source.opening_type ??
      null,

    panel_count:
      source.panel_count ??
      null,

    door_count_estimate:
      source
        .door_count_estimate ??
      null,

    glass:
      source.glass ??
      null,

    grid:
      source.grid ??
      null,

    frame:
      source.frame ??
      null,

    molding:
      source.molding ??
      null,

    upper:
      source.upper ??
      null,

    lower:
      source.lower ??
      null,

    fridge:
      source.fridge ??
      null,

    tall:
      source.tall ??
      null,

    pantry:
      source.pantry ??
      null,

    island:
      source.island ??
      null,

    scale:
      source.scale ??
      null,

    complexity:
      source.complexity ??
      null,

    special_features:
      Array.isArray(
        source.special_features,
      )
        ? source.special_features
        : [],
  };
}

/* =========================================================
   한 장 AI 분석
========================================================= */

async function analyzePhoto(
  supabase,
  photo,
) {
  const image =
    await getImageDataUrl(
      supabase,
      photo,
    );

  const instruction =
    makeInstruction(photo);

  const response =
    await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",

        headers: {
          Authorization:
            `Bearer ${process.env.OPENAI_API_KEY}`,

          "Content-Type":
            "application/json",
        },

        body: JSON.stringify({
          model:
            "gpt-5.6-luna",

          input: [
            {
              role: "user",

              content: [
                {
                  type:
                    "input_text",

                  text:
                    instruction,
                },

                {
                  type:
                    "input_image",

                  image_url:
                    image.dataUrl,
                },
              ],
            },
          ],
        }),
      },
    );

  let data;

  try {
    data =
      await response.json();
  } catch {
    throw new Error(
      `AI 응답 JSON 읽기 실패 (${response.status})`,
    );
  }

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
        `AI 구조분석 요청 실패 (${response.status})`,
    );
  }

  const outputText =
    extractOutputText(data);

  if (!outputText) {
    throw new Error(
      "AI 구조분석 결과가 없습니다.",
    );
  }

  let result;

  try {
    result =
      parseJson(
        outputText,
      );
  } catch (error) {
    console.error(
      "구조분석 JSON 파싱 실패:",
      outputText,
    );

    throw new Error(
      `AI 구조분석 JSON 형식 오류: ${
        error?.message ||
        "JSON 파싱 실패"
      }`,
    );
  }

  if (
    !result ||
    typeof result !==
      "object"
  ) {
    throw new Error(
      "AI 구조분석 결과 형식 오류",
    );
  }

  const visualFeatures =
    normalizeVisualFeatures(
      result.visual_features,
    );

  const estimateSearchText =
    String(
      result
        .estimate_search_text ||
        "",
    ).trim();

  if (!estimateSearchText) {
    throw new Error(
      "견적 검색용 구조 설명이 없습니다.",
    );
  }

  return {
    visualFeatures,
    estimateSearchText,

    imageInfo: {
      source:
        image.source,

      storagePath:
        image.storagePath,

      size:
        image.size,

      contentType:
        image.contentType,
    },
  };
}

/* =========================================================
   전체 사진 개수
========================================================= */

async function getTotalCount(
  supabase,
  companyId,
) {
  const {
    count,
    error,
  } =
    await supabase
      .from("work_photos")
      .select(
        "id",
        {
          count: "exact",
          head: true,
        },
      )
      .eq(
        "company_id",
        companyId,
      );

  if (error) {
    throw error;
  }

  return Number(
    count || 0,
  );
}

/* =========================================================
   미분석 사진 개수
========================================================= */

async function getRemainingCount(
  supabase,
  companyId,
) {
  const {
    count,
    error,
  } =
    await supabase
      .from("work_photos")
      .select(
        "id",
        {
          count: "exact",
          head: true,
        },
      )
      .eq(
        "company_id",
        companyId,
      )
      .is(
        "structure_analyzed_at",
        null,
      );

  if (error) {
    throw error;
  }

  return Number(
    count || 0,
  );
}

/* =========================================================
   GET
   선택 업체의 구조분석 현황 조회

   /api/analyze-work-structure?company_id=...
========================================================= */

export async function GET(
  request,
) {
  try {
    if (
      !process.env
        .NEXT_PUBLIC_SUPABASE_URL
    ) {
      throw new Error(
        "NEXT_PUBLIC_SUPABASE_URL 환경변수가 없습니다.",
      );
    }

    if (
      !process.env
        .NEXT_PUBLIC_SUPABASE_ANON_KEY
    ) {
      throw new Error(
        "NEXT_PUBLIC_SUPABASE_ANON_KEY 환경변수가 없습니다.",
      );
    }

    if (
      !process.env
        .SUPABASE_SERVICE_ROLE_KEY
    ) {
      throw new Error(
        "SUPABASE_SERVICE_ROLE_KEY 환경변수가 없습니다.",
      );
    }

    await requireSuperAdmin(
      request,
    );

    const supabase =
      getSupabase();

    const url =
      new URL(request.url);

    const companyId =
      String(
        url.searchParams.get(
          "company_id",
        ) || "",
      ).trim();

    const company =
      await getTargetCompany(
        supabase,
        companyId,
      );

    const total =
      await getTotalCount(
        supabase,
        company.id,
      );

    const remaining =
      await getRemainingCount(
        supabase,
        company.id,
      );

    const completed =
      Math.max(
        0,
        total - remaining,
      );

    return NextResponse.json({
      success: true,

      company: {
        id:
          company.id,

        company_name:
          company.company_name,

        slug:
          company.slug,

        is_active:
          company.is_active,

        subscription_plan:
          company.subscription_plan,
      },

      total,
      completed,
      remaining,

      finished:
        remaining === 0,
    });
  } catch (error) {
    console.error(
      "Structure analysis status API error:",
      error,
    );

    return NextResponse.json(
      {
        success: false,

        error:
          error?.message ||
          "구조분석 현황 조회 중 오류가 발생했습니다.",
      },
      {
        status:
          Number(
            error?.status,
          ) || 500,
      },
    );
  }
}

/* =========================================================
   POST
   슈퍼관리자 전용 구조분석 실행
========================================================= */

export async function POST(
  request,
) {
  try {
    if (
      !process.env
        .NEXT_PUBLIC_SUPABASE_URL
    ) {
      throw new Error(
        "NEXT_PUBLIC_SUPABASE_URL 환경변수가 없습니다.",
      );
    }

    if (
      !process.env
        .NEXT_PUBLIC_SUPABASE_ANON_KEY
    ) {
      throw new Error(
        "NEXT_PUBLIC_SUPABASE_ANON_KEY 환경변수가 없습니다.",
      );
    }

    if (
      !process.env
        .SUPABASE_SERVICE_ROLE_KEY
    ) {
      throw new Error(
        "SUPABASE_SERVICE_ROLE_KEY 환경변수가 없습니다.",
      );
    }

    if (
      !process.env
        .OPENAI_API_KEY
    ) {
      throw new Error(
        "OPENAI_API_KEY 환경변수가 없습니다.",
      );
    }

    await requireSuperAdmin(
      request,
    );

    const supabase =
      getSupabase();

    let body = {};

    try {
      body =
        await request.json();
    } catch {
      body = {};
    }

    const companyId =
      String(
        body?.company_id ||
        "",
      ).trim();

    const company =
      await getTargetCompany(
        supabase,
        companyId,
      );

    /*
     * 한 요청에서 최대 5장.
     * 기본은 기존과 동일하게 3장.
     */
    const requestedLimit =
      Number(
        body?.limit || 3,
      );

    const limit =
      Math.max(
        1,
        Math.min(
          Number.isFinite(
            requestedLimit,
          )
            ? Math.floor(
                requestedLimit,
              )
            : 3,
          5,
        ),
      );

    /*
     * 실패 사진 때문에 뒤 사진까지
     * 처리되지 않는 상황을 줄이기 위해
     * 실제 후보는 넉넉하게 조회한다.
     */
    const candidateLimit =
      Math.min(
        Math.max(
          limit * 5,
          15,
        ),
        30,
      );

    /* =====================================================
       전체 사진 수
    ===================================================== */

    const totalCount =
      await getTotalCount(
        supabase,
        company.id,
      );

    const remainingBefore =
      await getRemainingCount(
        supabase,
        company.id,
      );

    if (
      remainingBefore === 0
    ) {
      return NextResponse.json({
        success: true,
        finished: true,

        company: {
          id:
            company.id,

          company_name:
            company.company_name,
        },

        total:
          totalCount,

        completed:
          totalCount,

        remaining: 0,

        processed: 0,
        attempted: 0,
        failed: 0,

        results: [],
      });
    }

    /* =====================================================
       분석 후보 조회
    ===================================================== */

    const {
      data: photos,
      error: photoError,
    } =
      await supabase
        .from("work_photos")
        .select(`
          id,
          photo_url,
          storage_path,
          photo_type,
          category,
          sub_category,
          ai_description,
          ai_tags,
          visual_features,
          estimate_search_text,
          structure_analyzed_at,
          created_at
        `)
        .eq(
          "company_id",
          company.id,
        )
        .is(
          "structure_analyzed_at",
          null,
        )
        .order(
          "created_at",
          {
            ascending: true,
          },
        )
        .limit(
          candidateLimit,
        );

    if (photoError) {
      throw photoError;
    }

    if (
      !photos ||
      photos.length === 0
    ) {
      return NextResponse.json({
        success: true,
        finished: true,

        company: {
          id:
            company.id,

          company_name:
            company.company_name,
        },

        total:
          totalCount,

        completed:
          totalCount,

        remaining: 0,

        processed: 0,
        attempted: 0,
        failed: 0,

        results: [],
      });
    }

    const results = [];

    let processed = 0;
    let failed = 0;
    let attempted = 0;

    const failedIds =
      new Set();

    /* =====================================================
       순차 분석
    ===================================================== */

    for (
      const photo
      of photos
    ) {
      if (
        processed >= limit
      ) {
        break;
      }

      if (
        failedIds.has(
          photo.id,
        )
      ) {
        continue;
      }

      attempted += 1;

      try {
        const analysis =
          await analyzePhoto(
            supabase,
            photo,
          );

        const {
          error: updateError,
        } =
          await supabase
            .from(
              "work_photos",
            )
            .update({
              visual_features:
                analysis
                  .visualFeatures,

              estimate_search_text:
                analysis
                  .estimateSearchText,

              structure_version:
                1,

              structure_analyzed_at:
                new Date()
                  .toISOString(),
            })
            .eq(
              "id",
              photo.id,
            )
            .eq(
              "company_id",
              company.id,
            );

        if (updateError) {
          throw updateError;
        }

        processed += 1;

        results.push({
          id:
            photo.id,

          success:
            true,

          category:
            photo.category,

          sub_category:
            photo.sub_category,

          storage_path:
            photo.storage_path,

          image_source:
            analysis
              .imageInfo
              .source,

          image_size:
            analysis
              .imageInfo
              .size,

          visual_features:
            analysis
              .visualFeatures,

          estimate_search_text:
            analysis
              .estimateSearchText,
        });
      } catch (error) {
        failed += 1;

        failedIds.add(
          photo.id,
        );

        console.error(
          "Structure analysis failed:",
          {
            company_id:
              company.id,

            id:
              photo.id,

            storage_path:
              photo.storage_path,

            photo_url:
              photo.photo_url,

            error:
              error?.message ||
              error,
          },
        );

        /*
         * 실패 사진은 DB를 변경하지 않는다.
         * structure_analyzed_at도 null 유지.
         */
        results.push({
          id:
            photo.id,

          success:
            false,

          category:
            photo.category,

          sub_category:
            photo.sub_category,

          storage_path:
            photo.storage_path,

          error:
            error?.message ||
            "구조분석 실패",
        });
      }
    }

    /* =====================================================
       처리 후 남은 사진
    ===================================================== */

    const remainingAfter =
      await getRemainingCount(
        supabase,
        company.id,
      );

    const completed =
      Math.max(
        0,
        totalCount -
          remainingAfter,
      );

    return NextResponse.json({
      success: true,

      finished:
        remainingAfter === 0,

      company: {
        id:
          company.id,

        company_name:
          company.company_name,
      },

      total:
        totalCount,

      completed,

      remaining:
        remainingAfter,

      processed,

      attempted,

      failed,

      results,
    });
  } catch (error) {
    console.error(
      "Analyze work structure API error:",
      error,
    );

    return NextResponse.json(
      {
        success: false,

        error:
          error?.message ||
          "기존 시공사진 구조분석 중 오류가 발생했습니다.",
      },
      {
        status:
          Number(
            error?.status,
          ) || 500,
      },
    );
  }
           }
