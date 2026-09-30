"use client";

import React, { useMemo } from "react";

const FILM_WIDTH = 1220;

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function meterText(mm) {
  return `${(num(mm) / 1000).toFixed(2)}m`;
}

function getPieceTop(piece) {
  return num(piece.y);
}

function getPieceBottom(piece) {
  return num(piece.y) + num(piece.height);
}

/*
  어떤 조각도 통과하지 않는 Y 위치만
  가로 절단 가능 위치로 판단합니다.
*/
function findSafeCutLines(placements, usedLength) {
  const candidates = new Set([
    0,
    num(usedLength),
  ]);

  placements.forEach((piece) => {
    candidates.add(getPieceTop(piece));
    candidates.add(getPieceBottom(piece));
  });

  return [...candidates]
    .filter(
      (line) =>
        line >= 0 &&
        line <= num(usedLength)
    )
    .sort((a, b) => a - b)
    .filter((line) => {
      if (
        line === 0 ||
        line === num(usedLength)
      ) {
        return true;
      }

      return !placements.some((piece) => {
        const top = getPieceTop(piece);
        const bottom = getPieceBottom(piece);

        return (
          top < line &&
          bottom > line
        );
      });
    });
}

/*
  안전 절단선마다 페이지를 나눕니다.

  너무 짧은 구간이 계속 생기는 것을 막기 위해
  최소 약 700mm 이상 진행된 안전 절단선을 우선합니다.

  단, 가장 긴 조각이 끝나는 지점처럼
  실제 배치상 의미 있는 안전 절단선은 유지됩니다.
*/
function createCutPages(
  placements,
  usedLength
) {
  const safeLines =
    findSafeCutLines(
      placements,
      usedLength
    );

  if (safeLines.length <= 2) {
    return [
      {
        index: 0,
        start: 0,
        end: num(usedLength),
      },
    ];
  }

  const pages = [];
  let start = 0;

  while (start < num(usedLength)) {
    const candidates =
      safeLines.filter(
        (line) => line > start
      );

    if (!candidates.length) {
      break;
    }

    /*
      현재 시작점 이후의 조각 중
      가장 먼저 의미 있게 끝나는 안전선을 찾습니다.
    */
    const meaningful =
      candidates.find(
        (line) =>
          line - start >= 700
      );

    const end =
      meaningful ||
      candidates[
        candidates.length - 1
      ];

    pages.push({
      index: pages.length,
      start,
      end,
    });

    start = end;
  }

  if (
    pages.length === 0 ||
    pages[
      pages.length - 1
    ].end < num(usedLength)
  ) {
    pages.push({
      index: pages.length,
      start:
        pages.length > 0
          ? pages[
              pages.length - 1
            ].end
          : 0,
      end: num(usedLength),
    });
  }

  return pages.filter(
    (page) =>
      page.end > page.start
  );
}

function getPiecesForPage(
  placements,
  start,
  end
) {
  return placements.filter(
    (piece) => {
      const top =
        getPieceTop(piece);

      const bottom =
        getPieceBottom(piece);

      return (
        bottom > start &&
        top < end
      );
    }
  );
}

function makeTicks(
  start,
  end,
  step
) {
  const result = [];

  let current =
    Math.ceil(start / step) *
    step;

  while (current <= end) {
    result.push(current);
    current += step;
  }

  return result;
}

function getPieceColor(index) {
  const colors = [
    "#dbeafe",
    "#dcfce7",
    "#fef3c7",
    "#fce7f3",
    "#ede9fe",
    "#cffafe",
  ];

  return colors[
    index % colors.length
  ];
}
function GridLines({
  pageStart,
  pageEnd,
  left,
  top,
}) {
  const pageLength =
    pageEnd - pageStart;

  const verticalTicks =
    makeTicks(
      0,
      FILM_WIDTH,
      10
    );

  const horizontalTicks =
    makeTicks(
      pageStart,
      pageEnd,
      10
    );

  return (
    <>
      {/* 폭 방향: 1cm 세로선 */}
      {verticalTicks.map(
        (tick) => {
          const x =
            left + tick;

          const is100 =
            tick % 100 === 0;

          const is1000 =
            tick % 1000 === 0;

          const edge =
            tick === 0 ||
            tick === FILM_WIDTH;

          return (
            <g
              key={`vx-${tick}`}
            >
              <line
                x1={x}
                y1={top}
                x2={x}
                y2={
                  top +
                  pageLength
                }
                stroke={
                  edge
                    ? "#334155"
                    : is1000
                    ? "#64748b"
                    : is100
                    ? "#94a3b8"
                    : "#e2e8f0"
                }
                strokeWidth={
                  edge
                    ? 3
                    : is1000
                    ? 2
                    : is100
                    ? 1.2
                    : 0.45
                }
              />

              {is100 && (
                <text
                  x={x}
                  y={top - 17}
                  textAnchor="middle"
                  fontSize={
                    is1000
                      ? 22
                      : 16
                  }
                  fontWeight={
                    is1000
                      ? "900"
                      : "700"
                  }
                  fill="#475569"
                >
                  {tick}
                </text>
              )}
            </g>
          );
        }
      )}

      {/* 1220mm 끝 숫자 */}
      <text
        x={
          left +
          FILM_WIDTH
        }
        y={top - 42}
        textAnchor="end"
        fontSize="19"
        fontWeight="900"
        fill="#111827"
      >
        1220mm
      </text>

      {/* 길이 방향: 1cm 가로선 */}
      {horizontalTicks.map(
        (absolute) => {
          const local =
            absolute -
            pageStart;

          const y =
            top + local;

          const isMeter =
            absolute %
              1000 ===
            0;

          const is100 =
            absolute %
              100 ===
            0;

          return (
            <g
              key={`hy-${absolute}`}
            >
              <line
                x1={left}
                y1={y}
                x2={
                  left +
                  FILM_WIDTH
                }
                y2={y}
                stroke={
                  isMeter
                    ? "#64748b"
                    : is100
                    ? "#94a3b8"
                    : "#e2e8f0"
                }
                strokeWidth={
                  isMeter
                    ? 2.2
                    : is100
                    ? 1.2
                    : 0.45
                }
              />

              {isMeter ? (
                <text
                  x={left - 15}
                  y={y + 8}
                  textAnchor="end"
                  fontSize="24"
                  fontWeight="900"
                  fill="#1d4ed8"
                >
                  {meterText(
                    absolute
                  )}
                </text>
              ) : is100 ? (
                <text
                  x={left - 15}
                  y={y + 6}
                  textAnchor="end"
                  fontSize="14"
                  fontWeight="700"
                  fill="#64748b"
                >
                  {absolute %
                    1000}
                </text>
              ) : null}
            </g>
          );
        }
      )}

      {/* 페이지 시작 누적거리 */}
      <text
        x={left - 15}
        y={top + 7}
        textAnchor="end"
        fontSize="22"
        fontWeight="900"
        fill="#1d4ed8"
      >
        {meterText(
          pageStart
        )}
      </text>
    </>
  );
}

function PieceText({
  piece,
  number,
  x,
  y,
  width,
  height,
}) {
  const originalWidth =
    num(piece.originalWidth);

  const originalHeight =
    num(piece.originalHeight);

  const centerX =
    x + width / 2;

  const centerY =
    y + height / 2;

  /*
    작은 칸도 치수는 절대 생략하지 않습니다.
  */
  if (
    width < 170 ||
    height < 170
  ) {
    const rotate =
      width < 90 &&
      height > 150;

    return (
      <>
        <text
          x={centerX}
          y={
            rotate
              ? centerY - 30
              : centerY - 10
          }
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={
            width < 70
              ? 16
              : 20
          }
          fontWeight="900"
          fill="#111827"
        >
          #{number}
        </text>

        <text
          x={centerX}
          y={
            rotate
              ? centerY + 15
              : centerY + 20
          }
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={
            width < 70
              ? 12
              : 16
          }
          fontWeight="900"
          fill="#334155"
          transform={
            rotate
              ? `rotate(-90 ${centerX} ${centerY + 15})`
              : undefined
          }
        >
          {originalWidth}×
          {originalHeight}
        </text>
      </>
    );
  }

  return (
    <>
      <text
        x={centerX}
        y={centerY - 52}
        textAnchor="middle"
        fontSize={
          width > 350
            ? 28
            : 21
        }
        fontWeight="900"
        fill="#111827"
      >
        #{number}
      </text>

      <text
        x={centerX}
        y={centerY - 17}
        textAnchor="middle"
        fontSize={
          width > 350
            ? 24
            : 18
        }
        fontWeight="800"
        fill="#111827"
      >
        {piece.location}
      </text>

      <text
        x={centerX}
        y={centerY + 16}
        textAnchor="middle"
        fontSize={
          width > 350
            ? 23
            : 17
        }
        fontWeight="700"
        fill="#334155"
      >
        {piece.part}
      </text>

      <text
        x={centerX}
        y={centerY + 52}
        textAnchor="middle"
        fontSize={
          width > 350
            ? 25
            : 18
        }
        fontWeight="900"
        fill="#111827"
      >
        {originalWidth}×
        {originalHeight}
      </text>

      {piece.rotated && (
        <text
          x={centerX}
          y={centerY + 80}
          textAnchor="middle"
          fontSize="15"
          fontWeight="900"
          fill="#b45309"
        >
          회전
        </text>
      )}
    </>
  );
    }
function CutPage({
  page,
  placements,
  totalPages,
}) {
  const LEFT = 120;
  const RIGHT = 35;
  const TOP = 80;
  const BOTTOM = 75;

  const pageLength =
    page.end - page.start;

  const svgWidth =
    LEFT + FILM_WIDTH + RIGHT;

  const svgHeight =
    TOP + pageLength + BOTTOM;

  const pieces =
    getPiecesForPage(
      placements,
      page.start,
      page.end
    );

  return (
    <section
      style={{
        marginBottom: 22,
        border: "1px solid #d1d5db",
        borderRadius: 14,
        overflow: "hidden",
        background: "#ffffff",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          padding: "11px 12px",
          borderBottom:
            "1px solid #e5e7eb",
          background: "#f8fafc",
        }}
      >
        <div>
          <strong
            style={{
              fontSize: 16,
              fontWeight: 900,
            }}
          >
            {page.index + 1}차 재단
          </strong>

          <div
            style={{
              marginTop: 3,
              fontSize: 12,
              fontWeight: 700,
              color: "#64748b",
            }}
          >
            {meterText(page.start)}
            {" ~ "}
            {meterText(page.end)}
          </div>
        </div>

        <div
          style={{
            padding: "7px 9px",
            borderRadius: 8,
            background: "#fee2e2",
            color: "#b91c1c",
            fontSize: 12,
            fontWeight: 900,
          }}
        >
          {meterText(page.end)}
          에서 가로 절단
        </div>
      </div>

      <div
        style={{
          padding: 6,
          overflowX: "auto",
          WebkitOverflowScrolling:
            "touch",
        }}
      >
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          preserveAspectRatio="xMidYMin meet"
          style={{
            display: "block",
            width: "100%",
            minWidth: 620,
            height: "auto",
            background: "#ffffff",
          }}
        >
          <rect
            x={LEFT}
            y={TOP}
            width={FILM_WIDTH}
            height={pageLength}
            fill="#ffffff"
            stroke="#111827"
            strokeWidth="4"
          />

          <GridLines
            pageStart={page.start}
            pageEnd={page.end}
            left={LEFT}
            top={TOP}
          />

          {pieces.map((piece) => {
            const globalIndex =
              placements.findIndex(
                (item) =>
                  item.id === piece.id
              );

            const x =
              LEFT + num(piece.x);

            const y =
              TOP +
              num(piece.y) -
              page.start;

            const width =
              num(piece.width);

            const height =
              num(piece.height);

            return (
              <g key={piece.id}>
                <rect
                  x={x}
                  y={y}
                  width={width}
                  height={height}
                  fill={getPieceColor(
                    globalIndex
                  )}
                  fillOpacity="0.88"
                  stroke="#111827"
                  strokeWidth="3"
                />

                <PieceText
                  piece={piece}
                  number={
                    globalIndex + 1
                  }
                  x={x}
                  y={y}
                  width={width}
                  height={height}
                />
              </g>
            );
          })}

          <line
            x1={LEFT}
            y1={TOP + pageLength}
            x2={LEFT + FILM_WIDTH}
            y2={TOP + pageLength}
            stroke="#dc2626"
            strokeWidth="8"
          />

          <text
            x={LEFT - 15}
            y={
              TOP +
              pageLength +
              8
            }
            textAnchor="end"
            fontSize="23"
            fontWeight="900"
            fill="#dc2626"
          >
            {meterText(page.end)}
          </text>

          <text
            x={
              LEFT +
              FILM_WIDTH -
              8
            }
            y={
              TOP +
              pageLength -
              14
            }
            textAnchor="end"
            fontSize="21"
            fontWeight="900"
            fill="#dc2626"
          >
            여기서 가로 절단
          </text>
        </svg>
      </div>

      <div
        style={{
          padding: "8px 12px 11px",
          borderTop:
            "1px solid #e5e7eb",
          fontSize: 11,
          color: "#64748b",
          fontWeight: 700,
        }}
      >
        페이지 {page.index + 1}
        {" / "}
        {totalPages}
        {" · 시작 "}
        {meterText(page.start)}
        {" · 종료 "}
        {meterText(page.end)}
      </div>
    </section>
  );
}
function PieceList({
  placements,
}) {
  return (
    <div
      style={{
        marginTop: 12,
        border:
          "1px solid #e5e7eb",
        borderRadius: 10,
        overflow: "hidden",
        background: "#ffffff",
      }}
    >
      <div
        style={{
          padding: "9px 10px",
          background: "#f8fafc",
          borderBottom:
            "1px solid #e5e7eb",
          fontSize: 13,
          fontWeight: 900,
          color: "#111827",
        }}
      >
        전체 재단 목록
      </div>

      {placements.map(
        (piece, index) => (
          <div
            key={
              `list-${piece.id}`
            }
            style={{
              display: "grid",
              gridTemplateColumns:
                "38px 1fr auto",
              gap: 8,
              alignItems: "center",
              padding: "8px 10px",
              borderBottom:
                index ===
                placements.length - 1
                  ? "0"
                  : "1px solid #e5e7eb",
            }}
          >
            <strong
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent:
                  "center",
                minHeight: 30,
                borderRadius: 6,
                background: "#e5e7eb",
                fontSize: 11,
              }}
            >
              #{index + 1}
            </strong>

            <div
              style={{
                minWidth: 0,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 900,
                  color: "#111827",
                }}
              >
                {piece.location}
                {" · "}
                {piece.part}
              </div>

              <div
                style={{
                  marginTop: 2,
                  fontSize: 12,
                  fontWeight: 800,
                  color: "#475569",
                }}
              >
                {num(
                  piece.originalWidth
                )}
                ×
                {num(
                  piece.originalHeight
                )}
                mm
                {piece.rotated
                  ? " · 회전"
                  : ""}
              </div>
            </div>

            <strong
              style={{
                fontSize: 11,
                color: "#475569",
              }}
            >
              {piece.color}
            </strong>
          </div>
        )
      )}
    </div>
  );
}

function RollHeader({
  roll,
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent:
          "space-between",
        alignItems: "flex-start",
        gap: 12,
        marginBottom: 12,
        padding: 12,
        border:
          "1px solid #e5e7eb",
        borderRadius: 12,
        background: "#ffffff",
      }}
    >
      <div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 900,
            color: "#64748b",
          }}
        >
          CUTTING PLAN
        </div>

        <h3
          style={{
            margin: "3px 0 0",
            fontSize: 22,
            fontWeight: 900,
            color: "#111827",
          }}
        >
          {roll.color}
        </h3>

        <div
          style={{
            marginTop: 4,
            fontSize: 12,
            color: "#64748b",
            fontWeight: 700,
          }}
        >
          {roll.grainDirection
            ? "결 있음 · 회전 금지"
            : "결 없음 · 회전 가능"}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(3, auto)",
          gap: 7,
        }}
      >
        <StatBox
          label="보유"
          value={meterText(
            roll.lengthMm
          )}
        />

        <StatBox
          label="사용"
          value={meterText(
            roll.usedLength
          )}
        />

        <StatBox
          label="잔여"
          value={meterText(
            roll.remainingLength
          )}
        />
      </div>
    </div>
  );
}

function StatBox({
  label,
  value,
}) {
  return (
    <div
      style={{
        minWidth: 62,
        padding: "7px 8px",
        borderRadius: 8,
        background: "#f1f5f9",
      }}
    >
      <span
        style={{
          display: "block",
          marginBottom: 2,
          fontSize: 10,
          color: "#64748b",
          fontWeight: 700,
        }}
      >
        {label}
      </span>

      <strong
        style={{
          fontSize: 12,
          color: "#111827",
          fontWeight: 900,
        }}
      >
        {value}
      </strong>
    </div>
  );
              }
export default function CuttingDiagram({
  roll,
}) {
  const placements =
    Array.isArray(
      roll?.placements
    )
      ? roll.placements
      : [];

  const usedLength =
    Math.max(
      0,
      num(
        roll?.usedLength
      )
    );

  const pages = useMemo(
    () =>
      createCutPages(
        placements,
        usedLength
      ),
    [
      placements,
      usedLength,
    ]
  );

  if (
    !roll ||
    usedLength <= 0 ||
    placements.length === 0
  ) {
    return (
      <div
        style={{
          padding: 14,
          border:
            "1px solid #e5e7eb",
          borderRadius: 10,
          background: "#ffffff",
          color: "#64748b",
          fontSize: 13,
        }}
      >
        표시할 재단 결과가 없습니다.
      </div>
    );
  }

  return (
    <div
      style={{
        marginTop: 14,
      }}
    >
      <RollHeader
        roll={roll}
      />

      <div
        style={{
          marginBottom: 10,
          padding: "9px 11px",
          borderRadius: 9,
          background: "#eff6ff",
          color: "#1e40af",
          fontSize: 12,
          fontWeight: 800,
          lineHeight: 1.5,
        }}
      >
        폭 1220mm · 1cm 격자 ·
        10cm 숫자 표시 ·
        1m마다 누적 미터 표시
      </div>

      {pages.map(
        (page) => (
          <CutPage
            key={
              `${page.start}-${page.end}`
            }
            page={page}
            placements={
              placements
            }
            totalPages={
              pages.length
            }
          />
        )
      )}

      <PieceList
        placements={
          placements
        }
      />
    </div>
  );
            }
