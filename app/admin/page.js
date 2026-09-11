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
    setMessage("저장하고 있습니다...");

    try {
      const extension = image.name.split(".").pop() || "jpg";
      const filePath = `history/${Date.now()}.${extension}`;

      // 1. Storage에 사진 저장
      const { error: uploadError } = await supabase.storage
        .from("work-photos")
        .upload(filePath, image, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        throw uploadError;
      }

      // 2. projects 테이블에 과거 시공 프로젝트 생성
      const { data: projectData, error: projectError } =
        await supabase
          .from("projects")
          .insert([
            {
              title: `과거 시공 데이터 - ${category}`,
            },
          ])
          .select("id")
          .single();

      if (projectError) {
        throw projectError;
      }

      // 3. work_items에 실제 시공금액 저장
      const { data: workItemData, error: workItemError } =
        await supabase
          .from("work_items")
          .insert([
            {
              project_id: projectData.id,
              category: category.trim(),
              sub_category: category.trim(),
              actual_cost: Number(actualCost),
              memo: memo.trim() || null,
            },
          ])
          .select("id")
          .single();

      if (workItemError) {
        throw workItemError;
      }

      // 4. 사진 URL 생성
      const { data: publicUrlData } = supabase.storage
        .from("work-photos")
        .getPublicUrl(filePath);

      // 5. work_photos와 work_items 연결
      const { error: photoError } = await supabase
        .from("work_photos")
        .insert([
          {
            project_id: projectData.id,
            work_item_id: workItemData.id,
            storage_path: filePath,
            photo_url: publicUrlData.publicUrl,
            photo_type: "history",
            category: category.trim(),
            sub_category: category.trim(),
            ai_description: memo.trim() || "",
            ai_tags: material.trim() ? [material.trim()] : [],
          },
        ]);

      if (photoError) {
        throw photoError;
      }

      setMessage("✅ 과거 시공 데이터 저장 완료!");

      setImage(null);
      setCategory("");
      setActualCost("");
      setMaterial("");
      setMemo("");
    } catch (error) {
      console.error(error);
      setMessage(`❌ 오류: ${error.message}`);
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
        실제 시공사진과 실제 시공금액을 등록합니다.
        <br />
        등록된 자료는 AI 유사 시공사례 검색과 견적 계산에
        사용됩니다.
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
            onChange={(e) => setCategory(e.target.value)}
            placeholder="예: 문·문틀"
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
            onChange={(e) => setActualCost(e.target.value)}
            placeholder="예: 180000"
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
            onChange={(e) => setMaterial(e.target.value)}
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
            onChange={(e) => setMemo(e.target.value)}
            placeholder="예: 방문 1짝 + 문틀 포함, 기존 시트지 제거"
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
            cursor: loading ? "default" : "pointer",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "저장 중..." : "과거 시공 데이터 저장"}
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
