"use client";

import { useState } from "react";

export default function Home() {
  const [images, setImages] = useState([]);
  const [previews, setPreviews] = useState([]);

  function handleImages(e) {
    const files = Array.from(e.target.files || []);
    setImages(files);

    const urls = files.map((file) => URL.createObjectURL(file));
    setPreviews(urls);
  }

  function handleAnalyze() {
    if (images.length === 0) {
      alert("먼저 시공 사진을 선택해주세요.");
      return;
    }

    alert("사진 분석 기능을 연결할 준비가 완료되었습니다.");
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

      <h1 style={{ fontSize: "38px", marginBottom: "20px" }}>
        AI 인테리어필름 견적
      </h1>

      <p
        style={{
          color: "#666",
          fontSize: "18px",
          lineHeight: "1.8",
          marginBottom: "30px",
        }}
      >
        시공할 곳의 사진을 등록하면
        <br />
        과거 시공 데이터를 바탕으로 예상 견적을 분석합니다.
      </p>

      <section
        style={{
          border: "2px dashed #ccc",
          borderRadius: "20px",
          padding: "35px 20px",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: "55px" }}>📷</div>

        <h2 style={{ fontSize: "28px" }}>시공 사진 등록</h2>

        <p style={{ color: "#777", lineHeight: "1.6" }}>
          주방, 문, 샷시, 붙박이장 등
          <br />
          견적을 원하는 부분을 촬영해 주세요.
        </p>

        <label
          style={{
            display: "inline-block",
            marginTop: "20px",
            padding: "16px 25px",
            background: "#111827",
            color: "white",
            borderRadius: "12px",
            fontWeight: "bold",
            cursor: "pointer",
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
          <>
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

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, 1fr)",
                gap: "10px",
                marginTop: "20px",
              }}
            >
              {previews.map((src, index) => (
                <img
                  key={index}
                  src={src}
                  alt={`시공사진 ${index + 1}`}
                  style={{
                    width: "100%",
                    height: "160px",
                    objectFit: "cover",
                    borderRadius: "12px",
                  }}
                />
              ))}
            </div>

            <button
              onClick={handleAnalyze}
              style={{
                width: "100%",
                marginTop: "25px",
                padding: "18px",
                border: "none",
                borderRadius: "12px",
                background: "#111827",
                color: "white",
                fontSize: "18px",
                fontWeight: "bold",
              }}
            >
              AI 견적 분석하기
            </button>
          </>
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
      </section>
    </main>
  );
          }
