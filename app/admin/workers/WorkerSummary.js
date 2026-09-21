"use client";

export default function WorkerSummary({
  activeCount = 0,
  linkedCount = 0,
  inactiveCount = 0,
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: "8px",
        marginBottom: "12px",
      }}
    >
      <SummaryBox
        label="활성 시공자"
        value={activeCount}
      />

      <SummaryBox
        label="계정 연결"
        value={linkedCount}
      />

      <SummaryBox
        label="비활성"
        value={inactiveCount}
      />
    </div>
  );
}

function SummaryBox({
  label,
  value,
}) {
  return (
    <div
      style={{
        padding: "11px",
        border: "1px solid #e2e8f0",
        borderRadius: "10px",
        background: "#ffffff",
        textAlign: "center",
      }}
    >
      <div
        style={{
          color: "#64748b",
          fontSize: "11px",
        }}
      >
        {label}
      </div>

      <div
        style={{
          marginTop: "3px",
          color: "#111827",
          fontSize: "21px",
          fontWeight: "900",
        }}
      >
        {value}
      </div>
    </div>
  );
}
