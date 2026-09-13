"use client";

import { useRef, useState } from "react";
import { supabase } from "../lib/supabase";

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

  function makeId() {
    if (
      typeof crypto !== "undefined" &&
      crypto.randomUUID
    ) {
      return crypto.randomUUID();
    }

    return `${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`;
  }

  function formatWon(value) {
    return Number(value || 0).toLocaleString("ko-KR");
  }

  function resetResults() {
    setGroups([]);
    setTotalEstimate(null);
    setLeadComplete(false);
    setLeadMessage("");
  }

  function handlePhoneChange(value) {
    const numbers = value
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
      const img = new Image();

      img.onload = () => {
        resolve(img);
      };

      img.onerror = () => {
        reject(
          new Error("사진을 불러올 수 없습니다.")
        );
      };

      img.src = dataUrl;
    });
  }

  async function prepareImage(
    file,
    maxSize = 1600,
    quality = 0.82
  ) {
    const dataUrl = await fileToDataUrl(file);
    const img = await loadImageFromDataUrl(dataUrl);

    let width =
      img.naturalWidth || img.width;

    let height =
      img.naturalHeight || img.height;

    if (!width || !height) {
      throw new Error(
        "사진 크기를 확인할 수 없습니다."
      );
    }

    if (
      width > maxSize ||
      height > maxSize
    ) {
      if (width >= height) {
        height = Math.round(
          (height * maxSize) / width
        );
        width = maxSize;
      } else {
        width = Math.round(
          (width * maxSize) / height
        );
        height = maxSize;
      }
    }

    const canvas =
      document.createElement("canvas");

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");

    if (!ctx) {
      throw new Error(
        "이미지 처리 기능을 사용할 수 없습니다."
      );
    }

    ctx.drawImage(
      img,
      0,
      0,
      width,
      height
    );

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

    const convertedFile =
      new File(
        [blob],
        `customer-${makeId()}.jpg`,
        {
          type: "image/jpeg",
        }
      );

    const preview =
      await fileToDataUrl(convertedFile);

    return {
      file: convertedFile,
      preview,
    };
  }

  async function addImages(fileList) {
    const files =
      Array.from(fileList || []);

    if (!files.length) return;

    const remaining =
      Math.max(
        0,
        10 - images.length
      );

    if (remaining <= 0) {
      setMessage(
        "사진은 최대 10장까지 선택할 수 있습니다."
      );
      return;
    }

    const selected =
      files.slice(0, remaining);

    setImageLoading(true);
    setMessage(
      `사진을 준비하고 있습니다... 0/${selected.length}`
    );

    resetResults();

    try {
      const additions = [];

      for (
        let i = 0;
        i < selected.length;
        i += 1
      ) {
        const file = selected[i];

        setMessage(
          `사진을 준비하고 있습니다... ${i + 1}/${selected.length}`
        );

        try {
          const prepared =
            await prepareImage(
              file,
              1600,
              0.82
            );

          additions.push({
            id: makeId(),
            file: prepared.file,
            preview: prepared.preview,
          });
        } catch (error) {
          console.error(
            `사진 ${i + 1} 처리 실패`,
            error
          );
        }
      }

      if (!additions.length) {
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
          `⚠️ ${selected.length}장 중 ${additions.length}장만 정상적으로 불러왔습니다.`
        );
      } else if (
        files.length > remaining
      ) {
        setMessage(
          `✅ 사진 ${additions.length}장을 추가했습니다. 최대 10장까지 가능합니다.`
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
    setImages(
      (current) =>
        current.filter(
          (item) =>
            item.id !== id
        )
    );

    resetResults();
    setMessage("");
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

  function normalizeCategory(
    value
  ) {
    const text =
      String(value || "")
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

  function getGroupKey(
    analysis
  ) {
    return normalizeCategory(
      `${
        analysis?.category || ""
      } ${
        analysis?.sub_category ||
        ""
      }`
    );
  }

  async function getSignedImageUrl(
    path
  ) {
    if (!path) return null;

    try {
      const {
        data,
        error,
      } = await supabase.storage
        .from("work-photos")
        .createSignedUrl(
          path,
          60 * 60
        );

      if (error) {
        console.error(error);
        return null;
      }

      return (
        data?.signedUrl ||
        null
      );
    } catch (error) {
      console.error(error);
      return null;
    }
  }

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
        `${index + 1}번째 사진 분석 실패`
      );
    }

    return {
      ...imageItem,
      analysis:
        result.analysis,
    };
  }

  async function findSimilarCases(
    group
  ) {
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
        group.category || ""
      }`,
      `세부 부위: ${
        group.subCategory || ""
      }`,
      `사진 수: ${
        group.photos.length
      }`,
      ...analyses.map(
        (item, index) =>
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

    const embeddingResponse =
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
              text: searchText,
            }),
        }
      );

    const embeddingResult =
      await readJsonSafely(
        embeddingResponse
      );

    if (
      !embeddingResponse.ok ||
      !embeddingResult?.embedding
    ) {
      throw new Error(
        embeddingResult?.error ||
        "유사사례 검색 데이터를 만들지 못했습니다."
      );
    }

    const {
      data,
      error,
    } = await supabase.rpc(
      "get_public_similar_cases",
      {
        query_embedding:
          embeddingResult.embedding,
        match_threshold:
          0.65,
        match_count: 20,
      }
    );

    if (error) {
      throw new Error(
        `유사사례 검색 오류: ${error.message}`
      );
    }

    const filtered =
      (data || [])
        .filter((item) => {
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
        })
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

      if (seen.has(id)) {
        continue;
      }

      seen.add(id);
      unique.push(item);
    }

    return unique;
  }

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
        similarity >= 0.65
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
    };
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

    try {
      const analyzedPhotos =
        [];

      for (
        let i = 0;
        i < images.length;
        i += 1
      ) {
        const result =
          await analyzeOnePhoto(
            images[i],
            i,
            images.length
          );

        analyzedPhotos.push(
          result
        );
      }

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
          !groupMap.has(key)
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
          .photos.push(photo);
      }

      const baseGroups =
        Array.from(
          groupMap.values()
        );

      const completedGroups =
        [];

      for (
        let i = 0;
        i < baseGroups.length;
        i += 1
      ) {
        const group =
          baseGroups[i];

        setMessage(
          `유사 시공사례 검색 중... ${
            i + 1
          }/${
            baseGroups.length
          } · ${
            group.category
          }`
        );

        let cases = [];
        let groupEstimate =
          null;

        try {
          cases =
            await findSimilarCases(
              group
            );

          groupEstimate =
            calculateEstimate(
              cases
            );
        } catch (error) {
          console.error(
            error
          );
        }

        const casesWithImages =
          await Promise.all(
            cases
              .slice(0, 3)
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
            similarItems:
              casesWithImages,
            estimate:
              groupEstimate,
          }
        );
      }

      setGroups(
        completedGroups
      );

      const validEstimates =
        completedGroups
          .map(
            (item) =>
              item.estimate
          )
          .filter(Boolean);

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

        setTotalEstimate({
          min,
          max,
          average,
          estimatedGroupCount:
            validEstimates.length,
          totalGroupCount:
            completedGroups.length,
          missingCount,
        });

        if (
          missingCount > 0
        ) {
          setMessage(
            `⚠️ ${validEstimates.length}개 부위는 견적을 계산했고, ${missingCount}개 부위는 과거 데이터가 부족합니다. 총액에는 계산 가능한 부위만 포함되었습니다.`
          );
        } else {
          setMessage(
            `✅ ${completedGroups.length}개 시공 부위를 분석하여 부위별 견적과 총 예상견적을 계산했습니다.`
          );
        }
      } else {
        setTotalEstimate(
          null
        );

        setMessage(
          "⚠️ 사진 분석은 완료했지만 현재 DB에 같은 부위의 실제 시공 데이터가 부족합니다. 정확한 상담을 신청해주세요."
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

  async function uploadLeadPhotos() {
    const paths = [];

    for (
      let i = 0;
      i < images.length;
      i += 1
    ) {
      const path =
        `leads/${makeId()}.jpg`;

      const {
        error,
      } = await supabase.storage
        .from("work-photos")
        .upload(
          path,
          images[i].file,
          {
            cacheControl:
              "3600",
            contentType:
              "image/jpeg",
            upsert: false,
          }
        );

      if (error) {
        console.error(
          `상담 사진 ${
            i + 1
          } 저장 실패:`,
          error
        );

        continue;
      }

      paths.push(path);
    }

    return paths;
  }

  async function handleLeadSubmit(
    event
  ) {
    event.preventDefault();

    if (!groups.length) {
      setLeadMessage(
        "먼저 사진 AI 분석을 진행해주세요."
      );
      return;
    }

    if (
      !customerName.trim()
    ) {
      setLeadMessage(
        "이름을 입력해주세요."
      );
      return;
    }

    const phoneNumbers =
      phone.replace(
        /[^0-9]/g,
        ""
      );

    if (
      phoneNumbers.length <
      9
    ) {
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
        groups.map(
          (group) => ({
            group_key:
              group.key,

            category:
              group.category,

            sub_category:
              group.subCategory,

            photo_count:
              group.photos
                .length,

            estimate_min:
              group.estimate
                ?.min ??
              null,

            estimate_max:
              group.estimate
                ?.max ??
              null,

            estimate_average:
              group.estimate
                ?.average ??
              null,

            confidence:
              group.estimate
                ?.confidence ||
              "데이터 부족",

            similar_count:
              group.estimate
                ?.count ||
              0,
          })
        );

      const description =
        groups
          .map(
            (
              group,
              index
            ) => {
              const descriptions =
                group.photos
                  .map(
                    (
                      photo
                    ) =>
                      photo
                        .analysis
                        ?.description ||
                      ""
                  )
                  .filter(
                    Boolean
                  )
                  .join(
                    " / "
                  );

              return `${
                index + 1
              }. ${
                group.category
              }${
                group.subCategory
                  ? ` · ${group.subCategory}`
                  : ""
              } (${
                group.photos
                  .length
              }장): ${descriptions}`;
            }
          )
          .join("\n");

      const categoryText =
        groups
          .map(
            (group) =>
              group.category
          )
          .filter(Boolean)
          .join(", ");

      const memoLines =
        groups.map(
          (group) => {
            if (
              !group.estimate
            ) {
              return `${group.category}: 데이터 부족`;
            }

            return `${
              group.category
            }: ${formatWon(
              group.estimate
                .min
            )}~${formatWon(
              group.estimate
                .max
            )}원`;
          }
        );

      const response =
        await fetch(
          "/api/lead",
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                customer_name:
                  customerName.trim(),

                phone:
                  phone.trim(),

                region:
                  region.trim(),

                category:
                  categoryText ||
                  null,

                sub_category:
                  groups.length ===
                  1
                    ? groups[0]
                        .subCategory
                    : "다중부위",

                ai_description:
                  description,

                estimate_min:
                  totalEstimate
                    ?.min ??
                  null,

                estimate_max:
                  totalEstimate
                    ?.max ??
                  null,

                estimate_average:
                  totalEstimate
                    ?.average ??
                  null,

                customer_photo_path:
                  customerPhotoPaths[
                    0
                  ] ||
                  null,

                customer_photo_paths:
                  customerPhotoPaths,

                estimate_details:
                  estimateDetails,

                memo:
                  `다중사진 AI 견적\n${memoLines.join(
                    "\n"
                  )}`,
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
          "상담 신청 저장 오류"
        );
      }

      setLeadComplete(
        true
      );

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
      setLeadLoading(
        false
      );
    }
  }

  const sectionStyle = {
    marginTop: "24px",
    padding: "22px",
    border:
      "1px solid #e5e7eb",
    borderRadius: "20px",
    background: "#ffffff",
  };

  const inputStyle = {
    width: "100%",
    padding: "15px",
    marginTop: "7px",
    fontSize: "16px",
    border:
      "1px solid #d1d5db",
    borderRadius: "12px",
    boxSizing:
      "border-box",
  };

  const photoButtonStyle = {
    flex: 1,
    minHeight: "72px",
    border:
      "1px solid #d1d5db",
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
        padding:
          "28px 18px 70px",
        fontFamily:
          "Arial, sans-serif",
        background: "#f8fafc",
        minHeight: "100vh",
        boxSizing:
          "border-box",
      }}
    >
      <div
        style={{
          display:
            "inline-block",
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
          lineHeight: "1.3",
          color: "#111827",
        }}
      >
        AI 인테리어필름 견적
      </h1>

      <p
        style={{
          marginTop: 0,
          color: "#6b7280",
          fontSize: "17px",
          lineHeight: "1.7",
        }}
      >
        여러 시공 부위의 사진을 한 번에 올려주세요.
        AI가 같은 부위의 사진을 묶어 각각 견적을 계산하고
        마지막에 총 예상견적을 보여드립니다.
      </p>

      <section
        style={
          sectionStyle
        }
      >
        <h2
          style={{
            marginTop: 0,
            fontSize: "21px",
          }}
        >
          1. 시공할 곳 사진
        </h2>

        <p
          style={{
            color: "#6b7280",
            lineHeight: "1.6",
          }}
        >
          같은 부위를 여러 각도에서 촬영해도 됩니다.
          다른 시공 부위 사진도 함께 선택할 수 있습니다.
          최대 10장까지 가능합니다.
        </p>

        <input
          ref={
            cameraInputRef
          }
          type="file"
          accept="image/*"
          capture="environment"
          style={{
            display: "none",
          }}
          onChange={
            async (
              event
            ) => {
              await addImages(
                event.target
                  .files
              );

              event.target.value =
                "";
            }
          }
        />

        <input
          ref={
            galleryInputRef
          }
          type="file"
          accept="image/*"
          multiple
          style={{
            display: "none",
          }}
          onChange={
            async (
              event
            ) => {
              await addImages(
                event.target
                  .files
              );

              event.target.value =
                "";
            }
          }
        />

        <div
          style={{
            display: "flex",
            gap: "10px",
          }}
        >
          <button
            type="button"
            style={
              photoButtonStyle
            }
            disabled={
              loading ||
              imageLoading
            }
            onClick={() =>
              cameraInputRef
                .current
                ?.click()
            }
          >
            📷
            <br />
            사진 추가 촬영
          </button>

          <button
            type="button"
            style={
              photoButtonStyle
            }
            disabled={
              loading ||
              imageLoading
            }
            onClick={() =>
              galleryInputRef
                .current
                ?.click()
            }
          >
            🖼️
            <br />
            여러 사진 선택
          </button>
        </div>

        {images.length >
          0 && (
          <>
            <div
              style={{
                marginTop:
                  "14px",
                padding: "12px",
                background:
                  "#f3f4f6",
                borderRadius:
                  "10px",
                fontWeight:
                  "bold",
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
                marginTop:
                  "12px",
              }}
            >
              {images.map(
                (
                  item,
                  index
                ) => (
                  <div
                    key={
                      item.id
                    }
                    style={{
                      position:
                        "relative",
                    }}
                  >
                    <img
                      src={
                        item.preview
                      }
                      alt={`고객 사진 ${
                        index +
                        1
                      }`}
                      style={{
                        width:
                          "100%",
                        aspectRatio:
                          "1 / 1",
                        objectFit:
                          "cover",
                        borderRadius:
                          "10px",
                        display:
                          "block",
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
                        right:
                          "5px",
                        width:
                          "30px",
                        height:
                          "30px",
                        border:
                          "none",
                        borderRadius:
                          "50%",
                        background:
                          "rgba(17,24,39,0.85)",
                        color:
                          "#ffffff",
                        fontSize:
                          "16px",
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
          onClick={
            handleAnalyze
          }
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
            : `${images.length || ""}장 AI 견적 확인`}
        </button>

        {message && (
          <div
            style={{
              marginTop: "16px",
              padding: "14px",
              borderRadius: "12px",
              background:
                "#f3f4f6",
              lineHeight: "1.6",
              color: "#374151",
            }}
          >
            {message}
          </div>
        )}
      </section>

      {groups.length >
        0 && (
        <section
          style={
            sectionStyle
          }
        >
          <h2
            style={{
              marginTop: 0,
            }}
          >
            AI 부위별 분석
          </h2>

          <p
            style={{
              color: "#6b7280",
              lineHeight: "1.6",
            }}
          >
            총 {images.length}장의
            사진을{" "}
            <strong>
              {groups.length}개
              시공 부위
            </strong>
            로 분류했습니다.
          </p>

          {groups.map(
            (
              group,
              index
            ) => (
              <div
                key={`${group.key}-${index}`}
                style={{
                  marginTop:
                    "18px",
                  paddingTop:
                    index
                      ? "18px"
                      : 0,
                  borderTop:
                    index
                      ? "1px solid #e5e7eb"
                      : "none",
                }}
              >
                <div
                  style={{
                    fontSize:
                      "20px",
                    fontWeight:
                      "bold",
                  }}
                >
                  {index + 1}.{" "}
                  {
                    group.category
                  }
                  {group.subCategory
                    ? ` · ${group.subCategory}`
                    : ""}
                </div>

                <div
                  style={{
                    marginTop:
                      "5px",
                    color:
                      "#6b7280",
                  }}
                >
                  같은 부위 사진{" "}
                  {
                    group.photos
                      .length
                  }
                  장
                </div>

                <div
                  style={{
                    display:
                      "flex",
                    gap: "6px",
                    overflowX:
                      "auto",
                    marginTop:
                      "10px",
                  }}
                >
                  {group.photos.map(
                    (
                      photo
                    ) => (
                      <img
                        key={
                          photo.id
                        }
                        src={
                          photo.preview
                        }
                        alt="분석 사진"
                        style={{
                          width:
                            "82px",
                          height:
                            "82px",
                          objectFit:
                            "cover",
                          borderRadius:
                            "9px",
                          flexShrink:
                            0,
                        }}
                      />
                    )
                  )}
                </div>

                {group.estimate ? (
                  <div
                    style={{
                      marginTop:
                        "14px",
                      padding:
                        "14px",
                      background:
                        "#f3f4f6",
                      borderRadius:
                        "12px",
                      lineHeight:
                        "1.7",
                    }}
                  >
                    <strong>
                      {formatWon(
                        group
                          .estimate
                          .min
                      )}
                      원 ~{" "}
                      {formatWon(
                        group
                          .estimate
                          .max
                      )}
                      원
                    </strong>

                    <br />

                    유사 시공{" "}
                    {
                      group
                        .estimate
                        .count
                    }
                    건 · 신뢰도{" "}
                    {
                      group
                        .estimate
                        .confidence
                    }
                  </div>
                ) : (
                  <div
                    style={{
                      marginTop:
                        "14px",
                      padding:
                        "14px",
                      background:
                        "#fff7ed",
                      borderRadius:
                        "12px",
                      lineHeight:
                        "1.6",
                    }}
                  >
                    ⚠️ 같은 부위의
                    실제 시공 데이터가
                    부족하여 상담
                    확인이 필요합니다.
                  </div>
                )}

                {group
                  .similarItems
                  ?.length >
                  0 && (
                  <div
                    style={{
                      marginTop:
                        "15px",
                    }}
                  >
                    <strong>
                      비슷한 실제
                      시공사례
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
                              gap:
                                "7px",
                            }}
                          >
                            {item.beforeUrl ? (
                              <img
                                src={
                                  item.beforeUrl
                                }
                                alt="시공 전"
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
                                style={{
                                  aspectRatio:
                                    "1 / 1",
                                  background:
                                    "#f3f4f6",
                                  borderRadius:
                                    "10px",
                                }}
                              />
                            )}

                            {item.afterUrl ? (
                              <img
                                src={
                                  item.afterUrl
                                }
                                alt="시공 후"
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
                                style={{
                                  aspectRatio:
                                    "1 / 1",
                                  background:
                                    "#f3f4f6",
                                  borderRadius:
                                    "10px",
                                }}
                              />
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
                            {" · "}
                            유사도{" "}
                            {(
                              Number(
                                item.similarity ||
                                  0
                              ) *
                              100
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

          <h2
            style={{
              marginBottom:
                "10px",
            }}
          >
            총 예상 시공 견적
          </h2>

          <div
            style={{
              fontSize: "30px",
              lineHeight: "1.4",
              fontWeight: "bold",
            }}
          >
            {formatWon(
              totalEstimate.min
            )}
            원
            <br />
            ~{" "}
            {formatWon(
              totalEstimate.max
            )}
            원
          </div>

          <div
            style={{
              marginTop: "14px",
              padding: "12px",
              background:
                "#f3f4f6",
              borderRadius: "10px",
              lineHeight: "1.7",
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
                lineHeight:
                  "1.6",
              }}
            >
              ⚠️ 데이터가 부족한{" "}
              {
                totalEstimate.missingCount
              }
              개 부위는 위 총액에
              포함되지 않았습니다.
              상담 시 함께
              확인합니다.
            </p>
          )}

          <p
            style={{
              marginBottom: 0,
              color: "#6b7280",
              fontSize: "14px",
              lineHeight: "1.6",
            }}
          >
            실제 과거 시공금액을
            기반으로 계산한
            예상견적입니다.
            수량·크기·현장상태·자재
            및 추가 작업에 따라
            최종 금액은 달라질 수
            있습니다.
          </p>
        </section>
      )}

      {groups.length >
        0 && (
        <section
          style={{
            ...sectionStyle,
            border:
              "2px solid #111827",
          }}
        >
          <div
            style={{
              textAlign:
                "center",
              fontSize: "28px",
            }}
          >
            💬
          </div>

          <h2
            style={{
              textAlign:
                "center",
              marginBottom:
                "8px",
            }}
          >
            정확한 견적 상담받기
          </h2>

          <p
            style={{
              textAlign:
                "center",
              color: "#6b7280",
              lineHeight: "1.6",
            }}
          >
            보내주신 사진 전체와
            부위별 AI 견적을
            담당자가 확인한 뒤
            안내해드립니다.
          </p>

          {leadComplete ? (
            <div
              style={{
                padding: "22px",
                borderRadius:
                  "14px",
                textAlign:
                  "center",
                background:
                  "#ecfdf5",
                lineHeight: "1.8",
              }}
            >
              <div
                style={{
                  fontSize:
                    "25px",
                }}
              >
                ✅
              </div>

              <strong>
                상담 신청 완료
              </strong>

              <br />

              담당자가 확인 후
              연락드리겠습니다.
            </div>
          ) : (
            <form
              onSubmit={
                handleLeadSubmit
              }
            >
              <label
                style={{
                  display:
                    "block",
                  marginBottom:
                    "16px",
                  fontWeight:
                    "bold",
                }}
              >
                이름

                <input
                  value={
                    customerName
                  }
                  onChange={(e) =>
                    setCustomerName(
                      e.target
                        .value
                    )
                  }
                  placeholder="성함"
                  style={
                    inputStyle
                  }
                />
              </label>

              <label
                style={{
                  display:
                    "block",
                  marginBottom:
                    "16px",
                  fontWeight:
                    "bold",
                }}
              >
                연락처

                <input
                  type="tel"
                  inputMode="numeric"
                  value={phone}
                  onChange={(e) =>
                    handlePhoneChange(
                      e.target
                        .value
                    )
                  }
                  placeholder="010-0000-0000"
                  style={
                    inputStyle
                  }
                />
              </label>

              <label
                style={{
                  display:
                    "block",
                  marginBottom:
                    "16px",
                  fontWeight:
                    "bold",
                }}
              >
                시공 지역

                <input
                  value={region}
                  onChange={(e) =>
                    setRegion(
                      e.target
                        .value
                    )
                  }
                  placeholder="예: 인천 송도"
                  style={
                    inputStyle
                  }
                />
              </label>

              <label
                style={{
                  display:
                    "flex",
                  gap: "9px",
                  alignItems:
                    "flex-start",
                  fontSize:
                    "14px",
                  lineHeight: "1.5",
                  color:
                    "#4b5563",
                  marginTop:
                    "14px",
                }}
              >
                <input
                  type="checkbox"
                  checked={
                    privacyAgree
                  }
                  onChange={(e) =>
                    setPrivacyAgree(
                      e.target
                        .checked
                    )
                  }
                  style={{
                    width:
                      "20px",
                    height:
                      "20px",
                    marginTop:
                      "1px",
                    flexShrink: 0,
                  }}
                />

                상담을 위한 이름,
                연락처, 시공지역,
                고객 사진 및 견적
                정보 수집과 상담
                연락에 동의합니다.
              </label>

              {leadMessage && (
                <div
                  style={{
                    marginTop:
                      "15px",
                    padding:
                      "12px",
                    borderRadius:
                      "10px",
                    background:
                      "#f3f4f6",
                    lineHeight:
                      "1.6",
                  }}
                >
                  {
                    leadMessage
                  }
                </div>
              )}

              <button
                type="submit"
                disabled={
                  leadLoading
                }
                style={{
                  width: "100%",
                  marginTop:
                    "20px",
                  padding:
                    "18px",
                  border: "none",
                  borderRadius:
                    "14px",
                  background:
                    "#111827",
                  color:
                    "#ffffff",
                  fontSize:
                    "18px",
                  fontWeight:
                    "bold",
                  cursor:
                    "pointer",
                  opacity:
                    leadLoading
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
          lineHeight: "1.6",
        }}
      >
        기분좋은공간
        <br />
        AI 인테리어필름 견적
      </div>
    </main>
  );
  }
