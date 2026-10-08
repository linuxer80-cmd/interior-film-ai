"use client";

import { useState } from "react";

const section = {
  marginTop: 20,
  padding: 20,
  border: "1px solid #dbe3ee",
  borderRadius: 18,
  background: "#fff",
  color: "#172337",
  overflowWrap: "anywhere",
  textAlign: "left",
};

const muted = {
  color: "#64748b",
  fontSize: 13,
  lineHeight: 1.7,
};

const card = {
  padding: 14,
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  background: "#f8fafc",
  marginTop: 10,
};

const positive = (value) =>
  value !== null &&
  value !== undefined &&
  value !== "" &&
  Number.isFinite(Number(value)) &&
  Number(value) > 0;

const won = (value) =>
  positive(value)
    ? `${Math.round(Number(value)).toLocaleString("ko-KR")}원`
    : "금액 확인 필요";

const title = (row) =>
  [...new Set([row.category, row.sub_category].filter(Boolean))]
    .join(" · ") || "시공 부위";

const priced = (row) =>
  [
    row.estimate_min,
    row.estimate_max,
    row.estimate_average,
  ].every(positive);

const conditions = [
  [
    "실측·시공 범위",
    "크기, 문짝 수, 안쪽·옆면·몰딩 포함 범위를 현장에서 확인합니다.",
  ],
  [
    "필름·방염 조건",
    "제품번호와 방염 여부를 확정한 뒤 최종 금액을 확인합니다.",
  ],
  [
    "바탕면 보수",
    "들뜸·파손·오염 상태와 퍼티·보수 작업의 포함 여부를 확인합니다.",
  ],
  [
    "철거·폐기·이동",
    "기존 마감 철거, 폐기물 처리, 가구 이동의 포함 여부를 확인합니다.",
  ],
  [
    "출장·주차·기타",
    "현장 위치와 작업 여건에 따른 비용 유무를 확인합니다.",
  ],
  [
    "부가세·결제 조건",
    "부가세 포함 여부, 계약금·잔금, 일정은 업체 상담 후 확정합니다.",
  ],
];

function quantityText(row) {
  if (row.group_key !== "door-total") {
    return "사진 속 시공 범위 1식 · 실측 수량 별도 확인";
  }

  if (row.partial) {
    return `사진 속 ${row.detected_quantity}세트 중 ${row.priced_quantity}세트만 금액 산정`;
  }

  return `요청 총 ${row.quantity}세트 · 사진 속 ${row.detected_quantity}세트 기준`;
}

export default function EstimateTotal({
  totalEstimate,
  selectedFilm = null,
  fireType = "non_fire",
  baseEstimate = null,
  filmPriceAvailable = true,
}) {
  const [copyMessage, setCopyMessage] = useState("");
  const [showCopyText, setShowCopyText] = useState(false);

  const total = totalEstimate;

  const rows = Array.isArray(total?.details)
    ? total.details
    : [];

  const validTotal =
    total &&
    [total.min, total.max, total.average].every(positive);

  const partial = Number(total?.missingCount) > 0;

  const heading = partial
    ? "계산된 부위의 부분 견적"
    : "총 예상 시공 견적";

  const filmName = selectedFilm
    ? [
        selectedFilm.brand,
        selectedFilm.product_code,
        selectedFilm.product_name,
      ]
        .filter(Boolean)
        .join(" · ")
    : "필름 제품과 방염 조건은 필름 선택 화면에서 확인·변경할 수 있습니다.";

  const difference =
    validTotal &&
    positive(baseEstimate?.average) &&
    filmPriceAvailable
      ? Number(total.average) - Number(baseEstimate.average)
      : null;

  const copyText = [
    "인테리어필름 시공 예상견적서",
    "AI 사진 분석 참고용 · 최종 계약금액이 아닙니다.",
    `필름: ${filmName}`,

    ...(selectedFilm
      ? [
          `조건: ${
            fireType === "fire" ? "방염" : "비방염"
          }${
            filmPriceAvailable
              ? " · 가격 차이 반영"
              : " · 선택 필름 가격 미반영"
          }`,
        ]
      : []),

    "",

    ...rows.flatMap((row, index) => [
      `${index + 1}. ${title(row)}`,
      quantityText(row),

      priced(row)
        ? `예상 금액: ${won(row.estimate_average)} (${won(
            row.estimate_min
          )} ~ ${won(row.estimate_max)})${
            row.partial ? " · 일부만 산정" : ""
          }`
        : "금액 확인 필요 · 합계에 미포함",

      ...(positive(row.unit_average) && !row.partial
        ? [`세트당 참고 평균: 약 ${won(row.unit_average)}`]
        : []),

      "",
    ]),

    validTotal
      ? `${heading}: ${won(total.average)}\n참고 범위: ${won(
          total.min
        )} ~ ${won(total.max)}`
      : "현재 금액 산정이 어렵습니다. 사진과 시공 범위를 확인해주세요.",

    ...(partial
      ? [
          `미산정 ${total.missingCount}개 부위는 위 금액에 포함되지 않았습니다.`,
        ]
      : []),

    "",
    "상담 시 확인할 항목",

    ...conditions.map(
      ([label, text]) => `- ${label}: ${text}`
    ),

    "",
    "자재비·인건비·부자재비의 개별 확정 내역은 업체 상담 후 안내됩니다.",
  ].join("\n");

  async function copy() {
    try {
      if (!navigator.clipboard?.writeText) {
        throw Error("clipboard unavailable");
      }

      await navigator.clipboard.writeText(copyText);

      setCopyMessage("현재 견적 내용을 복사했습니다.");
      setShowCopyText(false);
    } catch {
      setCopyMessage(
        "아래 내용을 길게 눌러 전체 선택 후 복사해주세요."
      );
      setShowCopyText(true);
    }
  }

  return (
    <section
      style={section}
      aria-label="상세 시공 예상견적서"
    >
      <div
        style={{
          display: "flex",
          gap: 10,
          justifyContent: "space-between",
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <h2 style={{ margin: 0, fontSize: 21 }}>
          시공 예상견적서
        </h2>

        <span
          style={{
            padding: "5px 9px",
            background: "#eff6ff",
            color: "#1d4ed8",
            borderRadius: 20,
            fontSize: 12,
          }}
        >
          AI 사진 분석 · 참고용
        </span>
      </div>

      <p style={muted}>
        현재 선택한 시공 범위와 수량을 기준으로 정리했습니다.
        최종 계약금액은 실측과 업체 상담 후 확정합니다.
      </p>

      <div
        style={{
          ...card,
          background: "#eff6ff",
          borderColor: "#bfdbfe",
        }}
      >
        <strong>
          {validTotal ? heading : "견적 금액 확인 필요"}
        </strong>

        <div
          style={{
            fontSize: 29,
            fontWeight: 800,
            marginTop: 8,
          }}
        >
          {validTotal ? won(total.average) : "상담 후 안내"}
        </div>

        {validTotal && (
          <p
            style={{
              margin: "8px 0 0",
              lineHeight: 1.6,
            }}
          >
            참고 범위 {won(total.min)} ~ {won(total.max)}
          </p>
        )}

        {validTotal && (
          <p style={muted}>
            견적 계산 완료 {total.estimatedGroupCount}/
            {total.totalGroupCount}개 부위
          </p>
        )}

        {!validTotal && (
          <p style={muted}>
            현재 사진만으로는 금액을 산정하기 어렵습니다.
            아래 부위별 안내를 확인하거나 상담을 신청해주세요.
          </p>
        )}

        {partial && (
          <p
            role="status"
            style={{
              color: "#92400e",
              lineHeight: 1.7,
            }}
          >
            아직 견적이 확정되지 않은 {total.missingCount}개
            부위는 위 금액에 포함되지 않았습니다.
            미산정 부위는 0원 또는 무료 시공을 뜻하지 않습니다.
          </p>
        )}
      </div>

      <div style={card}>
        <strong>적용 필름·조건</strong>

        <p style={{ marginBottom: 6 }}>
          {filmName}
        </p>

        {selectedFilm && (
          <p style={muted}>
            {fireType === "fire" ? "방염" : "비방염"} ·{" "}
            {filmPriceAvailable
              ? "선택 필름의 가격 차이를 반영한 예상 금액입니다."
              : "가격정보가 없어 선택 필름의 가격 차이는 반영하지 않았습니다. 위 금액은 기본 견적입니다."}
          </p>
        )}

        {difference !== null && (
          <p style={muted}>
            기본 예상금액 {won(baseEstimate.average)} 대비{" "}
            {difference === 0
              ? "변동 없음"
              : `${
                  difference > 0 ? "+" : "−"
                }${Math.round(
                  Math.abs(difference)
                ).toLocaleString("ko-KR")}원`}
          </p>
        )}
      </div>

      {rows.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <h3 style={{ fontSize: 17 }}>
            부위별 시공 내역
          </h3>

          <p style={muted}>
            사진 장수와 실제 시공 수량은 다릅니다.
            문·문틀은 요청한 총 세트 수를 한 번만 반영합니다.
          </p>

          {rows.map((row, index) => (
            <article
              key={`${row.group_key || "scope"}-${index}`}
              style={card}
            >
              <strong>
                {index + 1}. {title(row)}
              </strong>

              <p style={muted}>
                {quantityText(row)}
              </p>

              {positive(row.unit_average) && !row.partial && (
                <p style={muted}>
                  세트당 참고 평균 약 {won(row.unit_average)}
                  {" · "}합계는 수량 환산 후 반올림
                </p>
              )}

              <div
                style={{
                  fontWeight: 800,
                  fontSize: 19,
                }}
              >
                {priced(row)
                  ? won(row.estimate_average)
                  : "금액 확인 필요"}
              </div>

              {priced(row) ? (
                <p style={muted}>
                  참고 범위 {won(row.estimate_min)} ~{" "}
                  {won(row.estimate_max)}
                  {row.partial
                    ? " · 계산된 세트만 포함"
                    : ""}
                </p>
              ) : (
                <p
                  style={{
                    ...muted,
                    color: "#92400e",
                  }}
                >
                  합계에 미포함 · 사진 또는 시공 범위를
                  추가 확인해야 합니다.
                </p>
              )}

              {Number(row.photo_count) > 0 && (
                <small style={muted}>
                  참고 사진 {row.photo_count}장
                </small>
              )}
            </article>
          ))}
        </div>
      )}

      <details style={{ marginTop: 20 }} open>
        <summary
          style={{
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          포함 범위·추가 비용 확인
        </summary>

        <p style={muted}>
          아래 항목은 포함 또는 별도 비용 여부가
          아직 확정되지 않았습니다.
          최종 견적에서 확인해주세요.
        </p>

        <dl style={{ margin: 0 }}>
          {conditions.map(([label, text]) => (
            <div
              key={label}
              style={{
                padding: "10px 0",
                borderTop: "1px solid #e2e8f0",
              }}
            >
              <dt
                style={{
                  fontWeight: 700,
                  fontSize: 14,
                }}
              >
                {label}
              </dt>

              <dd
                style={{
                  ...muted,
                  margin: "4px 0 0",
                }}
              >
                {text}
              </dd>
            </div>
          ))}
        </dl>

        <p style={muted}>
          부위별 금액은 예상 시공금액입니다.
          자재·시공·부자재의 세부 내역은
          상담 시 확인해주세요.
        </p>
      </details>

      <button
        type="button"
        onClick={copy}
        style={{
          marginTop: 16,
          width: "100%",
          minHeight: 46,
          padding: 12,
          border: "1px solid #cbd5e1",
          borderRadius: 10,
          background: "#fff",
          color: "#172337",
          fontWeight: 800,
          cursor: "pointer",
        }}
      >
        견적 내용 복사
      </button>

      {copyMessage && (
        <p role="status" style={muted}>
          {copyMessage}
        </p>
      )}

      {showCopyText && (
        <textarea
          aria-label="복사할 견적 내용"
          readOnly
          value={copyText}
          rows={12}
          onFocus={(event) => event.target.select()}
          style={{
            width: "100%",
            boxSizing: "border-box",
            marginTop: 8,
            padding: 10,
            fontSize: 14,
          }}
        />
      )}
    </section>
  );
              }
