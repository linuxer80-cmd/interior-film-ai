"use client";

import { useState } from "react";
import { supabase } from "../lib/supabase";

export default function Home() {
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [similarItems, setSimilarItems] = useState([]);
  const [estimate, setEstimate] = useState(null);

  async function resizeImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);

      img.onload = () => {
        try {
          let width = img.width;
          let height = img.height;

          const maxSize = 1600;

          if (width > maxSize || height > maxSize) {
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
            URL.revokeObjectURL(objectUrl);
            reject(
              new Error("이미지 처리에 실패했습니다.")
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
                    "AI 분석용 이미지 변환에 실패했습니다."
                  )
                );
                return;
              }

              resolve(
                new File(
                  [blob],
                  "customer-analysis.jpg",
                  {
                    type: "image/jpeg",
                  }
                )
              );
            },
            "image/jpeg",
            0.8
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
    const text = await response.text();

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

  async function handleAnalyze() {
    if (!image) {
      setMessage("사진을 선택해주세요.");
      return;
    }

    setLoading(true);
    setMessage(
      "사진을 준비하고 있습니다..."
    );
    setAnalysis(null);
    setSimilarItems([]);
    setEstimate(null);

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

      const analyzeResponse =
        await fetch("/api/analyze", {
          method: "POST",
          body: analyzeFormData,
        });

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

      if (!analyzeResult?.analysis) {
        throw new Error(
          "AI 분석 결과가 없습니다."
        );
      }

      const aiAnalysis =
        analyzeResult.analysis;

      setAnalysis(aiAnalysis);

      const tags = Array.isArray(
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
        "과거 시공사례와 비교할 검색 데이터를 만들고 있습니다..."
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
            "검색용 임베딩 생성에 실패했습니다."
        );
      }

      const embedding =
        embeddingResult.embedding;

      setMessage(
        "고객 사진을 저장하고 있습니다..."
      );

      const extension =
        image.name
          .split(".")
          .pop()
          ?.toLowerCase() || "jpg";

      const filePath =
        `customer/${Date.now()}.${extension}`;

      const { error: uploadError } =
        await supabase.storage
          .from("work-photos")
          .upload(
            filePath,
            image,
            {
              cacheControl: "3600",
              upsert: false,
            }
          );

      if (uploadError) {
        throw uploadError;
      }

      const { data: publicUrlData } =
        supabase.storage
          .from("work-photos")
          .getPublicUrl(filePath);

      const {
        error: customerPhotoError,
      } = await supabase
        .from("work_photos")
        .insert([
          {
            photo_url:
              publicUrlData.publicUrl,
            storage_path: filePath,
            photo_type: "customer",
            category:
              aiAnalysis?.category ||
              null,
            sub_category:
              aiAnalysis?.sub_category ||
              null,
            ai_description:
              aiAnalysis?.description ||
              "",
            ai_tags: tags,
            embedding: embedding,
          },
        ]);

      if (customerPhotoError) {
        throw customerPhotoError;
      }

      setMessage(
        "가장 비슷한 과거 시공사진을 찾고 있습니다..."
      );

      const {
        data: matchedPhotos,
        error: matchError,
      } = await supabase.rpc(
        "match_work_photos",
        {
          query_embedding: embedding,
          match_threshold: 0,
          match_count: 20,
        }
      );

      if (matchError) {
        throw new Error(
          `유사사진 검색 오류: ${matchError.message}`
        );
      }

      const historyMatches =
        (matchedPhotos || []).filter(
          (item) =>
            !item.photo_type ||
            item.photo_type ===
              "history" ||
            item.photo_type === "before"
        );

      /*
        같은 시공건 사진이 여러 장인 경우
        가장 유사도가 높은 사진 1장만 사용
      */
      const bestMatchByWorkItem =
        new Map();

      for (const photo of historyMatches) {
        if (!photo.work_item_id) {
          continue;
        }

        const existing =
          bestMatchByWorkItem.get(
            photo.work_item_id
          );

        if (
          !existing ||
          Number(photo.similarity || 0) >
            Number(
              existing.similarity || 0
            )
        ) {
          bestMatchByWorkItem.set(
            photo.work_item_id,
            photo
          );
        }
      }

      const uniqueMatches =
        Array.from(
          bestMatchByWorkItem.values()
        );

      const workItemIds =
        uniqueMatches.map(
          (item) => item.work_item_id
        );

      if (
        workItemIds.length === 0
      ) {
        setSimilarItems([]);
        setEstimate(null);
        setMessage(
          "⚠️ 유사한 과거 시공 데이터가 아직 부족합니다."
        );
        return;
      }

      const {
        data: workItems,
        error: workItemsError,
      } = await supabase
        .from("work_items")
        .select(
          "id, category, sub_category, actual_cost, memo"
        )
        .in("id", workItemIds)
        .not(
          "actual_cost",
          "is",
          null
        )
        .gt("actual_cost", 0);

      if (workItemsError) {
        throw workItemsError;
      }

      const combined =
        uniqueMatches
          .map((photo) => {
            const workItem =
              (
                workItems || []
              ).find(
                (item) =>
                  item.id ===
                  photo.work_item_id
              );

            if (!workItem) {
              return null;
            }

            return {
              ...photo,
              actual_cost: Number(
                workItem.actual_cost
              ),
              work_category:
                workItem.category,
              work_sub_category:
                workItem.sub_category,
              memo: workItem.memo,
            };
          })
          .filter(Boolean)
          .sort(
            (a, b) =>
              Number(
                b.similarity || 0
              ) -
              Number(
                a.similarity || 0
              )
          );

      setSimilarItems(combined);

      if (
        combined.length === 0
      ) {
        setEstimate(null);
        setMessage(
          "⚠️ 유사사진은 찾았지만 실제 시공금액 데이터가 없습니다."
        );
        return;
      }

      /*
        유사도 가중평균 계산

        예:
        95% 유사도 → 가중치 0.95
        80% 유사도 → 가중치 0.80

        따라서 더 비슷한 사례가
        견적에 더 크게 반영됨
      */
      let weightedCostTotal = 0;
      let weightTotal = 0;

      for (const item of combined) {
        const cost = Number(
          item.actual_cost
        );

        const similarity =
          Math.max(
            Number(
              item.similarity || 0
            ),
            0.01
          );

        if (cost > 0) {
          weightedCostTotal +=
            cost * similarity;

          weightTotal +=
            similarity;
        }
      }

      if (weightTotal <= 0) {
        setEstimate(null);
        setMessage(
          "⚠️ 견적 계산에 사용할 데이터가 없습니다."
        );
        return;
      }

      const weightedAverage =
        weightedCostTotal /
        weightTotal;

      /*
        현재는 기본 ±10%
        데이터가 더 많이 쌓이면
        실제 가격 분산을 이용해
        범위를 자동 조정할 예정
      */
      const minEstimate =
        Math.round(
          (weightedAverage * 0.9) /
            1000
        ) * 1000;

      const maxEstimate =
        Math.round(
          (weightedAverage * 1.1) /
            1000
        ) * 1000;

      const averageRounded =
        Math.round(
          weightedAverage / 1000
        ) * 1000;

      /*
        간단한 신뢰도 표시
      */
      const topSimilarity =
        combined.length > 0
          ? Number(
              combined[0]
                .similarity || 0
            )
          : 0;

      let confidence = "낮음";

      if (
        combined.length >= 5 &&
        topSimilarity >= 0.85
      ) {
        confidence = "높음";
      } else if (
        combined.length >= 2 &&
        topSimilarity >= 0.75
      ) {
        confidence = "보통";
      }

      setEstimate({
        average: averageRounded,
        min: minEstimate,
        max: maxEstimate,
        count: combined.length,
        confidence,
      });

      setMessage(
        `✅ 분석 완료! 서로 다른 과거 시공사례 ${combined.length}건을 기준으로 견적을 계산했습니다.`
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

  function formatWon(value) {
    return Number(
      value || 0
    ).toLocaleString("ko-KR");
  }

  return (
    <main
      style={{
        maxWidth: "720px",
        margin: "0 auto",
        padding:
          "30px 20px 60px",
        fontFamily:
          "Arial, sans-serif",
      }}
    >
      <div
        style={{
          display:
            "inline-block",
          background: "#111827",
          color: "white",
          padding: "8px 14px",
          borderRadius: "20px",
          marginBottom: "20px",
        }}
      >
        기분좋은공간
      </div>

      <h1
        style={{
          fontSize: "34px",
          lineHeight: "1.3",
        }}
      >
        AI 인테리어필름 견적
      </h1>

      <p
        style={{
          color: "#666",
          fontSize: "18px",
          lineHeight: "1.7",
        }}
      >
        시공할 곳의 사진을 올리면
        AI가 분석하고
        <br />
        실제 과거 시공사례와 비교해
        예상 견적을 계산합니다.
      </p>

      <section
        style={{
          marginTop: "30px",
          padding: "25px",
          border:
            "1px solid #ddd",
          borderRadius: "20px",
        }}
      >
        <label
          style={{
            display: "block",
            fontWeight: "bold",
            marginBottom: "12px",
          }}
        >
          시공할 곳 사진
        </label>

        <input
          type="file"
          accept="image/*"
          onChange={(e) =>
            setImage(
              e.target.files?.[0] ||
                null
            )
          }
        />

        {image && (
          <div
            style={{
              marginTop: "12px",
              padding: "12px",
              background: "#f3f4f6",
              borderRadius: "10px",
            }}
          >
            ✓ {image.name}
          </div>
        )}

        <button
          type="button"
          onClick={handleAnalyze}
          disabled={loading}
          style={{
            width: "100%",
            marginTop: "25px",
            padding: "20px",
            border: "none",
            borderRadius: "14px",
            background: "#111827",
            color: "white",
            fontSize: "20px",
            fontWeight: "bold",
            opacity: loading
              ? 0.7
              : 1,
          }}
        >
          {loading
            ? "AI 분석 및 견적 계산 중..."
            : "AI 견적 확인"}
        </button>

        {message && (
          <div
            style={{
              marginTop: "20px",
              padding: "15px",
              background: "#f3f4f6",
              borderRadius: "12px",
              lineHeight: "1.6",
            }}
          >
            {message}
          </div>
        )}
      </section>

      {analysis && (
        <section
          style={{
            marginTop: "25px",
            padding: "25px",
            border:
              "1px solid #ddd",
            borderRadius: "20px",
          }}
        >
          <h2>AI 사진 분석</h2>

          <p>
            <strong>
              시공 부위:
            </strong>{" "}
            {analysis.category}
          </p>

          <p>
            <strong>
              세부 부위:
            </strong>{" "}
            {analysis.sub_category}
          </p>

          <p
            style={{
              lineHeight: "1.7",
            }}
          >
            <strong>
              사진 분석:
            </strong>{" "}
            {analysis.description}
          </p>

          {Array.isArray(
            analysis.tags
          ) &&
            analysis.tags.length >
              0 && (
              <p>
                <strong>
                  특징:
                </strong>{" "}
                {analysis.tags.join(
                  ", "
                )}
              </p>
            )}
        </section>
      )}

      {estimate && (
        <section
          style={{
            marginTop: "25px",
            padding: "25px",
            border:
              "2px solid #111827",
            borderRadius: "20px",
          }}
        >
          <h2>
            예상 시공 견적
          </h2>

          <div
            style={{
              fontSize: "29px",
              fontWeight: "bold",
              margin: "20px 0",
            }}
          >
            {formatWon(
              estimate.min
            )}
            원 ~{" "}
            {formatWon(
              estimate.max
            )}
            원
          </div>

          <p>
            유사도 가중 평균금액:{" "}
            <strong>
              {formatWon(
                estimate.average
              )}
              원
            </strong>
          </p>

          <p>
            비교한 실제 시공건:{" "}
            <strong>
              {estimate.count}건
            </strong>
          </p>

          <p>
            현재 견적 신뢰도:{" "}
            <strong>
              {estimate.confidence}
            </strong>
          </p>

          <p
            style={{
              color: "#666",
              lineHeight: "1.6",
            }}
          >
            유사도가 높은 실제
            시공사례일수록 견적에
            더 크게 반영됩니다.
          </p>
        </section>
      )}

      {similarItems.length >
        0 && (
        <section
          style={{
            marginTop: "25px",
          }}
        >
          <h2>
            비슷한 과거 시공사례
          </h2>

          {similarItems.map(
            (item, index) => (
              <div
                key={
                  item.work_item_id ||
                  item.id ||
                  index
                }
                style={{
                  padding: "20px",
                  marginTop: "12px",
                  border:
                    "1px solid #ddd",
                  borderRadius:
                    "15px",
                }}
              >
                <strong>
                  유사사례{" "}
                  {index + 1}
                </strong>

                <p>
                  시공 부위:{" "}
                  {item.work_category ||
                    item.category ||
                    "-"}
                </p>

                {item.work_sub_category && (
                  <p>
                    세부 부위:{" "}
                    {
                      item.work_sub_category
                    }
                  </p>
                )}

                <p>
                  실제 시공금액:{" "}
                  <strong>
                    {formatWon(
                      item.actual_cost
                    )}
                    원
                  </strong>
                </p>

                {item.memo && (
                  <p>
                    시공 메모:{" "}
                    {item.memo}
                  </p>
                )}

                {typeof item.similarity ===
                  "number" && (
                  <p>
                    유사도:{" "}
                    {(
                      item.similarity *
                      100
                    ).toFixed(1)}
                    %
                  </p>
                )}
              </div>
            )
          )}
        </section>
      )}
    </main>
  );
}
