"use client";

import React, { useMemo } from "react";

const FILM_WIDTH = 1220;

const n = (v) => {
  const x = Number(v);
  return Number.isFinite(x) ? Math.round(x) : 0;
};

const meter = (mm) => `${(n(mm) / 1000).toFixed(2)}m`;

function getPages(roll) {
  if (Array.isArray(roll?.batches) && roll.batches.length) {
    return roll.batches.map((batch, index) => ({
      index,
      start: n(batch.start),
      end: n(batch.end),
      type: batch.type || "batch",
      usedWidth: n(batch.usedWidth),
      wasteWidth: n(batch.wasteWidth),
    }));
  }

  const used = Math.max(0, n(roll?.usedLength));

  return used > 0
    ? [
        {
          index: 0,
          start: 0,
          end: used,
          type: "fallback",
          usedWidth: 0,
          wasteWidth: 0,
        },
      ]
    : [];
}

function pagePieces(placements, page) {
  return placements.filter((piece) => {
    const top = n(piece.y);
    const bottom = top + n(piece.height);

    return bottom > page.start && top < page.end;
  });
}

function range(start, end, step) {
  const out = [];

  let value =
    Math.ceil(start / step) * step;

  while (value <= end) {
    out.push(value);
    value += step;
  }

  return out;
}

function fillColor(index) {
  const palette = [
    "#dbeafe",
    "#dcfce7",
    "#fef3c7",
    "#fce7f3",
    "#ede9fe",
    "#cffafe",
  ];

  return palette[index % palette.length];
}

function Grid({
  page,
  left,
  top,
}) {
  const pageLength =
    page.end - page.start;

  const xTicks = range(
    0,
    FILM_WIDTH,
    10
  );

  const yTicks = range(
    page.start,
    page.end,
    10
  );

  return (
    <>
      {/* 폭 방향 세로선 */}
      {xTicks.map((tick) => {
        const x =
          left + tick;

        const major100 =
          tick % 100 === 0;

        const major1000 =
          tick % 1000 === 0;

        const edge =
          tick === 0 ||
          tick === FILM_WIDTH;

        return (
          <g key={`x-${tick}`}>
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
                  ? "#111827"
                  : major1000
                  ? "#64748b"
                  : major100
                  ? "#94a3b8"
                  : "#e5e7eb"
              }
              strokeWidth={
                edge
                  ? 3
                  : major1000
                  ? 2
                  : major100
                  ? 1.15
                  : 0.45
              }
            />

            {major100 && (
              <text
                x={x}
                y={top - 16}
                textAnchor="middle"
                fontSize={
                  major1000
                    ? 22
                    : 15
                }
                fontWeight={
                  major1000
                    ? 900
                    : 700
                }
                fill="#475569"
              >
                {tick}
              </text>
            )}
          </g>
        );
      })}

      <text
        x={
          left +
          FILM_WIDTH
        }
        y={top - 42}
        textAnchor="end"
        fontSize="18"
        fontWeight="900"
        fill="#111827"
      >
        1220mm
      </text>

      {/* 롤 진행 방향 가로선 */}
      {yTicks.map((absolute) => {
        const local =
          absolute -
          page.start;

        const y =
          top + local;

        const major100 =
          absolute % 100 === 0;

        const major1000 =
          absolute % 1000 === 0;

        return (
          <g
            key={`y-${absolute}`}
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
                major1000
                  ? "#64748b"
                  : major100
                  ? "#94a3b8"
                  : "#e5e7eb"
              }
              strokeWidth={
                major1000
                  ? 2.2
                  : major100
                  ? 1.15
                  : 0.45
              }
            />

            {major1000 ? (
              <text
                x={left - 14}
                y={y + 7}
                textAnchor="end"
                fontSize="23"
                fontWeight="900"
                fill="#1d4ed8"
              >
                {meter(
                  absolute
                )}
              </text>
            ) : major100 ? (
              <text
                x={left - 14}
                y={y + 5}
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
      })}

      {/* 페이지 시작 누적 거리 */}
      <text
        x={left - 14}
        y={top + 7}
        textAnchor="end"
        fontSize="20"
        fontWeight="900"
        fill="#1d4ed8"
      >
        {meter(page.start)}
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
  const ow =
    n(piece.originalWidth);

  const oh =
    n(piece.originalHeight);

  const cx =
    x + width / 2;

  const cy =
    y + height / 2;

  /*
    폭이 매우 좁은 조각은
    치수를 세로로 회전시켜 반드시 표시
  */
  if (
    width < 110 &&
    height > 180
  ) {
    return (
      <>
        <text
          x={cx}
          y={cy - 36}
          textAnchor="middle"
          fontSize="17"
          fontWeight="900"
          fill="#111827"
        >
          #{number}
        </text>

        <text
          x={cx}
          y={cy + 12}
          textAnchor="middle"
          fontSize={
            width < 65
              ? 12
              : 15
          }
          fontWeight="900"
          fill="#111827"
          transform={`rotate(-90 ${cx} ${cy + 12})`}
        >
          {ow}×{oh}
        </text>
      </>
    );
  }

  /*
    높이가 낮거나 폭이 좁은 조각도
    번호와 사이즈는 반드시 표시
  */
  if (
    height < 155 ||
    width < 180
  ) {
    return (
      <>
        <text
          x={cx}
          y={cy - 10}
          textAnchor="middle"
          fontSize="17"
          fontWeight="900"
          fill="#111827"
        >
          #{number}
        </text>

        <text
          x={cx}
          y={cy + 18}
          textAnchor="middle"
          fontSize="14"
          fontWeight="900"
          fill="#111827"
        >
          {ow}×{oh}
        </text>
      </>
    );
  }

  const fs =
    width >= 350
      ? 22
      : 17;

  return (
    <>
      <text
        x={cx}
        y={cy - 52}
        textAnchor="middle"
        fontSize={fs + 3}
        fontWeight="900"
        fill="#111827"
      >
        #{number}
      </text>

      <text
        x={cx}
        y={cy - 19}
        textAnchor="middle"
        fontSize={fs}
        fontWeight="800"
        fill="#111827"
      >
        {piece.location}
      </text>

      <text
        x={cx}
        y={cy + 11}
        textAnchor="middle"
        fontSize={fs - 1}
        fontWeight="700"
        fill="#334155"
      >
        {piece.part}
      </text>

      <text
        x={cx}
        y={cy + 44}
        textAnchor="middle"
        fontSize={fs}
        fontWeight="900"
        fill="#111827"
      >
        {ow}×{oh}
      </text>

      {piece.rotated && (
        <text
          x={cx}
          y={cy + 70}
          textAnchor="middle"
          fontSize="14"
          fontWeight="900"
          fill="#b45309"
        >
          회전
        </text>
      )}
    </>
  );
}

function PagePieceList({
  pieces,
  placements,
}) {
  return (
    <div
      style={{
        borderTop:
          "1px solid #e5e7eb",
        padding:
          "8px 10px 10px",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 900,
          color: "#64748b",
          marginBottom: 6,
        }}
      >
        이 차수 재단 목록
      </div>

      <div
        style={{
          display: "grid",
          gap: 5,
        }}
      >
        {pieces.map((piece) => {
          const number =
            placements.findIndex(
              (p) =>
                p.id === piece.id
            ) + 1;

          return (
            <div
              key={`list-${piece.id}`}
              style={{
                display: "grid",
                gridTemplateColumns:
                  "34px 1fr auto",
                gap: 7,
                alignItems:
                  "center",
                padding: "7px 8px",
                borderRadius: 7,
                background:
                  "#f8fafc",
              }}
            >
              <strong
                style={{
                  fontSize: 11,
                }}
              >
                #{number}
              </strong>

              <div
                style={{
                  minWidth: 0,
                }}
              >
                <b
                  style={{
                    display:
                      "block",
                    fontSize: 12,
                  }}
                >
                  {piece.location}
                  {" · "}
                  {piece.part}
                </b>

                <span
                  style={{
                    fontSize: 11,
                    color:
                      "#64748b",
                  }}
                >
                  {n(
                    piece.originalWidth
                  )}
                  ×
                  {n(
                    piece.originalHeight
                  )}
                  mm
                  {piece.rotated
                    ? " · 회전"
                    : ""}
                </span>
              </div>

              <strong
                style={{
                  fontSize: 11,
                  color:
                    "#475569",
                }}
              >
                {piece.color}
              </strong>
            </div>
          );
        })}
      </div>
    </div>
  );
}
function CutPage({
  page,
  placements,
  totalPages,
}) {
  const LEFT = 115;
  const RIGHT = 35;
  const TOP = 78;
  const BOTTOM = 64;

  const pageLength =
    page.end -
    page.start;

  const svgWidth =
    LEFT +
    FILM_WIDTH +
    RIGHT;

  const svgHeight =
    TOP +
    pageLength +
    BOTTOM;

  const pieces =
    pagePieces(
      placements,
      page
    );

  return (
    <section
      style={{
        marginBottom: 18,
        border:
          "1px solid #d1d5db",
        borderRadius: 13,
        overflow: "hidden",
        background: "#fff",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent:
            "space-between",
          alignItems: "center",
          gap: 8,
          padding:
            "10px 11px",
          background:
            "#f8fafc",
          borderBottom:
            "1px solid #e5e7eb",
        }}
      >
        <div>
          <strong
            style={{
              fontSize: 16,
            }}
          >
            {page.index + 1}차 재단
          </strong>

          <div
            style={{
              marginTop: 2,
              fontSize: 12,
              fontWeight: 700,
              color: "#64748b",
            }}
          >
            {meter(
              page.start
            )}{" "}
            ~{" "}
            {meter(
              page.end
            )}
            {" · 길이 "}
            {meter(
              pageLength
            )}
          </div>
        </div>

        <div
          style={{
            padding: "6px 8px",
            borderRadius: 7,
            background:
              "#fee2e2",
            color: "#b91c1c",
            fontSize: 11,
            fontWeight: 900,
          }}
        >
          {meter(
            page.end
          )}{" "}
          가로 절단
        </div>
      </div>

      <div
        style={{
          padding: 5,
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
            background: "#fff",
          }}
        >
          {/* 필름 영역 */}
          <rect
            x={LEFT}
            y={TOP}
            width={FILM_WIDTH}
            height={pageLength}
            fill="#fff"
            stroke="#111827"
            strokeWidth="4"
          />

          {/* 1cm / 10cm / 1m 격자 */}
          <Grid
            page={page}
            left={LEFT}
            top={TOP}
          />

          {/* 재단 조각 */}
          {pieces.map((piece) => {
            const globalIndex =
              placements.findIndex(
                (p) =>
                  p.id === piece.id
              );

            const x =
              LEFT +
              n(piece.x);

            const y =
              TOP +
              n(piece.y) -
              page.start;

            const width =
              n(piece.width);

            const height =
              n(piece.height);

            return (
              <g
                key={piece.id}
              >
                <rect
                  x={x}
                  y={y}
                  width={width}
                  height={height}
                  fill={fillColor(
                    globalIndex
                  )}
                  fillOpacity="0.9"
                  stroke="#111827"
                  strokeWidth="3"
                />

                <PieceText
                  piece={piece}
                  number={
                    globalIndex +
                    1
                  }
                  x={x}
                  y={y}
                  width={width}
                  height={height}
                />
              </g>
            );
          })}

          {/* 가로 절단선 */}
          <line
            x1={LEFT}
            y1={
              TOP +
              pageLength
            }
            x2={
              LEFT +
              FILM_WIDTH
            }
            y2={
              TOP +
              pageLength
            }
            stroke="#dc2626"
            strokeWidth="8"
          />

          <text
            x={LEFT - 14}
            y={
              TOP +
              pageLength +
              7
            }
            textAnchor="end"
            fontSize="21"
            fontWeight="900"
            fill="#dc2626"
          >
            {meter(
              page.end
            )}
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
              13
            }
            textAnchor="end"
            fontSize="19"
            fontWeight="900"
            fill="#dc2626"
          >
            여기서 가로 절단
          </text>
        </svg>
      </div>

      <PagePieceList
        pieces={pieces}
        placements={
          placements
        }
      />

      <div
        style={{
          padding:
            "7px 10px",
          borderTop:
            "1px solid #e5e7eb",
          fontSize: 10,
          fontWeight: 700,
          color: "#64748b",
        }}
      >
        페이지{" "}
        {page.index + 1}/
        {totalPages}
        {" · "}
        폭 1220mm
        {" · "}
        1cm 격자
        {" · "}
        10cm 숫자
        {" · "}
        1m 누적 표시
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
}) {
  return (
    <div
      style={{
        minWidth: 60,
        padding: "6px 7px",
        borderRadius: 7,
        background: "#f1f5f9",
      }}
    >
      <span
        style={{
          display: "block",
          fontSize: 9,
          color: "#64748b",
        }}
      >
        {label}
      </span>

      <strong
        style={{
          fontSize: 11,
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

  const pages =
    useMemo(
      () =>
        getPages(
          roll
        ),
      [roll]
    );

  if (
    !roll ||
    !placements.length ||
    !pages.length
  ) {
    return (
      <div
        style={{
          padding: 12,
          border:
            "1px solid #e5e7eb",
          borderRadius: 9,
          color: "#64748b",
          fontSize: 12,
        }}
      >
        표시할 재단 결과가 없습니다.
      </div>
    );
  }

  return (
    <div
      style={{
        marginTop: 12,
      }}
    >
      {/* 롤 요약 */}
      <div
        style={{
          display: "flex",
          justifyContent:
            "space-between",
          alignItems:
            "flex-start",
          gap: 10,
          marginBottom: 10,
          padding: 10,
          border:
            "1px solid #e5e7eb",
          borderRadius: 10,
          background: "#fff",
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
            CUTTING PLAN
          </div>

          <h3
            style={{
              margin: "2px 0 0",
              fontSize: 20,
            }}
          >
            {roll.color}
          </h3>

          <div
            style={{
              marginTop: 3,
              fontSize: 11,
              fontWeight: 700,
              color: "#64748b",
            }}
          >
            {roll.grainDirection
              ? "결 있음 · 회전 금지"
              : "결 없음 · 회전 가능"}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent:
              "flex-end",
            gap: 5,
          }}
        >
          <Stat
            label="보유"
            value={meter(
              roll.lengthMm
            )}
          />

          <Stat
            label="사용"
            value={meter(
              roll.usedLength
            )}
          />

          <Stat
            label="잔여"
            value={meter(
              roll.remainingLength
            )}
          />

          <Stat
            label="효율"
            value={`${roll.efficiency || 0}%`}
          />
        </div>
      </div>

      {/* 재단 차수별 페이지 */}
      {pages.map((page) => (
        <CutPage
          key={`${page.start}-${page.end}`}
          page={page}
          placements={
            placements
          }
          totalPages={
            pages.length
          }
        />
      ))}
    </div>
  );
              }
