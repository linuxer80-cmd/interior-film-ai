"use client";

import { useState } from "react";
import { supabase } from "../lib/supabase";

export default function Home() {
  const [image, setImage] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  function handleImage(e) {
    const file = e.target.files?.[0];

    if (!file) {
      setImage(null);
      return;
    }

    setImage(file);
    setMessage("✅ 사진 1장이 선택되었습니다.");
  }

  async function handleUpload() {
    if (!image) {
      setMessage("먼저 사진을 선택해주세요.");
      return;
    }

    setLoading(true);
    setMessage("사진을 저장하고 있습니다...");

    try {
      const extension = image.name.split(".").pop() || "jpg";
      const filePath = `customer/${Date.now()}.${extension}`;

      // 1. Supabase Storage에 사진 저장
      const { error: uploadError } = await supabase.storage
        .from("work-photos")
        .upload(filePath, image, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        throw uploadError;
      }

      // 2. work_photos 테이블에 사진 경로 저장
      const { error: dbError } = await supabase
        .from("work_photos")
        .insert([
          {
            storage_path: filePath,
            photo_type: "customer",
          },
        ]);

      if (dbError) {
        throw dbError;
      }

      setMessage("✅ 사진 저장 + DB 등록 완료!");
      setImage(null);
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
          marginBottom: "25px",
        }}
      >
        기분좋은공간
      </div>

      <h1 style={{ fontSize: "38px", lineHeight: "1.25" }}>
        AI 인테리어필름 견적
      </h1>

      <p style={{ fontSize: "20px", color: "#666", lineHeight: "1.8" }}>
        시공할 곳의 사진을 등록하면
        <br />
        과거 시공 데이터를 바탕으로 예상 견적을 분석합니다.
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

        <p style={{ color: "#777", fontSize: "18px" }}>
          먼저 사진 1장으로 테스트합니다.
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
              }}
            >
              {loading ? "저장 중..." : "사진 저장 테스트"}
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
            }}
          >
            {message}
          </div>
        )}
      </section>
    </main>
  );
                }
