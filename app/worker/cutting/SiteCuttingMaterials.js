"use client";

import Link from "next/link";
import FilmThumbnail, {
  filmLabel,
} from "./FilmThumbnail";

export default function SiteCuttingMaterials({
  siteId,
  materials = [],
}) {
  return (
    <section
      style={{
        marginTop: 14,
        padding: 18,
        background: "white",
        border: "1px solid #e2e8f0",
        borderRadius: 16,
      }}
    >
      <h3 style={{ margin: "0 0 12px" }}>
        ✂️ 현장 필름 · 재단하기
      </h3>

      <p
        style={{
          color: "#64748b",
          fontSize: 12,
        }}
      >
        필름을 선택하면 해당 현장의 재단 기록을
        이어볼 수 있습니다.
      </p>

      {materials.map((material) => (
        <Link
          key={material.material_id}
          href={`/worker/cutting?siteId=${encodeURIComponent(
            siteId
          )}&materialId=${encodeURIComponent(
            material.material_id
          )}`}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: 12,
            marginTop: 8,
            border: "1px solid #e2e8f0",
            borderRadius: 10,
            color: "#111827",
            textDecoration: "none",
          }}
        >
          <FilmThumbnail material={material} />

          <span style={{ flex: 1 }}>
            <strong>
              {filmLabel(material)}
            </strong>

            <small
              style={{
                display: "block",
                color: "#64748b",
                marginTop: 4,
              }}
            >
              {material.product_name || "현장 사용 필름"}
            </small>
          </span>

          <strong>재단 →</strong>
        </Link>
      ))}

      {!materials.length && (
        <p>등록된 사용 필름이 없습니다.</p>
      )}

      <Link
        href={`/worker/cutting?siteId=${encodeURIComponent(
          siteId
        )}`}
        style={{
          display: "block",
          marginTop: 14,
          color: "#2563eb",
        }}
      >
        이 현장 재단 기록 열기 →
      </Link>
    </section>
  );
          }
