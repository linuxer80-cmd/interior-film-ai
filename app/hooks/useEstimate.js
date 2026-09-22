"use client";

import { useRef, useState } from "react";
import { supabase } from "../../lib/supabase";

import {
  makeId,
  prepareImage,
  revokePreviewUrl,
} from "../utils/imageUtils";

import {
  normalizeCategory,
  getGroupKey,
} from "../utils/categoryUtils";

const MAX_IMAGES = 10;
const MATCH_THRESHOLD = 0.65;

export default function useEstimate({
  companySlug = null,
} = {}) {
  const normalizedCompanySlug =
    String(companySlug || "")
      .trim()
      .toLowerCase();

  const [images, setImages] =
    useState([]);

  const [loading, setLoading] =
    useState(false);

  const [
    imageLoading,
    setImageLoading,
  ] = useState(false);

  const [message, setMessage] =
    useState("");

  const [groups, setGroups] =
    useState([]);

  const [
    totalEstimate,
    setTotalEstimate,
  ] = useState(null);

  const usageIdRef =
    useRef(null);

  const estimatePhotoPathsRef =
    useRef([]);

  /*
   * =========================================================
   * 세션 ID
   * =========================================================
   */

  function getSessionId() {
    if (
      typeof window ===
      "undefined"
    ) {
      return makeId();
    }

    const key =
      "interior_estimate_session_id";

    let sessionId =
      window.localStorage.getItem(
        key
      );

    if (!sessionId) {
      sessionId =
        makeId();

      window.localStorage.setItem(
        key,
        sessionId
      );
    }

    return sessionId;
  }

  /*
   * =========================================================
   * 견적 결과 초기화
   * =========================================================
   */

  function resetEstimateResults() {
    setGroups([]);

    setTotalEstimate(
      null
    );

    usageIdRef.current =
      null;

    estimatePhotoPathsRef.current =
      [];
  }

  /*
   * =========================================================
   * JSON 안전 읽기
   * =========================================================
   */

  async function readJsonSafely(
    response
  ) {
    const text =
      await response.text();

    try {
      return JSON.parse(
        text
      );
    } catch {
      throw new Error(
        text
          ? `서버 응답 오류: ${text.slice(
              0,
              200
            )}`
          : "서버에서 올바른 응답을 받지 못했습니다."
      );
    }
  }

  /*
   * =========================================================
   * 사용량 사전검사
   *
   * 실제 AI / 검색 / 업로드를 시작하기 전에
   * /api/usage-limit를 호출합니다.
   *
   * 이 함수는 사용량을 증가시키지 않습니다.
   * 현재 사용 가능한지만 확인합니다.
   * =========================================================
   */

  async function checkUsageBeforeAction({
    eventType,
    quantity = 1,
  }) {
    if (
      !normalizedCompanySlug
    ) {
      throw new Error(
        "회사 정보를 확인할 수 없습니다."
      );
    }

    const safeQuantity =
      Number(quantity);

    if (
      !Number.isFinite(
        safeQuantity
      ) ||
      safeQuantity <= 0
    ) {
      throw new Error(
        "사용량 확인 수량이 올바르지 않습니다."
      );
    }

    const response =
      await fetch(
        "/api/usage-limit",
        {
          method:
            "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body:
            JSON.stringify({
              company_slug:
                normalizedCompanySlug,

              event_type:
                eventType,

              requested_quantity:
                safeQuantity,
            }),
        }
      );

    const result =
      await readJsonSafely(
        response
      );

    if (
      !response.ok ||
      !result?.success ||
      result?.allowed ===
        false
    ) {
      /*
       * 서버에서 내려준 한도 메시지를
       * 그대로 고객 화면에 전달합니다.
       */

      throw new Error(
        result?.error ||
          "요금제 사용량 한도를 확인해주세요."
      );
    }

    return result;
  }

  /*
   * =========================================================
   * 자동견적 시작 전 핵심 사전검사
   *
   * 여기서 막히면:
   *
   * - OpenAI 사진분석 호출 안 함
   * - Embedding 호출 안 함
   * - Storage 업로드 안 함
   *
   * =========================================================
   */

  async function checkEstimateStartLimits() {
    /*
     * 자동견적 자체 1회
     */

    setMessage(
      "자동견적 사용 가능 여부를 확인하고 있습니다..."
    );

    await checkUsageBeforeAction({
      eventType:
        "auto_estimate",

      quantity: 1,
    });

    /*
     * 선택한 사진 수만큼
     * AI 사진분석 가능 여부
     */

    setMessage(
      "AI 사진분석 사용 가능 여부를 확인하고 있습니다..."
    );

    await checkUsageBeforeAction({
      eventType:
        "ai_photo_analysis",

      quantity:
        images.length,
    });

    /*
     * 선택한 사진 수만큼
     * 이미지 업로드 가능 여부
     *
     * 저장용량 MB는 실제 파일 크기를
     * /api/estimate-photo가 서버에서 다시 검사합니다.
     */

    setMessage(
      "사진 업로드 사용 가능 여부를 확인하고 있습니다..."
    );

    await checkUsageBeforeAction({
      eventType:
        "image_upload",

      quantity:
        images.length,
    });
  }

  /*
   * =========================================================
   * 사진 추가
   * =========================================================
   */

  async function addImages(
    fileList
  ) {
    const files =
      Array.from(
        fileList || []
      );

    if (!files.length) {
      return;
    }

    const remaining =
      Math.max(
        0,
        MAX_IMAGES -
          images.length
      );

    if (remaining <= 0) {
      setMessage(
        `사진은 최대 ${MAX_IMAGES}장까지 선택할 수 있습니다.`
      );

      return;
    }

    const selected =
      files.slice(
        0,
        remaining
      );

    setImageLoading(
      true
    );

    setMessage(
      `사진을 준비하고 있습니다... 0/${selected.length}`
    );

    resetEstimateResults();

    try {
      const additions =
        [];

      for (
        let index = 0;
        index <
        selected.length;
        index += 1
      ) {
        setMessage(
          `사진을 준비하고 있습니다... ${
            index + 1
          }/${selected.length}`
        );

        try {
          const prepared =
            await prepareImage(
              selected[
                index
              ]
            );

          additions.push({
            id:
              makeId(),

            file:
              prepared.file,

            preview:
              prepared.preview,
          });
        } catch (error) {
          console.error(
            `사진 ${
              index + 1
            } 처리 실패:`,
            error
          );
        }
      }

      if (
        !additions.length
      ) {
        throw new Error(
          "선택한 사진을 불러오지 못했습니다."
        );
      }

      setImages(
        (current) => [
          ...current,
          ...additions,
        ]
      );

      if (
        additions.length <
        selected.length
      ) {
        setMessage(
          `⚠️ ${selected.length}장 중 ${additions.length}장만 불러왔습니다.`
        );
      } else {
        setMessage(
          `✅ 사진 ${additions.length}장을 준비했습니다.`
        );
      }
    } catch (error) {
      console.error(
        error
      );

      setMessage(
        `❌ 오류: ${
          error?.message ||
          "사진을 불러올 수 없습니다."
        }`
      );
    } finally {
      setImageLoading(
        false
      );
    }
  }

  /*
   * =========================================================
   * 사진 삭제
   * =========================================================
   */

  function removeImage(id) {
    setImages(
      (current) => {
        const target =
          current.find(
            (item) =>
              item.id === id
          );

        if (
          target?.preview
        ) {
          revokePreviewUrl(
            target.preview
          );
        }

        return current.filter(
          (item) =>
            item.id !== id
        );
      }
    );

    resetEstimateResults();

    setMessage("");
  }

  /*
   * =========================================================
   * 사진 한 장 AI 분석
   * =========================================================
   */

  async function analyzeOnePhoto(
    imageItem,
    index,
    total
  ) {
    setMessage(
      `AI 사진 분석 중... ${
        index + 1
      }/${total}`
    );

    const formData =
      new FormData();

    formData.append(
      "image",
      imageItem.file
    );

    formData.append(
      "photoType",
      "before"
    );

    /*
     * AI 사용량을 정확한 업체에 귀속하기 위해
     * 현재 업체 slug 전달
     */

    if (
      normalizedCompanySlug
    ) {
      formData.append(
        "company_slug",
        normalizedCompanySlug
      );
    }

    const response =
      await fetch(
        "/api/analyze",
        {
          method:
            "POST",

          body:
            formData,
        }
      );

    const result =
      await readJsonSafely(
        response
      );

    if (
      !response.ok ||
      !result?.analysis
    ) {
      throw new Error(
        result?.error ||
          `${
            index + 1
          }번째 사진 분석 실패`
      );
    }

    return {
      ...imageItem,

      analysis:
        result.analysis,
    };
  }

  /*
   * =========================================================
   * Private Storage 이미지 Signed URL
   * =========================================================
   */

  async function getSignedImageUrl(
    path
  ) {
    if (!path) {
      return null;
    }

    if (
      !normalizedCompanySlug
    ) {
      return null;
    }

    try {
      const response =
        await fetch(
          "/api/similar-photo",
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                company_slug:
                  normalizedCompanySlug,

                path,
              }),
          }
        );

      const result =
        await readJsonSafely(
          response
        );

      if (
        !response.ok ||
        !result?.success ||
        !result?.signed_url
      ) {
        console.error(
          "유사 시공사진 URL 생성 실패:",
          result?.error
        );

        return null;
      }

      return result.signed_url;
    } catch (error) {
      console.error(
        "유사 시공사진 URL 생성 오류:",
        error
      );

      return null;
    }
  }

  /*
   * =========================================================
   * 유사 시공사례 검색
   * =========================================================
   */

  async function findSimilarCases(
    group
  ) {
    /*
     * 회사 slug가 없으면
     * 다른 업체 데이터를 검색하지 않습니다.
     */

    if (
      !normalizedCompanySlug
    ) {
      return [];
    }

    const analyses =
      group.photos.map(
        (item) =>
          item.analysis
      );

    const tags = [
      ...new Set(
        analyses.flatMap(
          (item) =>
            Array.isArray(
              item?.tags
            )
              ? item.tags
              : []
        )
      ),
    ];

    const searchText = [
      `시공 부위: ${
        group.category ||
        ""
      }`,

      `세부 부위: ${
        group.subCategory ||
        ""
      }`,

      `사진 수: ${
        group.photos.length
      }`,

      ...analyses.map(
        (
          item,
          index
        ) =>
          `사진 ${
            index + 1
          }: ${
            item?.description ||
            ""
          }`
      ),

      `특징: ${tags.join(
        ", "
      )}`,
    ].join("\n");

    /*
     * 유사검색 사전 한도검사는
     * handleAnalyze에서 전체 그룹 수를 계산한 뒤
     * 한 번에 먼저 검사합니다.
     *
     * 따라서 여기서는 실제 embedding을 실행합니다.
     */

    const response =
      await fetch(
        "/api/embedding",
        {
          method:
            "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body:
            JSON.stringify({
              text:
                searchText,
            }),
        }
      );

    const result =
      await readJsonSafely(
        response
      );

    if (
      !response.ok ||
      !result?.embedding
    ) {
      throw new Error(
        result?.error ||
          "유사사례 검색 데이터를 만들지 못했습니다."
      );
    }

    /*
     * company_slug를 RPC에 전달하여
     * 해당 업체의 시공 데이터만 검색
     */

    const {
      data,
      error,
    } =
      await supabase.rpc(
        "get_public_similar_cases",
        {
          query_embedding:
            result.embedding,

          company_slug:
            normalizedCompanySlug,

          match_threshold:
            MATCH_THRESHOLD,

          match_count: 20,
        }
      );

    if (error) {
      throw new Error(
        `유사사례 검색 오류: ${error.message}`
      );
    }

    /*
     * =========================================================
     * 유사이미지 검색 사용량 기록
     *
     * 실제 검색까지 성공한 경우에만 +1
     * =========================================================
     */

    const searchResults =
      Array.isArray(data)
        ? data
        : [];

    const topSimilarity =
      searchResults.length
        ? Math.max(
            ...searchResults.map(
              (item) =>
                Number(
                  item?.similarity ||
                    0
                )
            )
          )
        : null;

    const usageResponse =
      await fetch(
        "/api/similar-search-usage",
        {
          method:
            "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body:
            JSON.stringify({
              company_slug:
                normalizedCompanySlug,

              category:
                group.category ||
                null,

              sub_category:
                group.subCategory ||
                null,

              result_count:
                searchResults.length,

              top_similarity:
                topSimilarity,
            }),
        }
      );

    const usageResult =
      await readJsonSafely(
        usageResponse
      );

    /*
     * 여기서는 기존처럼 조용히 무시하지 않습니다.
     *
     * 특히 429라면
     * 한도 초과 상태이므로 즉시 중단합니다.
     */

    if (
      !usageResponse.ok ||
      !usageResult?.success
    ) {
      throw new Error(
        usageResult?.error ||
          "유사이미지 검색 사용량을 처리하지 못했습니다."
      );
    }

    /*
     * =========================================================
     * 같은 시공부위 + 실제 시공금액이 있는 데이터만 사용
     * =========================================================
     */

    const filtered = (
      data || []
    )
      .filter(
        (item) => {
          const itemGroup =
            normalizeCategory(
              `${
                item.category ||
                ""
              } ${
                item.sub_category ||
                ""
              }`
            );

          return (
            itemGroup ===
              group.key &&
            Number(
              item.actual_cost ||
                0
            ) > 0
          );
        }
      )
      .slice(
        0,
        10
      );

    const unique = [];

    const seen =
      new Set();

    for (
      const item of filtered
    ) {
      const id =
        item.work_item_id ||
        `${item.category}-${item.actual_cost}`;

      if (
        seen.has(id)
      ) {
        continue;
      }

      seen.add(id);

      unique.push(
        item
      );
    }

    return unique;
  }

  /*
   * =========================================================
   * 유사 시공 데이터 기반 견적 계산
   * =========================================================
   */

  function calculateEstimate(
    cases
  ) {
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
          item.actual_cost ||
            0
        );

      const similarity =
        Number(
          item.similarity ||
            0
        );

      if (
        cost > 0 &&
        similarity >=
          MATCH_THRESHOLD
      ) {
        /*
         * 유사도가 높은 데이터에
         * 더 큰 가중치를 부여
         */

        const weight =
          similarity *
          similarity;

        weightedCostTotal +=
          cost *
          weight;

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
      Math.round(
        (weightedAverage *
          0.9) /
          1000
      ) * 1000;

    const max =
      Math.round(
        (weightedAverage *
          1.1) /
          1000
      ) * 1000;

    const average =
      Math.round(
        weightedAverage /
          1000
      ) * 1000;

    const topSimilarity =
      Math.max(
        ...cases.map(
          (item) =>
            Number(
              item.similarity ||
                0
            )
        )
      );

    let confidence =
      "낮음";

    if (
      cases.length >= 5 &&
      topSimilarity >=
        0.85
    ) {
      confidence =
        "높음";
    } else if (
      cases.length >= 2 &&
      topSimilarity >=
        0.75
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
    };
  }

  /*
   * =========================================================
   * 자동견적 사진 저장
   * =========================================================
   */

  async function uploadEstimatePhotos() {
    const paths = [];

    const failed = [];

    const uploadErrors =
      [];

    for (
      let index = 0;
      index <
      images.length;
      index += 1
    ) {
      try {
        setMessage(
          `견적 사진 저장 중... ${
            index + 1
          }/${images.length}`
        );

        const formData =
          new FormData();

        formData.append(
          "image",
          images[
            index
          ].file
        );

        if (
          normalizedCompanySlug
        ) {
          formData.append(
            "company_slug",
            normalizedCompanySlug
          );
        }

        const response =
          await fetch(
            "/api/estimate-photo",
            {
              method:
                "POST",

              body:
                formData,
            }
          );

        const result =
          await readJsonSafely(
            response
          );

        if (
          !response.ok ||
          !result?.success ||
          !result?.path
        ) {
          throw new Error(
            result?.error ||
              "사진 저장 실패"
          );
        }

        paths.push(
          result.path
        );
      } catch (error) {
        console.error(
          `자동견적 사진 ${
            index + 1
          } 저장 실패:`,
          error
        );

        failed.push(
          index + 1
        );

        uploadErrors.push(
          error?.message ||
            `자동견적 사진 ${
              index + 1
            } 저장 실패`
        );
      }
    }

    estimatePhotoPathsRef.current =
      paths;

    if (
      images.length > 0 &&
      paths.length === 0
    ) {
      throw new Error(
        uploadErrors[0] ||
          "자동견적 사진을 서버에 저장하지 못했습니다."
      );
    }

    if (
      failed.length > 0
    ) {
      console.warn(
        "일부 자동견적 사진 저장 실패:",
        failed
      );
    }

    return paths;
        }
    /*
   * =========================================================
   * 자동견적 사용 로그
   * =========================================================
   */

  async function saveEstimateUsage({
    completedGroups,
    estimate,
    photoPaths,
  }) {
    try {
      const response =
        await fetch(
          "/api/estimate-usage",
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                company_slug:
                  normalizedCompanySlug ||
                  null,

                session_id:
                  getSessionId(),

                category:
                  completedGroups
                    .map(
                      (group) =>
                        group.category
                    )
                    .filter(
                      Boolean
                    )
                    .join(
                      ", "
                    ) ||
                  null,

                sub_category:
                  completedGroups
                    .map(
                      (group) =>
                        group.subCategory
                    )
                    .filter(
                      Boolean
                    )
                    .join(
                      ", "
                    ) ||
                  null,

                photo_count:
                  images.length,

                estimate_min:
                  estimate?.min ??
                  null,

                estimate_max:
                  estimate?.max ??
                  null,

                estimate_average:
                  estimate?.average ??
                  null,

                photo_paths:
                  Array.isArray(
                    photoPaths
                  )
                    ? photoPaths
                    : [],
              }),
          }
        );

      const result =
        await readJsonSafely(
          response
        );

      if (
        !response.ok ||
        !result?.success
      ) {
        throw new Error(
          result?.error ||
            "자동견적 로그 저장 실패"
        );
      }

      usageIdRef.current =
        result.usage_id ||
        result?.data?.id ||
        null;

      return result;
    } catch (error) {
      console.error(
        "자동견적 사용기록 오류:",
        error
      );

      /*
       * 기존 동작 유지:
       *
       * 로그 저장 오류가 나도
       * 이미 계산된 AI 견적 결과는 유지합니다.
       */

      return null;
    }
  }

  /*
   * =========================================================
   * 전체 AI 자동견적 실행
   * =========================================================
   */

  async function handleAnalyze() {
    /*
     * =====================================================
     * 사진 확인
     * =====================================================
     */

    if (!images.length) {
      setMessage(
        "사진을 한 장 이상 선택해주세요."
      );

      return;
    }

    /*
     * =====================================================
     * 회사 확인
     *
     * SaaS 사용량을 정확하게 적용하려면
     * 업체 slug가 반드시 있어야 합니다.
     * =====================================================
     */

    if (
      !normalizedCompanySlug
    ) {
      setMessage(
        "❌ 회사 정보를 확인할 수 없습니다."
      );

      return;
    }

    setLoading(
      true
    );

    setGroups([]);

    setTotalEstimate(
      null
    );

    usageIdRef.current =
      null;

    estimatePhotoPathsRef.current =
      [];

    try {
      /*
       * ===================================================
       * 0. 자동견적 시작 전 사전 한도검사
       *
       * 매우 중요:
       *
       * 이 검사가 AI 사진분석보다 먼저 실행됩니다.
       *
       * 확인:
       *
       * - auto_estimate 1회
       * - ai_photo_analysis 사진 수
       * - image_upload 사진 수
       *
       * 하나라도 한도 초과라면
       * 아래 OpenAI 호출까지 내려가지 않습니다.
       * ===================================================
       */

      await checkEstimateStartLimits();

      /*
       * ===================================================
       * 1. 사진별 AI 분석
       * ===================================================
       */

      const analyzedPhotos =
        [];

      for (
        let index = 0;
        index <
        images.length;
        index += 1
      ) {
        const result =
          await analyzeOnePhoto(
            images[index],
            index,
            images.length
          );

        analyzedPhotos.push(
          result
        );
      }

      /*
       * ===================================================
       * 2. 같은 시공 부위끼리 그룹화
       * ===================================================
       */

      setMessage(
        "같은 시공 부위의 사진을 묶고 있습니다..."
      );

      const groupMap =
        new Map();

      for (
        const photo of analyzedPhotos
      ) {
        const key =
          getGroupKey(
            photo.analysis
          );

        if (
          !groupMap.has(
            key
          )
        ) {
          groupMap.set(
            key,
            {
              key,

              category:
                photo.analysis
                  ?.category ||
                "시공 부위",

              subCategory:
                photo.analysis
                  ?.sub_category ||
                "",

              photos: [],
            }
          );
        }

        groupMap
          .get(key)
          .photos.push(
            photo
          );
      }

      const baseGroups =
        Array.from(
          groupMap.values()
        );

      /*
       * ===================================================
       * 2-1. 유사이미지 검색 사전 한도검사
       *
       * AI 분석 결과가 나온 후에야
       * 몇 개의 시공부위 그룹인지 알 수 있습니다.
       *
       * 예:
       *
       * 사진 4장
       * → 문 2장
       * → 싱크대 2장
       *
       * 실제 유사검색 = 2회
       *
       * 따라서 그룹 수만큼 한 번에 검사합니다.
       *
       * 이 검사가 통과해야
       * /api/embedding 호출을 시작합니다.
       * ===================================================
       */

      if (
        baseGroups.length >
        0
      ) {
        setMessage(
          "유사 시공사례 검색 가능 여부를 확인하고 있습니다..."
        );

        await checkUsageBeforeAction({
          eventType:
            "similar_image_search",

          quantity:
            baseGroups.length,
        });
      }

      /*
       * ===================================================
       * 3. 각 부위 유사사례 검색
       * ===================================================
       */

      const completedGroups =
        [];

      for (
        let index = 0;
        index <
        baseGroups.length;
        index += 1
      ) {
        const group =
          baseGroups[
            index
          ];

        setMessage(
          `유사 시공사례 검색 중... ${
            index + 1
          }/${
            baseGroups.length
          } · ${group.category}`
        );

        let cases = [];

        let estimate =
          null;

        /*
         * 이전 버전에서는
         * 유사검색 오류를 console.error만 하고
         * 다음 단계로 계속 진행했습니다.
         *
         * 이제 사용량 제한도 연결되어 있으므로
         * 429 등의 오류를 조용히 무시하지 않습니다.
         */

        cases =
          await findSimilarCases(
            group
          );

        estimate =
          calculateEstimate(
            cases
          );

        /*
         * 고객 화면에는
         * 가장 유사한 2건 표시
         */

        const similarItems =
          await Promise.all(
            cases
              .slice(
                0,
                2
              )
              .map(
                async (
                  item
                ) => ({
                  ...item,

                  beforeUrl:
                    await getSignedImageUrl(
                      item.before_path
                    ),

                  afterUrl:
                    await getSignedImageUrl(
                      item.after_path
                    ),
                })
              )
          );

        completedGroups.push(
          {
            ...group,

            similarItems,

            estimate,
          }
        );
      }

      setGroups(
        completedGroups
      );

      /*
       * ===================================================
       * 4. 부위별 견적 합산
       * ===================================================
       */

      const validEstimates =
        completedGroups
          .map(
            (item) =>
              item.estimate
          )
          .filter(
            Boolean
          );

      let calculatedTotal =
        null;

      if (
        validEstimates.length
      ) {
        const min =
          validEstimates.reduce(
            (
              sum,
              item
            ) =>
              sum +
              item.min,
            0
          );

        const max =
          validEstimates.reduce(
            (
              sum,
              item
            ) =>
              sum +
              item.max,
            0
          );

        const average =
          validEstimates.reduce(
            (
              sum,
              item
            ) =>
              sum +
              item.average,
            0
          );

        const missingCount =
          completedGroups.length -
          validEstimates.length;

        calculatedTotal = {
          min,

          max,

          average,

          estimatedGroupCount:
            validEstimates.length,

          totalGroupCount:
            completedGroups.length,

          missingCount,
        };

        setTotalEstimate(
          calculatedTotal
        );
      } else {
        setTotalEstimate(
          null
        );
      }

      /*
       * ===================================================
       * 5. 자동견적에 사용된 사진 저장
       *
       * 시작 전에 image_upload 한도를
       * 확인했지만 보안을 위해
       * /api/estimate-photo에서도
       * 매 사진마다 서버 한도를 다시 검사합니다.
       *
       * 저장용량 MB 역시
       * /api/estimate-photo가 실제 파일 크기로 검사합니다.
       * ===================================================
       */

      setMessage(
        "자동견적 사진을 안전하게 저장하고 있습니다..."
      );

      const photoPaths =
        await uploadEstimatePhotos();

      /*
       * ===================================================
       * 6. 자동견적 사용 로그 저장
       *
       * /api/estimate-usage에서도
       * 서버가 auto_estimate 한도를 다시 확인합니다.
       * ===================================================
       */

      setMessage(
        "자동견적 기록을 저장하고 있습니다..."
      );

      await saveEstimateUsage({
        completedGroups,

        estimate:
          calculatedTotal,

        photoPaths,
      });

      /*
       * ===================================================
       * 7. 완료 메시지
       * ===================================================
       */

      if (
        validEstimates.length
      ) {
        const missingCount =
          completedGroups.length -
          validEstimates.length;

        if (
          missingCount > 0
        ) {
          setMessage(
            `⚠️ ${validEstimates.length}개 부위는 견적을 계산했고, ${missingCount}개 부위는 데이터가 부족합니다.`
          );
        } else {
          setMessage(
            `✅ ${completedGroups.length}개 시공 부위의 예상견적을 계산했습니다.`
          );
        }
      } else {
        setMessage(
          "⚠️ 사진 분석은 완료했지만 같은 부위의 실제 시공 데이터가 부족합니다. 정확한 상담을 신청해주세요."
        );
      }
    } catch (error) {
      console.error(
        "자동견적 실행 오류:",
        error
      );

      /*
       * 한도 초과도 여기로 들어옵니다.
       *
       * 서버가 전달한 실제 메시지를
       * 고객 화면에 보여줍니다.
       */

      setMessage(
        `❌ ${
          error?.message ||
          "분석 중 오류가 발생했습니다."
        }`
      );
    } finally {
      setLoading(
        false
      );
    }
  }

  /*
   * =========================================================
   * Hook 외부에서 사용할 값
   * =========================================================
   */

  return {
    images,

    loading,

    imageLoading,

    message,

    groups,

    totalEstimate,

    usageIdRef,

    estimatePhotoPathsRef,

    addImages,

    removeImage,

    handleAnalyze,

    setMessage,

    setGroups,

    setTotalEstimate,

    resetEstimateResults,

    readJsonSafely,
  };
        }
