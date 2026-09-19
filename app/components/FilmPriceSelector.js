"use client";

export default function FilmPriceSelector({
  selectedFilm = null,
  fireType = "non_fire",
  onFireTypeChange,
}) {
  if (!selectedFilm) {
    return null;
  }

  const fireAvailable =
    Number(
      selectedFilm.fire_price_per_meter ||
        0
    ) > 0;

  const nonFireAvailable =
    Number(
      selectedFilm.non_fire_price_per_meter ||
        0
    ) > 0;

  const selectedPriceAvailable =
    fireType === "fire"
      ? fireAvailable
      : nonFireAvailable;

  const sectionStyle = {
    marginTop: "16px",
    padding: "16px",
    border: "1px solid #e5e7eb",
    borderRadius: "16px",
    background: "#ffffff",
  };

  const getButtonStyle = (
    type,
    available
  ) => {
    const active =
      fireType === type;

    return {
      padding: "14px 10px",

      borderRadius: "12px",

      border: active
        ? "2px solid #111827"
        : "1px solid #d1d5db",

      background: active
        ? "#111827"
        : "#ffffff",

      color: active
        ? "#ffffff"
        : available
          ? "#111827"
          : "#9ca3af",

      fontSize: "15px",

      fontWeight: "bold",

      cursor: available
        ? "pointer"
        : "not-allowed",

      opacity: available
        ? 1
        : 0.5,
    };
  };

  return (
    <section style={sectionStyle}>
      <div
        style={{
          fontSize: "16px",
          fontWeight: "bold",
        }}
      >
        시공 필름 종류
      </div>

      <p
        style={{
          marginTop: "6px",
          marginBottom: "12px",
          color: "#6b7280",
          fontSize: "14px",
          lineHeight: 1.6,
        }}
      >
        선택한 필름의 방염 여부에 따라
        예상 견적이 달라질 수 있습니다.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(2, minmax(0, 1fr))",
          gap: "8px",
        }}
      >
        {/* 비방염 */}

        <button
          type="button"
          disabled={
            !nonFireAvailable
          }
          onClick={() => {
            if (
              nonFireAvailable
            ) {
              onFireTypeChange?.(
                "non_fire"
              );
            }
          }}
          style={getButtonStyle(
            "non_fire",
            nonFireAvailable
          )}
        >
          비방염

          {!nonFireAvailable && (
            <>
              <br />

              <span
                style={{
                  fontSize: "12px",
                  fontWeight:
                    "normal",
                }}
              >
                선택 불가
              </span>
            </>
          )}
        </button>

        {/* 방염 */}

        <button
          type="button"
          disabled={
            !fireAvailable
          }
          onClick={() => {
            if (
              fireAvailable
            ) {
              onFireTypeChange?.(
                "fire"
              );
            }
          }}
          style={getButtonStyle(
            "fire",
            fireAvailable
          )}
        >
          방염

          {!fireAvailable && (
            <>
              <br />

              <span
                style={{
                  fontSize: "12px",
                  fontWeight:
                    "normal",
                }}
              >
                선택 불가
              </span>
            </>
          )}
        </button>
      </div>

      {!selectedPriceAvailable && (
        <div
          style={{
            marginTop: "12px",
            padding: "11px",
            background: "#fff7ed",
            borderRadius: "10px",
            color: "#9a3412",
            fontSize: "14px",
            lineHeight: 1.6,
          }}
        >
          이 제품은 선택한 조건의
          가격정보가 없습니다.
        </div>
      )}

      <div
        style={{
          marginTop: "12px",
          padding: "11px",
          background: "#f3f4f6",
          borderRadius: "10px",
          fontSize: "14px",
          lineHeight: 1.6,
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
    </section>
  );
}
