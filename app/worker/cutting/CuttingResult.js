"use client";

import { useEffect, useMemo, useState } from "react";
import CuttingDiagram, { getCutPages } from "./CuttingDiagram";
import { formatMeterFromMm } from "./cuttingOptimizer";

const TEXT_SCALE_KEY = "cutting-diagram-text-scale";
const MIN_TEXT_SCALE = 60;
const MAX_TEXT_SCALE = 220;
const DEFAULT_TEXT_SCALE = 130;
const STEP = 10;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export default function CuttingResult({ result, onClose }) {
  const [rollIndex, setRollIndex] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [textScalePercent, setTextScalePercent] =
    useState(DEFAULT_TEXT_SCALE);

  const usedRolls = Array.isArray(result?.usedRolls)
    ? result.usedRolls
    : [];

  useEffect(() => {
    if (!result) return;

    setRollIndex(0);
    setPageIndex(0);
    setCompleted(false);
  }, [result]);

  useEffect(() => {
    try {
      const saved = Number(
        window.localStorage.getItem(TEXT_SCALE_KEY)
      );

      if (
        Number.isFinite(saved) &&
        saved >= MIN_TEXT_SCALE &&
        saved <= MAX_TEXT_SCALE
      ) {
        setTextScalePercent(saved);
      }
    } catch {
      // localStorage 사용 불가 시 기본값 사용
    }
  }, []);

  useEffect(() => {
    if (!result) return;

    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = oldOverflow;
    };
  }, [result]);

  function setTextScale(value) {
    const next = clamp(
      Math.round(Number(value) / STEP) * STEP,
      MIN_TEXT_SCALE,
      MAX_TEXT_SCALE
    );

    setTextScalePercent(next);

    try {
      window.localStorage.setItem(
        TEXT_SCALE_KEY,
        String(next)
      );
    } catch {
      // 저장 실패해도 현재 화면에서는 정상 사용
    }
  }

  function changeTextScale(amount) {
    setTextScale(textScalePercent + amount);
  }

  const currentRoll = usedRolls[rollIndex] || null;

  const pages = useMemo(
    () => (currentRoll ? getCutPages(currentRoll) : []),
    [currentRoll]
  );

  if (!result) return null;

  if (!usedRolls.length) {
    return (
      <FullScreen>
        <div style={{ margin: "auto", textAlign: "center" }}>
          <h2>재단 결과가 없습니다.</h2>

          <button
            type="button"
            onClick={onClose}
            style={primaryButton}
          >
            돌아가기
          </button>
        </div>
      </FullScreen>
    );
  }

  if (completed) {
    const colors = [
      ...new Set(usedRolls.map((roll) => roll.color)),
    ];

    return (
      <FullScreen>
        <div
          style={{
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            padding: 24,
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: 74,
              height: 74,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 18,
              borderRadius: "50%",
              background: "#dcfce7",
              fontSize: 35,
            }}
          >
            ✓
          </div>

          <h1
            style={{
              margin: 0,
              fontSize: 27,
              fontWeight: 900,
              color: "#111827",
            }}
          >
            전체 필름 재단 완료
          </h1>

          <div
            style={{
              marginTop: 18,
              width: "100%",
              maxWidth: 450,
            }}
          >
            {colors.map((color) => (
              <div
                key={color}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "12px 14px",
                  marginBottom: 6,
                  borderRadius: 10,
                  background: "#f1f5f9",
                }}
              >
                <strong>{color}</strong>

                <span
                  style={{
                    color: "#15803d",
                    fontWeight: 900,
                  }}
                >
                  완료 ✓
                </span>
              </div>
            ))}
          </div>

          <div
            style={{
              marginTop: 14,
              color: "#64748b",
              fontSize: 14,
            }}
          >
            총 사용 길이{" "}
            <strong style={{ color: "#111827" }}>
              {formatMeterFromMm(
                result.summary?.totalUsedLength || 0
              )}
            </strong>
          </div>

          <button
            type="button"
            style={{
              ...primaryButton,
              width: "100%",
              maxWidth: 450,
              marginTop: 25,
            }}
            onClick={() => {
              setRollIndex(0);
              setPageIndex(0);
              setCompleted(false);
            }}
          >
            처음부터 다시 보기
          </button>

          <button
            type="button"
            style={{
              ...secondaryButton,
              width: "100%",
              maxWidth: 450,
              marginTop: 8,
            }}
            onClick={onClose}
          >
            재단 화면 닫기
          </button>
        </div>
      </FullScreen>
    );
  }

  const safePageIndex = Math.min(
    Math.max(0, pageIndex),
    Math.max(0, pages.length - 1)
  );

  const isLastPage =
    safePageIndex >= pages.length - 1;

  const isFirstPage = safePageIndex === 0;

  const nextRoll = usedRolls[rollIndex + 1] || null;
  const previousRoll = usedRolls[rollIndex - 1] || null;

  const sameColorNext =
    nextRoll &&
    nextRoll.color === currentRoll.color;

  const nextDifferentColor =
    nextRoll &&
    nextRoll.color !== currentRoll.color;

  function goNext() {
    if (!isLastPage) {
      setPageIndex(safePageIndex + 1);
      return;
    }

    if (nextRoll) {
      setRollIndex(rollIndex + 1);
      setPageIndex(0);
      return;
    }

    setCompleted(true);
  }

  function goPrevious() {
    if (!isFirstPage) {
      setPageIndex(safePageIndex - 1);
      return;
    }

    if (!previousRoll) return;

    const previousPages =
      getCutPages(previousRoll);

    setRollIndex(rollIndex - 1);

    setPageIndex(
      Math.max(0, previousPages.length - 1)
    );
  }

  let nextButtonText = "다음 재단 보기 →";

  if (isLastPage) {
    if (sameColorNext) {
      nextButtonText =
        `다음 ${currentRoll.color} 롤 재단하기 →`;
    } else if (nextDifferentColor) {
      nextButtonText =
        `${nextRoll.color} 재단하기 →`;
    } else {
      nextButtonText = "전체 재단 완료";
    }
  }

  return (
    <FullScreen>
      <div
        style={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
        }}
      >
        <header
          style={{
            flex: "0 0 auto",
            padding: "8px 12px",
            borderBottom: "1px solid #e5e7eb",
            background: "#ffffff",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 10,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 10,
                  color: "#64748b",
                  fontWeight: 900,
                }}
              >
                ROLL {rollIndex + 1}
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 8,
                }}
              >
                <h2
                  style={{
                    margin: 0,
                    fontSize: 23,
                    fontWeight: 900,
                  }}
                >
                  {currentRoll.color}
                </h2>

                <strong
                  style={{
                    color: "#2563eb",
                    fontSize: 14,
                  }}
                >
                  {safePageIndex + 1}/{pages.length}
                </strong>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              style={{
                width: 40,
                height: 40,
                border: "1px solid #d1d5db",
                borderRadius: 10,
                background: "#ffffff",
                fontSize: 22,
              }}
            >
              ×
            </button>
          </div>

          <div
            style={{
              display: "flex",
              gap: 6,
              marginTop: 6,
              overflowX: "auto",
            }}
          >
            <Chip
              label="보유"
              value={formatMeterFromMm(
                currentRoll.lengthMm
              )}
            />

            <Chip
              label="사용"
              value={formatMeterFromMm(
                currentRoll.usedLength
              )}
            />

            <Chip
              label="잔여"
              value={formatMeterFromMm(
                currentRoll.remainingLength
              )}
            />
          </div>

          {/* 재단 이미지 글씨 크기 조절 */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "auto 38px 1fr 52px 38px",
              gap: 6,
              alignItems: "center",
              marginTop: 7,
              padding: "6px 8px",
              borderRadius: 9,
              background: "#f8fafc",
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 900,
                color: "#475569",
                whiteSpace: "nowrap",
              }}
            >
              도면 글씨
            </span>

            <button
              type="button"
              onClick={() =>
                changeTextScale(-STEP)
              }
              disabled={
                textScalePercent <=
                MIN_TEXT_SCALE
              }
              style={fontButton}
            >
              −
            </button>

            <input
              type="range"
              min={MIN_TEXT_SCALE}
              max={MAX_TEXT_SCALE}
              step={STEP}
              value={textScalePercent}
              onChange={(e) =>
                setTextScale(
                  Number(e.target.value)
                )
              }
              style={{
                width: "100%",
              }}
            />

            <strong
              style={{
                textAlign: "center",
                fontSize: 12,
                color: "#111827",
              }}
            >
              {textScalePercent}%
            </strong>

            <button
              type="button"
              onClick={() =>
                changeTextScale(STEP)
              }
              disabled={
                textScalePercent >=
                MAX_TEXT_SCALE
              }
              style={fontButton}
            >
              +
            </button>
          </div>
        </header>

        <main
          style={{
            flex: 1,
            minHeight: 0,
            padding: "7px 8px",
            overflow: "hidden",
          }}
        >
          <CuttingDiagram
            roll={currentRoll}
            pageIndex={safePageIndex}
            textScale={
              textScalePercent / 100
            }
          />
        </main>

        <footer
          style={{
            flex: "0 0 auto",
            padding:
              "9px 10px calc(9px + env(safe-area-inset-bottom))",
            borderTop: "1px solid #e5e7eb",
            background: "#ffffff",
          }}
        >
          {isLastPage &&
            !sameColorNext && (
              <div
                style={{
                  marginBottom: 7,
                  padding: "8px 10px",
                  borderRadius: 8,
                  background: "#dcfce7",
                  color: "#166534",
                  fontSize: 12,
                  fontWeight: 900,
                  textAlign: "center",
                }}
              >
                ✓ {currentRoll.color} 재단 종료
                {nextDifferentColor &&
                  ` · 다음 ${nextRoll.color}`}
              </div>
            )}

          {isLastPage &&
            sameColorNext && (
              <div
                style={{
                  marginBottom: 7,
                  padding: "8px 10px",
                  borderRadius: 8,
                  background: "#eff6ff",
                  color: "#1d4ed8",
                  fontSize: 12,
                  fontWeight: 900,
                  textAlign: "center",
                }}
              >
                ✓ 현재 {currentRoll.color} 롤 재단 완료
              </div>
            )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                previousRoll ||
                !isFirstPage
                  ? "105px 1fr"
                  : "1fr",
              gap: 7,
            }}
          >
            {(previousRoll ||
              !isFirstPage) && (
              <button
                type="button"
                onClick={goPrevious}
                style={secondaryButton}
              >
                ← 이전
              </button>
            )}

            <button
              type="button"
              onClick={goNext}
              style={primaryButton}
            >
              {nextButtonText}
            </button>
          </div>
        </footer>
      </div>
    </FullScreen>
  );
}

function FullScreen({ children }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        background: "#f4f6f8",
        overflow: "hidden",
        overscrollBehavior: "none",
      }}
    >
      {children}
    </div>
  );
}

function Chip({ label, value }) {
  return (
    <span
      style={{
        display: "inline-flex",
        gap: 4,
        alignItems: "center",
        padding: "5px 7px",
        borderRadius: 7,
        background: "#f1f5f9",
        whiteSpace: "nowrap",
        color: "#64748b",
        fontSize: 10,
      }}
    >
      {label}
      <b
        style={{
          color: "#111827",
          fontSize: 11,
        }}
      >
        {value}
      </b>
    </span>
  );
}

const fontButton = {
  width: 38,
  height: 32,
  border: "1px solid #cbd5e1",
  borderRadius: 7,
  background: "#ffffff",
  color: "#111827",
  fontSize: 20,
  fontWeight: 900,
};

const primaryButton = {
  minHeight: 48,
  border: 0,
  borderRadius: 11,
  background: "#111827",
  color: "#ffffff",
  fontSize: 14,
  fontWeight: 900,
  cursor: "pointer",
};

const secondaryButton = {
  minHeight: 48,
  border: "1px solid #cbd5e1",
  borderRadius: 11,
  background: "#ffffff",
  color: "#334155",
  fontSize: 13,
  fontWeight: 900,
  cursor: "pointer",
};
