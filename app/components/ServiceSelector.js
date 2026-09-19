"use client";

export default function ServiceSelector({
  groups = [],
  resultMode = "",
  onChange,
}) {
  if (!groups.length) {
    return null;
  }

  const sectionStyle = {
    marginTop: "24px",
    padding: "18px",
    border: "1px solid #e5e7eb",
    borderRadius: "20px",
    background: "#ffffff",
  };

  return (
    <section style={sectionStyle}>
      <h2
        style={{
          marginTop: 0,
          textAlign: "center",
        }}
      >
        다음 서비스를 선택하세요
      </h2>

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(2, minmax(0, 1fr))",
          gap: "10px",
        }}
      >
        {/* 상세견적 */}

        <button
          type="button"
          onClick={() =>
            onChange?.("detail")
          }
          style={{
            minHeight: "72px",
            padding: "12px",
            borderRadius: "14px",

            border:
              resultMode === "detail"
                ? "3px solid #111827"
                : "1px solid #d1d5db",

            background:
              resultMode === "detail"
                ? "#111827"
                : "#ffffff",

            color:
              resultMode === "detail"
                ? "#ffffff"
                : "#111827",

            fontSize: "16px",
            fontWeight: "bold",
            cursor: "pointer",
          }}
        >
          💬 상세견적 신청
        </button>

        {/* 가상시공 */}

        <button
          type="button"
          onClick={() =>
            onChange?.("virtual")
          }
          style={{
            minHeight: "72px",
            padding: "12px",
            borderRadius: "14px",

            border:
              resultMode === "virtual"
                ? "3px solid #5d4037"
                : "1px solid #d1d5db",

            background:
              resultMode === "virtual"
                ? "#5d4037"
                : "#ffffff",

            color:
              resultMode === "virtual"
                ? "#ffffff"
                : "#111827",

            fontSize: "16px",
            fontWeight: "bold",
            cursor: "pointer",
          }}
        >
          🎨 가상 시공 보기
        </button>
      </div>
    </section>
  );
}
