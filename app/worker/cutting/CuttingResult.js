"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import CuttingDiagram, {
  getCutPages,
} from "./CuttingDiagram";

import {
  formatMeterFromMm,
} from "./cuttingOptimizer";

export default function CuttingResult({
  result,
  onClose,
}) {
  const [rollIndex, setRollIndex] =
    useState(0);

  const [pageIndex, setPageIndex] =
    useState(0);

  const [completed, setCompleted] =
    useState(false);

  const usedRolls =
    Array.isArray(
      result?.usedRolls
    )
      ? result.usedRolls
      : [];

  useEffect(() => {
    if (!result) return;

    setRollIndex(0);
    setPageIndex(0);
    setCompleted(false);
  }, [result]);

  /*
    결과 화면에서는 뒤 페이지가 스크롤되지 않도록 처리
  */
  useEffect(() => {
    if (!result) return;

    const oldOverflow =
      document.body.style.overflow;

    document.body.style.overflow =
      "hidden";

    return () => {
      document.body.style.overflow =
        oldOverflow;
    };
  }, [result]);

  const currentRoll =
    usedRolls[rollIndex] ||
    null;

  const pages =
    useMemo(
      () =>
        currentRoll
          ? getCutPages(
              currentRoll
            )
          : [],
      [currentRoll]
    );

  if (!result) {
    return null;
  }

  if (!usedRolls.length) {
    return (
      <FullScreen>
        <div
          style={{
            margin: "auto",
            textAlign: "center",
          }}
        >
          <h2>
            재단 결과가 없습니다.
          </h2>

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

  /*
    모든 컬러 재단 완료 화면
  */
  if (completed) {
    const colors = [
      ...new Set(
        usedRolls.map(
          (roll) =>
            roll.color
        )
      ),
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
            {colors.map(
              (color) => (
                <div
                  key={color}
                  style={{
                    display: "flex",
                    justifyContent:
                      "space-between",
                    padding:
                      "12px 14px",
                    marginBottom: 6,
                    borderRadius: 10,
                    background:
                      "#f1f5f9",
                  }}
                >
                  <strong>
                    {color}
                  </strong>

                  <span
                    style={{
                      color:
                        "#15803d",
                      fontWeight: 900,
                    }}
                  >
                    완료 ✓
                  </span>
                </div>
              )
            )}
          </div>

          <div
            style={{
              marginTop: 14,
              color: "#64748b",
              fontSize: 14,
            }}
          >
            총 사용 길이{" "}
            <strong
              style={{
                color: "#111827",
              }}
            >
              {formatMeterFromMm(
                result.summary
                  ?.totalUsedLength ||
                  0
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
              setCompleted(
                false
              );
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

  const safePageIndex =
    Math.min(
      Math.max(
        0,
        pageIndex
      ),
      Math.max(
        0,
        pages.length - 1
      )
    );

  const isLastPage =
    safePageIndex >=
    pages.length - 1;

  const isFirstPage =
    safePageIndex === 0;

  const nextRoll =
    usedRolls[
      rollIndex + 1
    ] || null;

  const previousRoll =
    usedRolls[
      rollIndex - 1
    ] || null;

  const sameColorNext =
    nextRoll &&
    nextRoll.color ===
      currentRoll.color;

  const nextDifferentColor =
    nextRoll &&
    nextRoll.color !==
      currentRoll.color;

  function goNext() {
    /*
      같은 롤의 다음 재단 차수
    */
    if (!isLastPage) {
      setPageIndex(
        safePageIndex + 1
      );

      return;
    }

    /*
      다음 롤 또는 다음 컬러
    */
    if (nextRoll) {
      setRollIndex(
        rollIndex + 1
      );

      setPageIndex(0);

      return;
    }

    /*
      마지막 컬러 마지막 페이지
    */
    setCompleted(true);
  }

  function goPrevious() {
    if (!isFirstPage) {
      setPageIndex(
        safePageIndex - 1
      );

      return;
    }

    if (!previousRoll) {
      return;
    }

    const previousPages =
      getCutPages(
        previousRoll
      );

    setRollIndex(
      rollIndex - 1
    );

    setPageIndex(
      Math.max(
        0,
        previousPages.length -
          1
      )
    );
  }

  let nextButtonText =
    "다음 재단 보기 →";

  if (isLastPage) {
    if (sameColorNext) {
      nextButtonText =
        `다음 ${currentRoll.color} 롤 재단하기 →`;
    } else if (
      nextDifferentColor
    ) {
      nextButtonText =
        `${nextRoll.color} 재단하기 →`;
    } else {
      nextButtonText =
        "전체 재단 완료";
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
        {/* 상단 */}
        <header
          style={{
            flex: "0 0 auto",
            padding:
              "10px 12px 8px",
            borderBottom:
              "1px solid #e5e7eb",
            background: "#ffffff",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent:
                "space-between",
              alignItems:
                "center",
              gap: 10,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 10,
                  color:
                    "#64748b",
                  fontWeight: 900,
                }}
              >
                ROLL{" "}
                {rollIndex + 1}
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems:
                    "baseline",
                  gap: 8,
                  marginTop: 1,
                }}
              >
                <h2
                  style={{
                    margin: 0,
                    fontSize: 23,
                    fontWeight: 900,
                  }}
                >
                  {
                    currentRoll.color
                  }
                </h2>

                <strong
                  style={{
                    color:
                      "#2563eb",
                    fontSize: 14,
                  }}
                >
                  {safePageIndex +
                    1}
                  /
                  {pages.length}
                </strong>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              style={{
                width: 40,
                height: 40,
                border:
                  "1px solid #d1d5db",
                borderRadius: 10,
                background:
                  "#ffffff",
                fontSize: 22,
                cursor:
                  "pointer",
              }}
            >
              ×
            </button>
          </div>

          <div
            style={{
              display: "flex",
              gap: 6,
              marginTop: 7,
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
        </header>

        {/* 재단 이미지 */}
        <main
          style={{
            flex: 1,
            minHeight: 0,
            padding:
              "7px 8px",
            overflow: "hidden",
          }}
        >
          <CuttingDiagram
            roll={currentRoll}
            pageIndex={
              safePageIndex
            }
          />
        </main>

        {/* 하단 조작 */}
        <footer
          style={{
            flex: "0 0 auto",
            padding:
              "9px 10px calc(9px + env(safe-area-inset-bottom))",
            borderTop:
              "1px solid #e5e7eb",
            background:
              "#ffffff",
          }}
        >
          {/* 마지막 페이지 컬러 종료 안내 */}
          {isLastPage &&
            !sameColorNext && (
              <div
                style={{
                  marginBottom: 7,
                  padding:
                    "8px 10px",
                  borderRadius: 8,
                  background:
                    "#dcfce7",
                  color:
                    "#166534",
                  fontSize: 12,
                  fontWeight: 900,
                  textAlign:
                    "center",
                }}
              >
                ✓{" "}
                {
                  currentRoll.color
                }{" "}
                재단 종료
                {nextDifferentColor &&
                  ` · 다음 ${nextRoll.color}`}
              </div>
            )}

          {isLastPage &&
            sameColorNext && (
              <div
                style={{
                  marginBottom: 7,
                  padding:
                    "8px 10px",
                  borderRadius: 8,
                  background:
                    "#eff6ff",
                  color:
                    "#1d4ed8",
                  fontSize: 12,
                  fontWeight: 900,
                  textAlign:
                    "center",
                }}
              >
                ✓ 현재{" "}
                {
                  currentRoll.color
                }{" "}
                롤 재단 완료
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
                onClick={
                  goPrevious
                }
                style={
                  secondaryButton
                }
              >
                ← 이전
              </button>
            )}

            <button
              type="button"
              onClick={goNext}
              style={
                primaryButton
              }
            >
              {nextButtonText}
            </button>
          </div>
        </footer>
      </div>
    </FullScreen>
  );
}

function FullScreen({
  children,
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        background:
          "#f4f6f8",
        overflow: "hidden",
        overscrollBehavior:
          "none",
      }}
    >
      {children}
    </div>
  );
}

function Chip({
  label,
  value,
}) {
  return (
    <span
      style={{
        display:
          "inline-flex",
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
  border:
    "1px solid #cbd5e1",
  borderRadius: 11,
  background: "#ffffff",
  color: "#334155",
  fontSize: 13,
  fontWeight: 900,
  cursor: "pointer",
};
