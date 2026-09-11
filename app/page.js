"use client";

import { useState } from "react";
import { supabase } from "../lib/supabase";

export default function Home() {
  const [image, setImage] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [estimate, setEstimate] = useState(null);

  function handleImage(e) {
    const file = e.target.files?.[0];

    if (!file) {
      setImage(null);
      return;
    }

    setImage(file);
    setAnalysis(null);
    setEstimate(null);
    setMessage("✅ 사진 1장이 선택되었습니다.");
  }

  function mapCategory(aiCategory) {
    const value = (aiCategory || "").trim();

    if (
      value.includes("방문") ||
      value.includes("문틀") ||
      value.includes("중문") ||
      value.includes("도어") ||
      value === "문"
    ) {
      return "문·문틀";
    }

    return value;
  }

  async function getEstimateFromHistory(aiCategory) {
    const mappedCategory = mapCategory(aiCategory);

    const { data, error } = await supabase
      .from("work_items")
      .select("actual_cost, category, difficulty, quantity")
      .eq("category", mappedCategory)
      .not("actual_cost", "is", null)
      .gt("actual_cost", 0);

    if (error) {
      throw error;
    }

    if (!data || data.length === 0) {
      return null;
    }

    const costs = data
      .map((item) => Number(item.actual_cost))
      .filter((value) => Number.isFinite(value) && value > 0);

    if (costs.length === 0) {
      return null;
    }

    const average =
      costs.reduce((sum, value) => sum + value, 0) / costs.length;

    const min = Math.round(average * 0.9);
    const max = Math.round(average * 1.1);

    return {
      category: mappedCategory,
      average: Math.round(average),
      min,
      max,
      sampleCount: costs.length,
    };
  }

  async function handleUpload() {
    if (!image) {
      setMessage("먼저 사진을 선택해주세요.");
      return;
    }

    setLoading(true);
    setAnalysis(null);
    setEstimate(null);

    try {
      setMessage("사진을 저장하고 있습니다...");

      const extension = image.name.split(".").pop() || "jpg";
      const filePath = `customer/${Date.now()}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from("work-photos")
        .upload(filePath, image, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from("work-photos")
        .getPublicUrl(filePath);

      setMessage("AI가 사진을 분석하고 있습니다...");

      const formData = new FormData();
      formData.append("image", image);

      const aiResponse = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
      });

      const aiData = await aiResponse.json();

      if (!aiResponse.ok) {
        throw new Error(aiData.error || "AI 분석에 실패했습니다.");
      }

      const result = aiData.analysis;

      setMessage("과거 실제 시공금액을 비교하고 있습니다...");

      const estimateResult = await getEstimateFromHistory(
        result.category
      );

      setMessage("분석 결과를 저장하고 있습니다...");

      const { error: dbError } = await supabase
        .from("work_photos")
        .insert([
          {
            storage_path: filePath,
            photo_url: publicUrlData.publicUrl,
            photo_type: "customer",
            category: result.category || "기타",
            sub_category: result.sub_category || "",
            ai_description: result.description || "",
            ai_tags: result.tags || [],
          },
        ]);

      if (dbError) throw dbError;

      setAnalysis(result);
      setEstimate(estimateResult);

      setMessage("✅ 사진 분석 + 예상견적 계산 완료!");
    } catch (error) {
      console.error(error);
      setMessage(`❌ 오류: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  function formatWon(value) {
    return new Intl.NumberFormat("ko-KR").format(value) + "원";
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
          marginBottom: "25px",
        }}
      >
        기분좋은공간
      </div>

      <h1 style={{ fontSize: "38px", lineHeight: "1.25" }}>
        AI 인테리어필름 견적
      </h1>

      <p style={{ fontSize: "20px", color: "#666", lineHeight: "1.8" }}>
