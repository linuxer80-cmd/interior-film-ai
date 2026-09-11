"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabase";

export default function AdminPage() {
  const [images, setImages] = useState([]);
  const [category, setCategory] = useState("");
  const [actualCost, setActualCost] = useState("");
  const [material, setMaterial] = useState("");
  const [memo, setMemo] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

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
              height = Math.round((height * maxSize) / width);
              width = maxSize;
            } else {
              width = Math.round((width * maxSize) / height);
              height = maxSize;
            }
          }

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext("2d");

          if (!ctx) {
            URL.revokeObjectURL(objectUrl);
            reject(new Error("이미지 처리에 실패했습니다."));
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
              URL.revokeObjectURL(objectUrl);

              if (!blob) {
                reject(
                  new Error("AI 분석용 이미지 변환에 실패했습니다.")
                );
                return;
              }

              resolve(
                new File([blob], "ai-analysis.jpg", {
                  type: "image/jpeg",
                })
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
        reject(new Error("사진을 불러올 수 없습니다."));
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
          ? `서버 응답 오류: ${text.slice(0, 200)}`
          : "서버에서 올바른 응답을 받지 못했습니다."
      );
    }
  }

  async function analyzeImage(file) {
    const resizedImage = await resizeImage(file);

    const analyzeFormData = new FormData();
    analyzeFormData.append("image", resizedImage);

    const analyzeResponse = await fetch("/api/analyze", {
      method: "POST",
      body: analyzeFormData,
    });

    const analyzeResult =
      await readJsonSafely(analyzeResponse);

    if (!analyzeResponse.ok) {
      throw new Error(
        analyzeResult?.error ||
          "AI 사진 분석에 실패했습니다."
      );
    }

    return analyzeResult.analysis;
  }

  async function createEmbedding(searchText) {
    const embeddingResponse = await fetch(
      "/api/embedding",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: searchText,
        }),
      }
    );

    const embeddingResult =
      await readJsonSafely(embeddingResponse);

    if (
      !embeddingResponse.ok ||
      !embeddingResult?.embedding
    ) {
      throw new Error(
        embeddingResult?.error ||
          "임베딩 생성에 실패했습니다."
      );
    }

    return embeddingResult.embedding;
  }

  async function handleSave() {
    if (images.length === 0) {
      setMessage("사진을 1장 이상 선택해주세요.");
      return;
    }

    if (!category.trim()) {
      setMessage("시공 부위를 입력해주세요.");
      return;
    }

    const costNumber = Number(
      String(actualCost).replace(/,/g, "")
    );

    if (!costNumber || costNumber <= 0) {
      setMessage("실제 시공금액을 입력해주세요.");
      return;
    }

    setLoading(true);
    setMessage("시공정보를 먼저 저장하고 있습니다...");

    try {
      const projectId =
        "d9a21463-1f8f-452a-9dd0-cdc69ebfa27f";

      // 1. work_items는 시공건당 1건만 생성
      const {
        data: workItemData,
        error: workItemError,
      } = await supabase
        .from("work_items")
        .insert([
          {
            project_id: projectId,
            category: category.trim(),
            sub_category: category.trim(),
            actual_cost: costNumber,
            memo: memo.trim() || null,
          },
        ])
        .select("id")
        .single();

      if (workItemError) {
        throw workItemError;
      }

      const workItemId = workItemData.id;

      // 2. 선택한 사진을 한 장씩 처리
      for (let i = 0; i < images.length; i++) {
        const image = images[i];

        setMessage(
          `사진 ${i + 1}/${images.length} AI 분석 중...`
        );

        const aiAnalysis = await analyzeImage(image);

        let tags = [];

        if (Array.isArray(aiAnalysis?.tags)) {
          tags = [...aiAnalysis.tags];
        }

        if (material.trim()) {
          tags.push(material.trim());
        }

        tags = [...new Set(tags)];

        const searchText = [
          `시공 부위: ${category.trim()}`,
          `세부 부위: ${
            aiAnalysis?.sub_category ||
            category.trim()
          }`,
          `사진 설명: ${
            aiAnalysis?.description || ""
          }`,
          `특징: ${tags.join(", ")}`,
          material.trim()
            ? `사용 자재: ${material.trim()}`
            : "",
          memo.trim()
            ? `시공 메모: ${memo.trim()}`
            : "",
        ]
          .filter(Boolean)
          .join("\n");

        setMessage(
          `사진 ${i + 1}/${images.length} 검색 데이터 생성 중...`
        );

        const embedding =
          await createEmbedding(searchText);

        const extension =
          image.name
            .split(".")
            .pop()
            ?.toLowerCase() || "jpg";

        const filePath =
          `history/${workItemId}/${Date.now()}-${i}.${extension}`;

        setMessage(
          `사진 ${i + 1}/${images.length} 원본 저장 중...`
        );

        const { error: uploadError } =
          await supabase.storage
            .from("work-photos")
            .upload(filePath, image, {
              cacheControl: "3600",
              upsert: false,
            });

        if (uploadError) {
          throw uploadError;
        }

        const { data: publicUrlData } =
          supabase.storage
            .from("work-photos")
            .getPublicUrl(filePath);

        const { error: photoError } =
          await supabase
            .from("work_photos")
            .insert([
              {
                project_id: projectId,
                work_item_id: workItemId,
                storage_path: filePath,
                photo_url: publicUrlData.publicUrl,
                photo_type: "history",
                category: category.trim(),
                sub_category:
                  aiAnalysis?.sub_category ||
                  category.trim(),
                ai_description:
                  aiAnalysis?.description || "",
                ai_tags: tags,
                embedding: embedding,
              },
            ]);

        if (photoError) {
          throw photoError;
        }
      }

      setMessage(
        `✅ 저장 완료! 사진 ${images.length}장이 같은 시공건으로 연결되었습니다.`
      );

      setImages([]);
      setCategory("");
      setActualCost("");
      setMaterial("");
      setMemo("");
    } catch (error) {
      console.error(error);

      setMessage(
        `❌ 오류: ${
          error?.message ||
          "저장 중 오류가 발생했습니다."
        }`
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        maxWidth: "720px",
        margin: "0 auto",
        padding: "30px 20px 60px",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div
        style={{
          display: "inline-block",
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
        과거 시공 데이터 등록
      </h1>

      <p
        style={{
          color: "#666",
          fontSize: "18px",
          lineHeight: "1.7",
        }}
      >
        같은 시공건의 사진을 여러 장 선택할 수 있습니다.
        <br />
        모든 사진은 같은 실제 시공금액과 연결됩니다.
      </p>

      <section
        style={{
          marginTop: "30px",
          padding: "25px",
          border: "1px solid #ddd",
          borderRadius: "20px",
        }}
      >
        <div style={{ marginBottom: "25px" }}>
          <label
            style={{
              display: "block",
              fontWeight: "bold",
              marginBottom: "10px",
            }}
          >
            시공 사진 여러 장
          </label>

          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(e) =>
              setImages(
                Array.from(e.target.files || [])
              )
            }
          />

          {images.length > 0 && (
            <div
              style={{
                marginTop: "12px",
                padding: "12px",
                background: "#f3f4f6",
                borderRadius: "10px",
                lineHeight: "1.7",
              }}
            >
              선택한 사진: {images.length}장
              <br />
              {images.map((file, index) => (
                <div key={`${file.name}-${index}`}>
                  {index + 1}. {file.name}
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ marginBottom: "25px" }}>
          <label
            style={{
              display: "block",
              fontWeight: "bold",
              marginBottom: "8px",
            }}
          >
            시공 부위
          </label>

          <input
            type="text"
            value={category}
            onChange={(e) =>
              setCategory(e.target.value)
            }
            placeholder="예: 싱크대, 중문, 방화문"
            style={{
              width: "100%",
              padding: "15px",
              fontSize: "17px",
              border: "1px solid #ccc",
              borderRadius: "10px",
              boxSizing: "border-box",
            }}
          />
        </div>

        <div style={{ marginBottom: "25px" }}>
          <label
            style={{
              display: "block",
              fontWeight: "bold",
              marginBottom: "8px",
            }}
          >
            실제 시공금액
          </label>

          <input
            type="number"
            inputMode="numeric"
            value={actualCost}
            onChange={(e) =>
              setActualCost(e.target.value)
            }
            placeholder="예: 550000"
            style={{
              width: "100%",
              padding: "15px",
              fontSize: "17px",
              border: "1px solid #ccc",
              borderRadius: "10px",
              boxSizing: "border-box",
            }}
          />
        </div>

        <div style={{ marginBottom: "25px" }}>
          <label
            style={{
              display: "block",
              fontWeight: "bold",
              marginBottom: "8px",
            }}
          >
            사용 자재
          </label>

          <input
            type="text"
            value={material}
            onChange={(e) =>
              setMaterial(e.target.value)
            }
            placeholder="예: 현대L&C GS115"
            style={{
              width: "100%",
              padding: "15px",
              fontSize: "17px",
              border: "1px solid #ccc",
              borderRadius: "10px",
              boxSizing: "border-box",
            }}
          />
        </div>

        <div style={{ marginBottom: "25px" }}>
          <label
            style={{
              display: "block",
              fontWeight: "bold",
              marginBottom: "8px",
            }}
          >
            메모
          </label>

          <textarea
            value={memo}
            onChange={(e) =>
              setMemo(e.target.value)
            }
            placeholder="예: 싱크대 상하부장 + 냉장고장 전체"
            rows={5}
            style={{
              width: "100%",
              padding: "15px",
              fontSize: "17px",
              border: "1px solid #ccc",
              borderRadius: "10px",
              boxSizing: "border-box",
              resize: "vertical",
            }}
          />
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={loading}
          style={{
            width: "100%",
            padding: "20px",
            border: "none",
            borderRadius: "14px",
            background: "#111827",
            color: "white",
            fontSize: "20px",
            fontWeight: "bold",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading
            ? "AI 분석 및 저장 중..."
            : "과거 시공 데이터 저장"}
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
    </main>
  );
                }
