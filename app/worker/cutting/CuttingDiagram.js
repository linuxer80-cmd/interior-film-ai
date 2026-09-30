"use client";

import React from "react";

const FILM_WIDTH = 1220;

function n(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : 0;
}

function meter(mm) {
  return `${(n(mm) / 1000).toFixed(2)}m`;
}

function range(start, end, step) {
  const values = [];
  let value = Math.ceil(start / step) * step;

  while (value <= end) {
    values.push(value);
    value += step;
  }

  return values;
}

function fillColor(index) {
  const colors = [
    "#dbeafe",
    "#dcfce7",
    "#fef3c7",
    "#fce7f3",
    "#ede9fe",
    "#cffafe",
  ];

  return colors[Math.max(0, index) % colors.length];
}

/*
  실제 배치 좌표에서 가로 전체를 자를 수 있는 위치 검색.

  해당 Y 위치를 통과하는 조각이 하나도 없으면
  그 지점에서 1220mm 전체 가로 절단이 가능합니다.
*/
function findSafeCutLines(placements, usedLength) {
  const used = n(usedLength);
  const candidates = new Set([0, used]);

  placements.forEach((piece) => {
    const top = n(piece.y);
    const bottom = top + n(piece.height);

    candidates.add(top);
    candidates.add(bottom);
  });

  return [...candidates]
    .filter((y) => y >= 0 && y <= used)
    .sort((a, b) => a - b)
    .filter((y) => {
      if (y === 0 || y === used) {
        return true;
      }

      return !placements.some((piece) => {
        const top = n(piece.y);
        const bottom = top + n(piece.height);

        return top < y && bottom > y;
      });
    });
}

/*
  가로로 완전히 자를 수 있는 위치마다
  재단 페이지를 새로 만듭니다.
*/
export function getCutPages(roll) {
  const placements = Array.isArray(roll?.placements)
    ? roll.placements
    : [];

  const usedLength = Math.max(0, n(roll?.usedLength));

  if (!placements.length || usedLength <= 0) {
    return [];
  }

  const lines = findSafeCutLines(
    placements,
    usedLength
  );

  const pages = [];

  for (let i = 0; i < lines.length - 1; i += 1) {
    const start = lines[i];
    const end = lines[i + 1];

    if (end <= start) continue;

    pages.push({
      index: pages.length,
      start,
      end,
      length: end - start,
    });
  }

  return pages;
}

function getPagePieces(placements, page) {
  return placements.filter((piece) => {
    const top = n(piece.y);
    const bottom = top + n(piece.height);

    return (
      bottom > page.start &&
      top < page.end
    );
  });
}

/*
  조각 내부 텍스트.

  작은 조각도 가로×세로 사이즈는 절대 생략하지 않습니다.
*/
function PieceText({
  piece,
  number,
  x,
  y,
  width,
  height,
}) {
  const ow = n(piece.originalWidth);
  const oh = n(piece.originalHeight);

  const cx = x + width / 2;
  const cy = y + height / 2;

  // 매우 좁고 긴 조각
  if (width < 95 && height >= 170) {
    return (
      <>
        <text
          x={cx}
          y={cy - 34}
          textAnchor="middle"
          fontSize={width < 55 ? 13 : 16}
          fontWeight="900"
          fill="#111827"
        >
          #{number}
        </text>

        <text
          x={cx}
          y={cy + 10}
          textAnchor="middle"
          fontSize={width < 55 ? 10 : 13}
          fontWeight="900"
          fill="#111827"
          transform={`rotate(-90 ${cx} ${cy + 10})`}
        >
          {ow}×{oh}
        </text>
      </>
    );
  }

  // 작거나 낮은 조각
  if (width < 190 || height < 180) {
    return (
      <>
        <text
          x={cx}
          y={cy - 10}
          textAnchor="middle"
          fontSize="15"
          fontWeight="900"
          fill="#111827"
        >
          #{number}
        </text>

        <text
          x={cx}
          y={cy + 18}
          textAnchor="middle"
          fontSize="12"
          fontWeight="900"
          fill="#111827"
        >
          {ow}×{oh}
        </text>
      </>
    );
  }

  const fontSize = width >= 350 ? 20 : 16;

  return (
    <>
      <text
        x={cx}
        y={cy - 50}
        textAnchor="middle"
        fontSize={fontSize + 3}
        fontWeight="900"
        fill="#111827"
      >
        #{number}
      </text>

      <text
        x={cx}
        y={cy - 18}
        textAnchor="middle"
        fontSize={fontSize}
        fontWeight="900"
        fill="#111827"
      >
        {piece.location}
      </text>

      <text
        x={cx}
        y={cy + 12}
        textAnchor="middle"
        fontSize={fontSize - 1}
        fontWeight="700"
        fill="#334155"
      >
        {piece.part}
      </text>

      <text
        x={cx}
        y={cy + 45}
        textAnchor="middle"
        fontSize={fontSize}
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
          fontSize="12"
          fontWeight="900"
          fill="#b45309"
        >
          회전
        </text>
      )}
    </>
  );
}

/*
  그리드는 반드시 조각 색상 위에 그립니다.

  10mm   = 1cm 흐린 선
  100mm  = 10cm 조금 진한 선 + 숫자
  1000mm = 1m 굵은 선 + 누적거리
*/
function GridOverlay({
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
    <g pointerEvents="none">
      {/* 폭 방향 세로선 */}
      {xTicks.map((tick) => {
        const x = left + tick;

        const is100 =
          tick % 100 === 0;

        const is1000 =
          tick % 1000 === 0;

        return (
          <g key={`x-${tick}`}>
            <line
              x1={x}
              y1={top}
              x2={x}
              y2={top + pageLength}
              stroke={
                is1000
                  ? "#475569"
                  : is100
                  ? "#64748b"
                  : "#64748b"
              }
              strokeWidth={
                is1000
                  ? 2
                  : is100
                  ? 1
                  : 0.45
              }
              opacity={
                is1000
                  ? 0.8
                  : is100
                  ? 0.48
                  : 0.18
              }
            />

            {is100 && (
              <text
                x={x}
                y={top - 14}
                textAnchor="middle"
                fontSize={
                  is1000 ? 19 : 13
                }
                fontWeight={
                  is1000 ? 900 : 700
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
        x={left + FILM_WIDTH}
        y={top - 38}
        textAnchor="end"
        fontSize="17"
        fontWeight="900"
        fill="#111827"
      >
        1220mm
      </text>

      {/* 길이 방향 가로선 */}
      {yTicks.map((absolute) => {
        const local =
          absolute - page.start;

        const y =
          top + local;

        const is100 =
          absolute % 100 === 0;

        const is1000 =
          absolute % 1000 === 0;

        return (
          <g key={`y-${absolute}`}>
            <line
              x1={left}
              y1={y}
              x2={left + FILM_WIDTH}
              y2={y}
              stroke={
                is1000
                  ? "#475569"
                  : is100
                  ? "#64748b"
                  : "#64748b"
              }
              strokeWidth={
                is1000
                  ? 2.2
                  : is100
                  ? 1
                  : 0.45
              }
              opacity={
                is1000
                  ? 0.8
                  : is100
                  ? 0.48
                  : 0.18
              }
            />

            {is1000 ? (
              <text
                x={left - 14}
                y={y + 7}
                textAnchor="end"
                fontSize="22"
                fontWeight="900"
                fill="#1d4ed8"
              >
                {meter(absolute)}
              </text>
            ) : is100 ? (
              <text
                x={left - 14}
                y={y + 5}
                textAnchor="end"
                fontSize="12"
                fontWeight="700"
                fill="#64748b"
              >
                {absolute % 1000}
              </text>
            ) : null}
          </g>
        );
      })}

      {/* 현재 페이지 시작 누적거리 */}
      <text
        x={left - 14}
        y={top + 7}
        textAnchor="end"
        fontSize="19"
        fontWeight="900"
        fill="#1d4ed8"
      >
        {meter(page.start)}
      </text>
    </g>
  );
}

export default function CuttingDiagram({
  roll,
  pageIndex = 0,
}) {
  const placements =
    Array.isArray(roll?.placements)
      ? roll.placements
      : [];

  const pages = getCutPages(roll);

  if (
    !roll ||
    !placements.length ||
    !pages.length
  ) {
    return (
      <div
        style={{
          padding: 20,
          textAlign: "center",
          color: "#64748b",
          fontSize: 13,
        }}
      >
        표시할 재단 결과가 없습니다.
      </div>
    );
  }

  const safeIndex = Math.min(
    Math.max(0, pageIndex),
    pages.length - 1
  );

  const page = pages[safeIndex];

  const pieces =
    getPagePieces(
      placements,
      page
    );

  const LEFT = 108;
  const RIGHT = 26;
  const TOP = 65;
  const BOTTOM = 55;

  const pageLength =
    page.end - page.start;

  const svgWidth =
    LEFT +
    FILM_WIDTH +
    RIGHT;

  const svgHeight =
    TOP +
    pageLength +
    BOTTOM;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* 현재 페이지 정보 */}
      <div
        style={{
          display: "flex",
          justifyContent:
            "space-between",
          alignItems: "center",
          gap: 8,
          marginBottom: 7,
          flex: "0 0 auto",
        }}
      >
        <div>
          <strong
            style={{
              fontSize: 15,
              fontWeight: 900,
              color: "#111827",
            }}
          >
            {safeIndex + 1}차 재단
          </strong>

          <div
            style={{
              marginTop: 2,
              fontSize: 11,
              fontWeight: 700,
              color: "#64748b",
            }}
          >
            {meter(page.start)}
            {" → "}
            {meter(page.end)}
            {" · "}
            {meter(pageLength)}
          </div>
        </div>

        <div
          style={{
            padding: "6px 8px",
            borderRadius: 7,
            background: "#fee2e2",
            color: "#b91c1c",
            fontSize: 10,
            fontWeight: 900,
            whiteSpace: "nowrap",
          }}
        >
          {meter(page.end)}
          {" 가로 절단"}
        </div>
      </div>

      {/* 재단도 한 장만 전체 화면에 맞춤 */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          border: "1px solid #cbd5e1",
          borderRadius: 10,
          background: "#ffffff",
        }}
      >
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          preserveAspectRatio="xMidYMid meet"
          style={{
            display: "block",
            width: "100%",
            height: "100%",
            maxHeight: "100%",
          }}
        >
          {/* 필름 흰 바탕 */}
          <rect
            x={LEFT}
            y={TOP}
            width={FILM_WIDTH}
            height={pageLength}
            fill="#ffffff"
          />

          {/* 조각 색상 먼저 */}
          {pieces.map((piece) => {
            const index =
              placements.findIndex(
                (item) =>
                  item.id === piece.id
              );

            const x =
              LEFT + n(piece.x);

            const y =
              TOP +
              n(piece.y) -
              page.start;

            return (
              <rect
                key={`fill-${piece.id}`}
                x={x}
                y={y}
                width={n(piece.width)}
                height={n(piece.height)}
                fill={fillColor(index)}
                fillOpacity="0.58"
              />
            );
          })}

          {/* 그리드는 조각 위 */}
          <GridOverlay
            page={page}
            left={LEFT}
            top={TOP}
          />

          {/* 테두리 + 부위 + 사이즈 */}
          {pieces.map((piece) => {
            const index =
              placements.findIndex(
                (item) =>
                  item.id === piece.id
              );

            const x =
              LEFT + n(piece.x);

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
                key={`piece-${piece.id}`}
              >
                <rect
                  x={x}
                  y={y}
                  width={width}
                  height={height}
                  fill="none"
                  stroke="#111827"
                  strokeWidth="3"
                />

                <PieceText
                  piece={piece}
                  number={index + 1}
                  x={x}
                  y={y}
                  width={width}
                  height={height}
                />
              </g>
            );
          })}

          {/* 필름 외곽 */}
          <rect
            x={LEFT}
            y={TOP}
            width={FILM_WIDTH}
            height={pageLength}
            fill="none"
            stroke="#111827"
            strokeWidth="4"
          />

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
            x={
              LEFT +
              FILM_WIDTH -
              8
            }
            y={
              TOP +
              pageLength -
              12
            }
            textAnchor="end"
            fontSize="17"
            fontWeight="900"
            fill="#dc2626"
          >
            {meter(page.end)}
            {" 가로 절단"}
          </text>
        </svg>
      </div>
    </div>
  );
}
