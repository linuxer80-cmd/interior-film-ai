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
      // --------------------------------
      // 1. AI 사진 분석
      // --------------------------------
      let aiAnalysis = {
        category: category.trim(),
        sub_category: category.trim(),
        description: memo.trim(),
        tags: [],
      };

      try {
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
      } catch (aiError) {
        console.error("AI 분석 오류:", aiError);
      }

      setMessage("사진과 시공정보를 저장하고 있습니다...");

      // --------------------------------
      // 2. Storage 사진 업로드
      // --------------------------------
      const extension =
        image.name.split(".").pop()?.toLowerCase() || "jpg";

      const filePath =
        `history/${Date.now()}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from("work-photos")
        .upload(filePath, image, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        throw uploadError;
      }

      // --------------------------------
      // 3. 기존 프로젝트 ID 임시 사용
      // --------------------------------
      const projectId =
        "d9a21463-1f8f-452a-9dd0-cdc69ebfa27f";

      // --------------------------------
      // 4. work_items 생성
      // --------------------------------
      const { data: workItemData, error: workItemError } =
        await supabase
          .from("work_items")
          .insert([
            {
              project_id: projectId,

              // 실제 견적 분류는 사람이 입력한 값을 기준으로 사용
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

      // --------------------------------
      // 5. 사진 URL 생성
      // --------------------------------
      const { data: publicUrlData } =
        supabase.storage
          .from("work-photos")
          .getPublicUrl(filePath);

      // --------------------------------
      // 6. AI 태그 만들기
      // --------------------------------
      let tags = [];

      if (Array.isArray(aiAnalysis?.tags)) {
        tags = [...aiAnalysis.tags];
      }

      if (material.trim()) {
        tags.push(material.trim());
      }

      tags = [...new Set(tags)];

      // --------------------------------
      // 7. work_photos 저장
      // --------------------------------
      const { error: photoError } = await supabase
        .from("work_photos")
        .insert([
          {
            project_id: projectId,
            work_item_id: workItemData.id,

            storage_path: filePath,
            photo_url: publicUrlData.publicUrl,

            photo_type: "history",

            // 사람이 입력한 대분류
            category: category.trim(),

            // AI가 분석한 세부분류
            sub_category:
              aiAnalysis?.sub_category ||
              category.trim(),

            // AI 설명
            ai_description:
              aiAnalysis?.description ||
              memo.trim() ||
              "",

            // AI 특징 + 자재
            ai_tags: tags,
          },
        ]);

      if (photoError) {
        throw photoError;
      }

      setMessage(
        "✅ 저장 완료! 사진 AI 분석 정보도 함께 저장되었습니다."
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
          error?.message || "저장 중 오류가 발생했습니다."
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
        사진은 AI가 자동으로 분석합니다.
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
            placeholder="예: 중문, 문·문틀, 싱크대"
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
            placeholder="예: 중문 유리 간살 2연동"
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
