import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  checkUsageLimit,
  makeUsageLimitError,
} from "../../utils/serverUsageLimit";

export const runtime = "nodejs";
export const maxDuration = 60;

/*
 * =========================================================
 * 설정
 * =========================================================
 */

const EMBEDDING_MODEL = "text-embedding-3-small";

const DEFAULT_MATCH_THRESHOLD = 0.65;
const DEFAULT_MATCH_COUNT = 20;

const MIN_MATCH_THRESHOLD = 0;
const MAX_MATCH_THRESHOLD = 1;

const MIN_MATCH_COUNT = 1;
const MAX_MATCH_COUNT = 50;

const MAX_ESTIMATE_CASES = 10;

/*
 * =========================================================
 * Supabase 관리자 클라이언트
 * =========================================================
 */

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

/*
 * =========================================================
 * 문자열 정리
 * =========================================================
 */

function normalizeCompanySlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeOptionalText(value) {
  const text =
    String(value || "").trim();

  return text || null;
}

/*
 * =========================================================
 * 기존 useEstimate.js와 동일한 category 정규화
 * =========================================================
 */

function normalizeCategory(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

/*
 * 기존 useEstimate.js의 group.key와 동일한 값을 만듭니다.
 *
 * category + sub_category
 * =========================================================
 */

function makeGroupKey(
  category,
  subCategory
) {
  return normalizeCategory(
    `${category || ""} ${
      subCategory || ""
    }`
  );
}

/*
 * =========================================================
 * 숫자 정리
 * =========================================================
 */

function toFiniteNumber(
  value,
  fallback = null
) {
  const number =
    Number(value);

  if (
    !Number.isFinite(number)
  ) {
    return fallback;
  }

  return number;
}

function clampNumber(
  value,
  min,
  max,
  fallback
) {
  const number =
    toFiniteNumber(
      value,
      fallback
    );

  return Math.min(
    max,
    Math.max(
      min,
      number
    )
  );
}

function normalizeMatchCount(
  value
) {
  const number =
    Math.floor(
      toFiniteNumber(
        value,
        DEFAULT_MATCH_COUNT
      )
    );

  return Math.min(
    MAX_MATCH_COUNT,
    Math.max(
      MIN_MATCH_COUNT,
      number
    )
  );
}

/*
 * =========================================================
 * 유사도 공개값 정리
 * =========================================================
 */

function roundSimilarity(value) {
  const number =
    Number(value);

  if (
    !Number.isFinite(number)
  ) {
    return null;
  }

  return Number(
    number.toFixed(6)
  );
}

/*
 * =========================================================
 * 기존 useEstimate.js와 동일한
 * 1,000원 단위 금액 반올림
 * =========================================================
 */

function roundMoneyToThousand(
  value
) {
  const number =
    Number(value);

  if (
    !Number.isFinite(number)
  ) {
    return null;
  }

  return (
    Math.round(
      number / 1000
    ) * 1000
  );
}

/*
 * =========================================================
 * OpenAI Embedding
 * =========================================================
 */

async function createEmbedding(
  text
) {
  const apiKey =
    process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY가 설정되어 있지 않습니다."
    );
  }

  const response =
    await fetch(
      "https://api.openai.com/v1/embeddings",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",

          Authorization:
            `Bearer ${apiKey}`,
        },

        body:
          JSON.stringify({
            model:
              EMBEDDING_MODEL,

            input:
              text,
          }),
      }
    );

  const data =
    await response.json();

  if (!response.ok) {
    console.error(
      "SIMILAR ESTIMATE EMBEDDING ERROR:",
      data
    );

    throw new Error(
      data?.error?.message ||
        "임베딩 생성 중 오류가 발생했습니다."
    );
  }

  const embedding =
    data?.data?.[0]
      ?.embedding;

  if (
    !Array.isArray(
      embedding
    ) ||
    embedding.length === 0
  ) {
    throw new Error(
      "임베딩 결과를 찾을 수 없습니다."
    );
  }

  return embedding;
}

/*
 * =========================================================
 * 서버 내부 유사사례 조회
 *
 * 중요:
 *
 * - 브라우저에서 RPC 직접 호출 안 함
 * - Service Role로만 호출
 * - company_slug 버전 RPC만 호출
 * - DB 함수에서도 업체 격리
 * =========================================================
 */

async function getSimilarCases({
  supabase,
  companySlug,
  embedding,
  matchThreshold,
  matchCount,
}) {
  const {
    data,
    error,
  } = await supabase.rpc(
    "get_public_similar_cases",
    {
      query_embedding:
        embedding,

      company_slug:
        companySlug,

      match_threshold:
        matchThreshold,

      match_count:
        matchCount,
    }
  );

  if (error) {
    console.error(
      "SIMILAR ESTIMATE RPC ERROR:",
      error
    );

    throw new Error(
      error.message ||
        "유사 시공사례를 검색하지 못했습니다."
    );
  }

  return Array.isArray(data)
    ? data
    : [];
}

/*
 * =========================================================
 * 기존 useEstimate.js와 동일한 유사사례 필터
 *
 * 순서:
 *
 * 1. category + sub_category 정규화
 * 2. 현재 group.key와 정확히 일치
 * 3. actual_cost > 0
 * 4. 최대 10개
 * 5. work_item_id 기준 중복 제거
 *
 * 기존 훅의 동작을 그대로 서버로 이동합니다.
 * =========================================================
 */

function filterSimilarCases({
  rows,
  groupKey,
}) {
  const safeRows =
    Array.isArray(rows)
      ? rows
      : [];

  /*
   * 기존:
   *
   * (data || [])
   *   .filter(...)
   *   .slice(0, 10)
   */

  const filtered =
    safeRows
      .filter((item) => {
        const itemGroup =
          normalizeCategory(
            `${
              item?.category ||
              ""
            } ${
              item?.sub_category ||
              ""
            }`
          );

        return (
          itemGroup ===
            groupKey &&
          Number(
            item?.actual_cost ||
              0
          ) > 0
        );
      })
      .slice(
        0,
        MAX_ESTIMATE_CASES
      );

  /*
   * 기존과 동일하게
   * work_item_id 중복 제거
   */

  const unique = [];

  const seen =
    new Set();

  for (
    const item of filtered
  ) {
    const id =
      item?.work_item_id ||
      `${
        item?.category ||
        ""
      }-${
        item?.actual_cost ||
        ""
      }`;

    if (
      seen.has(id)
    ) {
      continue;
    }

    seen.add(id);

    unique.push(item);
  }

  return unique;
}

/*
 * =========================================================
 * 기존 useEstimate.js와 동일한 견적 계산
 *
 * - similarity >= MATCH_THRESHOLD
 * - similarity² 가중치
 * - 평균 ±10%
 * - 1,000원 단위 반올림
 * - 신뢰도 동일
 * =========================================================
 */

function calculateEstimate({
  rows,
  matchThreshold,
}) {
  const cases =
    Array.isArray(rows)
      ? rows
      : [];

  if (!cases.length) {
    return null;
  }

  let weightedCostTotal =
    0;

  let weightTotal =
    0;

  for (
    const item of cases
  ) {
    const cost =
      Number(
        item?.actual_cost ||
          0
      );

    const similarity =
      Number(
        item?.similarity ||
          0
      );

    if (
      cost > 0 &&
      similarity >=
        matchThreshold
    ) {
      /*
       * 기존 useEstimate.js와 동일:
       *
       * 유사도가 높은 데이터에
       * similarity² 가중치
       */

      const weight =
        similarity *
        similarity;

      weightedCostTotal +=
        cost * weight;

      weightTotal +=
        weight;
    }
  }

  if (
    weightTotal <= 0
  ) {
    return null;
  }

  const weightedAverage =
    weightedCostTotal /
    weightTotal;

  const min =
    roundMoneyToThousand(
      weightedAverage * 0.9
    );

  const max =
    roundMoneyToThousand(
      weightedAverage * 1.1
    );

  const average =
    roundMoneyToThousand(
      weightedAverage
    );

  const topSimilarity =
    Math.max(
      ...cases.map(
        (item) =>
          Number(
            item?.similarity ||
              0
          )
      )
    );

  /*
   * 기존 신뢰도 판정 그대로
   */

  let confidence =
    "낮음";

  if (
    cases.length >= 5 &&
    topSimilarity >= 0.85
  ) {
    confidence =
      "높음";
  } else if (
    cases.length >= 2 &&
    topSimilarity >= 0.75
  ) {
    confidence =
      "보통";
  }

  return {
    min,
    max,
    average,

    count:
      cases.length,

    confidence,

    top_similarity:
      roundSimilarity(
        topSimilarity
      ),
  };
}

/*
 * =========================================================
 * 고객에게 반환 가능한 유사사례
 *
 * 중요:
 *
 * actual_cost 반환 안 함
 * embedding 반환 안 함
 *
 * 사진 표시와 UI에 필요한 값만 반환
 * =========================================================
 */

function makePublicCases(rows) {
  const safeRows =
    Array.isArray(rows)
      ? rows
      : [];

  return safeRows.map(
    (item) => ({
      work_item_id:
        item?.work_item_id ||
        null,

      category:
        item?.category ||
        null,

      sub_category:
        item?.sub_category ||
        null,

      similarity:
        roundSimilarity(
          item?.similarity
        ),

      before_path:
        item?.before_path ||
        null,

      after_path:
        item?.after_path ||
        null,
    })
  );
}

/*
 * =========================================================
 * 사용량 기록
 * =========================================================
 */

async function insertUsageEvent({
  supabase,
  company,
  category,
  subCategory,
  resultCount,
  topSimilarity,
}) {
  const {
    data,
    error,
  } = await supabase
    .from("usage_events")
    .insert({
      company_id:
        company.id,

      event_type:
        "similar_image_search",

      quantity: 1,

      cost_krw: 0,

      provider:
        "openai",

      model:
        EMBEDDING_MODEL,

      reference_id:
        null,

      metadata: {
        company_slug:
          company.slug,

        subscription_plan:
          company
            .subscription_plan ||
          null,

        category:
          category ||
          null,

        sub_category:
          subCategory ||
          null,

        result_count:
          Number(
            resultCount || 0
          ),

        top_similarity:
          Number.isFinite(
            Number(
              topSimilarity
            )
          )
            ? Number(
                topSimilarity
              )
            : null,
      },
    })
    .select("id")
    .single();

  if (error) {
    console.error(
      "SIMILAR ESTIMATE USAGE INSERT ERROR:",
      error
    );

    throw new Error(
      error.message ||
        "유사이미지 검색 사용량 저장 실패"
    );
  }

  return data;
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
    /*
     * =====================================================
     * 요청 데이터
     * =====================================================
     */

    const body =
      await request.json();

    const companySlug =
      normalizeCompanySlug(
        body?.company_slug
      );

    const text =
      normalizeText(
        body?.text
      );

    const category =
      normalizeOptionalText(
        body?.category
      );

    const subCategory =
      normalizeOptionalText(
        body?.sub_category
      );

    const matchThreshold =
      clampNumber(
        body?.match_threshold,
        MIN_MATCH_THRESHOLD,
        MAX_MATCH_THRESHOLD,
        DEFAULT_MATCH_THRESHOLD
      );

    const matchCount =
      normalizeMatchCount(
        body?.match_count
      );

    /*
     * 기존 useEstimate.js의
     * group.key와 동일한 값
     */

    const groupKey =
      makeGroupKey(
        category,
        subCategory
      );

    /*
     * =====================================================
     * 기본값 검사
     * =====================================================
     */

    if (!companySlug) {
      return NextResponse.json(
        {
          success: false,

          error:
            "company_slug가 없습니다.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !/^[a-z0-9-]+$/.test(
        companySlug
      )
    ) {
      return NextResponse.json(
        {
          success: false,

          error:
            "올바르지 않은 회사 주소입니다.",
        },
        {
          status: 400,
        }
      );
    }

    if (!text) {
      return NextResponse.json(
        {
          success: false,

          error:
            "유사사례 검색용 텍스트가 없습니다.",
        },
        {
          status: 400,
        }
      );
    }

    if (!groupKey) {
      return NextResponse.json(
        {
          success: false,

          error:
            "시공 부위 정보가 없습니다.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * =====================================================
     * Supabase 관리자 클라이언트
     * =====================================================
     */

    const supabase =
      getAdminSupabase();

    if (!supabase) {
      return NextResponse.json(
        {
          success: false,

          error:
            "Supabase 서버 환경변수를 확인해주세요.",
        },
        {
          status: 500,
        }
      );
    }

    /*
     * =====================================================
     * 활성 업체 확인
     * =====================================================
     */

    const {
      data: company,
      error: companyError,
    } = await supabase
      .from("companies")
      .select(
        `
          id,
          slug,
          company_name,
          subscription_plan,
          is_active
        `
      )
      .eq(
        "slug",
        companySlug
      )
      .eq(
        "is_active",
        true
      )
      .maybeSingle();

    if (companyError) {
      console.error(
        "SIMILAR ESTIMATE COMPANY LOOKUP ERROR:",
        companyError
      );

      return NextResponse.json(
        {
          success: false,

          error:
            "회사 정보를 확인하지 못했습니다.",
        },
        {
          status: 500,
        }
      );
    }

    if (!company?.id) {
      return NextResponse.json(
        {
          success: false,

          error:
            "사용할 수 없는 회사 주소입니다.",
        },
        {
          status: 404,
        }
      );
    }

    /*
     * =====================================================
     * 유사검색 사용량 한도 검사
     *
     * OpenAI embedding 전에 검사합니다.
     *
     * 따라서 한도 초과 업체는
     * OpenAI 비용도 발생하지 않습니다.
     * =====================================================
     */

    const limitCheck =
      await checkUsageLimit({
        company,

        eventType:
          "similar_image_search",

        requestedQuantity: 1,

        supabase,
      });

    if (!limitCheck.ok) {
      const errorPayload =
        makeUsageLimitError(
          limitCheck
        );

      return NextResponse.json(
        {
          ...errorPayload,

          code:
            limitCheck
              .limitReached
              ? "SIMILAR_IMAGE_SEARCH_LIMIT_REACHED"
              : "SIMILAR_IMAGE_SEARCH_LIMIT_CHECK_FAILED",
        },
        {
          status:
            limitCheck.status ||
            (
              limitCheck
                .limitReached
                ? 429
                : 503
            ),
        }
      );
    }

    /*
     * =====================================================
     * OpenAI embedding
     *
     * embedding은 이 서버 함수 안에서만 존재합니다.
     * 고객 브라우저에는 반환하지 않습니다.
     * =====================================================
     */

    const embedding =
      await createEmbedding(
        text
      );

    /*
     * =====================================================
     * 업체별 유사사례 검색
     * =====================================================
     */

    const rawCases =
      await getSimilarCases({
        supabase,

        companySlug:
          company.slug,

        embedding,

        matchThreshold,

        matchCount,
      });

    /*
     * =====================================================
     * 기존 useEstimate.js와 동일한 필터링
     *
     * category + sub_category 정확 매칭
     * → 최대 10건
     * → 중복 제거
     * =====================================================
     */

    const filteredCases =
      filterSimilarCases({
        rows:
          rawCases,

        groupKey,
      });

    /*
     * =====================================================
     * 기존 useEstimate.js와 동일한 견적 계산
     * =====================================================
     */

    const estimate =
      calculateEstimate({
        rows:
          filteredCases,

        matchThreshold,
      });

    /*
     * 검색 로그용 최고 유사도
     *
     * 기존 훅에서는 검색 전체 결과의
     * 최고 유사도를 로그에 기록했습니다.
     *
     * 동일하게 rawCases 기준으로 계산합니다.
     */

    const rawSimilarities =
      rawCases
        .map(
          (item) =>
            Number(
              item?.similarity ||
                0
            )
        )
        .filter(
          (value) =>
            Number.isFinite(
              value
            )
        );

    const topSimilarity =
      rawSimilarities.length
        ? Math.max(
            ...rawSimilarities
          )
        : null;

    /*
     * =====================================================
     * 유사검색 사용량 기록
     *
     * 실제 embedding + RPC 검색이
     * 정상적으로 완료된 경우에만 +1
     *
     * 기존 /api/similar-search-usage를
     * 따로 호출하지 않습니다.
     * =====================================================
     */

    const usageEvent =
      await insertUsageEvent({
        supabase,

        company,

        category,

        subCategory,

        /*
         * 기존 사용량 API에는
         * RPC 검색 전체 결과 개수를 전달했습니다.
         *
         * 동일하게 rawCases.length 사용
         */

        resultCount:
          rawCases.length,

        topSimilarity,
      });

    /*
     * =====================================================
     * 사용량 결과
     * =====================================================
     */

    const usedBefore =
      Number(
        limitCheck.used ||
          0
      );

    const usedAfter =
      usedBefore + 1;

    const limit =
      limitCheck.unlimited
        ? null
        : Number(
            limitCheck.limit ||
              0
          );

    const remaining =
      limitCheck.unlimited
        ? null
        : Math.max(
            0,
            limit -
              usedAfter
          );

    /*
     * =====================================================
     * 고객 공개 응답
     *
     * 절대 포함하지 않는 값:
     *
     * - embedding
     * - actual_cost
     *
     * similar_cases에는 사진 표시와
     * 유사도 표시에 필요한 데이터만 포함합니다.
     * =====================================================
     */

    return NextResponse.json({
      success: true,

      estimate:
        estimate
          ? {
              min:
                estimate.min,

              max:
                estimate.max,

              average:
                estimate.average,

              count:
                estimate.count,

              confidence:
                estimate.confidence,

              top_similarity:
                estimate
                  .top_similarity,
            }
          : null,

      similar_cases:
        makePublicCases(
          filteredCases
        ),

      usage_event_id:
        usageEvent?.id ||
        null,

      planUsage: {
        event_type:
          "similar_image_search",

        plan_code:
          limitCheck
            .planCode ||
          company
            .subscription_plan ||
          null,

        plan_name:
          limitCheck
            .planName ||
          null,

        used_before:
          usedBefore,

        used_after:
          usedAfter,

        limit,

        remaining,

        unlimited:
          Boolean(
            limitCheck.unlimited
          ),
      },
    });
  } catch (error) {
    console.error(
      "SIMILAR ESTIMATE API ERROR:",
      error
    );

    return NextResponse.json(
      {
        success: false,

        error:
          error?.message ||
          "유사 시공사례 견적 처리 중 오류가 발생했습니다.",
      },
      {
        status: 500,
      }
    );
  }
}
