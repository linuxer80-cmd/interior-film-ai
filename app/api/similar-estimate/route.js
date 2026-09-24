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
  const text = String(value || "").trim();

  return text || null;
}

/*
 * =========================================================
 * 숫자 정리
 * =========================================================
 */

function toFiniteNumber(value, fallback = null) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
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
    toFiniteNumber(value, fallback);

  return Math.min(
    max,
    Math.max(
      min,
      number
    )
  );
}

function normalizeMatchCount(value) {
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
 * 공개 응답용 숫자
 * =========================================================
 */

function roundMoney(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return null;
  }

  return Math.round(number);
}

function roundSimilarity(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return null;
  }

  return Number(number.toFixed(6));
}

/*
 * =========================================================
 * OpenAI Embedding
 * =========================================================
 */

async function createEmbedding(text) {
  const apiKey =
    process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY가 설정되어 있지 않습니다."
    );
  }

  const response = await fetch(
    "https://api.openai.com/v1/embeddings",
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",

        Authorization:
          `Bearer ${apiKey}`,
      },

      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: text,
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
    data?.data?.[0]?.embedding;

  if (
    !Array.isArray(embedding) ||
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
 * 서버 내부용 유사사례 조회
 *
 * 중요:
 * - 브라우저에서 RPC를 직접 호출하지 않습니다.
 * - Service Role로 호출합니다.
 * - company_slug 버전만 사용합니다.
 * - DB 함수 내부에서도 회사 slug + 활성 상태를 검사합니다.
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
      query_embedding: embedding,

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
 * 카테고리 필터
 *
 * 기존 브라우저 로직과 최대한 동일하게 유지합니다.
 * =========================================================
 */

function normalizeCategory(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function normalizeSubCategory(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function filterSimilarCases({
  rows,
  category,
  subCategory,
}) {
  const safeRows =
    Array.isArray(rows)
      ? rows
      : [];

  if (safeRows.length === 0) {
    return [];
  }

  const targetCategory =
    normalizeCategory(category);

  const targetSubCategory =
    normalizeSubCategory(subCategory);

  let filtered =
    safeRows.filter((item) => {
      const cost =
        Number(item?.actual_cost);

      const similarity =
        Number(item?.similarity);

      return (
        Number.isFinite(cost) &&
        cost > 0 &&
        Number.isFinite(similarity) &&
        similarity > 0
      );
    });

  /*
   * category가 있으면 우선 동일 category 사용
   */
  if (targetCategory) {
    const categoryMatches =
      filtered.filter((item) => {
        return (
          normalizeCategory(
            item?.category
          ) === targetCategory
        );
      });

    if (categoryMatches.length > 0) {
      filtered =
        categoryMatches;
    }
  }

  /*
   * sub_category까지 동일한 데이터가 있으면
   * 더 정확한 데이터 우선 사용
   */
  if (targetSubCategory) {
    const subCategoryMatches =
      filtered.filter((item) => {
        return (
          normalizeSubCategory(
            item?.sub_category
          ) === targetSubCategory
        );
      });

    if (subCategoryMatches.length > 0) {
      filtered =
        subCategoryMatches;
    }
  }

  return filtered;
}

/*
 * =========================================================
 * 가중 평균 견적 계산
 *
 * 기존 useEstimate.js 방식:
 * - similarity² 가중치
 * - 평균값 기준 ±10%
 * =========================================================
 */

function calculateEstimate(rows) {
  const safeRows =
    Array.isArray(rows)
      ? rows
      : [];

  if (safeRows.length === 0) {
    return null;
  }

  let weightedCostSum = 0;
  let totalWeight = 0;

  for (const item of safeRows) {
    const cost =
      Number(item?.actual_cost);

    const similarity =
      Number(item?.similarity);

    if (
      !Number.isFinite(cost) ||
      cost <= 0 ||
      !Number.isFinite(similarity) ||
      similarity <= 0
    ) {
      continue;
    }

    const weight =
      similarity * similarity;

    weightedCostSum +=
      cost * weight;

    totalWeight +=
      weight;
  }

  if (
    totalWeight <= 0 ||
    !Number.isFinite(
      weightedCostSum
    )
  ) {
    return null;
  }

  const average =
    weightedCostSum /
    totalWeight;

  const min =
    average * 0.9;

  const max =
    average * 1.1;

  const similarities =
    safeRows
      .map((item) =>
        Number(item?.similarity)
      )
      .filter((value) =>
        Number.isFinite(value)
      );

  const topSimilarity =
    similarities.length > 0
      ? Math.max(
          ...similarities
        )
      : null;

  return {
    average:
      roundMoney(average),

    min:
      roundMoney(min),

    max:
      roundMoney(max),

    count:
      safeRows.length,

    top_similarity:
      roundSimilarity(
        topSimilarity
      ),
  };
}

/*
 * =========================================================
 * 고객에게 반환 가능한 유사사례 정보
 *
 * actual_cost는 절대 반환하지 않습니다.
 * embedding도 절대 반환하지 않습니다.
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
          company.subscription_plan ||
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
            Number(topSimilarity)
          )
            ? Number(topSimilarity)
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

export async function POST(request) {
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

    /*
     * =====================================================
     * Supabase
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
     * 사용량 한도 검사
     *
     * 여기서 먼저 검사하므로
     * 한도 초과 업체는 OpenAI 비용도 발생하지 않습니다.
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
            limitCheck.limitReached
              ? "SIMILAR_IMAGE_SEARCH_LIMIT_REACHED"
              : "SIMILAR_IMAGE_SEARCH_LIMIT_CHECK_FAILED",
        },
        {
          status:
            limitCheck.status ||
            (
              limitCheck.limitReached
                ? 429
                : 503
            ),
        }
      );
    }

    /*
     * =====================================================
     * OpenAI embedding 생성
     *
     * embedding은 서버 내부에서만 사용합니다.
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
     * category / sub_category 필터
     * =====================================================
     */

    const filteredCases =
      filterSimilarCases({
        rows:
          rawCases,

        category,

        subCategory,
      });

    /*
     * =====================================================
     * 견적 계산
     * =====================================================
     */

    const estimate =
      calculateEstimate(
        filteredCases
      );

    const topSimilarity =
      estimate?.top_similarity ??
      (
        filteredCases.length > 0
          ? roundSimilarity(
              filteredCases[0]
                ?.similarity
            )
          : null
      );

    /*
     * =====================================================
     * 사용량 기록
     *
     * 실제 검색이 서버에서 정상적으로 끝난 뒤
     * 정확히 1회만 기록합니다.
     * =====================================================
     */

    const usageEvent =
      await insertUsageEvent({
        supabase,

        company,

        category,

        subCategory,

        resultCount:
          filteredCases.length,

        topSimilarity,
      });

    /*
     * =====================================================
     * 사용량 계산
     * =====================================================
     */

    const usedBefore =
      Number(
        limitCheck.used || 0
      );

    const usedAfter =
      usedBefore + 1;

    const limit =
      limitCheck.unlimited
        ? null
        : Number(
            limitCheck.limit || 0
          );

    const remaining =
      limitCheck.unlimited
        ? null
        : Math.max(
            0,
            limit - usedAfter
          );

    /*
     * =====================================================
     * 고객 공개용 응답
     *
     * 중요:
     * - embedding 없음
     * - actual_cost 없음
     * =====================================================
     */

    return NextResponse.json({
      success: true,

      estimate: estimate
        ? {
            min:
              estimate.min,

            max:
              estimate.max,

            average:
              estimate.average,

            count:
              estimate.count,

            top_similarity:
              estimate.top_similarity,
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
          limitCheck.planCode ||
          company.subscription_plan ||
          null,

        plan_name:
          limitCheck.planName ||
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
