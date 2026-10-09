"use client";

import Link from "next/link";

export default function SiteCuttingMaterials({
  siteId,
  materials = [],
}) {
  const count = new Set(
    materials
      .filter(Boolean)
      .map(material =>
        [
          material.brand,
          material.product_code ||
            material.code ||
            material.product_name ||
            material.name,
        ]
          .filter(Boolean)
          .join(" / ")
          .trim()
          .toUpperCase()
      )
      .filter(Boolean)
  ).size;

  return (
    <section
      style={{
        marginTop: 14,
        padding: 20,
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: 18,
      }}
    >
      <h3 style={{ margin: "0 0 10px" }}>
        ✂️ 현장 재단
      </h3>

      <p
        style={{
          color: "#64748b",
          fontSize: 13,
          lineHeight: 1.7,
          margin: "0 0 16px",
        }}
      >
        재단앱에서 이 현장의 필름을 선택하고
        롤 길이와 사이즈를 입력하세요.
      </p>

      <Link
        href={`/worker/cutting?siteId=${encodeURIComponent(
          siteId
        )}`}
        style={{
          display: "block",
          padding: "16px 18px",
          borderRadius: 12,
          background: "#2563eb",
          color: "#fff",
          textAlign: "center",
          textDecoration: "none",
          fontWeight: 800,
          fontSize: 16,
        }}
      >
        재단앱 열기 →
      </Link>

      <p
        style={{
          color: "#64748b",
          fontSize: 12,
          marginBottom: 0,
        }}
      >
        {count
          ? `이 현장에 등록된 필름 ${count}종을 사용할 수 있습니다.`
          : "등록된 필름이 없습니다. 관리자에게 현장 필름 등록을 요청해주세요."}
      </p>
    </section>
  );
}
