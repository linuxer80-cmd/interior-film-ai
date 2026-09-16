"use client";

import { useRef, useState } from "react";
import { supabase } from "../lib/supabase";

const MAX_IMAGES = 10;
const MATCH_THRESHOLD = 0.65;

export default function Home() {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [groups, setGroups] = useState([]);
  const [totalEstimate, setTotalEstimate] = useState(null);

  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [region, setRegion] = useState("");
  const [privacyAgree, setPrivacyAgree] = useState(false);
  const [leadLoading, setLeadLoading] = useState(false);
  const [leadComplete, setLeadComplete] = useState(false);
  const [leadMessage, setLeadMessage] = useState("");

  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);

  // 현재 자동견적 로그 ID
  const usageIdRef = useRef(null);

  // 자동견적 단계에서 이미 저장한 사진 경로
  // 상세상담 신청 시 같은 사진을 다시 업로드하지 않기 위해 사용
  const estimatePhotoPathsRef = useRef([]);

  function makeId() {
    if (
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
    ) {
      return crypto.randomUUID();
    }

    return `${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`;
  }

  function getSessionId() {
    if (typeof window === "undefined") {
      return makeId();
    }

    const key = "interior_estimate_session_id";
    let sessionId = window.localStorage.getItem(key);

    if (!sessionId) {
      sessionId = makeId();
      window.localStorage.setItem(key, sessionId);
    }

    return sessionId;
  }

  function formatWon(value) {
    return Number(value || 0).toLocaleString("ko-KR");
  }

  function resetResults() {
    setGroups([]);
    setTotalEstimate(null);
    setLeadComplete(false);
    setLeadMessage("");

    usageIdRef.current = null;
    estimatePhotoPathsRef.current = [];
  }

  function handlePhoneChange(value) {
    const numbers = String(value || "")
      .replace(/[^0-9]/g, "")
      .slice(0, 11);

    if (numbers.length <= 3) {
      setPhone(numbers);
      return;
    }

    if (numbers.length <= 7) {
      setPhone(
        `${numbers.slice(0, 3)}-${numbers.slice(3)}`
      );
      return;
    }

    setPhone(
      `${numbers.slice(0, 3)}-${numbers.slice(
        3,
        7
      )}-${numbers.slice(7)}`
    );
  }

  async function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        if (typeof reader.result !== "string") {
          reject(
            new Error("사진 데이터를 읽을 수 없습니다.")
          );
          return;
        }

        resolve(reader.result);
      };

      reader.onerror = () => {
        reject(
          new Error("사진 파일을 읽을 수 없습니다.")
        );
      };

      reader.readAsDataURL(file);
    });
  }

  async function loadImageFromDataUrl(dataUrl) {
    return new Promise((resolve, reject) => {
      const image = new Image();

      image.onload = () => resolve(image);

      image.onerror = () =>
        reject(
          new Error("사진을 불러올 수 없습니다.")
        );

      image.src = dataUrl;
    });
  }

  async function prepareImage(
    file,
    maxSize = 1200,
    quality = 0.68
  ) {
    if (!file) {
      throw new Error("사진 파일이 없습니다.");
    }

    let bitmap = null;
    let source = null;
    let originalWidth = 0;
    let originalHeight = 0;

    try {
      if (typeof createImageBitmap === "function") {
        bitmap = await createImageBitmap(file);
      }
    } catch {
      bitmap = null;
    }

    if (bitmap) {
      source = bitmap;
      originalWidth = bitmap.width;
      originalHeight = bitmap.height;
    } else {
      const dataUrl = await fileToDataUrl(file);
      const image =
        await loadImageFromDataUrl(dataUrl);

      source = image;
      originalWidth =
        image.naturalWidth || image.width;
      originalHeight =
        image.naturalHeight || image.height;
    }

    if (!originalWidth || !originalHeight) {
      bitmap?.close?.();

      throw new Error(
        "사진 크기를 확인할 수 없습니다."
      );
    }

    let width = originalWidth;
    let height = originalHeight;

    if (width > maxSize || height > maxSize) {
      const ratio = Math.min(
        maxSize / width,
        maxSize / height
      );

      width = Math.round(width * ratio);
      height = Math.round(height * ratio);
    }

    const canvas = document.createElement("canvas");

    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d", {
      alpha: false,
    });

    if (!context) {
      bitmap?.close?.();

      throw new Error(
        "이미지 처리 기능을 사용할 수 없습니다."
      );
    }

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(source, 0, 0, width, height);

    bitmap?.close?.();

    const blob = await new Promise(
      (resolve, reject) => {
        canvas.toBlob(
          (result) => {
            if (!result) {
              reject(
                new Error(
                  "JPEG 이미지 변환에 실패했습니다."
                )
              );
              return;
            }

            resolve(result);
          },
          "image/jpeg",
          quality
        );
      }
    );

    const convertedFile = new File(
      [blob],
      `customer-${makeId()}.jpg`,
      {
        type: "image/jpeg",
        lastModified: Date.now(),
      }
    );

    return {
      file: convertedFile,
      preview: URL.createObjectURL(convertedFile),
    };
  }

  async function addImages(fileList) {
    const files = Array.from(fileList || []);

    if (!files.length) return;

    const remaining = Math.max(
      0,
      MAX_IMAGES - images.length
    );

    if (remaining <= 0) {
      setMessage(
        `사진은 최대 ${MAX_IMAGES}장까지 선택할 수 있습니다.`
      );
      return;
    }

    const selected = files.slice(0, remaining);

    setImageLoading(true);
    setMessage(
      `사진을 준비하고 있습니다... 0/${selected.length}`
    );

    resetResults();

    try {
      const additions = [];

      for (
        let index = 0;
        index < selected.length;
        index += 1
      ) {
        setMessage(
          `사진을 준비하고 있습니다... ${
            index + 1
          }/${selected.length}`
        );

        try {
          const prepared = await prepareImage(
            selected[index]
          );

          additions.push({
            id: makeId(),
            file: prepared.file,
            preview: prepared.preview,
          });
        } catch (error) {
          console.error(
            `사진 ${index + 1} 처리 실패:`,
            error
          );
        }
      }

      if (!additions.length) {
        throw new Error(
          "선택한 사진을 불러오지 못했습니다."
        );
      }

      setImages((current) => [
        ...current,
        ...additions,
      ]);

      if (additions.length < selected.length) {
        setMessage(
          `⚠️ ${selected.length}장 중 ${additions.length}장만 불러왔습니다.`
        );
      } else {
        setMessage(
          `✅ 사진 ${additions.length}장을 준비했습니다.`
        );
      }
    } catch (error) {
      console.error(error);

      setMessage(
        `❌ 오류: ${
          error?.message ||
          "사진을 불러올 수 없습니다."
        }`
      );
    } finally {
      setImageLoading(false);
    }
  }

  function removeImage(id) {
    setImages((current) => {
      const target = current.find(
        (item) => item.id === id
      );

      if (target?.preview?.startsWith("blob:")) {
        URL.revokeObjectURL(target.preview);
      }

      return current.filter(
        (item) => item.id !== id
      );
    });

    resetResults();
    setMessage("");
  }

  async function readJsonSafely(response) {
    const text = await response.text();

    try {
      return JSON.parse(text);
    } catch {
      throw new Error(
        text
          ? `서버 응답 오류: ${text.slice(0, 200)}`
          : "서버에서 올바른 응답을 받지 못했습니다."
      );
    }
  }

  function normalizeCategory(value) {
    const text = String(value || "")
      .trim()
      .toLowerCase();

    if (
      text.includes("방문") ||
      text.includes("문틀") ||
      text.includes("중문") ||
      text.includes("방화문") ||
      text.includes("현관문") ||
      text.includes("도어") ||
      text.includes("슬라이딩")
    ) {
      return "door";
    }

    if (
      text.includes("싱크대") ||
      text.includes("주방") ||
      text.includes("상부장") ||
      text.includes("하부장") ||
      text.includes("냉장고장")
    ) {
      return "kitchen";
    }

    if (
      text.includes("붙박이장") ||
      text.includes("옷장")
    ) {
      return "closet";
    }

    if (
      text.includes("신발장") ||
      text.includes("현관장")
    ) {
      return "shoe";
    }

    if (
      text.includes("화장대") ||
      text.includes("서랍장")
    ) {
      return "vanity";
    }

    if (
      text.includes("샷시") ||
      text.includes("창틀") ||
      text.includes("창문")
    ) {
      return "window";
    }

    if (
      text.includes("몰딩") ||
      text.includes("걸레받이")
    ) {
      return "molding";
    }

    if (
      text.includes("아트월") ||
      text.includes("벽체")
    ) {
      return "wall";
    }

    return text || "other";
  }

  function getGroupKey(analysis) {
    return normalizeCategory(
      `${analysis?.category || ""} ${
        analysis?.sub_category || ""
      }`
    );
  }

  async function analyzeOnePhoto(
    imageItem,
    index,
    total
  ) {
    setMessage(
      `AI 사진 분석 중... ${index + 1}/${total}`
    );

    const formData = new FormData();

    formData.append("image", imageItem.file);
    formData.append("photoType", "before");

    const response = await fetch("/api/analyze", {
      method: "POST",
      body: formData,
    });

    const result =
      await readJsonSafely(response);

    if (!response.ok || !result?.analysis) {
      throw new Error(
        result?.error ||
          `${index + 1}번째 사진 분석 실패`
      );
    }

    return {
      ...imageItem,
      analysis: result.analysis,
    };
  }

  async function getSignedImageUrl(path) {
    if (!path) return null;

    try {
      const { data, error } =
        await supabase.storage
          .from("work-photos")
          .createSignedUrl(path, 60 * 60);

      if (error) {
        console.error(error);
        return null;
      }

      return data?.signedUrl || null;
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  async function findSimilarCases(group) {
    const analyses = group.photos.map(
      (item) => item.analysis
    );

    const tags = [
      ...new Set(
        analyses.flatMap((item) =>
          Array.isArray(item?.tags)
            ? item.tags
            : []
        )
      ),
    ];

    const searchText = [
      `시공 부위: ${group.category || ""}`,
      `세부 부위: ${group.subCategory || ""}`,
      `사진 수: ${group.photos.length}`,
      ...analyses.map(
        (item, index) =>
          `사진 ${index + 1}: ${
            item?.description || ""
          }`
      ),
      `특징: ${tags.join(", ")}`,
    ].join("\n");

    const response = await fetch(
      "/api/embedding",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          text: searchText,
        }),
      }
    );

    const result =
      await readJsonSafely(response);

    if (!response.ok || !result?.embedding) {
      throw new Error(
        result?.error ||
          "유사사례 검색 데이터를 만들지 못했습니다."
      );
    }

    const { data, error } =
      await supabase.rpc(
        "get_public_similar_cases",
        {
          query_embedding: result.embedding,
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

    const filtered = (data || [])
      .filter((item) => {
        const itemGroup =
          normalizeCategory(
            `${item.category || ""} ${
              item.sub_category || ""
            }`
          );

        return (
          itemGroup === group.key &&
          Number(item.actual_cost || 0) > 0
        );
      })
      .slice(0, 10);

    const unique = [];
    const seen = new Set();

    for (const item of filtered) {
      const id =
        item.work_item_id ||
        `${item.category}-${item.actual_cost}`;

      if (seen.has(id)) continue;

      seen.add(id);
      unique.push(item);
    }

    return unique;
  }

  function calculateEstimate(cases) {
    if (!cases.length) return null;

    let weightedCostTotal = 0;
    let weightTotal = 0;

    for (const item of cases) {
      const cost = Number(
        item.actual_cost || 0
      );

      const similarity = Number(
        item.similarity || 0
      );

      if (
        cost > 0 &&
        similarity >= MATCH_THRESHOLD
      ) {
        const weight =
          similarity * similarity;

        weightedCostTotal +=
          cost * weight;

        weightTotal += weight;
      }
    }

    if (weightTotal <= 0) return null;

    const weightedAverage =
      weightedCostTotal / weightTotal;

    const min =
      Math.round(
        (weightedAverage * 0.9) / 1000
      ) * 1000;

    const max =
      Math.round(
        (weightedAverage * 1.1) / 1000
      ) * 1000;

    const average =
      Math.round(weightedAverage / 1000) *
      1000;

    const topSimilarity = Math.max(
      ...cases.map((item) =>
        Number(item.similarity || 0)
      )
    );

    let confidence = "낮음";

    if (
      cases.length >= 5 &&
      topSimilarity >= 0.85
    ) {
      confidence = "높음";
    } else if (
      cases.length >= 2 &&
      topSimilarity >= 0.75
    ) {
      confidence = "보통";
    }

    return {
      min,
      max,
      average,
      count: cases.length,
      confidence,
    };
  }

  /*
   * 자동견적 사진 저장
   *
   * 상세상담을 신청하지 않아도
   * AI 견적을 실행하면 사진을 저장한다.
   */
  async function uploadEstimatePhotos() {
    const paths = [];

    for (
      let index = 0;
      index < images.length;
      index += 1
    ) {
      try {
        setMessage(
          `견적 사진 저장 중... ${
            index + 1
          }/${images.length}`
        );

        const path =
          `estimate-usage/${makeId()}.jpg`;

        const { error } =
          await supabase.storage
            .from("work-photos")
            .upload(
              path,
              images[index].file,
              {
                cacheControl: "3600",
                contentType: "image/jpeg",
                upsert: false,
              }
            );

        if (error) {
          console.error(
            `자동견적 사진 ${
              index + 1
            } 저장 실패:`,
            error
          );

          continue;
        }

        paths.push(path);
      } catch (error) {
        console.error(
          `자동견적 사진 ${
            index + 1
          } 처리 오류:`,
          error
        );
      }
    }

    estimatePhotoPathsRef.current = paths;

    return paths;
  }

  /*
   * 자동견적 사용 로그 저장
   *
   * estimate_usage 테이블에
   * 견적정보 + 사진 경로를 저장한다.
   */
  async function saveEstimateUsage({
    completedGroups,
    estimate,
    photoPaths,
  }) {
    try {
      const response = await fetch(
        "/api/estimate-usage",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            session_id: getSessionId(),

            category:
              completedGroups
                .map(
                  (group) =>
                    group.category
                )
                .filter(Boolean)
                .join(", ") || null,

            sub_category:
              completedGroups
                .map(
                  (group) =>
                    group.subCategory
                )
                .filter(Boolean)
                .join(", ") || null,

            photo_count: images.length,

            estimate_min:
              estimate?.min ?? null,

            estimate_max:
              estimate?.max ?? null,

            estimate_average:
              estimate?.average ?? null,

            photo_paths:
              Array.isArray(photoPaths)
                ? photoPaths
                : [],
          }),
        }
      );

      const result =
        await readJsonSafely(response);

      /*
       * 중요 수정:
       * API는 id가 아니라 usage_id를 반환한다.
       */
      if (
        response.ok &&
        result?.success &&
        result?.usage_id
      ) {
        usageIdRef.current =
          result.usage_id;
      } else {
        console.error(
          "자동견적 사용기록 실패:",
          result
        );
      }
    } catch (error) {
      console.error(
        "자동견적 사용기록 오류:",
        error
      );
    }
  }

  async function handleAnalyze() {
    if (!images.length) {
      setMessage(
        "사진을 한 장 이상 선택해주세요."
      );
      return;
    }

    setLoading(true);
    setGroups([]);
    setTotalEstimate(null);
    setLeadComplete(false);
    setLeadMessage("");

    usageIdRef.current = null;
    estimatePhotoPathsRef.current = [];

    try {
      const analyzedPhotos = [];

      for (
        let index = 0;
        index < images.length;
        index += 1
      ) {
        const result =
          await analyzeOnePhoto(
            images[index],
            index,
            images.length
          );

        analyzedPhotos.push(result);
      }

      setMessage(
        "같은 시공 부위의 사진을 묶고 있습니다..."
      );

      const groupMap = new Map();

      for (const photo of analyzedPhotos) {
        const key =
          getGroupKey(photo.analysis);

        if (!groupMap.has(key)) {
          groupMap.set(key, {
            key,
            category:
              photo.analysis?.category ||
              "시공 부위",
            subCategory:
              photo.analysis
                ?.sub_category || "",
            photos: [],
          });
        }

        groupMap.get(key).photos.push(photo);
      }

      const baseGroups = Array.from(
        groupMap.values()
      );

      const completedGroups = [];

      for (
        let index = 0;
        index < baseGroups.length;
        index += 1
      ) {
        const group = baseGroups[index];

        setMessage(
          `유사 시공사례 검색 중... ${
            index + 1
          }/${baseGroups.length} · ${
            group.category
          }`
        );

        let cases = [];
        let estimate = null;

        try {
          cases =
            await findSimilarCases(group);

          estimate =
            calculateEstimate(cases);
        } catch (error) {
          console.error(error);
        }

        const similarItems =
          await Promise.all(
            cases
              .slice(0, 2)
              .map(async (item) => ({
                ...item,
                beforeUrl:
                  await getSignedImageUrl(
                    item.before_path
                  ),
                afterUrl:
                  await getSignedImageUrl(
                    item.after_path
                  ),
              }))
          );

        completedGroups.push({
          ...group,
          similarItems,
          estimate,
        });
      }

      setGroups(completedGroups);

      const validEstimates =
        completedGroups
          .map((item) => item.estimate)
          .filter(Boolean);

      let calculatedTotal = null;

      if (validEstimates.length) {
        const min =
          validEstimates.reduce(
            (sum, item) =>
              sum + item.min,
            0
          );

        const max =
          validEstimates.reduce(
            (sum, item) =>
              sum + item.max,
            0
          );

        const average =
          validEstimates.reduce(
            (sum, item) =>
              sum + item.average,
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
        setTotalEstimate(null);
      }

      /*
       * 상세상담 신청 전
       * 자동견적 사진을 Storage에 저장
       */
      setMessage(
        "자동견적 기록과 사진을 저장하고 있습니다..."
      );

      const photoPaths =
        await uploadEstimatePhotos();

      /*
       * estimate_usage에
       * 자동견적 정보 + photo_paths 저장
       */
      await saveEstimateUsage({
        completedGroups,
        estimate: calculatedTotal,
        photoPaths,
      });

      if (validEstimates.length) {
        const missingCount =
          completedGroups.length -
          validEstimates.length;

        if (missingCount > 0) {
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
      console.error(error);

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
   * 상담 신청 사진
   *
   * 자동견적 단계에서 이미 저장했다면
   * 같은 사진을 다시 업로드하지 않는다.
   */
  async function uploadLeadPhotos() {
    if (
      Array.isArray(
        estimatePhotoPathsRef.current
      ) &&
      estimatePhotoPathsRef.current.length > 0
    ) {
      return estimatePhotoPathsRef.current;
    }

    const paths = [];

    for (
      let index = 0;
      index < images.length;
      index += 1
    ) {
      const path =
        `leads/${makeId()}.jpg`;

      const { error } =
        await supabase.storage
          .from("work-photos")
          .upload(
            path,
            images[index].file,
            {
              cacheControl: "3600",
              contentType:
                "image/jpeg",
              upsert: false,
            }
          );

      if (error) {
        console.error(
          `상담 사진 ${
            index + 1
          } 저장 실패:`,
          error
        );

        continue;
      }

      paths.push(path);
    }

    return paths;
  }

  async function handleLeadSubmit(event) {
    event.preventDefault();

    if (!groups.length) {
      setLeadMessage(
        "먼저 사진 AI 분석을 진행해주세요."
      );
      return;
    }

    if (!customerName.trim()) {
      setLeadMessage(
        "이름을 입력해주세요."
      );
      return;
    }

    const phoneNumbers =
      phone.replace(/[^0-9]/g, "");

    if (phoneNumbers.length < 9) {
      setLeadMessage(
        "연락처를 정확히 입력해주세요."
      );
      return;
    }

    if (!region.trim()) {
      setLeadMessage(
        "시공 지역을 입력해주세요."
      );
      return;
    }

    if (!privacyAgree) {
      setLeadMessage(
        "개인정보 수집 및 상담 연락에 동의해주세요."
      );
      return;
    }

    setLeadLoading(true);

    setLeadMessage(
      "사진과 상담 신청을 접수하고 있습니다..."
    );

    try {
      const customerPhotoPaths =
        await uploadLeadPhotos();

      const estimateDetails =
        groups.map((group) => ({
          group_key: group.key,
          category: group.category,
          sub_category:
            group.subCategory,
          photo_count:
            group.photos.length,
          estimate_min:
            group.estimate?.min ??
            null,
          estimate_max:
            group.estimate?.max ??
            null,
          estimate_average:
            group.estimate?.average ??
            null,
          confidence:
            group.estimate?.confidence ||
            "데이터 부족",
          similar_count:
            group.estimate?.count || 0,
        }));

      const description = groups
        .map((group, index) => {
          const descriptions =
            group.photos
              .map(
                (photo) =>
                  photo.analysis
                    ?.description || ""
              )
              .filter(Boolean)
              .join(" / ");

          return `${index + 1}. ${
            group.category
          }${
            group.subCategory
              ? ` · ${group.subCategory}`
              : ""
          } (${
            group.photos.length
          }장): ${descriptions}`;
        })
        .join("\n");

      const categoryText = groups
        .map((group) => group.category)
        .filter(Boolean)
        .join(", ");

      const memoLines = groups.map(
        (group) => {
          if (!group.estimate) {
            return `${group.category}: 데이터 부족`;
          }

          return `${
            group.category
          }: ${formatWon(
            group.estimate.min
          )}~${formatWon(
            group.estimate.max
          )}원`;
        }
      );

      const response = await fetch(
        "/api/lead",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            customer_name:
              customerName.trim(),

            phone: phone.trim(),

            region: region.trim(),

            category:
              categoryText || null,

            sub_category:
              groups.length === 1
                ? groups[0]
                    .subCategory
                : "다중부위",

            ai_description:
              description,

            estimate_min:
              totalEstimate?.min ??
              null,

            estimate_max:
              totalEstimate?.max ??
              null,

            estimate_average:
              totalEstimate?.average ??
              null,

            customer_photo_path:
              customerPhotoPaths[0] ||
              null,

            customer_photo_paths:
              customerPhotoPaths,

            estimate_details:
              estimateDetails,

            memo:
              `다중사진 AI 견적\n${memoLines.join(
                "\n"
              )}`,

            usage_id:
              usageIdRef.current,
          }),
        }
      );

      const result =
        await readJsonSafely(response);

      if (
        !response.ok ||
        !result?.success
      ) {
        throw new Error(
          result?.error ||
            "상담 신청 저장 오류"
        );
      }

      setLeadComplete(true);

      setLeadMessage(
        "✅ 상담 신청이 완료되었습니다. 확인 후 연락드리겠습니다."
      );
    } catch (error) {
      console.error(error);

      setLeadMessage(
        `❌ 상담 신청 오류: ${
          error?.message ||
          "다시 시도해주세요."
        }`
      );
    } finally {
      setLeadLoading(false);
    }
  }

  const sectionStyle = {
    marginTop: "24px",
    padding: "22px",
    border: "1px solid #e5e7eb",
    borderRadius: "20px",
    background: "#ffffff",
  };

  const inputStyle = {
    width: "100%",
    padding: "15px",
    marginTop: "7px",
    fontSize: "16px",
    border: "1px solid #d1d5db",
    borderRadius: "12px",
    boxSizing: "border-box",
  };

  const photoButtonStyle = {
    flex: 1,
    minHeight: "72px",
    border: "1px solid #d1d5db",
    borderRadius: "14px",
    background: "#ffffff",
    fontSize: "16px",
    fontWeight: "bold",
    cursor: "pointer",
  };

  return (
    <main
      style={{
        maxWidth: "720px",
        margin: "0 auto",
        padding: "28px 18px 70px",
        fontFamily: "Arial, sans-serif",
        background: "#f8fafc",
        minHeight: "100vh",
        boxSizing: "border-box",
        color: "#111827",
      }}
    >
      <div
        style={{
          display: "inline-block",
          background: "#111827",
          color: "#ffffff",
          padding: "8px 14px",
          borderRadius: "20px",
          fontWeight: "bold",
        }}
      >
        기분좋은공간
      </div>

      <h1
        style={{
          marginTop: "18px",
          marginBottom: "8px",
          fontSize: "32px",
          lineHeight: 1.3,
        }}
      >
        AI 인테리어필름 견적
      </h1>

      <p
        style={{
          marginTop: 0,
          color: "#6b7280",
          fontSize: "17px",
          lineHeight: 1.7,
        }}
      >
        여러 시공 부위의 사진을 한 번에
        올려주세요. AI가 같은 부위끼리 묶어서
        예상견적을 계산합니다.
      </p>

      <section style={sectionStyle}>
        <h2 style={{ marginTop: 0 }}>
          1. 시공할 곳 사진
        </h2>

        <p
          style={{
            color: "#6b7280",
            lineHeight: 1.6,
          }}
        >
          최대 10장까지 선택할 수 있습니다.
          같은 부위를 여러 각도로 촬영하면
          정확도가 좋아집니다.
        </p>

        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: "none" }}
          onChange={async (event) => {
            await addImages(
              event.target.files
            );

            event.target.value = "";
          }}
        />

        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: "none" }}
          onChange={async (event) => {
            await addImages(
              event.target.files
            );

            event.target.value = "";
          }}
        />

        <div
          style={{
            display: "flex",
            gap: "10px",
          }}
        >
          <button
            type="button"
            style={photoButtonStyle}
            disabled={
              loading || imageLoading
            }
            onClick={() =>
              cameraInputRef.current?.click()
            }
          >
            📷
            <br />
            사진 촬영
          </button>

          <button
            type="button"
            style={photoButtonStyle}
            disabled={
              loading || imageLoading
            }
            onClick={() =>
              galleryInputRef.current?.click()
            }
          >
            🖼️
            <br />
            여러 사진 선택
          </button>
        </div>

        {images.length > 0 && (
          <>
            <div
              style={{
                marginTop: "14px",
                padding: "12px",
                background: "#f3f4f6",
                borderRadius: "10px",
                fontWeight: "bold",
              }}
            >
              ✅ 선택한 사진{" "}
              {images.length}장
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(3, minmax(0, 1fr))",
                gap: "8px",
                marginTop: "12px",
              }}
            >
              {images.map(
                (item, index) => (
                  <div
                    key={item.id}
                    style={{
                      position:
                        "relative",
                    }}
                  >
                    <img
                      src={item.preview}
                      alt={`고객 사진 ${
                        index + 1
                      }`}
                      loading="lazy"
                      decoding="async"
                      style={{
                        width: "100%",
                        aspectRatio:
                          "1 / 1",
                        objectFit:
                          "cover",
                        borderRadius:
                          "10px",
                        display: "block",
                      }}
                    />

                    <button
                      type="button"
                      disabled={
                        loading ||
                        imageLoading
                      }
                      onClick={() =>
                        removeImage(
                          item.id
                        )
                      }
                      style={{
                        position:
                          "absolute",
                        top: "5px",
                        right: "5px",
                        width: "30px",
                        height: "30px",
                        border: "none",
                        borderRadius:
                          "50%",
                        background:
                          "rgba(17,24,39,.85)",
                        color: "#fff",
                        fontSize: "16px",
                      }}
                    >
                      ×
                    </button>
                  </div>
                )
              )}
            </div>
          </>
        )}

        <button
          type="button"
          onClick={handleAnalyze}
          disabled={
            loading ||
            imageLoading ||
            !images.length
          }
          style={{
            width: "100%",
            marginTop: "18px",
            padding: "18px",
            border: "none",
            borderRadius: "14px",
            background: "#111827",
            color: "#ffffff",
            fontSize: "18px",
            fontWeight: "bold",
            cursor: "pointer",
            opacity:
              loading ||
              imageLoading ||
              !images.length
                ? 0.65
                : 1,
          }}
        >
          {imageLoading
            ? "사진 준비 중..."
            : loading
            ? "AI 분석 중..."
            : `${
                images.length || ""
              }장 AI 견적 확인`}
        </button>

        {message && (
          <div
            style={{
              marginTop: "16px",
              padding: "14px",
              borderRadius: "12px",
              background: "#f3f4f6",
              lineHeight: 1.6,
            }}
          >
            {message}
          </div>
        )}
      </section>

      {groups.length > 0 && (
        <section style={sectionStyle}>
          <h2 style={{ marginTop: 0 }}>
            AI 부위별 분석
          </h2>

          <p
            style={{
              color: "#6b7280",
              lineHeight: 1.6,
            }}
          >
            총 {images.length}장의 사진을{" "}
            <strong>
              {groups.length}개 시공 부위
            </strong>
            로 분류했습니다.
          </p>

          {groups.map(
            (group, index) => (
              <div
                key={`${group.key}-${index}`}
                style={{
                  marginTop: "18px",
                  paddingTop:
                    index ? "18px" : 0,
                  borderTop: index
                    ? "1px solid #e5e7eb"
                    : "none",
                }}
              >
                <div
                  style={{
                    fontSize: "20px",
                    fontWeight: "bold",
                  }}
                >
                  {index + 1}.{" "}
                  {group.category}
                  {group.subCategory
                    ? ` · ${group.subCategory}`
                    : ""}
                </div>

                <div
                  style={{
                    marginTop: "5px",
                    color: "#6b7280",
                  }}
                >
                  같은 부위 사진{" "}
                  {group.photos.length}장
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: "6px",
                    overflowX: "auto",
                    marginTop: "10px",
                  }}
                >
                  {group.photos.map(
                    (photo) => (
                      <img
                        key={photo.id}
                        src={photo.preview}
                        alt="분석 사진"
                        loading="lazy"
                        decoding="async"
                        style={{
                          width: "82px",
                          height: "82px",
                          objectFit:
                            "cover",
                          borderRadius:
                            "9px",
                          flexShrink: 0,
                        }}
                      />
                    )
                  )}
                </div>

                {group.estimate ? (
                  <div
                    style={{
                      marginTop: "14px",
                      padding: "14px",
                      background:
                        "#f3f4f6",
                      borderRadius:
                        "12px",
                      lineHeight: 1.7,
                    }}
                  >
                    <strong>
                      {formatWon(
                        group.estimate
                          .min
                      )}
                      원 ~{" "}
                      {formatWon(
                        group.estimate
                          .max
                      )}
                      원
                    </strong>
                    <br />
                    유사 시공{" "}
                    {
                      group.estimate
                        .count
                    }
                    건 · 신뢰도{" "}
                    {
                      group.estimate
                        .confidence
                    }
                  </div>
                ) : (
                  <div
                    style={{
                      marginTop: "14px",
                      padding: "14px",
                      background:
                        "#fff7ed",
                      borderRadius:
                        "12px",
                      lineHeight: 1.6,
                    }}
                  >
                    ⚠️ 실제 시공 데이터가
                    부족하여 상담 확인이
                    필요합니다.
                  </div>
                )}

                {group.similarItems
                  ?.length > 0 && (
                  <div
                    style={{
                      marginTop: "15px",
                    }}
                  >
                    <strong>
                      비슷한 실제 시공사례
                    </strong>

                    {group.similarItems.map(
                      (
                        item,
                        caseIndex
                      ) => (
                        <div
                          key={
                            item.work_item_id ||
                            caseIndex
                          }
                          style={{
                            marginTop:
                              "12px",
                          }}
                        >
                          <div
                            style={{
                              display:
                                "grid",
                              gridTemplateColumns:
                                "1fr 1fr",
                              gap: "7px",
                            }}
                          >
                            {[
                              [
                                item.beforeUrl,
                                "시공 전",
                              ],
                              [
                                item.afterUrl,
                                "시공 후",
                              ],
                            ].map(
                              (
                                [
                                  url,
                                  alt,
                                ],
                                photoIndex
                              ) =>
                                url ? (
                                  <img
                                    key={
                                      photoIndex
                                    }
                                    src={
                                      url
                                    }
                                    alt={
                                      alt
                                    }
                                    loading="lazy"
                                    decoding="async"
                                    style={{
                                      width:
                                        "100%",
                                      aspectRatio:
                                        "1 / 1",
                                      objectFit:
                                        "cover",
                                      borderRadius:
                                        "10px",
                                    }}
                                  />
                                ) : (
                                  <div
                                    key={
                                      photoIndex
                                    }
                                    style={{
                                      aspectRatio:
                                        "1 / 1",
                                      background:
                                        "#f3f4f6",
                                      borderRadius:
                                        "10px",
                                    }}
                                  />
                                )
                            )}
                          </div>

                          <div
                            style={{
                              marginTop:
                                "5px",
                              fontSize:
                                "14px",
                              color:
                                "#4b5563",
                            }}
                          >
                            실제 시공금액{" "}
                            <strong>
                              {formatWon(
                                item.actual_cost
                              )}
                              원
                            </strong>
                            {" · "}유사도{" "}
                            {(
                              Number(
                                item.similarity ||
                                  0
                              ) * 100
                            ).toFixed(
                              1
                            )}
                            %
                          </div>
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>
            )
          )}
        </section>
      )}

      {totalEstimate && (
        <section
          style={{
            ...sectionStyle,
            border:
              "2px solid #111827",
          }}
        >
          <div
            style={{
              color: "#6b7280",
              fontWeight: "bold",
            }}
          >
            부위별 예상견적 합산
          </div>

          <h2>
            총 예상 시공 견적
          </h2>

          <div
            style={{
              fontSize: "30px",
              lineHeight: 1.4,
              fontWeight: "bold",
            }}
          >
            {formatWon(
              totalEstimate.min
            )}
            원
            <br />~{" "}
            {formatWon(
              totalEstimate.max
            )}
            원
          </div>

          <div
            style={{
              marginTop: "14px",
              padding: "12px",
              background: "#f3f4f6",
              borderRadius: "10px",
              lineHeight: 1.7,
            }}
          >
            가중 평균 합계{" "}
            <strong>
              {formatWon(
                totalEstimate.average
              )}
              원
            </strong>
            <br />
            견적 계산 완료{" "}
            <strong>
              {
                totalEstimate.estimatedGroupCount
              }
              /
              {
                totalEstimate.totalGroupCount
              }
              개 부위
            </strong>
          </div>

          {totalEstimate.missingCount >
            0 && (
            <p
              style={{
                color: "#b45309",
                lineHeight: 1.6,
              }}
            >
              ⚠️ 데이터가 부족한{" "}
              {
                totalEstimate.missingCount
              }
              개 부위는 총액에 포함되지
              않았습니다.
            </p>
          )}

          <p
            style={{
              color: "#6b7280",
              fontSize: "14px",
              lineHeight: 1.6,
            }}
          >
            실제 시공금액은 수량, 크기,
            현장상태, 자재 및 추가 작업에
            따라 달라질 수 있습니다.
          </p>
        </section>
      )}

      {groups.length > 0 && (
        <section
          style={{
            ...sectionStyle,
            border:
              "2px solid #111827",
          }}
        >
          <h2
            style={{
              textAlign: "center",
            }}
          >
            💬 정확한 견적 상담받기
          </h2>

          <p
            style={{
              textAlign: "center",
              color: "#6b7280",
              lineHeight: 1.6,
            }}
          >
            사진과 AI 견적을 담당자가
            확인한 후 안내해드립니다.
          </p>

          {leadComplete ? (
            <div
              style={{
                padding: "22px",
                borderRadius: "14px",
                textAlign: "center",
                background: "#ecfdf5",
                lineHeight: 1.8,
              }}
            >
              <div
                style={{
                  fontSize: "25px",
                }}
              >
                ✅
              </div>

              <strong>
                상담 신청 완료
              </strong>
              <br />
              확인 후 연락드리겠습니다.
            </div>
          ) : (
            <form
              onSubmit={
                handleLeadSubmit
              }
            >
              <label
                style={{
                  display: "block",
                  marginBottom:
                    "16px",
                  fontWeight: "bold",
                }}
              >
                이름
                <input
                  value={customerName}
                  onChange={(event) =>
                    setCustomerName(
                      event.target
                        .value
                    )
                  }
                  placeholder="성함"
                  style={inputStyle}
                />
              </label>

              <label
                style={{
                  display: "block",
                  marginBottom:
                    "16px",
                  fontWeight: "bold",
                }}
              >
                연락처
                <input
                  type="tel"
                  inputMode="numeric"
                  value={phone}
                  onChange={(event) =>
                    handlePhoneChange(
                      event.target
                        .value
                    )
                  }
                  placeholder="010-0000-0000"
                  style={inputStyle}
                />
              </label>

              <label
                style={{
                  display: "block",
                  marginBottom:
                    "16px",
                  fontWeight: "bold",
                }}
              >
                시공 지역
                <input
                  value={region}
                  onChange={(event) =>
                    setRegion(
                      event.target
                        .value
                    )
                  }
                  placeholder="예: 인천 송도"
                  style={inputStyle}
                />
              </label>

              <label
                style={{
                  display: "flex",
                  gap: "9px",
                  alignItems:
                    "flex-start",
                  fontSize: "14px",
                  lineHeight: 1.5,
                  color: "#4b5563",
                  marginTop: "14px",
                }}
              >
                <input
                  type="checkbox"
                  checked={
                    privacyAgree
                  }
                  onChange={(event) =>
                    setPrivacyAgree(
                      event.target
                        .checked
                    )
                  }
                  style={{
                    width: "20px",
                    height: "20px",
                    flexShrink: 0,
                  }}
                />

                상담을 위한 이름, 연락처,
                시공지역, 사진 및 견적정보
                수집과 상담 연락에
                동의합니다.
              </label>

              {leadMessage && (
                <div
                  style={{
                    marginTop:
                      "15px",
                    padding: "12px",
                    borderRadius:
                      "10px",
                    background:
                      "#f3f4f6",
                    lineHeight: 1.6,
                  }}
                >
                  {leadMessage}
                </div>
              )}

              <button
                type="submit"
                disabled={leadLoading}
                style={{
                  width: "100%",
                  marginTop: "20px",
                  padding: "18px",
                  border: "none",
                  borderRadius:
                    "14px",
                  background:
                    "#111827",
                  color: "#ffffff",
                  fontSize: "18px",
                  fontWeight: "bold",
                  opacity: leadLoading
                    ? 0.65
                    : 1,
                }}
              >
                {leadLoading
                  ? "상담 신청 중..."
                  : "무료 정확한 견적 상담 신청"}
              </button>
            </form>
          )}
        </section>
      )}

      <div
        style={{
          textAlign: "center",
          marginTop: "35px",
          color: "#9ca3af",
          fontSize: "13px",
          lineHeight: 1.6,
        }}
      >
        기분좋은공간
        <br />
        AI 인테리어필름 견적
      </div>
    </main>
  );
              }
