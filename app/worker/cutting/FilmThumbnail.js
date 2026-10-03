"use client";

import { useState } from "react";

export function filmLabel(material) {
  return (
    [
      material.brand,
      material.product_code || material.product_name,
    ]
      .filter(Boolean)
      .join(" / ")
      .trim()
      .toUpperCase() || `필름 ${material.material_id}`
  );
}

export default function FilmThumbnail({
  material,
  size = 42,
}) {
  const path = material?.sample_image_path || "";
  const [failedPath, setFailedPath] = useState(null);

  const base =
    process.env.NEXT_PUBLIC_SUPABASE_URL || "";

  const url = /^https?:\/\//.test(path)
    ? path
    : path && base
      ? `${base}/storage/v1/object/public/film-samples/${path
          .replace(/^\/+/, "")
          .replace(/^film-samples\//, "")
          .split("/")
          .map(encodeURIComponent)
          .join("/")}`
      : "";

  if (url && failedPath !== url) {
    return (
      <img
        src={url}
        alt={`${material?.product_code || "필름"} 샘플`}
        onError={() => setFailedPath(url)}
        width={size}
        height={size}
        style={{
          objectFit: "cover",
          borderRadius: 7,
          border: "1px solid #cbd5e1",
          flexShrink: 0,
        }}
      />
    );
  }

  return (
    <span
      title="등록된 샘플 이미지가 없습니다"
      style={{
        width: size,
        height: size,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#e2e8f0",
        borderRadius: 7,
        color: "#64748b",
        fontSize: 9,
        textAlign: "center",
        flexShrink: 0,
      }}
    >
      이미지
      <br />
      없음
    </span>
  );
}
