"use client";

import React, { useMemo } from "react";

const FILM_WIDTH = 1220;

function n(value) {
  const number = Number(value);

  return Number.isFinite(number)
    ? Math.round(number)
    : 0;
}

function meter(mm) {
  return `${(n(mm) / 1000).toFixed(2)}m`;
}

function range(start, end, step) {
  const result = [];

  let value =
    Math.ceil(start / step) * step;

  while (value <= end) {
    result.push(value);
    value += step;
  }

  return result;
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

  return colors[
    Math.max(0, index) %
      colors.length
  ];
}

/*
  실제 배치 좌표를 검사해서
  가로 1220 전체를 안전하게 자를 수 있는
  위치를 찾습니다.

  어떤 조각도 해당 Y를 통과하지 않으면
  페이지 종료 지점입니다.
*/
function findSafeCutLines(
  placements,
  usedLength
) {
  const used = n(usedLength);

  const candidates = new Set([
    0,
    used,
  ]);

  placements.forEach((piece) => {
    const top = n(piece.y);
    const bottom =
      top + n(piece.height);

    candidates.add(top);
    candidates.add(bottom);
  });

  return [...candidates]
    .filter(
      (y) =>
        y >= 0 &&
        y <= used
    )
    .sort((a, b) => a - b)
    .filter((y) => {
      if (
        y === 0 ||
        y === used
      ) {
        return true;
      }

      const crossing =
        placements.some(
          (piece) => {
            const top =
              n(piece.y);

            const bottom =
              top +
              n(piece.height);

            return (
              top < y &&
              bottom > y
            );
          }
        );

      return !crossing;
    });
}

/*
  안전한 절단선이 있으면
  무조건 다음 페이지로 넘깁니다.

  예:
  0 ~ 1950
  1950 ~ 2950
  2950 ~ ...
*/
function buildPages(
  placements,
  usedLength
) {
  const lines =
    findSafeCutLines(
      placements,
      usedLength
    );

  const pages = [];

  for (
    let i = 0;
    i < lines.length - 1;
    i += 1
  ) {
    const start = lines[i];
    const end = lines[i + 1];

    if (end <= start) {
      continue;
    }

    pages.push({
      index: pages.length,
      start,
      end,
    });
  }

  return pages;
}

function getPagePieces(
  placements,
  page
) {
  return placements.filter(
    (piece) => {
      const top =
        n(piece.y);

      const bottom =
        top +
        n(piece.height);

      return (
        bottom > page.start &&
        top < page.end
      );
    }
  );
}

/*
  조각 색상 채우기
  그리드는 이 뒤에 다시 그리므로
  조각 위에서도 격자가 보입니다.
*/
function PieceFill({
  piece,
  x,
  y,
  index,
}) {
  return (
    <rect
      x={x}
      y={y}
      width={n(piece.width)}
      height={n(piece.height)}
      fill={fillColor(index)}
      fillOpacity="0.62"
    />
  );
}

/*
  조각 테두리 + 텍스트.

  사이즈는 어떠한 경우에도 생략하지 않습니다.
*/
function PieceOverlay({
  piece,
  x,
  y,
  number,
}) {
  const width =
    n(piece.width);

  const height =
    n(piece.height);

  const ow =
    n(piece.originalWidth);

  const oh =
    n(piece.originalHeight);

  const cx =
    x + width / 2;

  const cy =
    y + height / 2;

  const veryNarrow =
    width < 95 &&
    height >= 170;

  const compact =
    width < 190 ||
    height < 180;

  return (
    <>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill="none"
        stroke="#111827"
        strokeWidth="3"
      />

      {veryNarrow ? (
        <>
          <text
            x={cx}
            y={cy - 38}
            textAnchor="middle"
            fontSize="17"
            fontWeight="900"
            fill="#111827"
          >
            #{number}
          </text>

          <text
            x={cx}
            y={cy + 10}
            textAnchor="middle"
            fontSize={
              width < 60
                ? 11
                : 14
            }
            fontWeight="900"
            fill="#111827"
            transform={`rotate(-90 ${cx} ${cy + 10})`}
          >
            {ow}×{oh}
          </text>
        </>
      ) : compact ? (
        <>
          <text
            x={cx}
            y={cy - 11}
            textAnchor="middle"
            fontSize="16"
            fontWeight="900"
            fill="#111827"
          >
            #{number}
          </text>

          <text
            x={cx}
            y={cy + 19}
            textAnchor="middle"
            fontSize="13"
            fontWeight="900"
            fill="#111827"
          >
            {ow}×{oh}
          </text>
        </>
      ) : (
        <>
          <text
            x={cx}
            y={cy - 55}
            textAnchor="middle"
            fontSize="23"
            fontWeight="900"
            fill="#111827"
          >
            #{number}
          </text>

          <text
            x={cx}
            y={cy - 20}
            textAnchor="middle"
            fontSize="19"
            fontWeight="900"
            fill="#111827"
          >
            {piece.location}
          </text>

          <text
            x={cx}
            y={cy + 12}
            textAnchor="middle"
            fontSize="18"
            fontWeight="700"
            fill="#334155"
          >
            {piece.part}
          </text>

          <text
            x={cx}
            y={cy + 48}
            textAnchor="middle"
            fontSize="20"
            fontWeight="900"
            fill="#111827"
          >
            {ow}×{oh}
          </text>

          {piece.rotated && (
            <text
              x={cx}
              y={cy + 75}
              textAnchor="middle"
              fontSize="13"
              fontWeight="900"
              fill="#b45309"
            >
              회전
            </text>
          )}
        </>
      )}
    </>
  );
}

/*
  조각 위에 표시되는 격자

  10mm = 1cm 아주 흐린 선
  100mm = 10cm 진한 선 + 숫자
  1000mm = 1m 더 진한 선 + 큰 숫자
*/
function GridOverlay({
  page,
  left,
  top,
}) {
  const pageLength =
    page.end -
    page.start;

  const xTicks =
    range(
      0,
      FILM_WIDTH,
      10
    );

  const yTicks =
    range(
      page.start,
      page.end,
      10
    );

  return (
    <g
      pointerEvents="none"
    >
      {xTicks.map((tick) => {
        const x =
          left + tick;

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
              y2={
                top +
                pageLength
              }
              stroke={
                is1000
                  ? "#64748b"
                  : is100
                  ? "#94a3b8"
                  : "#64748b"
              }
              strokeWidth={
                is1000
                  ? 2
                  : is100
                  ? 1.1
                  : 0.45
              }
              opacity={
                is1000
                  ? 0.7
                  : is100
                  ? 0.48
                  : 0.17
              }
            />

            {is100 && (
              <text
                x={x}
                y={top - 16}
                textAnchor="middle"
                fontSize={
                  is1000
                    ? 21
                    : 14
                }
                fontWeight={
                  is1000
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
        y={top - 40}
        textAnchor="end"
        fontSize="17"
        fontWeight="900"
        fill="#111827"
      >
        1220mm
      </text>

      {yTicks.map(
        (absolute) => {
          const local =
            absolute -
            page.start;

          const y =
            top + local;

          const is100 =
            absolute %
              100 ===
            0;

          const is1000 =
            absolute %
              1000 ===
            0;

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
                  is1000
                    ? "#64748b"
                    : is100
                    ? "#94a3b8"
                    : "#64748b"
                }
                strokeWidth={
                  is1000
                    ? 2.2
                    : is100
                    ? 1.1
                    : 0.45
                }
                opacity={
                  is1000
                    ? 0.72
                    : is100
                    ? 0.5
                    : 0.17
                }
              />

              {is1000 ? (
                <text
                  x={left - 15}
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
              ) : is100 ? (
                <text
                  x={left - 15}
                  y={y + 5}
                  textAnchor="end"
                  fontSize="13"
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

      <text
        x={left - 15}
        y={top + 7}
        textAnchor="end"
        fontSize="20"
        fontWeight="900"
        fill="#1d4ed8"
      >
        {meter(
          page.start
        )}
      </text>
    </g>
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
          marginBottom: 6,
          fontSize: 11,
          fontWeight: 900,
          color: "#64748b",
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
        {pieces.map(
          (piece) => {
            const number =
              placements.findIndex(
                (item) =>
                  item.id ===
                  piece.id
              ) + 1;

            return (
              <div
                key={
                  `list-${piece.id}`
                }
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "34px 1fr auto",
                  gap: 7,
                  alignItems:
                    "center",
                  padding:
                    "7px 8px",
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

                <div>
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
          }
        )}
      </div>
    </div>
  );
}

function CutPage({
  page,
  placements,
  totalPages,
}) {
  const LEFT = 112;
  const RIGHT = 30;
  const TOP = 76;
  const BOTTOM = 62;

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
    getPagePieces(
      placements,
      page
    );

  return (
    <section
      style={{
        marginBottom: 20,
        border:
          "1px solid #d1d5db",
        borderRadius: 13,
        overflow: "hidden",
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
              fontWeight: 900,
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
            )}
            {" ~ "}
            {meter(
              page.end
            )}
            {" · "}
            길이{" "}
            {meter(
              pageLength
            )}
          </div>
        </div>

        <div
          style={{
            padding:
              "6px 8px",
            borderRadius: 7,
            background:
              "#fee2e2",
            color: "#b91c1c",
            fontSize: 11,
            fontWeight: 900,
            whiteSpace:
              "nowrap",
          }}
        >
          {meter(
            page.end
          )}
          {" 가로 절단"}
        </div>
      </div>

      <div
        style={{
          overflowX:
            "auto",
          padding: 5,
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
            background:
              "#ffffff",
          }}
        >
          <rect
            x={LEFT}
            y={TOP}
            width={
              FILM_WIDTH
            }
            height={
              pageLength
            }
            fill="#ffffff"
          />

          {/* 1. 조각 색상 */}
          {pieces.map(
            (piece) => {
              const index =
                placements.findIndex(
                  (item) =>
                    item.id ===
                    piece.id
                );

              const x =
                LEFT +
                n(piece.x);

              const y =
                TOP +
                n(piece.y) -
                page.start;

              return (
                <PieceFill
                  key={
                    `fill-${piece.id}`
                  }
                  piece={
                    piece
                  }
                  x={x}
                  y={y}
                  index={
                    index
                  }
                />
              );
            }
          )}

          {/* 2. 조각 위에 그리드 */}
          <GridOverlay
            page={page}
            left={LEFT}
            top={TOP}
          />

          {/* 3. 조각 테두리와 텍스트 */}
          {pieces.map(
            (piece) => {
              const index =
                placements.findIndex(
                  (item) =>
                    item.id ===
                    piece.id
                );

              const x =
                LEFT +
                n(piece.x);

              const y =
                TOP +
                n(piece.y) -
                page.start;

              return (
                <PieceOverlay
                  key={
                    `overlay-${piece.id}`
                  }
                  piece={
                    piece
                  }
                  x={x}
                  y={y}
                  number={
                    index + 1
                  }
                />
              );
            }
          )}

          {/* 필름 외곽선 */}
          <rect
            x={LEFT}
            y={TOP}
            width={
              FILM_WIDTH
            }
            height={
              pageLength
            }
            fill="none"
            stroke="#111827"
            strokeWidth="4"
          />

          {/* 페이지 끝 가로 절단선 */}
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
              14
            }
            textAnchor="end"
            fontSize="18"
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
        {page.index + 1}
        /{totalPages} 페이지
        {" · "}
        시작{" "}
        {meter(page.start)}
        {" · "}
        종료{" "}
        {meter(page.end)}
        {" · "}
        폭 1220mm
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
        minWidth: 58,
        padding:
          "6px 7px",
        borderRadius: 7,
        background:
          "#f1f5f9",
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

  /*
    batch가 있더라도 실제 좌표를 다시 검사합니다.
    가로로 완전히 자를 수 있는 곳이면
    반드시 다음 페이지로 넘깁니다.
  */
  const pages = useMemo(
    () =>
      buildPages(
        placements,
        roll?.usedLength ||
          0
      ),
    [
      placements,
      roll?.usedLength,
    ]
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
          background:
            "#ffffff",
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
          background:
            "#ffffff",
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
              margin:
                "2px 0 0",
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
            label="페이지"
            value={`${pages.length}장`}
          />
        </div>
      </div>

      <div
        style={{
          marginBottom: 10,
          padding:
            "8px 10px",
          borderRadius: 8,
          background:
            "#eff6ff",
          color: "#1e40af",
          fontSize: 11,
          fontWeight: 800,
          lineHeight: 1.5,
        }}
      >
        1cm 흐린 격자 · 10cm 눈금 ·
        1m 누적거리 · 가로 절단 가능 지점마다
        자동 페이지 분리
      </div>

      {pages.map((page) => (
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
      ))}
    </div>
  );
          }
