"use client";

function formatWon(value) {
  return Number(value || 0).toLocaleString("ko-KR");
}

export default function FilmAdjustedEstimate({
  selectedFilm = null,
  fireType = "non_fire",
  baseEstimate = null,
  adjustedEstimate = null,
}) {
  if (
    !selectedFilm ||
    !baseEstimate ||
    !adjustedEstimate
  ) {
    return null;
  }

  const selectedPrice =
    fireType === "fire"
      ? Number(
          selectedFilm.fire_price_per_meter || 0
        )
      : Number(
          selectedFilm.non_fire_price_per_meter || 0
        );

  /*
   * 해당 방염 조건의 자재단가가 없으면
   * 수정견적을 표시하지 않습니다.
   */
  if (!selectedPrice) {
    return (
      <section
        style={{
          marginTop: "16px",
          padding: "18px",
          border: "1px solid #e5e7eb",
          borderRadius: "16px",
          background: "#ffffff",
        }}
      >
        <div
          style={{
            fontSize: "18px",
            fontWeight: "bold",
          }}
        >
          선택 필름 적용 예상견적
        </div>

        <div
          style={{
            marginTop: "12px",
            padding: "14px",
            borderRadius: "12px",
            background: "#fff7ed",
            color: "#9a3412",
            lineHeight: 1.6,
          }}
        >
          선택한 필름의{" "}
          {fireType === "fire"
            ? "방염"
            : "비방염"}{" "}
          가격정보가 없어 수정견적을 계산할 수
          없습니다.
        </div>
      </section>
    );
  }

  const baseMin = Number(
    baseEstimate.min || 0
  );

  const baseMax = Number(
    baseEstimate.max || 0
  );

  const baseAverage = Number(
    baseEstimate.average || 0
  );

  const adjustedMin = Number(
    adjustedEstimate.min || 0
  );

  const adjustedMax = Number(
    adjustedEstimate.max || 0
  );

  const adjustedAverage = Number(
    adjustedEstimate.average || 0
  );

  const difference =
    adjustedAverage - baseAverage;

  const differenceText =
    difference > 0
      ? `+${formatWon(difference)}원`
      : difference < 0
        ? `-${formatWon(
            Math.abs(difference)
          )}원`
        : "변동 없음";

  return (
    <section
      style={{
        marginTop: "16px",
        padding: "20px",
        border: "2px solid #111827",
        borderRadius: "18px",
        background: "#ffffff",
      }}
    >
      <div
        style={{
          fontSize: "20px",
          fontWeight: "bold",
        }}
      >
        💰 선택 필름 적용 예상견적
      </div>

      <div
        style={{
          marginTop: "8px",
          color: "#6b7280",
          fontSize: "14px",
          lineHeight: 1.6,
        }}
      >
        선택한 필름의 자재 단가 차이를
        반영한 예상 시공금액입니다.
      </div>

      {/* 선택 제품 */}

      <div
        style={{
          marginTop: "16px",
          padding: "14px",
          borderRadius: "12px",
          background: "#f3f4f6",
          lineHeight: 1.7,
        }}
      >
        선택 제품{" "}
        <strong>
          {selectedFilm.product_code}
        </strong>

        {selectedFilm.product_name
          ? ` · ${selectedFilm.product_name}`
          : ""}

        <br />

        시공 조건{" "}
        <strong>
          {fireType === "fire"
            ? "방염"
            : "비방염"}
        </strong>
      </div>

      {/* 기존 AI 견적 */}

      <div
        style={{
          marginTop: "18px",
          color: "#6b7280",
          fontSize: "14px",
        }}
      >
        기존 AI 예상견적
      </div>

      <div
        style={{
          marginTop: "5px",
          fontSize: "17px",
          fontWeight: "bold",
          color: "#6b7280",
        }}
      >
        {formatWon(baseMin)}원 ~{" "}
        {formatWon(baseMax)}원
      </div>

      {/* 화살표 */}

      <div
        style={{
          textAlign: "center",
          margin: "12px 0",
          fontSize: "24px",
        }}
      >
        ↓
      </div>

      {/* 수정 견적 */}

      <div
        style={{
          fontSize: "15px",
          fontWeight: "bold",
        }}
      >
        선택 필름 적용 예상견적
      </div>

      <div
        style={{
          marginTop: "6px",
          fontSize: "27px",
          lineHeight: 1.4,
          fontWeight: "bold",
        }}
      >
        {formatWon(adjustedMin)}원
        <br />
        ~ {formatWon(adjustedMax)}원
      </div>

      {/* 평균 기준 증감 */}

      <div
        style={{
          marginTop: "16px",
          padding: "14px",
          borderRadius: "12px",
          background:
            difference > 0
              ? "#fff7ed"
              : difference < 0
                ? "#ecfdf5"
                : "#f3f4f6",
          lineHeight: 1.7,
        }}
      >
        예상 견적 증감{" "}

        <strong
          style={{
            fontSize: "18px",
          }}
        >
          {differenceText}
        </strong>

        <br />

        <span
          style={{
            color: "#6b7280",
            fontSize: "13px",
          }}
        >
          기존 AI 견적의 평균금액과 비교한
          예상 차이입니다.
        </span>
      </div>

      <p
        style={{
          marginBottom: 0,
          marginTop: "14px",
          color: "#6b7280",
          fontSize: "13px",
          lineHeight: 1.6,
        }}
      >
        ※ 전체 예상견적 중 자재비 30%에
        선택 필름의 가격 차이를 반영한
        금액입니다. 실제 시공금액은 현장상태,
        수량, 크기 및 추가 작업에 따라 달라질
        수 있습니다.
      </p>
    </section>
  );
        }
