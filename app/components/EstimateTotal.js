"use client";

function formatWon(value) {
  return Number(
    value || 0
  ).toLocaleString(
    "ko-KR"
  );
}

export default function EstimateTotal({
  totalEstimate,
}) {
  if (!totalEstimate) {
    return null;
  }

  const sectionStyle = {
    marginTop: "24px",
    padding: "22px",
    border:
      "2px solid #111827",
    borderRadius: "20px",
    background: "#ffffff",
  };

  return (
    <section style={sectionStyle}>
      <div
        style={{
          color: "#6b7280",
          fontWeight: "bold",
        }}
      >
        부위별 예상견적 합산
      </div>

      <h2>
        총 예상 시공 견적
      </h2>

      <div
        style={{
          fontSize: "30px",
          lineHeight: 1.4,
          fontWeight: "bold",
        }}
      >
        {formatWon(
          totalEstimate.min
        )}
        원

        <br />

        ~{" "}
        {formatWon(
          totalEstimate.max
        )}
        원
      </div>

      <div
        style={{
          marginTop: "14px",
          padding: "12px",
          background: "#f3f4f6",
          borderRadius: "10px",
          lineHeight: 1.7,
        }}
      >
        가중 평균 합계{" "}

        <strong>
          {formatWon(
            totalEstimate.average
          )}
          원
        </strong>

        <br />

        견적 계산 완료{" "}

        <strong>
          {
            totalEstimate
              .estimatedGroupCount
          }
          /
          {
            totalEstimate
              .totalGroupCount
          }
          개 부위
        </strong>
      </div>

      {totalEstimate.missingCount >
        0 && (
        <p
          style={{
            color: "#b45309",
            lineHeight: 1.6,
          }}
        >
          ⚠️ 데이터가 부족한{" "}
          {
            totalEstimate
              .missingCount
          }
          개 부위는 총액에
          포함되지 않았습니다.
        </p>
      )}

      <p
        style={{
          color: "#6b7280",
          fontSize: "14px",
          lineHeight: 1.6,
        }}
      >
        실제 시공금액은 수량, 크기,
        현장상태, 자재 및 추가 작업에
        따라 달라질 수 있습니다.
      </p>
    </section>
  );
}
