"use client";

import { useMemo, useState } from "react";
import styles from "./FilmCuttingOptimizer.module.css";

import {
  FILM_WIDTH,
  optimizeCutting,
  getUniqueColors,
  formatMeterFromMm,
} from "./cuttingOptimizer";

const initialRolls = [
  {
    id: "roll-1",
    color: "",
    lengthM: "",
    grainDirection: false,
  },
];

const initialSections = [
  {
    id: "section-1",
    location: "",
    part: "",
    colors: [
      {
        id: "color-1",
        color: "",
        sizes: [
          {
            id: "size-1",
            width: "",
            height: "",
            quantity: 1,
          },
        ],
      },
    ],
  },
];

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

function RollDiagram({ roll }) {
  const usedLength = Math.max(roll.usedLength, 1);

  const marks = [];

  for (let y = 0; y <= usedLength; y += 1000) {
    marks.push(y);
  }

  if (
    marks.length === 0 ||
    marks[marks.length - 1] !== usedLength
  ) {
    marks.push(usedLength);
  }

  return (
    <div className={styles.diagramScroll}>
      <svg
        className={styles.diagram}
        viewBox={`0 0 ${FILM_WIDTH} ${usedLength}`}
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect
          x="0"
          y="0"
          width={FILM_WIDTH}
          height={usedLength}
          fill="#ffffff"
          stroke="#111827"
          strokeWidth="5"
        />

        {marks.map((y) => (
          <g key={`mark-${y}`}>
            <line
              x1="0"
              y1={y}
              x2={FILM_WIDTH}
              y2={y}
              stroke="#cbd5e1"
              strokeWidth="3"
              strokeDasharray="15 12"
            />

            <text
              x="12"
              y={Math.min(y + 42, usedLength - 8)}
              fontSize="36"
              fill="#475569"
            >
              {y.toLocaleString()}mm
            </text>
          </g>
        ))}

        {roll.placements.map((piece, index) => {
          const hue =
            (piece.sectionIndex * 67 +
              piece.colorIndex * 41 +
              index * 13) %
            360;

          const clipId = `clip-${roll.id}-${piece.id}`;

          return (
            <g key={piece.id}>
              <defs>
                <clipPath id={clipId}>
                  <rect
                    x={piece.x}
                    y={piece.y}
                    width={piece.width}
                    height={piece.height}
                  />
                </clipPath>
              </defs>

              <rect
                x={piece.x}
                y={piece.y}
                width={piece.width}
                height={piece.height}
                fill={`hsl(${hue} 70% 90%)`}
                stroke="#0f172a"
                strokeWidth="4"
              />

              <g clipPath={`url(#${clipId})`}>
                <text
                  x={piece.x + 15}
                  y={piece.y + 48}
                  fontSize="40"
                  fontWeight="700"
                  fill="#0f172a"
                >
                  {piece.location}
                </text>

                <text
                  x={piece.x + 15}
                  y={piece.y + 96}
                  fontSize="36"
                  fill="#0f172a"
                >
                  {piece.part}
                </text>

                <text
                  x={piece.x + 15}
                  y={piece.y + 142}
                  fontSize="34"
                  fill="#334155"
                >
                  {piece.originalWidth} × {piece.originalHeight}
                </text>

                <text
                  x={piece.x + 15}
                  y={piece.y + 184}
                  fontSize="30"
                  fill="#475569"
                >
                  {piece.color}
                  {piece.rotated ? " · 회전" : ""}
                </text>
              </g>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function FilmCuttingOptimizer() {
  const [rolls, setRolls] =
    useState(initialRolls);

  const [sections, setSections] =
    useState(initialSections);

  const [rollMode, setRollMode] =
    useState("waste");

  const [result, setResult] =
    useState(null);

  const [errors, setErrors] =
    useState([]);

  const [calculating, setCalculating] =
    useState(false);

  const colors = useMemo(
    () => getUniqueColors(rolls),
    [rolls]
  );
    function updateRoll(id, field, value) {
    setRolls((prev) =>
      prev.map((roll) =>
        roll.id === id
          ? {
              ...roll,
              [field]: value,
            }
          : roll
      )
    );
  }

  function addRoll() {
    setRolls((prev) => [
      ...prev,
      {
        id: makeId("roll"),
        color: "",
        lengthM: "",
        grainDirection: false,
      },
    ]);
  }

  function removeRoll(id) {
    setRolls((prev) =>
      prev.filter((roll) => roll.id !== id)
    );
  }

  function updateSection(id, field, value) {
    setSections((prev) =>
      prev.map((section) =>
        section.id === id
          ? {
              ...section,
              [field]: value,
            }
          : section
      )
    );
  }

  function addSection() {
    setSections((prev) => [
      ...prev,
      {
        id: makeId("section"),
        location: "",
        part: "",
        colors: [
          {
            id: makeId("color"),
            color: colors[0] || "",
            sizes: [
              {
                id: makeId("size"),
                width: "",
                height: "",
                quantity: 1,
              },
            ],
          },
        ],
      },
    ]);
  }

  function removeSection(id) {
    setSections((prev) =>
      prev.filter((section) => section.id !== id)
    );
  }

  function addColor(sectionId) {
    setSections((prev) =>
      prev.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              colors: [
                ...section.colors,
                {
                  id: makeId("color"),
                  color: colors[0] || "",
                  sizes: [
                    {
                      id: makeId("size"),
                      width: "",
                      height: "",
                      quantity: 1,
                    },
                  ],
                },
              ],
            }
          : section
      )
    );
  }

  function updateColor(
    sectionId,
    colorId,
    value
  ) {
    setSections((prev) =>
      prev.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              colors: section.colors.map(
                (group) =>
                  group.id === colorId
                    ? {
                        ...group,
                        color: value,
                      }
                    : group
              ),
            }
          : section
      )
    );
  }

  function removeColor(
    sectionId,
    colorId
  ) {
    setSections((prev) =>
      prev.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              colors: section.colors.filter(
                (group) =>
                  group.id !== colorId
              ),
            }
          : section
      )
    );
  }

  function addSize(
    sectionId,
    colorId
  ) {
    setSections((prev) =>
      prev.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              colors: section.colors.map(
                (group) =>
                  group.id === colorId
                    ? {
                        ...group,
                        sizes: [
                          ...group.sizes,
                          {
                            id: makeId("size"),
                            width: "",
                            height: "",
                            quantity: 1,
                          },
                        ],
                      }
                    : group
              ),
            }
          : section
      )
    );
  }

  function updateSize(
    sectionId,
    colorId,
    sizeId,
    field,
    value
  ) {
    setSections((prev) =>
      prev.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              colors: section.colors.map(
                (group) =>
                  group.id === colorId
                    ? {
                        ...group,
                        sizes: group.sizes.map(
                          (size) =>
                            size.id === sizeId
                              ? {
                                  ...size,
                                  [field]: value,
                                }
                              : size
                        ),
                      }
                    : group
              ),
            }
          : section
      )
    );
  }

  function removeSize(
    sectionId,
    colorId,
    sizeId
  ) {
    setSections((prev) =>
      prev.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              colors: section.colors.map(
                (group) =>
                  group.id === colorId
                    ? {
                        ...group,
                        sizes: group.sizes.filter(
                          (size) =>
                            size.id !== sizeId
                        ),
                      }
                    : group
              ),
            }
          : section
      )
    );
  }
    function calculate(iterations) {
    setCalculating(true);
    setErrors([]);

    setTimeout(() => {
      const response =
        optimizeCutting({
          rolls,
          sections,
          rollMode,
          iterations,
        });

      setResult(
        response.result || null
      );

      setErrors(
        response.errors || []
      );

      setCalculating(false);
    }, 30);
  }

  function loadSample() {
    setRolls([
      {
        id: "sample-roll-1",
        color: "S123",
        lengthM: 11,
        grainDirection: false,
      },
      {
        id: "sample-roll-2",
        color: "S123",
        lengthM: 20,
        grainDirection: false,
      },
      {
        id: "sample-roll-3",
        color: "S231",
        lengthM: 15,
        grainDirection: false,
      },
      {
        id: "sample-roll-4",
        color: "W123",
        lengthM: 15,
        grainDirection: true,
      },
    ]);

    setSections([
      {
        id: "sample-section-1",
        location: "방1",
        part: "방문",
        colors: [
          {
            id: "sample-color-1",
            color: "S123",
            sizes: [
              {
                id: "sample-size-1",
                width: 600,
                height: 1900,
                quantity: 1,
              },
            ],
          },
          {
            id: "sample-color-2",
            color: "S231",
            sizes: [
              {
                id: "sample-size-2",
                width: 150,
                height: 2100,
                quantity: 2,
              },
              {
                id: "sample-size-3",
                width: 900,
                height: 150,
                quantity: 1,
              },
            ],
          },
        ],
      },
      {
        id: "sample-section-2",
        location: "주방",
        part: "하부장",
        colors: [
          {
            id: "sample-color-3",
            color: "W123",
            sizes: [
              {
                id: "sample-size-4",
                width: 600,
                height: 800,
                quantity: 4,
              },
            ],
          },
        ],
      },
    ]);

    setResult(null);
    setErrors([]);
  }

  function resetAll() {
    setRolls(initialRolls);
    setSections(initialSections);
    setResult(null);
    setErrors([]);
  }

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div>
            <h1>필름 재단 최적화</h1>
            <p>
              필름 폭 {FILM_WIDTH}mm ·
              위치/부위/컬러별 재단
            </p>
          </div>

          <div className={styles.headerButtons}>
            <button
              type="button"
              onClick={loadSample}
              className={styles.secondaryButton}
            >
              샘플 불러오기
            </button>

            <button
              type="button"
              onClick={resetAll}
              className={styles.secondaryButton}
            >
              초기화
            </button>
          </div>
        </header>

        <section className={styles.card}>
          <div className={styles.sectionTitle}>
            <div>
              <h2>1. 보유 필름 롤</h2>
              <p>
                컬러번호와 실제 남아있는
                롤 길이를 입력하세요.
              </p>
            </div>

            <button
              type="button"
              onClick={addRoll}
              className={styles.addButton}
            >
              + 롤 추가
            </button>
          </div>

          <div className={styles.rollList}>
            {rolls.map((roll, index) => (
              <div
                className={styles.rollRow}
                key={roll.id}
              >
                <div className={styles.rowNumber}>
                  {index + 1}
                </div>

                <label>
                  <span>컬러번호</span>
                  <input
                    value={roll.color}
                    placeholder="예: S115"
                    onChange={(e) =>
                      updateRoll(
                        roll.id,
                        "color",
                        e.target.value.toUpperCase()
                      )
                    }
                  />
                </label>

                <label>
                  <span>롤 길이(m)</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    value={roll.lengthM}
                    placeholder="예: 11"
                    onChange={(e) =>
                      updateRoll(
                        roll.id,
                        "lengthM",
                        e.target.value
                      )
                    }
                  />
                </label>

                <label>
                  <span>필름 방향</span>
                  <select
                    value={
                      roll.grainDirection
                        ? "grain"
                        : "free"
                    }
                    onChange={(e) =>
                      updateRoll(
                        roll.id,
                        "grainDirection",
                        e.target.value ===
                          "grain"
                      )
                    }
                  >
                    <option value="free">
                      결 없음 · 회전 가능
                    </option>

                    <option value="grain">
                      결 있음 · 회전 불가
                    </option>
                  </select>
                </label>

                <button
                  type="button"
                  onClick={() =>
                    removeRoll(roll.id)
                  }
                  className={styles.deleteButton}
                >
                  삭제
                </button>
              </div>
            ))}
          </div>
        </section>
        <section className={styles.card}>
          <div className={styles.sectionTitle}>
            <div>
              <h2>2. 재단 사이즈</h2>
              <p>
                시공 위치와 부위를 만들고
                그 안에 컬러별 재단 사이즈를 입력하세요.
              </p>
            </div>

            <button
              type="button"
              onClick={addSection}
              className={styles.addButton}
            >
              + 시공 부위 추가
            </button>
          </div>

          <div className={styles.sectionList}>
            {sections.map(
              (section, sectionIndex) => (
                <div
                  className={styles.sectionCard}
                  key={section.id}
                >
                  <div className={styles.sectionHeader}>
                    <strong>
                      시공 부위 {sectionIndex + 1}
                    </strong>

                    <button
                      type="button"
                      onClick={() =>
                        removeSection(
                          section.id
                        )
                      }
                      className={styles.deleteTextButton}
                    >
                      부위 삭제
                    </button>
                  </div>

                  <div className={styles.locationGrid}>
                    <label>
                      <span>시공 위치</span>
                      <input
                        value={
                          section.location
                        }
                        placeholder="예: 방1"
                        onChange={(e) =>
                          updateSection(
                            section.id,
                            "location",
                            e.target.value
                          )
                        }
                      />
                    </label>

                    <label>
                      <span>시공 부위</span>
                      <input
                        value={section.part}
                        placeholder="예: 방문"
                        onChange={(e) =>
                          updateSection(
                            section.id,
                            "part",
                            e.target.value
                          )
                        }
                      />
                    </label>
                  </div>

                  {section.colors.map(
                    (group, colorIndex) => (
                      <div
                        className={styles.colorCard}
                        key={group.id}
                      >
                        <div className={styles.colorHeader}>
                          <label>
                            <span>
                              컬러 {colorIndex + 1}
                            </span>

                            <select
                              value={group.color}
                              onChange={(e) =>
                                updateColor(
                                  section.id,
                                  group.id,
                                  e.target.value
                                )
                              }
                            >
                              <option value="">
                                컬러 선택
                              </option>

                              {colors.map(
                                (color) => (
                                  <option
                                    key={color}
                                    value={color}
                                  >
                                    {color}
                                  </option>
                                )
                              )}
                            </select>
                          </label>

                          <button
                            type="button"
                            onClick={() =>
                              removeColor(
                                section.id,
                                group.id
                              )
                            }
                            className={styles.deleteTextButton}
                          >
                            컬러 삭제
                          </button>
                        </div>

                        <div className={styles.sizeList}>
                          {group.sizes.map(
                            (size, sizeIndex) => (
                              <div
                                className={styles.sizeRow}
                                key={size.id}
                              >
                                <strong>
                                  {sizeIndex + 1}
                                </strong>

                                <label>
                                  <span>가로 mm</span>
                                  <input
                                    type="number"
                                    inputMode="numeric"
                                    value={size.width}
                                    onChange={(e) =>
                                      updateSize(
                                        section.id,
                                        group.id,
                                        size.id,
                                        "width",
                                        e.target.value
                                      )
                                    }
                                  />
                                </label>

                                <span className={styles.multiply}>
                                  ×
                                </span>

                                <label>
                                  <span>세로 mm</span>
                                  <input
                                    type="number"
                                    inputMode="numeric"
                                    value={size.height}
                                    onChange={(e) =>
                                      updateSize(
                                        section.id,
                                        group.id,
                                        size.id,
                                        "height",
                                        e.target.value
                                      )
                                    }
                                  />
                                </label>

                                <label>
                                  <span>수량</span>
                                  <input
                                    type="number"
                                    inputMode="numeric"
                                    min="1"
                                    value={size.quantity}
                                    onChange={(e) =>
                                      updateSize(
                                        section.id,
                                        group.id,
                                        size.id,
                                        "quantity",
                                        e.target.value
                                      )
                                    }
                                  />
                                </label>

                                <button
                                  type="button"
                                  onClick={() =>
                                    removeSize(
                                      section.id,
                                      group.id,
                                      size.id
                                    )
                                  }
                                  className={styles.smallDelete}
                                >
                                  삭제
                                </button>
                              </div>
                            )
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            addSize(
                              section.id,
                              group.id
                            )
                          }
                          className={styles.sizeAddButton}
                        >
                          + 재단 사이즈 추가
                        </button>
                      </div>
                    )
                  )}

                  <button
                    type="button"
                    onClick={() =>
                      addColor(section.id)
                    }
                    className={styles.colorAddButton}
                  >
                    + 컬러 추가
                  </button>
                </div>
              )
            )}
          </div>
        </section>

        <section className={styles.card}>
          <h2>3. 최적 재단 계산</h2>

          <div className={styles.modeBox}>
            <label>
              <input
                type="radio"
                checked={rollMode === "waste"}
                onChange={() =>
                  setRollMode("waste")
                }
              />
              전체 사용 길이 최소
            </label>

            <label>
              <input
                type="radio"
                checked={
                  rollMode === "short-first"
                }
                onChange={() =>
                  setRollMode(
                    "short-first"
                  )
                }
              />
              짧은 롤 우선 사용
            </label>
          </div>

          <div className={styles.calculateButtons}>
            <button
              type="button"
              disabled={calculating}
              onClick={() => calculate(80)}
              className={styles.quickButton}
            >
              빠른 계산
            </button>

            <button
              type="button"
              disabled={calculating}
              onClick={() => calculate(500)}
              className={styles.primaryButton}
            >
              {calculating
                ? "계산 중..."
                : "정밀 최적화"}
            </button>
          </div>

          {errors.length > 0 && (
            <div className={styles.errorBox}>
              {errors.map(
                (error, index) => (
                  <div key={index}>
                    • {error}
                  </div>
                )
              )}
            </div>
          )}
        </section>

        {result && (
          <section className={styles.resultSection}>
            <div className={styles.resultSummary}>
              <h2>재단 결과</h2>

              <div className={styles.summaryGrid}>
                <div>
                  <span>사용 롤</span>
                  <strong>
                    {result.summary.usedRollCount}개
                  </strong>
                </div>

                <div>
                  <span>총 사용 길이</span>
                  <strong>
                    {formatMeterFromMm(
                      result.summary.totalUsedLength
                    )}
                  </strong>
                </div>

                <div>
                  <span>재단 효율</span>
                  <strong>
                    {result.summary.efficiency}%
                  </strong>
                </div>
              </div>
            </div>

            {result.usedRolls.map(
              (roll, index) => (
                <div
                  className={styles.resultCard}
                  key={roll.id}
                >
                  <div className={styles.resultHeader}>
                    <div>
                      <h3>
                        {roll.color} · ROLL {index + 1}
                      </h3>

                      <p>
                        원래 {formatMeterFromMm(
                          roll.lengthMm
                        )}
                        {" · "}
                        사용 {formatMeterFromMm(
                          roll.usedLength
                        )}
                        {" · "}
                        잔여 {formatMeterFromMm(
                          roll.remainingLength
                        )}
                      </p>
                    </div>

                    <strong>
                      효율 {roll.efficiency}%
                    </strong>
                  </div>

                  <RollDiagram roll={roll} />
                </div>
              )
            )}

            {result.unplaced.length > 0 && (
              <div className={styles.errorBox}>
                <strong>
                  배치하지 못한 재단물
                </strong>

                {result.unplaced.map(
                  (piece) => (
                    <div key={piece.id}>
                      {piece.location} ·
                      {piece.part} ·
                      {piece.color} ·
                      {piece.originalWidth}×
                      {piece.originalHeight}
                    </div>
                  )
                )}
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
                    }
