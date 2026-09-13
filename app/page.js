"use client";

import { useRef, useState } from "react";
import { supabase } from "../lib/supabase";

export default function Home() {
  const [image, setImage] = useState(null);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const [analysis, setAnalysis] = useState(null);
  const [similarItems, setSimilarItems] = useState([]);
  const [estimate, setEstimate] = useState(null);

  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [region, setRegion] = useState("");
  const [privacyAgree, setPrivacyAgree] = useState(false);

  const [leadLoading, setLeadLoading] = useState(false);
  const [leadComplete, setLeadComplete] = useState(false);
  const [leadMessage, setLeadMessage] = useState("");

  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);

  function selectImage(file) {
    if (!file) return;

    setImage(file);

    setMessage("");
    setAnalysis(null);
    setSimilarItems([]);
    setEstimate(null);

    setLeadComplete(false);
    setLeadMessage("");
  }

  function formatWon(value) {
    return Number(value || 0).toLocaleString("ko-KR");
  }

  function handlePhoneChange(value) {
    const numbers = value.replace(/[^0-9]/g, "").slice(0, 11);

    if (numbers.length <= 3) {
      setPhone(numbers);
      return;
    }

    if (numbers.length <= 7) {
      setPhone(
        numbers.slice(0, 3) +
          "-" +
          numbers.slice(3)
      );
      return;
    }

    setPhone(
      numbers.slice(0, 3) +
        "-" +
        numbers.slice(3, 7) +
        "-" +
        numbers.slice(7)
    );
  }

  async function resizeImage(file, maxSize = 1600) {
    return new Promise((resolve, reject) => {
      const img = new Image();

      const objectUrl =
        URL.createObjectURL(file);

      img.onload = () => {
        try {
          let width = img.width;
          let height = img.height;

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

          const ctx =
            canvas.getContext("2d");

          if (!ctx) {
            URL.revokeObjectURL(objectUrl);

            reject(
              new Error(
                "이미지 처리에 실패했습니다."
              )
            );

            return;
          }

          ctx.drawImage(
            img,
            0,
            0,
            width,
            height
          );

          canvas.toBlob(
            (blob) => {
              URL.revokeObjectURL(objectUrl);

              if (!blob) {
                reject(
                  new Error(
                    "이미지 변환에 실패했습니다."
                  )
                );

                return;
              }

              resolve(
                new File(
                  [blob],
                  "customer-photo.jpg",
                  {
                    type: "image/jpeg",
                  }
                )
              );
            },
            "image/jpeg",
            0.82
          );
        } catch (error) {
          URL.revokeObjectURL(objectUrl);

          reject(error);
        }
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);

        reject(
          new Error(
            "사진을 불러올 수 없습니다."
          )
        );
      };

      img.src = objectUrl;
    });
  }

  async function readJsonSafely(response) {
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

  async function getSignedImageUrl(path) {
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

  async function handleAnalyze() {
    if (!image) {
      setMessage(
        "사진을 선택해주세요."
      );

      return;
    }

    setLoading(true);

    setMessage(
      "사진을 준비하고 있습니다..."
    );

    setAnalysis(null);
    setSimilarItems([]);
    setEstimate(null);

    setLeadComplete(false);
    setLeadMessage("");

    try {
      const resizedImage =
        await resizeImage(image);

      setMessage(
        "AI가 시공 부위를 분석하고 있습니다..."
      );

      const analyzeFormData =
        new FormData();

      analyzeFormData.append(
        "image",
        resizedImage
      );

      analyzeFormData.append(
        "photoType",
        "before"
      );

      const analyzeResponse =
        await fetch(
          "/api/analyze",
          {
            method: "POST",
            body: analyzeFormData,
          }
        );

      const analyzeResult =
        await readJsonSafely(
          analyzeResponse
        );

      if (!analyzeResponse.ok) {
        throw new Error(
          analyzeResult?.error ||
            "AI 사진 분석에 실패했습니다."
        );
      }

      if (
        !analyzeResult?.analysis
      ) {
        throw new Error(
          "AI 분석 결과가 없습니다."
        );
      }

      const aiAnalysis =
        analyzeResult.analysis;

      setAnalysis(aiAnalysis);

      const tags =
        Array.isArray(
          aiAnalysis?.tags
        )
          ? aiAnalysis.tags
          : [];

      const searchText = [
        `시공 부위: ${
          aiAnalysis?.category || ""
        }`,
        `세부 부위: ${
          aiAnalysis?.sub_category || ""
        }`,
        `사진 설명: ${
          aiAnalysis?.description || ""
        }`,
        `특징: ${tags.join(", ")}`,
      ]
        .filter(Boolean)
        .join("\n");

      setMessage(
        "과거 실제 시공사례와 비교하고 있습니다..."
      );

      const embeddingResponse =
        await fetch(
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

      const embedding =
        embeddingResult.embedding;

      /*
        고객은 DB 테이블을 직접 조회하지 않고
        공개용 RPC를 통해 필요한 정보만 받습니다.
      */

      const {
        data: matchedCases,
        error: matchError,
      } = await supabase.rpc(
        "get_public_similar_cases",
        {
          query_embedding:
            embedding,
          match_threshold:
            0.65,
          match_count:
            20,
        }
      );

      if (matchError) {
        throw new Error(
          `유사사례 검색 오류: ${matchError.message}`
        );
      }

      const customerGroup =
        normalizeCategory(
          `${
            aiAnalysis?.category || ""
          } ${
            aiAnalysis?.sub_category ||
            ""
          }`
        );

      const filteredCases =
        (matchedCases || [])
          .filter((item) => {
            const itemGroup =
              normalizeCategory(
                `${
                  item.category || ""
                } ${
                  item.sub_category ||
                  ""
                }`
              );

            return (
              itemGroup ===
                customerGroup &&
              Number(
                item.actual_cost ||
                  0
              ) > 0
            );
          })
          .slice(0, 10);

      if (
        filteredCases.length ===
        0
      ) {
        setSimilarItems([]);
        setEstimate(null);

        setMessage(
          "⚠️ 같은 시공 부위의 과거 사례가 아직 부족합니다. 아래에서 정확한 견적 상담을 신청해주세요."
        );

        return;
      }

      /*
        고객에게 보여줄 시공 전후 사진의
        임시 Signed URL 생성
      */

      const casesWithImages =
        await Promise.all(
          filteredCases.map(
            async (item) => {
              const beforeUrl =
                await getSignedImageUrl(
                  item.before_path
                );

              const afterUrl =
                await getSignedImageUrl(
                  item.after_path
                );

              return {
                ...item,
                beforeUrl,
                afterUrl,
              };
            }
          )
        );

      setSimilarItems(
        casesWithImages
      );

      /*
        유사도 제곱을 가중치로 사용해
        실제 과거 시공금액 기반 견적 계산
      */

      let weightedCostTotal = 0;
      let weightTotal = 0;

      for (const item of filteredCases) {
        const cost =
          Number(
            item.actual_cost || 0
          );

        const similarity =
          Number(
            item.similarity || 0
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

          weightTotal += weight;
        }
      }

      if (weightTotal <= 0) {
        setEstimate(null);

        setMessage(
          "⚠️ 견적 계산에 사용할 데이터가 부족합니다."
        );

        return;
      }

      const weightedAverage =
        weightedCostTotal /
        weightTotal;

      const minEstimate =
        Math.round(
          (weightedAverage *
            0.9) /
            1000
        ) * 1000;

      const maxEstimate =
        Math.round(
          (weightedAverage *
            1.1) /
            1000
        ) * 1000;

      const averageEstimate =
        Math.round(
          weightedAverage /
            1000
        ) * 1000;

      const topSimilarity =
        filteredCases.length > 0
          ? Number(
              filteredCases[0]
                .similarity || 0
            )
          : 0;

      let confidence =
        "낮음";

      if (
        filteredCases.length >=
          5 &&
        topSimilarity >= 0.85
      ) {
        confidence = "높음";
      } else if (
        filteredCases.length >=
          2 &&
        topSimilarity >= 0.75
      ) {
        confidence = "보통";
      }

      setEstimate({
        min: minEstimate,
        max: maxEstimate,
        average:
          averageEstimate,
        count:
          filteredCases.length,
        confidence,
      });

      setMessage(
        `✅ 실제 과거 시공사례 ${filteredCases.length}건을 기준으로 예상 견적을 계산했습니다.`
      );
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

  async function uploadLeadPhoto() {
    if (!image) return null;

    const resized =
      await resizeImage(
        image,
        1800
      );

    let randomId;

    if (
      typeof crypto !==
        "undefined" &&
      crypto.randomUUID
    ) {
      randomId =
        crypto.randomUUID();
    } else {
      randomId =
        `${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}`;
    }

    const path =
      `leads/${randomId}.jpg`;

    const {
      error,
    } = await supabase.storage
      .from("work-photos")
      .upload(
        path,
        resized,
        {
          cacheControl:
            "3600",
          contentType:
            "image/jpeg",
          upsert: false,
        }
      );

    if (error) {
      throw new Error(
        `상담 사진 저장 실패: ${error.message}`
      );
    }

    return path;
  }

  async function handleLeadSubmit(
    event
  ) {
    event.preventDefault();

    if (!analysis) {
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
      "상담 신청을 접수하고 있습니다..."
    );

    try {
      let customerPhotoPath =
        null;

      try {
        customerPhotoPath =
          await uploadLeadPhoto();
      } catch (photoError) {
        console.error(
          photoError
        );

        /*
          사진 업로드가 실패하더라도
          연락처 상담 신청 자체는 계속 진행
        */
      }

      

            const response = await fetch("/api/lead", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    customer_name: customerName.trim(),
    phone: phone.trim(),
    region: region.trim(),

    category:
      analysis?.category || null,

    sub_category:
      analysis?.sub_category || null,

    ai_description:
      analysis?.description || null,

    estimate_min:
      estimate?.min || null,

    estimate_max:
      estimate?.max || null,

    estimate_average:
      estimate?.average || null,

    customer_photo_path:
      customerPhotoPath,

    memo:
      estimate
        ? `AI 견적 신뢰도: ${estimate.confidence || ""}`
        : "AI 분석 후 상담 신청",
  }),
});

const result = await response.json();

if (!response.ok || !result.success) {
  throw new Error(
    result.error || "상담 신청 저장 오류"
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
    boxSizing: "border-box",
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
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          display:
            "inline-block",
          background: "#111827",
          color: "#ffffff",
          padding:
            "8px 14px",
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
        시공할 곳을 촬영하거나
        사진을 선택하면 AI가
        분석하고 실제 과거
        시공사례를 바탕으로 예상
        견적을 계산합니다.
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
          onChange={(event) => {
            selectImage(
              event.target
                .files?.[0]
            );

            event.target.value =
              "";
          }}
        />

        <input
          ref={
            galleryInputRef
          }
          type="file"
          accept="image/*"
          style={{
            display: "none",
          }}
          onChange={(event) => {
            selectImage(
              event.target
                .files?.[0]
            );

            event.target.value =
              "";
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
            style={
              photoButtonStyle
            }
            disabled={loading}
            onClick={() =>
              cameraInputRef.current?.click()
            }
          >
            📷
            <br />
            카메라로 촬영
          </button>

          <button
            type="button"
            style={
              photoButtonStyle
            }
            disabled={loading}
            onClick={() =>
              galleryInputRef.current?.click()
            }
          >
            🖼️
            <br />
            갤러리에서 선택
          </button>
        </div>

        {image && (
          <div
            style={{
              marginTop: "14px",
              padding: "12px",
              background:
                "#f3f4f6",
              borderRadius: "10px",
              color: "#374151",
            }}
          >
            ✅ 사진 선택 완료
          </div>
        )}

        <button
          type="button"
          onClick={
            handleAnalyze
          }
          disabled={loading}
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
            opacity: loading
              ? 0.65
              : 1,
          }}
        >
          {loading
            ? "AI 분석 중..."
            : "AI 견적 확인"}
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

      {analysis && (
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
            AI 사진 분석
          </h2>

          <div
            style={{
              fontSize: "19px",
              fontWeight: "bold",
              marginBottom:
                "6px",
            }}
          >
            {analysis.category ||
              "시공 부위"}
          </div>

          <div
            style={{
              color: "#4b5563",
              marginBottom:
                "14px",
            }}
          >
            {analysis.sub_category ||
              ""}
          </div>

          <div
            style={{
              lineHeight: "1.75",
              color: "#374151",
            }}
          >
            {analysis.description}
          </div>
        </section>
      )}

      {estimate && (
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
            실제 유사 시공{" "}
            {estimate.count}건
            기준
          </div>

          <h2
            style={{
              marginBottom:
                "10px",
            }}
          >
            예상 시공 견적
          </h2>

          <div
            style={{
              fontSize: "29px",
              lineHeight: "1.4",
              fontWeight: "bold",
              color: "#111827",
            }}
          >
            {formatWon(
              estimate.min
            )}
            원
            <br />
            ~{" "}
            {formatWon(
              estimate.max
            )}
            원
          </div>

          <div
            style={{
              marginTop: "15px",
              padding: "12px",
              borderRadius: "10px",
              background:
                "#f3f4f6",
              lineHeight: "1.6",
            }}
          >
            유사도 가중 평균{" "}
            <strong>
              {formatWon(
                estimate.average
              )}
              원
            </strong>
            <br />
            견적 신뢰도{" "}
            <strong>
              {
                estimate.confidence
              }
            </strong>
          </div>

          <p
            style={{
              marginBottom: 0,
              color: "#6b7280",
              fontSize: "14px",
              lineHeight: "1.6",
            }}
          >
            사진 기반 예상견적으로,
            수량·현장상태·자재·추가
            작업에 따라 최종 금액은
            달라질 수 있습니다.
          </p>
        </section>
      )}

      {similarItems.length >
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
            비슷한 실제 시공사례
          </h2>

          <p
            style={{
              color: "#6b7280",
              lineHeight: "1.6",
            }}
          >
            고객님의 사진과 비슷한
            과거 실제 시공건입니다.
          </p>

          {similarItems
            .slice(0, 3)
            .map(
              (
                item,
                index
              ) => (
                <div
                  key={
                    item.work_item_id ||
                    index
                  }
                  style={{
                    marginTop:
                      "20px",
                    paddingTop:
                      index === 0
                        ? 0
                        : "20px",
                    borderTop:
                      index === 0
                        ? "none"
                        : "1px solid #e5e7eb",
                  }}
                >
                  <div
                    style={{
                      display:
                        "grid",
                      gridTemplateColumns:
                        "1fr 1fr",
                      gap: "8px",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          textAlign:
                            "center",
                          fontWeight:
                            "bold",
                          marginBottom:
                            "6px",
                        }}
                      >
                        시공 전
                      </div>

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
                              "12px",
                            background:
                              "#e5e7eb",
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            aspectRatio:
                              "1 / 1",
                            display:
                              "flex",
                            alignItems:
                              "center",
                            justifyContent:
                              "center",
                            background:
                              "#f3f4f6",
                            borderRadius:
                              "12px",
                            color:
                              "#9ca3af",
                          }}
                        >
                          사진 없음
                        </div>
                      )}
                    </div>

                    <div>
                      <div
                        style={{
                          textAlign:
                            "center",
                          fontWeight:
                            "bold",
                          marginBottom:
                            "6px",
                        }}
                      >
                        시공 후
                      </div>

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
                              "12px",
                            background:
                              "#e5e7eb",
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            aspectRatio:
                              "1 / 1",
                            display:
                              "flex",
                            alignItems:
                              "center",
                            justifyContent:
                              "center",
                            background:
                              "#f3f4f6",
                            borderRadius:
                              "12px",
                            color:
                              "#9ca3af",
                          }}
                        >
                          사진 없음
                        </div>
                      )}
                    </div>
                  </div>

                  <div
                    style={{
                      marginTop:
                        "12px",
                      fontSize:
                        "17px",
                      fontWeight:
                        "bold",
                    }}
                  >
                    {item.category ||
                      "인테리어필름"}
                    {item.sub_category
                      ? ` · ${item.sub_category}`
                      : ""}
                  </div>

                  <div
                    style={{
                      marginTop:
                        "6px",
                      lineHeight: "1.7",
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
                    <br />

                    유사도{" "}
                    <strong>
                      {(
                        Number(
                          item.similarity ||
                            0
                        ) * 100
                      ).toFixed(1)}
                      %
                    </strong>
                  </div>
                </div>
              )
            )}
        </section>
      )}

      {analysis && (
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
              marginBottom:
                "8px",
            }}
          >
            💬
          </div>

          <h2
            style={{
              textAlign:
                "center",
              margin:
                "0 0 8px",
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
              marginTop: 0,
              marginBottom:
                "22px",
            }}
          >
            사진과 AI 견적을 함께
            확인한 뒤 실제 시공
            조건에 맞춰 안내해
            드립니다.
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
