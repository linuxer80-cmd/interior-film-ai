"use client";

const FILM_WIDTH = 1220;

function n(value) {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.round(number)
    : 0;
}

function fs(size, scale) {
  return Math.max(
    8,
    Math.round(size * scale)
  );
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

function findSafeCutLines(
  placements,
  usedLength
) {
  const used = n(usedLength);
  const candidates =
    new Set([0, used]);

  placements.forEach((piece) => {
    const top = n(piece.y);
    const bottom =
      top +
      n(piece.height);

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

      return !placements.some(
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
    });
}

export function getCutPages(roll) {
  const placements =
    Array.isArray(
      roll?.placements
    )
      ? roll.placements
      : [];

  const usedLength =
    Math.max(
      0,
      n(roll?.usedLength)
    );

  if (
    !placements.length ||
    usedLength <= 0
  ) {
    return [];
  }

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
      length: end - start,
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

function PieceText({
  piece,
  number,
  x,
  y,
  width,
  height,
  textScale,
}) {
  const ow =
    n(piece.originalWidth);

  const oh =
    n(piece.originalHeight);

  const cx =
    x + width / 2;

  const cy =
    y + height / 2;

  const outlineWidth =
    Math.max(
      3,
      Math.round(
        5 * textScale
      )
    );

  const textOutline = {
    paintOrder: "stroke",
    stroke: "#ffffff",
    strokeWidth:
      outlineWidth,
    strokeLinejoin: "round",
  };

  if (
    width < 105 &&
    height >= 200
  ) {
    return (
      <>
        <text
          x={cx}
          y={
            cy -
            fs(
              40,
              textScale
            )
          }
          textAnchor="middle"
          fontSize={fs(
            22,
            textScale
          )}
          fontWeight="900"
          fill="#111827"
          style={textOutline}
        >
          #{number}
        </text>

        <text
          x={cx}
          y={cy + 10}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={fs(
            27,
            textScale
          )}
          fontWeight="900"
          fill="#0f172a"
          transform={
            `rotate(-90 ${cx} ${cy + 10})`
          }
          style={textOutline}
        >
          {ow}×{oh}
        </text>
      </>
    );
  }

  if (
    width < 210 ||
    height < 190
  ) {
    return (
      <>
        <text
          x={cx}
          y={
            cy -
            fs(
              15,
              textScale
            )
          }
          textAnchor="middle"
          fontSize={fs(
            21,
            textScale
          )}
          fontWeight="900"
          fill="#111827"
          style={textOutline}
        >
          #{number}
        </text>

        <text
          x={cx}
          y={
            cy +
            fs(
              23,
              textScale
            )
          }
          textAnchor="middle"
          fontSize={fs(
            28,
            textScale
          )}
          fontWeight="900"
          fill="#0f172a"
          style={textOutline}
        >
          {ow}×{oh}
        </text>
      </>
    );
  }

  const locationBase =
    width >= 500
      ? 23
      : 19;

  const partBase =
    width >= 500
      ? 21
      : 18;

  const dimensionBase =
    width >= 500
      ? 34
      : width >= 300
      ? 31
      : 28;

  return (
    <>
      <text
        x={cx}
        y={
          cy -
          fs(
            68,
            textScale
          )
        }
        textAnchor="middle"
        fontSize={fs(
          23,
          textScale
        )}
        fontWeight="900"
        fill="#111827"
        style={textOutline}
      >
        #{number}
      </text>

      <text
        x={cx}
        y={
          cy -
          fs(
            34,
            textScale
          )
        }
        textAnchor="middle"
        fontSize={fs(
          locationBase,
          textScale
        )}
        fontWeight="900"
        fill="#111827"
        style={textOutline}
      >
        {piece.location}
      </text>

      <text
        x={cx}
        y={cy}
        textAnchor="middle"
        fontSize={fs(
          partBase,
          textScale
        )}
        fontWeight="800"
        fill="#334155"
        style={textOutline}
      >
        {piece.part}
      </text>

      <text
        x={cx}
        y={
          cy +
          fs(
            48,
            textScale
          )
        }
        textAnchor="middle"
        fontSize={fs(
          dimensionBase,
          textScale
        )}
        fontWeight="900"
        fill="#0f172a"
        style={textOutline}
      >
        {ow}×{oh}
      </text>

      {piece.rotated && (
        <text
          x={cx}
          y={
            cy +
            fs(
              80,
              textScale
            )
          }
          textAnchor="middle"
          fontSize={fs(
            16,
            textScale
          )}
          fontWeight="900"
          fill="#b45309"
          style={textOutline}
        >
          회전
        </text>
      )}
    </>
  );
}

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
    <g pointerEvents="none">
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
                  ? "#475569"
                  : "#64748b"
              }
              strokeWidth={
                is1000
                  ? 2
                  : is100
                  ? 1
                  : 0.4
              }
              opacity={
                is1000
                  ? 0.78
                  : is100
                  ? 0.45
                  : 0.16
              }
            />

            {is100 && (
              <text
                x={x}
                y={top - 14}
                textAnchor="middle"
                fontSize={
                  is1000
                    ? 19
                    : 13
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
        y={top - 38}
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
                    ? "#475569"
                    : "#64748b"
                }
                strokeWidth={
                  is1000
                    ? 2.2
                    : is100
                    ? 1
                    : 0.4
                }
                opacity={
                  is1000
                    ? 0.78
                    : is100
                    ? 0.45
                    : 0.16
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
                  {meter(
                    absolute
                  )}
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
                  {absolute %
                    1000}
                </text>
              ) : null}
            </g>
          );
        }
      )}

      <text
        x={left - 14}
        y={top + 7}
        textAnchor="end"
        fontSize="19"
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

export default function CuttingDiagram({
  roll,
  pageIndex = 0,
  textScale = 1.3,
}) {
  const placements =
    Array.isArray(
      roll?.placements
    )
      ? roll.placements
      : [];

  const pages =
    getCutPages(roll);

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

  const safeTextScale =
    Math.min(
      2.2,
      Math.max(
        0.6,
        Number(
          textScale
        ) || 1.3
      )
    );

  const safeIndex =
    Math.min(
      Math.max(
        0,
        pageIndex
      ),
      pages.length - 1
    );

  const page =
    pages[safeIndex];

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
            {meter(
              page.start
            )}
            {" → "}
            {meter(
              page.end
            )}
            {" · "}
            {meter(
              pageLength
            )}
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
          {meter(
            page.end
          )}
          {" 가로 절단"}
        </div>
      </div>

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
            overflow: "visible",
          }}
        >
          <rect
            x={LEFT}
            y={TOP}
            width={FILM_WIDTH}
            height={pageLength}
            fill="#ffffff"
          />

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
                <rect
                  key={
                    `fill-${piece.id}`
                  }
                  x={x}
                  y={y}
                  width={
                    n(
                      piece.width
                    )
                  }
                  height={
                    n(
                      piece.height
                    )
                  }
                  fill={
                    fillColor(
                      index
                    )
                  }
                  fillOpacity="0.55"
                />
              );
            }
          )}

          <GridOverlay
            page={page}
            left={LEFT}
            top={TOP}
          />

          {pieces.map(
            (piece) => {
              const x =
                LEFT +
                n(piece.x);

              const y =
                TOP +
                n(piece.y) -
                page.start;

              return (
                <rect
                  key={
                    `border-${piece.id}`
                  }
                  x={x}
                  y={y}
                  width={
                    n(
                      piece.width
                    )
                  }
                  height={
                    n(
                      piece.height
                    )
                  }
                  fill="none"
                  stroke="#111827"
                  strokeWidth="3"
                />
              );
            }
          )}

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
                <PieceText
                  key={
                    `text-${piece.id}`
                  }
                  piece={
                    piece
                  }
                  number={
                    index + 1
                  }
                  x={x}
                  y={y}
                  width={
                    n(
                      piece.width
                    )
                  }
                  height={
                    n(
                      piece.height
                    )
                  }
                  textScale={
                    safeTextScale
                  }
                />
              );
            }
          )}

          <rect
            x={LEFT}
            y={TOP}
            width={FILM_WIDTH}
            height={pageLength}
            fill="none"
            stroke="#111827"
            strokeWidth="4"
          />

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
            style={{
              paintOrder:
                "stroke",
              stroke:
                "#ffffff",
              strokeWidth: 4,
            }}
          >
            {meter(
              page.end
            )}
            {" 가로 절단"}
          </text>
        </svg>
      </div>
    </div>
  );
            }
