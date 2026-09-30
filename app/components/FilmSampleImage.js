"use client";

import { useState } from "react";
import Image from "next/image";

export function getFilmSampleUrl(path, baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "") {
  const value = String(path || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value) || /^data:image\//i.test(value)) return value;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith("//")) return "";
  const base = baseUrl.replace(/\/$/, "");
  if (!base) return "";
  const encodedPath = value.split("/").map((part) => {
    try { return encodeURIComponent(decodeURIComponent(part)); }
    catch { return encodeURIComponent(part); }
  }).join("/");
  return `${base}/storage/v1/object/public/${encodedPath}`;
}

function SamplePicture({ src, label, large, size }) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [dimensions, setDimensions] = useState(null);
  const unavailable = !src || failed;

  return (
    <span style={{ display: "block", width: size, marginInline: "auto",
      maxWidth: large && dimensions ? `min(100%, ${dimensions.width}px)` : "100%" }}>
      <span style={{ position: "relative", display: "block", width: "100%",
        aspectRatio: large && dimensions ? `${dimensions.width} / ${dimensions.height}` : "1 / 1",
        maxHeight: large ? "65dvh" : undefined, overflow: "hidden", boxSizing: "border-box",
        borderRadius: large ? 15 : 9, border: "1px solid #e5e7eb", background: "#f9fafb" }}>
        {unavailable ? (
          <span role="status" style={{ display: "flex", position: "absolute", inset: 0,
            alignItems: "center", justifyContent: "center", padding: 8,
            color: "#6b7280", textAlign: "center", fontSize: large ? 14 : 10, lineHeight: 1.5 }}>
            {failed ? "이미지를 불러오지 못했습니다" : "샘플 이미지 준비 중"}
          </span>
        ) : (
          <Image key={attempt} src={src} alt={label} fill unoptimized
            sizes={large ? "(max-width: 560px) 90vw, 492px" : "(max-width: 720px) 23vw, 165px"}
            loading={large ? "eager" : "lazy"}
            style={{ objectFit: "contain" }}
            onLoad={(event) => {
              const { naturalWidth, naturalHeight } = event.currentTarget;
              if (naturalWidth > 0 && naturalHeight > 0) {
                setDimensions({ width: naturalWidth, height: naturalHeight });
              }
            }}
            onError={() => setFailed(true)} />
        )}
      </span>
      {large && failed && (
        <button type="button" onClick={() => { setFailed(false); setAttempt((value) => value + 1); }}
          style={{ display: "block", margin: "10px auto 0", padding: "9px 15px",
            border: "1px solid #d1d5db", borderRadius: 9, background: "#fff", color: "#374151", cursor: "pointer" }}>
          이미지 다시 불러오기
        </button>
      )}
    </span>
  );
}

export default function FilmSampleImage({ product, large = false, size = "100%" }) {
  const src = getFilmSampleUrl(product?.sample_image_path);
  return <SamplePicture key={`${product?.id || product?.product_code || ""}:${src}:${large}`}
    src={src} label={product?.product_code || "필름 샘플"} large={large} size={size} />;
}
