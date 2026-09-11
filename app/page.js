"use client";

import { useState } from "react";

export default function Home() {
  const [images, setImages] = useState([]);

  function handleImages(e) {
    const files = Array.from(e.target.files || []);
    setImages(files);
  }

  return (
    <main
      style={{
        maxWidth: "720px",
        margin: "0 auto",
        padding: "30px 20px",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div style={{ marginBottom: "30px" }}>
        <div
          style={{
            display: "inline-block",
            background: "#111827",
            color: "white",
            padding: "7px 12px",
            borderRadius: "20px",
            fontSize: "13px",
          }}
        >
          기분좋은공간
        </div>

        <h1 style={{ fontSize: "32px", marginBottom: "10px" }}>
          AI 인테리어필름 견적
        </h1>

        <p style={{ color: "#666", lineHeight: "1.7" }}>
          시공할 곳의 사진을 등록하면
          <br />
          과거 시공 데이터를 바탕으로 예상 견적을 분석합니다.
        </p>
      </div>

      <section
        style={{
          border: "2px dashed #ccc",
          borderRadius: "18px",
          padding: "30px 20px",
          textAlign: "center",
          background: "#fafafa",
        }}
      >
        <div style={{ fontSize: "45px" }}>📷</div>

        <h2>시공 사진 등록</h2>

        <p style={{ color: "#777", fontSize: "14px" }}>
          주방, 문, 샷시, 붙박이장 등
          <br />
          견적을 원하는 부분을 촬영해 주세요.
        </p>

        <label
          style={{
            display: "inline-block",
            marginTop: "15px",
            padding: "14px 24px",
            background: "#111827",
            color: "white",
            borderRadius: "10px",
            cursor: "pointer",
            fontWeight: "bold",
          }}
        >
          사진 선택하기

          <input
            type="file"
            accept="image/*"
            multiple
            onChange={handleImages}
            style={{ display: "none" }}
          />
        </label>

        {images.length > 0 && (
          <div
            style={{
              marginTop: "20px",
              padding: "12px",
              background: "#e8f5e9",
              borderRadius: "10px",
            }}
          >
            ✓ 사진 {images.length}장이 선택되었습니다.
          </div>
        )}
      </section>

      <section
        style={{
          marginTop: "25px",
          padding: "22px",
          border: "1px solid #eee",
          borderRadius: "16px",
        }}
      >
        <h2>AI 견적 분석</h2>

        <p style={{ color: "#666", lineHeight: "1.7" }}>
          등록된 사진과 유사한 과거 시공 사례를 찾아
          실제 자재비와 시공비 데이터를 기준으로 견적을 계산합니다.
        </p>

        <button
          disabled={images.length === 0}
          style={{
            width: "100%",
            padding: "16px",
            marginTop: "10px",
            border: "none",
            borderRadius: "10px",
            background: images.length ? "#111827" : "#ddd",
            color: "white",
            fontSize: "16px",
            fontWeight: "bold",
          }}
        >
          AI 예상 견적 확인하기
        </button>
      </section>

      <p
        style={{
          textAlign: "center",
          color: "#999",
          fontSize: "12px",
          marginTop: "30px",
        }}
      >
        ※ 사진 분석 결과는 예상 견적이며 현장 상황에 따라 달라질 수 있습니다.
      </p>
    </main>
  );
            }
