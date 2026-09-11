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

      // 1. 사진 Storage 저장
      const { error: uploadError } = await supabase.storage
        .from("work-photos")
        .upload(filePath, image, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // 2. project 생성
      const { data: projectData, error: projectError } = await supabase
        .from("projects")
        .insert([
          {
            title: `과거 시공 데이터 - ${category}`,
          },
        ])
        .select("id")
        .single();

      if (projectError) throw projectError;

      // 3. work_item 생성
      const { data: workItemData, error: workItemError } = await supabase
        .from("work_items")
        .insert([
          {
            project_id: projectData.id,
            category: category,
            sub_category: category,
            actual_cost: Number(actualCost),
            memo: memo || null,
          },
        ])
        .select("id")
        .single();

      if (workItemError) throw workItemError;

      const { data: publicUrlData } = supabase.storage
        .from("work-photos")
        .getPublicUrl(filePath);

      // 4. work_photos에 사진과 work_item 연결
      const { error: photoError } = await supabase
        .from("work_photos")
        .insert([
          {
            project_id: projectData.id,
            work_item_id: workItemData.id,
            storage_path: filePath,
            photo_url: publicUrlData.publicUrl,
            photo_type: "history",
            category: category,
            sub_category: category,
            ai_description: memo || "",
            ai_tags: material ? [material] : [],
          },
        ]);

      if (photoError) throw photoError;

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
      <h1>과거 시공 데이터 등록</h1>

      <p style={{ color: "#666", lineHeight: "1.7" }}>
        실제 시공사진과 실제 시공금액을 등록합니다.
        나중에 고객 사진과 유사한 과거 시공사례를 찾는 데 사용됩니다.
      </p>

      <div style={{ marginTop: "30px" }}>
        <label>
          <strong>시공 사진</strong>
        </label>

        <input
          type="file"
          accept="image/*"
          onChange={(e) => setImage(e.target.files?.[0] || null)}
          style={{
            width: "100%",
            marginTop: "10px",
            marginBottom: "20px",
          }}
        />

        <label>
          <strong>시공 부위</strong>
        </label>

        <input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="예: 문·문틀, 싱크대, 붙박이장"
          style={{
            width: "100%",
            padding: "15px",
            marginTop: "8px",
            marginBottom: "20px",
            boxSizing: "border-box",
          }}
        />

        <label>
          <strong>실제 시공금액</strong>
        </label>

        <input
          type="number"
          value={actualCost}
          onChange={(e) => setActualCost(e.target.value)}
          placeholder="예: 180000"
          style={{
            width: "100%",
            padding: "15px",
            marginTop: "8px",
            marginBottom: "20px",
            boxSizing: "border-box",
          }}
        />

        <label>
          <strong>자재</strong>
        </label>

        <input
          value={material}
          onChange={(e) => setMaterial(e.target.value)}
          placeholder="예: 현대L&C GS115"
          style={{
            width: "100%",
            padding: "15px",
            marginTop: "8px",
            marginBottom: "20px",
            boxSizing: "border-box",
          }}
        />

        <label>
          <strong>메모</strong>
        </label>

        <textarea
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="예: 방문 1짝 + 문틀 포함, 기존 시트지 제거"
          rows={5}
          style={{
            width: "100%",
            padding: "15px",
            marginTop: "8px",
            marginBottom: "20px",
            boxSizing: "border-box",
          }}
        />

        <button
          onClick={handleSave}
          disabled={loading}
          style={{
            width: "100%",
            padding: "20px",
            border: "none",
            borderRadius: "14px",
            background: "#
