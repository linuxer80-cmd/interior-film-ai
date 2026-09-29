"use client";

import { useRef, useState } from "react";

import {
  makeId,
  prepareImage,
  revokePreviewUrl,
} from "../utils/imageUtils";

import {
  applyEstimateTarget,
  buildEstimatePhotoGroups,
  assignEstimateSubject,
} from "../utils/categoryUtils";

const MAX_IMAGES = 10;
const MATCH_THRESHOLD = 0.65;

/*
 * 모바일 / 서버 부하를 고려한 동시 처리 수
 *
 * AI 분석:
 * 한꺼번에 너무 많이 보내면 OpenAI/Vercel 요청이 몰릴 수 있으므로
 * 최대 3개씩 처리합니다.
 *
 * 유사검색:
 * 그룹별 검색은 최대 3개씩 처리합니다.
 *
 * 사진 업로드:
 * 최대 3개씩 처리합니다.
 */
const AI_ANALYSIS_CONCURRENCY = 3;
const SIMILAR_SEARCH_CONCURRENCY = 3;
const PHOTO_UPLOAD_CONCURRENCY = 3;

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

  const [resultReady, setResultReady] = useState(false);
  const [savingPhotos, setSavingPhotos] = useState(false);
  const [storageStatus, setStorageStatus] = useState("");
  const savePromiseRef = useRef(null);
  const uploadedPathsRef = useRef(new Map());
  const runRef = useRef(0);
  const busyRef = useRef(false);

  const usageIdRef =
    useRef(null);

  const estimatePhotoPathsRef =
    useRef([]);

  /*
   * =========================================================
   * 동시 처리 헬퍼
   *
   * 전체를 한꺼번에 실행하지 않고
   * 지정한 개수만큼 묶어서 병렬 처리합니다.
   *
   * 반환 순서는 원본 배열 순서를 유지합니다.
   * =========================================================
   */

  async function mapWithConcurrency(
    items,
    concurrency,
    worker
  ) {
    const safeItems =
      Array.isArray(items)
        ? items
        : [];

    if (!safeItems.length) {
      return [];
    }

    const safeConcurrency =
      Math.max(
        1,
        Math.min(
          Number(concurrency) || 1,
          safeItems.length
        )
      );

    const results =
      new Array(
        safeItems.length
      );

    let nextIndex = 0;

    async function runWorker() {
      while (true) {
        const currentIndex =
          nextIndex;

        nextIndex += 1;

        if (
          currentIndex >=
          safeItems.length
        ) {
          return;
        }

        results[currentIndex] =
          await worker(
            safeItems[
              currentIndex
            ],
            currentIndex
          );
      }
    }

    await Promise.all(
      Array.from(
        {
          length:
            safeConcurrency,
        },
        () => runWorker()
      )
    );

    return results;
  }

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
    runRef.current += 1;
    setResultReady(false);
    setStorageStatus("");
    savePromiseRef.current = null;
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
   * 기존에는 3번을 순서대로 기다렸습니다.
   *
   * 변경:
   * 서로 독립적인 사용량 조회이므로 동시에 검사합니다.
   * 사용량 자체를 증가시키지는 않습니다.
   * =========================================================
   */

  async function checkEstimateStartLimits() {
    setMessage(
      "자동견적 사용 가능 여부를 확인하고 있습니다..."
    );

    const missingUploads = images.filter((image) => !uploadedPathsRef.current.has(`${normalizedCompanySlug}:${image.id}`)).length;
    await Promise.all([
      checkUsageBeforeAction({
        eventType:
          "auto_estimate",

        quantity: 1,
      }),

      checkUsageBeforeAction({
        eventType:
          "ai_photo_analysis",

        quantity:
          images.length,
      }),

      ...(missingUploads ? [checkUsageBeforeAction({ eventType: "image_upload", quantity: missingUploads })] : []),
    ]);
  }

  /*
   * =========================================================
   * 사진 추가
   *
   * 이미지 준비도 최대 3장씩 병렬 처리합니다.
   * =========================================================
   */

  async function addImages(
    fileList
  ) {
    if (busyRef.current || savePromiseRef.current) return;
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
      let completedCount = 0;

      const preparedResults =
        await mapWithConcurrency(
          selected,
          3,
          async (
            file,
            index
          ) => {
            try {
              const prepared =
                await prepareImage(
                  file
                );

              completedCount += 1;

              setMessage(
                `사진을 준비하고 있습니다... ${completedCount}/${selected.length}`
              );

              return {
                success: true,

                index,

                item: {
                  id:
                    makeId(),

                  file:
                    prepared.file,

                  preview:
                    prepared.preview,
                },
              };
            } catch (error) {
              console.error(
                `사진 ${
                  index + 1
                } 처리 실패:`,
                error
              );

              completedCount += 1;

              setMessage(
                `사진을 준비하고 있습니다... ${completedCount}/${selected.length}`
              );

              return {
                success: false,

                index,

                error,
              };
            }
          }
        );

      const additions =
        preparedResults
          .filter(
            (item) =>
              item?.success &&
              item?.item
          )
          .sort(
            (a, b) =>
              a.index -
              b.index
          )
          .map(
            (item) =>
              item.item
          );

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
    if (busyRef.current || savePromiseRef.current) return;
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

        const remaining = current.filter((item) => item.id !== id);
        const nextRoot = remaining.find((item) => item.subjectId === id)?.id;
        return remaining.map((item) => item.subjectId === id ? { ...item, subjectId: nextRoot || item.id } : item);
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
    const formData =
      new FormData();

    formData.append(
      "image",
      imageItem.file
    );

    formData.append("purpose", "estimate");
    formData.append(
      "photoType",
      "before"
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
        applyEstimateTarget(result.analysis, imageItem.targetChoice),

      analysisIndex:
        index,

      analysisTotal:
        total,
    };
  }

  /*
   * =========================================================
   * Private Storage 이미지 Signed URL
   * =========================================================
   */

  async function getSignedImageUrl(item, side) {
    if (!normalizedCompanySlug) return { url: null, status: "error" };
    const path = item[`${side}_path`];
    if (!item.work_item_id && !path) return { url: null, status: "missing" };
    try {
      const response = await fetch("/api/similar-photo", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_slug: normalizedCompanySlug,
          ...(item.work_item_id ? { work_item_id: item.work_item_id, photo_type: side } : { path }),
        }),
      });
      const result = await readJsonSafely(response);
      if (!response.ok || !result?.success) throw new Error(result?.error || "사진 조회 실패");
      return { url: result.signed_url || null, status: result.signed_url ? "ready" : "missing" };
    } catch (error) {
      console.warn("유사 시공사진 조회 실패", error);
      return { url: null, status: "error" };
    }
  }

  /*
   * =========================================================
   * 유사 시공사례 검색 + 견적
   * =========================================================
   */

  async function findSimilarCases(
    group
  ) {
    if (
      !normalizedCompanySlug || group.requiresConfirmation
    ) {
      return {
        cases: [],
        estimate: null,
      };
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
        "/api/similar-estimate",
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

              text:
                searchText,

              category:
                group.category ||
                null,

              sub_category:
                group.subCategory ||
                null,

              construction_scope: group.scope,
              match_threshold:
                MATCH_THRESHOLD,

              match_count:
                20,
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
          "유사 시공사례 검색 중 오류가 발생했습니다."
      );
    }

    return {
      cases:
        Array.isArray(
          result?.similar_cases
        )
          ? result.similar_cases
          : [],

      estimate:
        result?.estimate ||
        null,
    };
  }

  /*
   * =========================================================
   * 유사 시공사례 한 그룹 완성
   *
   * 검색 + Signed URL 생성을 하나의 작업으로 묶습니다.
   * 그룹 여러 개는 외부에서 병렬 처리합니다.
   * =========================================================
   */

  async function completeSimilarGroup(group) {
    const { cases, estimate } = await findSimilarCases(group);
    return { ...group, similarItems: cases.slice(0, 2).map((item) => ({
      ...item, beforeStatus: "loading", afterStatus: "loading",
    })), estimate };
  }

  async function loadSimilarImages(completedGroups, runId) {
    // Update each side independently: one slow request must not hide other photos.
    const tasks = completedGroups.flatMap((group) => (group.similarItems || []).flatMap((item, index) =>
      ["before", "after"].map((side) => ({ group, item, index, side }))));
    await mapWithConcurrency(tasks, 6, async ({ group, item, index, side }) => {
      const { url, status } = await getSignedImageUrl(item, side);
      if (runRef.current !== runId) return;
      setGroups((current) => current.map((entry) => entry.key !== group.key ? entry : {
        ...entry, similarItems: entry.similarItems.map((photo, i) => i !== index ? photo : {
          ...photo, [`${side}Url`]: url, [`${side}Status`]: status,
        }),
      }));
    });
  }

  function retrySimilarPhoto(groupKey, index, side) {
    const group = groups.find((entry) => entry.key === groupKey);
    const item = group?.similarItems?.[index];
    if (!item || !["before", "after"].includes(side) || item[`${side}Status`] === "loading") return;
    const runId = runRef.current;
    setGroups((current) => current.map((entry) => entry.key !== groupKey ? entry : {
      ...entry, similarItems: entry.similarItems.map((photo, i) => i !== index ? photo : {
        ...photo, [`${side}Url`]: null, [`${side}Status`]: "loading",
      }),
    }));
    void getSignedImageUrl(item, side).then(({ url, status }) => {
      if (runRef.current !== runId) return;
      setGroups((current) => current.map((entry) => entry.key !== groupKey ? entry : {
        ...entry, similarItems: entry.similarItems.map((photo, i) => i !== index ? photo : {
          ...photo, [`${side}Url`]: url, [`${side}Status`]: status,
        }),
      }));
    });
  }

  function updatePhotoOptions(id, options) {
    if (busyRef.current || savePromiseRef.current || imageLoading) return;
    setImages((current) => {
      if ("subjectId" in options) return assignEstimateSubject(current, id, options.subjectId);
      return current.map((photo) => photo.id === id ? { ...photo, targetChoice: options.targetChoice || "" } : photo);
    });
    resetEstimateResults();
  }

  /*
   * =========================================================
   * 자동견적 사진 한 장 저장
   * =========================================================
   */

  async function uploadOneEstimatePhoto(
    imageItem,
    index
  ) {
    if (uploadedPathsRef.current.has(`${normalizedCompanySlug}:${imageItem.id}`)) return uploadedPathsRef.current.get(`${normalizedCompanySlug}:${imageItem.id}`);
    const formData =
      new FormData();

    formData.append(
      "image",
      imageItem.file
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
          `사진 ${
            index + 1
          } 저장 실패`
      );
    }

    uploadedPathsRef.current.set(`${normalizedCompanySlug}:${imageItem.id}`, result.path);
    return result.path;
  }

  /*
   * =========================================================
   * 자동견적 사진 저장
   *
   * 기존:
   * 사진1 → 사진2 → 사진3
   *
   * 변경:
   * 최대 3장 동시 업로드
   * =========================================================
   */

  async function uploadEstimatePhotos() {
    if (!images.length) {
      estimatePhotoPathsRef.current =
        [];

      return [];
    }

    let completedCount = 0;

    const uploadResults =
      await mapWithConcurrency(
        images,
        PHOTO_UPLOAD_CONCURRENCY,
        async (
          imageItem,
          index
        ) => {
          try {
            const path =
              await uploadOneEstimatePhoto(
                imageItem,
                index
              );

            completedCount += 1;

            setStorageStatus(
              `견적 사진 저장 중... ${completedCount}/${images.length}`
            );

            return {
              success: true,

              index,

              path,
            };
          } catch (error) {
            completedCount += 1;

            setStorageStatus(
              `견적 사진 저장 중... ${completedCount}/${images.length}`
            );

            console.error(
              `자동견적 사진 ${
                index + 1
              } 저장 실패:`,
              error
            );

            return {
              success: false,

              index,

              error,
            };
          }
        }
      );

    const successResults =
      uploadResults
        .filter(
          (item) =>
            item?.success &&
            item?.path
        )
        .sort(
          (a, b) =>
            a.index -
            b.index
        );

    const paths =
      successResults.map(
        (item) =>
          item.path
      );

    const failed =
      uploadResults.filter(
        (item) =>
          !item?.success
      );

    estimatePhotoPathsRef.current =
      paths;

    if (failed.length > 0) {
      throw new Error(`${paths.length}/${images.length}장 저장됨. 실패한 사진은 다시 저장해주세요.`);
    }
    return paths;
  }

  /*
   * =========================================================
   * 자동견적 사용 로그
   * =========================================================
   */

  async function ensureEstimatePhotos() {
    if (savePromiseRef.current) return savePromiseRef.current;
    setSavingPhotos(true);
    const task = uploadEstimatePhotos();
    savePromiseRef.current = task;
    try {
      const paths = await task;
      setStorageStatus("사진 저장 완료");
      return paths;
    } catch (error) {
      setStorageStatus(error.message || "사진 저장 실패. 다시 저장해주세요.");
      throw error;
    } finally {
      if (savePromiseRef.current === task) { savePromiseRef.current = null; setSavingPhotos(false); }
    }
  }

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
       * 로그 저장 오류가 나더라도
       * 계산된 AI 견적 결과는 유지합니다.
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
    if (busyRef.current || savePromiseRef.current) return;

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

    busyRef.current = true;
    const runId = ++runRef.current;
    setResultReady(false);
    setStorageStatus("");
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
       * ===================================================
       * 0. 자동견적 시작 전 사전 한도검사
       *
       * 3개 사용량 검사를 동시에 실행합니다.
       * ===================================================
       */

      await checkEstimateStartLimits();

      /*
       * ===================================================
       * 1. 사진별 AI 분석
       *
       * 기존:
       * 사진1 완료 → 사진2 완료 → 사진3 완료
       *
       * 변경:
       * 최대 3장 동시 분석
       * ===================================================
       */

      setMessage(
        `AI 사진 분석 중... 0/${images.length}`
      );

      let analyzedCount = 0;

      const analyzedPhotos =
        await mapWithConcurrency(
          images,
          AI_ANALYSIS_CONCURRENCY,
          async (
            imageItem,
            index
          ) => {
            const result =
              await analyzeOnePhoto(
                imageItem,
                index,
                images.length
              );

            analyzedCount += 1;

            setMessage(
              `AI 사진 분석 중... ${analyzedCount}/${images.length}`
            );

            return result;
          }
        );

      /*
       * ===================================================
       * 2. 같은 시공 부위끼리 그룹화
       * ===================================================
       */

      setMessage(
        "사진별 시공 대상을 확인하고 있습니다..."
      );

      const baseGroups = buildEstimatePhotoGroups(analyzedPhotos);

      /*
       * ===================================================
       * 2-1. 유사이미지 검색 사전 한도검사
       *
       * 전체 그룹 수가 남은 한도 안에 있는지
       * 먼저 확인하는 기존 안전장치는 유지합니다.
       * ===================================================
       */

      const searchableGroups = baseGroups.filter((group) => !group.requiresConfirmation);
      if (searchableGroups.length > 0) {
        setMessage(
          "유사 시공사례 검색 가능 여부를 확인하고 있습니다..."
        );

        await checkUsageBeforeAction({
          eventType:
            "similar_image_search",

          quantity:
            searchableGroups.length,
        });
      }

      /*
       * ===================================================
       * 3. 각 부위 유사사례 검색
       *
       * 기존:
       * 그룹1 → 그룹2 → 그룹3
       *
       * 변경:
       * 최대 3개 그룹 동시 검색
       * ===================================================
       */

      setMessage(
        `유사 시공사례 검색 중... 0/${baseGroups.length}`
      );

      let searchedGroupCount = 0;

      const completedGroups =
        await mapWithConcurrency(
          baseGroups,
          SIMILAR_SEARCH_CONCURRENCY,
          async (
            group
          ) => {
            const completed =
              await completeSimilarGroup(
                group
              );

            searchedGroupCount += 1;

            setMessage(
              `유사 시공사례 검색 중... ${searchedGroupCount}/${baseGroups.length}`
            );

            return completed;
          }
        );

      /*
       * 견적 및 유사사례 결과를
       * 사진 저장보다 먼저 화면에 표시합니다.
       */

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
       * 5. 자동견적 사진 저장
       *
       * 최대 3장씩 동시 업로드
       * ===================================================
       */

      setResultReady(true);
      setStorageStatus("사진 저장 중...");
      void loadSimilarImages(completedGroups, runId).catch((error) => console.warn("유사사진 표시 실패", error));
      let photoPaths = [];
      try {
        photoPaths = await ensureEstimatePhotos();
      } catch (error) {
        photoPaths = estimatePhotoPathsRef.current;
        setStorageStatus(error.message || "사진 저장 실패. 다시 저장해주세요.");
      }

      /*
       * ===================================================
       * 6. 자동견적 사용 로그 저장
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

      setMessage(
        `❌ ${
          error?.message ||
          "분석 중 오류가 발생했습니다."
        }`
      );
    } finally {
      busyRef.current = false;
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

    resultReady,
    storageStatus,
    savingPhotos,
    ensureEstimatePhotos,
    loading,

    imageLoading,

    message,

    groups,

    totalEstimate,

    usageIdRef,

    estimatePhotoPathsRef,

    addImages,

    removeImage,
    updatePhotoOptions,
    retrySimilarPhoto,

    handleAnalyze,

    setMessage,

    setGroups,

    setTotalEstimate,

    resetEstimateResults,

    readJsonSafely,
  };
        }
