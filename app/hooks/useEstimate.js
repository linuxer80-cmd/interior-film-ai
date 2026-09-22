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

export default function useEstimate({ companySlug = null } = {}) {
  const normalizedCompanySlug = String(companySlug || "")
    .trim()
    .toLowerCase();

  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [imageLoading, setImageLoading] =
    useState(false);

  const [message, setMessage] = useState("");

  const [groups, setGroups] = useState([]);

  const [totalEstimate, setTotalEstimate] =
    useState(null);

  const usageIdRef = useRef(null);

  const estimatePhotoPathsRef =
    useRef([]);

  function getSessionId() {
    if (
      typeof window === "undefined"
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
      sessionId = makeId();

      window.localStorage.setItem(
        key,
        sessionId
      );
    }

    return sessionId;
  }

  function resetEstimateResults() {
    setGroups([]);
    setTotalEstimate(null);

    usageIdRef.current = null;

    estimatePhotoPathsRef.current =
      [];
  }

  async function readJsonSafely(
    response
  ) {
    const text =
      await response.text();

    try {
      return JSON.parse(text);
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
   * 사진 추가
   * =========================================================
   */

  async function addImages(
    fileList
  ) {
    const files = Array.from(
      fileList || []
    );

    if (!files.length) {
      return;
    }

    const remaining = Math.max(
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

    setImageLoading(true);

    setMessage(
      `사진을 준비하고 있습니다... 0/${selected.length}`
    );

    resetEstimateResults();

    try {
      const additions = [];

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
              selected[index]
            );

          additions.push({
            id: makeId(),

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
     * 중요:
     * AI 분석 사용량을 정확한 업체에 귀속하기 위해
     * 현재 업체 slug를 분석 API에 전달합니다.
     */
    if (normalizedCompanySlug) {
      formData.append(
        "company_slug",
        normalizedCompanySlug
      );
    }

    const response =
      await fetch(
        "/api/analyze",
        {
          method: "POST",
          body: formData,
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
   * 서버에서 업체 소속을 확인한 뒤 발급
   * =========================================================
   */

  async function getSignedImageUrl(path) {
    if (!path) {
      return null;
    }

    if (!normalizedCompanySlug) {
      return null;
    }

    try {
      const response = await fetch(
        "/api/similar-photo",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            company_slug:
              normalizedCompanySlug,
            path,
          }),
        }
      );

      const result =
        await readJsonSafely(response);

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
     * 절대로 공용/다른 업체 데이터를 검색하지 않습니다.
     */
    if (!normalizedCompanySlug) {
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

    const response =
      await fetch(
        "/api/embedding",
        {
          method: "POST",

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
     * 중요:
     * company_slug를 RPC에 전달하여
     * 해당 업체의 시공 데이터만 검색합니다.
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
     * 검색 자체가 정상 완료된 경우 1회 기록합니다.
     * 기록 실패가 실제 견적 기능을 막지는 않습니다.
     * =========================================================
     */

    try {
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
                    item?.similarity || 0
                  )
              )
            )
          : null;

      const usageResponse =
        await fetch(
          "/api/similar-search-usage",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
              company_slug:
                normalizedCompanySlug,

              category:
                group.category || null,

              sub_category:
                group.subCategory || null,

              result_count:
                searchResults.length,

              top_similarity:
                topSimilarity,
            }),
          }
        );

      if (!usageResponse.ok) {
        const usageResult =
          await readJsonSafely(
            usageResponse
          );

        console.error(
          "유사이미지 검색 사용량 기록 실패:",
          usageResult?.error
        );
      }
    } catch (usageError) {
      console.error(
        "유사이미지 검색 사용량 기록 오류:",
        usageError
      );
    }

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
      .slice(0, 10);

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

    let weightTotal = 0;

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
         * 더 큰 가중치를 부여합니다.
         */

        const weight =
          similarity *
          similarity;

        weightedCostTotal +=          cost * weight;

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
          images[index].file
        );

        /*
         * 중요:
         * 사진 저장 API에도
         * 현재 업체 slug를 전달합니다.
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
            method: "POST",

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
                      (
                        group
                      ) =>
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
                      (
                        group
                      ) =>
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
       * 로그 저장 오류가 나도
       * AI 견적 자체는 유지합니다.
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
    if (!images.length) {
      setMessage(
        "사진을 한 장 이상 선택해주세요."
      );

      return;
    }

    setLoading(true);

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
       * 1. 사진별 AI 분석
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
       * 2. 같은 시공 부위끼리 그룹화
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
       * 3. 각 부위 유사사례 검색
       *
       * findSimilarCases 내부에서
       * company_slug 기준으로
       * 해당 업체 데이터만 검색합니다.
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
          baseGroups[index];

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

        try {
          cases =
            await findSimilarCases(
              group
            );

          estimate =
            calculateEstimate(
              cases
            );
        } catch (error) {
          console.error(
            error
          );
        }

        /*
         * 고객 화면에는
         * 가장 유사한 2건을 표시
         *
         * getSignedImageUrl은
         * /api/similar-photo 서버 API를 통해
         * 업체 소속 확인 후 Signed URL을 받습니다.
         */

        const similarItems =
          await Promise.all(
            cases
              .slice(0, 2)
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
       * 4. 부위별 견적 합산
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

        calculatedTotal =
          {
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
       * 5. 자동견적에 사용된 사진 저장
       */

      setMessage(
        "자동견적 사진을 안전하게 저장하고 있습니다..."
      );

      const photoPaths =
        await uploadEstimatePhotos();

      /*
       * 6. 자동견적 사용 로그 저장
       */

      setMessage(
        "자동견적 기록을 저장하고 있습니다..."
      );

      await saveEstimateUsage(
        {
          completedGroups,

          estimate:
            calculatedTotal,

          photoPaths,
        }
      );

      /*
       * 7. 완료 메시지
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
        error
      );

      setMessage(
        `❌ 오류: ${
          error?.message ||
          "분석 중 오류가 발생했습니다."
        }`
      );
    } finally {
      setLoading(false);
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
