import {
  sectionStyle,
} from "./adminStyles";

export default function UsageSummary({
  usageStats,
  usageMessage,
  usageLoading,
  loadUsageStats,
}) {
  const cards = [
    [
      "오늘 자동견적",
      usageStats.today,
      "건",
    ],
    [
      "최근 7일",
      usageStats.sevenDays,
      "건",
    ],
    [
      "전체 자동견적",
      usageStats.total,
      "건",
    ],
    [
      "예상 사용자",
      usageStats.sessions,
      "명",
    ],
    [
      "상세 상담",
      usageStats.leads,
      "건",
    ],
    [
      "견적→상담 전환",
      usageStats.converted,
      "건",
    ],
  ];

  return (
    <section style={sectionStyle}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "10px",
        }}
      >
        <h2 style={{ margin: 0 }}>
          자동견적 로그 분석
        </h2>

        <button
          type="button"
          onClick={loadUsageStats}
          disabled={usageLoading}
          style={{
            border: "1px solid #d1d5db",
            borderRadius: "9px",
            background: "#ffffff",
            padding: "9px 12px",
            fontWeight: "bold",
          }}
        >
          {usageLoading
            ? "조회 중..."
            : "새로고침"}
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(2, minmax(0, 1fr))",
          gap: "10px",
          marginTop: "16px",
        }}
      >
        {cards.map(([label, value, unit]) => (
          <div
            key={label}
            style={{
              padding: "14px",
              border: "1px solid #e5e7eb",
              borderRadius: "12px",
              background: "#f9fafb",
            }}
          >
            <div
              style={{
                fontSize: "13px",
                color: "#6b7280",
              }}
            >
              {label}
            </div>

            <div
              style={{
                fontSize: "25px",
                fontWeight: "bold",
                marginTop: "4px",
              }}
            >
              {Number(
                value || 0
              ).toLocaleString("ko-KR")}
              {unit}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: "10px",
          padding: "14px",
          borderRadius: "12px",
          background: "#5d4037",
          color: "#ffffff",
        }}
      >
        <div
          style={{
            fontSize: "13px",
            opacity: 0.85,
          }}
        >
          자동견적 → 상세상담 전환율
        </div>

        <div
          style={{
            fontSize: "30px",
            fontWeight: "bold",
            marginTop: "4px",
          }}
        >
          {usageStats.conversion}%
        </div>
      </div>

      {usageMessage && (
        <div
          style={{
            marginTop: "12px",
            whiteSpace: "pre-wrap",
            fontSize: "14px",
          }}
        >
          {usageMessage}
        </div>
      )}
    </section>
  );
}
