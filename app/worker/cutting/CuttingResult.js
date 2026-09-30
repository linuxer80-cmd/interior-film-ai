"use client";

import CuttingDiagram from "./CuttingDiagram";
import { formatMeterFromMm } from "./cuttingOptimizer";

export default function CuttingResult({
  result,
  onClose,
}) {
  if (!result) return null;

  const usedRolls = Array.isArray(result.usedRolls)
    ? result.usedRolls
    : [];

  const summary = result.summary || {};

  return (
    <section
      style={{
        marginTop: 20,
      }}
    >
      {/* 결과 제목 */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 10,
          marginBottom: 12,
        }}
      >
        <div>
          <div
            style={{
              marginBottom: 3,
              fontSize: 11,
              fontWeight: 900,
              letterSpacing: "0.08em",
              color: "#64748b",
            }}
          >
            CUTTING RESULT
          </div>

          <h2
            style={{
              margin: 0,
              fontSize: 22,
              fontWeight: 900,
              color: "#111827",
            }}
          >
            재단 결과
          </h2>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            style={{
              minHeight: 36,
              padding: "0 13px",
              border: "1px solid #d1d5db",
              borderRadius: 8,
              background: "#ffffff",
              color: "#475569",
              fontSize: 12,
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            결과 닫기
          </button>
        )}
      </div>

      {/* 전체 요약 */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(4, minmax(0, 1fr))",
          gap: 7,
          marginBottom: 14,
        }}
      >
        <SummaryBox
          label="사용 롤"
          value={`${summary.usedRollCount || 0}개`}
        />

        <SummaryBox
          label="총 사용 길이"
          value={formatMeterFromMm(
            summary.totalUsedLength || 0
          )}
        />

        <SummaryBox
          label="잔여 길이"
          value={formatMeterFromMm(
            summary.totalRemainingLength || 0
          )}
        />

        <SummaryBox
          label="효율"
          value={`${summary.efficiency || 0}%`}
        />
      </div>

      {/* 롤별 결과 */}
      {usedRolls.map((roll, index) => (
        <article
          key={`${roll.id || roll.color}-${index}`}
          style={{
            marginBottom: 18,
            padding: 10,
            border: "1px solid #e5e7eb",
            borderRadius: 14,
            background: "#ffffff",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 10,
              marginBottom: 8,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 900,
                  color: "#64748b",
                }}
              >
                ROLL {index + 1}
              </div>

              <h3
                style={{
                  margin: "2px 0 0",
                  fontSize: 20,
                  fontWeight: 900,
                  color: "#111827",
                }}
              >
                {roll.color}
              </h3>
            </div>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "flex-end",
                gap: 5,
              }}
            >
              <SmallStat
                label="보유"
                value={formatMeterFromMm(
                  roll.lengthMm || 0
                )}
              />

              <SmallStat
                label="사용"
                value={formatMeterFromMm(
                  roll.usedLength || 0
                )}
              />

              <SmallStat
                label="잔여"
                value={formatMeterFromMm(
                  roll.remainingLength || 0
                )}
              />

              <SmallStat
                label="효율"
                value={`${roll.efficiency || 0}%`}
              />
            </div>
          </div>

          {/* 새 재단도 */}
          <CuttingDiagram roll={roll} />
        </article>
      ))}

      {/* 배치 실패 */}
      {Array.isArray(result.unplaced) &&
        result.unplaced.length > 0 && (
          <div
            style={{
              marginTop: 12,
              padding: 12,
              border: "1px solid #fecaca",
              borderRadius: 10,
              background: "#fef2f2",
              color: "#991b1b",
            }}
          >
            <strong
              style={{
                display: "block",
                marginBottom: 6,
                fontSize: 13,
              }}
            >
              배치하지 못한 재단물
            </strong>

            {result.unplaced.map(
              (piece, index) => (
                <div
                  key={piece.id || index}
                  style={{
                    padding: "3px 0",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {piece.location} · {piece.part} ·{" "}
                  {piece.color} ·{" "}
                  {piece.originalWidth}×
                  {piece.originalHeight}mm
                </div>
              )
            )}
          </div>
        )}
    </section>
  );
}

function SummaryBox({
  label,
  value,
}) {
  return (
    <div
      style={{
        minWidth: 0,
        padding: "10px 8px",
        border: "1px solid #e5e7eb",
        borderRadius: 10,
        background: "#ffffff",
        textAlign: "center",
      }}
    >
      <span
        style={{
          display: "block",
          marginBottom: 3,
          fontSize: 10,
          fontWeight: 700,
          color: "#64748b",
        }}
      >
        {label}
      </span>

      <strong
        style={{
          display: "block",
          fontSize: 14,
          fontWeight: 900,
          color: "#111827",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </strong>
    </div>
  );
}

function SmallStat({
  label,
  value,
}) {
  return (
    <span
      style={{
        padding: "6px 7px",
        borderRadius: 7,
        background: "#f1f5f9",
        color: "#64748b",
        fontSize: 10,
        fontWeight: 700,
        whiteSpace: "nowrap",
      }}
    >
      {label}{" "}
      <b
        style={{
          color: "#111827",
          fontWeight: 900,
        }}
      >
        {value}
      </b>
    </span>
  );
            }
