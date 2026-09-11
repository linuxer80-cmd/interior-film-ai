"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabase";

export default function AdminPage() {
  const [image, setImage] = useState(null);
  const [category, setCategory] = useState("");
  const [actualCost, setActualCost] = useState("");
  const [material, setMaterial] = useState("");
  const [memo, setMemo] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSave() {
    if (!image) {
      setMessage("사진을 선택해주세요.");
      return;
    }

    if (!category.trim()) {
      setMessage("시공 부위를 입력해주세요.");
      return;
    }

    if (!actualCost || Number(actualCost) <= 0) {
      setMessage("실제 시공금액을 입력해주세요.");
      return;
    }

    setLoading(true);
    setMessage("사진을 AI가 분석하고 있습니다...");

    try {
      // 1. 사진 AI 분석
      let aiAnalysis = {
        category: category.trim(),
        sub_category: category.trim(),
        description: memo.trim(),
        tags: [],
      };

      const analyzeFormData = new FormData();
      analyzeFormData.append("image", image);

      const analyzeResponse = await fetch("/api/analyze", {
        method: "POST",
        body: analyzeFormData,
      });

      const analyzeResult = await analyzeResponse.json();

      if (
        analyzeResponse.ok &&
        analyzeResult.success &&
        analyzeResult.analysis
      ) {
        aiAnalysis = analyzeResult.analysis;
      }

      // 2. 검색용 태그 정리
      let tags = [];

      if (Array.isArray(aiAnalysis?.tags)) {
        tags = [...aiAnalysis.tags];
      }

      if (material.trim()) {
        tags.push(material.trim());
      }

      tags = [...new Set(tags)];

      // 3. 임베딩에 사용할 검색 문장 생성
      const searchText = [
        `시공 부위: ${category.trim()}`,
        `세부 부위: ${
          aiAnalysis?.sub_category || category.trim()
        }`,
        `사진 설명: ${
          aiAnalysis?.description || memo.trim() || ""
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

      setMessage("유사사진 검색용 데이터를 만들고 있습니다...");

      // 4. 검색용 임베딩 생성
      const embeddingResponse = await fetch("/api/embedding", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: searchText,
        }),
      });

      const embeddingResult =
        await embeddingResponse.json();

      if (
        !embeddingResponse.ok ||
        !embeddingResult.success ||
        !embeddingResult.embedding
      ) {
        throw new Error(
          embeddingResult?.error ||
            "임베딩 생성에 실패했습니다."
        );
      }

      const embedding = embeddingResult.embedding;

      setMessage("사진과 시공정보를 저장하고 있습니다...");

      // 5. Storage에 사진 업로드
      const extension =
        image.name.split(".").pop()?.toLowerCase() ||
        "jpg";

      const filePath =
        `history/${Date.now()}.${extension}`;

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

      // 현재 개발용 기존 프로젝트 ID
      const projectId =
        "d9a21463-1f8f-452a-9dd0-cdc69ebfa27f";

      // 6. 실제 시공정보 저장
      const {
        data: workItemData,
        error: workItemError,
      } = await supabase
        .from("work_items")
        .insert([
          {
            project_id: projectId,
            category: category.trim(),
            sub_category:
              aiAnalysis?.sub_category ||
              category.trim(),
            actual_cost: Number(actualCost),
            memo: memo.trim() || null,
          },
        ])
        .select("id")
        .single();

      if (workItemError) {
        throw workItemError;
      }

      // 7. 사진 URL 생성
      const { data: publicUrlData } =
        supabase.storage
          .from("work-photos")
          .getPublicUrl(filePath);

      // 8. 사진 + AI 분석 + 임베딩 저장
      const { error: photoError } =
        await supabase
          .from("work_photos")
          .insert([
            {
              project_id: projectId,
              work_item_id: workItemData.id,

              storage_path: filePath,
              photo_url: publicUrlData.publicUrl,

              photo_type: "history",

              category: category.trim(),

              sub_category:
                aiAnalysis?.sub_category ||
                category.trim(),

              ai_description:
                aiAnalysis?.description ||
                memo.trim() ||
                "",

              ai_tags: tags,

              embedding: embedding,
            },
          ]);

      if (photoError) {
        throw photoError;
      }

      setMessage(
        `✅ 저장 완료! AI 분석 + 검색용 임베딩 ${embedding.length}차원까지 저장되었습니다.`
      );

      setImage(null);
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
        과거 시공사진과 실제 시공금액을 등록합니다.
        <br />
        사진 분석과 유사사례 검색용 데이터도 자동으로 생성합니다.
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
            시공 사진
          </label>

          <input
            type="file"
            accept="image/*"
            onChange={(e) =>
              setImage(e.target.files?.[0] || null)
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
            placeholder="예: 방화문, 중문, 문·문틀, 싱크대"
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
            placeholder="예: 300000"
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
            placeholder="예: 현관 방화문 + 문틀 전체 시공"
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
            cursor: loading
              ? "default"
              : "pointer",
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
