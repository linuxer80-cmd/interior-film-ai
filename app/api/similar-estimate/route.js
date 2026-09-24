import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import {
  checkUsageLimit,
  makeUsageLimitError,
} from "../../utils/serverUsageLimit";

import {
  normalizeCategory,
} from "../../utils/categoryUtils";

export const runtime = "nodejs";
export const maxDuration = 60;

const EMBEDDING_MODEL =
  "text-embedding-3-small";

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

  if (
    !supabaseUrl ||
    !serviceRoleKey
  ) {
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

function normalizeCompanySlug(
  value
) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeText(value) {
  return String(value || "")
    .trim();
}

function normalizeOptionalText(
  value
) {
  const text =
    String(value || "")
      .trim();

  return text || null;
}

/*
 * =========================================================
 * 공통 카테고리 그룹 키
 *
 * 중요:
 * 브라우저 useEstimate.js와
 * 서버가 동일한 categoryUtils.js를 사용합니다.
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
 * 숫자 처리
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

function roundSimilarity(
  value
) {
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
 * 업체별 유사사례 검색
 *
 * 브라우저가 아닌 서버에서
 * Service Role로만 RPC를 호출합니다.
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
  } =
    await supabase.rpc(
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
 * 유사사례 필터
 *
 * 중요:
 *
 * AI 분석:
 * 주방 가구 / 상부장과 하부장...
 * → kitchen
 *
 * DB:
 * 싱크대 / 싱크대
 * → kitchen
 *
 * 같은 표준 그룹끼리만 견적에 사용합니다.
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
 * 실제 시공금액 기반 견적 계산
 *
 * actual_cost는 서버 내부에서만 사용합니다.
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

  let weightedCostTotal = 0;
  let weightTotal = 0;

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
 * 고객에게 반환할 안전한 유사사례 데이터
 *
 * actual_cost 반환 금지
 * embedding 반환 금지
 * =========================================================
 */

function makePublicCases(
  rows
) {
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
 * 유사검색 사용량 기록
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
  } =
    await supabase
      .from(
        "usage_events"
      )
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
              resultCount ||
                0
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
     * 고객페이지와 동일한
     * 공통 categoryUtils.js 규칙 사용
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
    } =
      await supabase
        .from(
          "companies"
        )
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
     * 유사검색 한도 검사
     *
     * embedding 생성 전에 검사하여
     * 한도 초과 상태에서는 OpenAI 비용이 발생하지 않습니다.
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
     * 서버 내부 Embedding 생성
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
     * 공통 카테고리 규칙으로 필터
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
     * 서버 내부 견적 계산
     * =====================================================
     */

    const estimate =
      calculateEstimate({
        rows:
          filteredCases,

        matchThreshold,
      });

    /*
     * =====================================================
     * 로그용 최고 유사도
     * =====================================================
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
     * 유사검색 사용량 +1
     * =====================================================
     */

    const usageEvent =
      await insertUsageEvent({
        supabase,

        company,

        category,

        subCategory,

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
     * embedding과 actual_cost는 반환하지 않습니다.
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
