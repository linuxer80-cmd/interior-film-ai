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

      <p
        style={{
          fontSize: "20px",
          color: "#666",
          lineHeight: "1.8",
        }}
      >
        시공할 곳의 사진을 등록하면
        <br />
        과거 실제 시공 데이터를 바탕으로 예상 견적을 계산합니다.
      </p>

      <section
        style={{
          marginTop: "35px",
          border: "2px dashed #ccc",
          borderRadius: "24px",
          padding: "40px 20px",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: "64px" }}>📷</div>

        <h2 style={{ fontSize: "32px" }}>시공 사진 등록</h2>

        <p
          style={{
            color: "#777",
            fontSize: "18px",
            lineHeight: "1.6",
          }}
        >
          사진을 등록하면 AI가 시공 부위를 분석하고
          <br />
          과거 실제 시공금액과 비교합니다.
        </p>

        <label
          style={{
            display: "inline-block",
            marginTop: "20px",
            background: "#111827",
            color: "white",
            padding: "18px 30px",
            borderRadius: "14px",
            fontSize: "20px",
            fontWeight: "bold",
            cursor: "pointer",
          }}
        >
          사진 선택하기
          <input
            type="file"
            accept="image/*"
            onChange={handleImage}
            style={{ display: "none" }}
          />
        </label>

        {image && (
          <div style={{ marginTop: "25px" }}>
            <div
              style={{
                padding: "15px",
                background: "#e8f5e9",
                borderRadius: "12px",
              }}
            >
              ✓ {image.name}
            </div>

            <button
              onClick={handleUpload}
              disabled={loading}
              style={{
                width: "100%",
                marginTop: "20px",
                padding: "20px",
                border: "none",
                borderRadius: "15px",
                background: "#111827",
                color: "white",
                fontSize: "20px",
                fontWeight: "bold",
                cursor: loading ? "default" : "pointer",
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? "처리 중..." : "AI 견적 분석"}
            </button>
          </div>
        )}

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
            marginTop: "30px",
            padding: "25px",
            border: "1px solid #ddd",
            borderRadius: "20px",
          }}
        >
          <h2>AI 사진 분석 결과</h2>

          <p>
            <strong>시공 부위:</strong> {analysis.category}
          </p>

          <p>
            <strong>세부 부위:</strong> {analysis.sub_category}
          </p>

          <p>
            <strong>분석:</strong> {analysis.description}
          </p>

          <p>
            <strong>특징:</strong>{" "}
            {Array.isArray(analysis.tags)
              ? analysis.tags.join(", ")
              : ""}
          </p>
        </section>
      )}

      {estimate && (
        <section
          style={{
            marginTop: "30px",
            padding: "25px",
            border: "2px solid #111827",
            borderRadius: "20px",
          }}
        >
          <h2>예상 견적</h2>

          <div
            style={{
              fontSize: "32px",
              fontWeight: "bold",
              margin: "15px 0",
            }}
          >
            {formatWon(estimate.min)} ~ {formatWon(estimate.max)}
          </div>

          <p>
            기준 평균금액:{" "}
            <strong>{formatWon(estimate.average)}</strong>
          </p>

          <p>
            과거 데이터 분류:{" "}
            <strong>{estimate.category}</strong>
          </p>

          <p>
            비교 데이터:{" "}
            <strong>{estimate.sampleCount}건</strong>
          </p>

          <p
            style={{
              color: "#666",
              lineHeight: "1.6",
            }}
          >
            현재는 과거 실제 시공금액을 기준으로 계산한
            1차 예상견적입니다. 실제 견적은 현장 크기, 수량,
            상태, 난이도, 자재에 따라 달라질 수 있습니다.
          </p>
        </section>
      )}

      {analysis && !estimate && (
        <section
          style={{
            marginTop: "30px",
            padding: "25px",
            background: "#fff7ed",
            borderRadius: "20px",
          }}
        >
          해당 시공 부위의 과거 가격 데이터가 아직 부족합니다.
        </section>
      )}
    </main>
  );
          }
