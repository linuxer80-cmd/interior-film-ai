"use client";

import { useMemo, useState } from "react";
import styles from "./FilmCuttingOptimizer.module.css";

import {
  FILM_WIDTH,
  optimizeCutting,
  formatMeterFromMm,
} from "./cuttingOptimizer";

function makeId(prefix = "id") {
  return `${prefix}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function normalizeColor(value) {
  return String(value || "").trim().toUpperCase();
}

function createRoll() {
  return {
    id: makeId("roll"),
    color: "",
    lengthM: "",
    grainDirection: false,
  };
}

function createSize() {
  return {
    id: makeId("size"),
    width: "",
    height: "",
    quantity: 1,
  };
}

function createColorGroup(color = "") {
  return {
    id: makeId("color"),
    color,
    sizes: [createSize()],
  };
}

function createSection(location = "", color = "") {
  return {
    id: makeId("section"),
    location,
    part: "",
    colors: [createColorGroup(color)],
  };
}

function parseBulkSizes(value) {
  const rows = [];

  String(value || "")
    .split(/\r?\n/)
    .forEach((line) => {
      const numbers = line
        .replace(/,/g, "")
        .match(/\d+(?:\.\d+)?/g);

      if (!numbers || numbers.length < 2) return;

      const width = Math.round(Number(numbers[0]));
      const height = Math.round(Number(numbers[1]));
      const quantity =
        numbers.length >= 3
          ? Math.max(1, Math.floor(Number(numbers[2]) || 1))
          : 1;

      if (width <= 0 || height <= 0) return;

      rows.push({
        id: makeId("size"),
        width,
        height,
        quantity,
      });
    });

  return rows;
}

function isBlankSize(size) {
  return !Number(size.width) && !Number(size.height);
}

export default function FilmCuttingOptimizer() {
  const [rolls, setRolls] = useState(() => [createRoll()]);
  const [sections, setSections] = useState(() => [createSection()]);
  const [rollMode, setRollMode] = useState("waste");
  const [iterations, setIterations] = useState(350);
  const [result, setResult] = useState(null);
  const [errors, setErrors] = useState([]);
  const [calculating, setCalculating] = useState(false);
  const [bulkEditor, setBulkEditor] = useState(null);

  const colors = useMemo(
    () => [
      ...new Set(
        rolls
          .map((roll) => normalizeColor(roll.color))
          .filter(Boolean)
      ),
    ],
    [rolls]
  );

  const inputSummary = useMemo(() => {
    const validRolls = rolls.filter(
      (roll) =>
        normalizeColor(roll.color) &&
        Number(roll.lengthM) > 0
    );

    let pieceCount = 0;

    sections.forEach((section) => {
      section.colors.forEach((group) => {
        group.sizes.forEach((size) => {
          if (
            Number(size.width) > 0 &&
            Number(size.height) > 0
          ) {
            pieceCount += Math.max(
              1,
              Number(size.quantity) || 1
            );
          }
        });
      });
    });

    return {
      rollCount: validRolls.length,
      colorCount: colors.length,
      sectionCount: sections.length,
      pieceCount,
    };
  }, [rolls, sections, colors]);

  function updateRoll(id, field, value) {
    setRolls((prev) =>
      prev.map((roll) =>
        roll.id === id
          ? {
              ...roll,
              [field]:
                field === "color"
                  ? normalizeColor(value)
                  : value,
            }
          : roll
      )
    );
    setResult(null);
  }

  function addRoll() {
    setRolls((prev) => [...prev, createRoll()]);
    setResult(null);
  }

  function removeRoll(id) {
    setRolls((prev) =>
      prev.length <= 1
        ? prev
        : prev.filter((roll) => roll.id !== id)
    );
    setResult(null);
  }

  function updateSection(sectionId, field, value) {
    setSections((prev) =>
      prev.map((section) =>
        section.id === sectionId
          ? { ...section, [field]: value }
          : section
      )
    );
    setResult(null);
  }

  function addSection() {
    setSections((prev) => {
      const last = prev[prev.length - 1];

      return [
        ...prev,
        createSection(
          last?.location || "",
          colors[0] || ""
        ),
      ];
    });
    setResult(null);
  }

  function removeSection(sectionId) {
    setSections((prev) =>
      prev.length <= 1
        ? prev
        : prev.filter((section) => section.id !== sectionId)
    );
    setResult(null);
  }

  function copySection(sectionId) {
    setSections((prev) => {
      const source = prev.find(
        (section) => section.id === sectionId
      );

      if (!source) return prev;

      const copy = {
        ...source,
        id: makeId("section"),
        colors: source.colors.map((group) => ({
          ...group,
          id: makeId("color"),
          sizes: group.sizes.map((size) => ({
            ...size,
            id: makeId("size"),
          })),
        })),
      };

      const index = prev.findIndex(
        (section) => section.id === sectionId
      );

      const next = [...prev];
      next.splice(index + 1, 0, copy);
      return next;
    });

    setResult(null);
  }

  function addColorGroup(sectionId) {
    setSections((prev) =>
      prev.map((section) => {
        if (section.id !== sectionId) return section;

        const used = new Set(
          section.colors
            .map((group) => normalizeColor(group.color))
            .filter(Boolean)
        );

        const nextColor =
          colors.find((color) => !used.has(color)) ||
          colors[0] ||
          "";

        return {
          ...section,
          colors: [
            ...section.colors,
            createColorGroup(nextColor),
          ],
        };
      })
    );

    setResult(null);
  }

  function removeColorGroup(sectionId, colorGroupId) {
    setSections((prev) =>
      prev.map((section) => {
        if (section.id !== sectionId) return section;
        if (section.colors.length <= 1) return section;

        return {
          ...section,
          colors: section.colors.filter(
            (group) => group.id !== colorGroupId
          ),
        };
      })
    );

    setResult(null);
  }

  function updateColorGroup(sectionId, colorGroupId, color) {
    setSections((prev) =>
      prev.map((section) =>
        section.id !== sectionId
          ? section
          : {
              ...section,
              colors: section.colors.map((group) =>
                group.id === colorGroupId
                  ? {
                      ...group,
                      color: normalizeColor(color),
                    }
                  : group
              ),
            }
      )
    );

    setResult(null);
  }

  function addSize(sectionId, colorGroupId) {
    setSections((prev) =>
      prev.map((section) =>
        section.id !== sectionId
          ? section
          : {
              ...section,
              colors: section.colors.map((group) =>
                group.id === colorGroupId
                  ? {
                      ...group,
                      sizes: [...group.sizes, createSize()],
                    }
                  : group
              ),
            }
      )
    );

    setResult(null);
  }

  function removeSize(sectionId, colorGroupId, sizeId) {
    setSections((prev) =>
      prev.map((section) =>
        section.id !== sectionId
          ? section
          : {
              ...section,
              colors: section.colors.map((group) => {
                if (group.id !== colorGroupId) return group;
                if (group.sizes.length <= 1) return group;

                return {
                  ...group,
                  sizes: group.sizes.filter(
                    (size) => size.id !== sizeId
                  ),
                };
              }),
            }
      )
    );

    setResult(null);
  }

  function updateSize(
    sectionId,
    colorGroupId,
    sizeId,
    field,
    value
  ) {
    setSections((prev) =>
      prev.map((section) =>
        section.id !== sectionId
          ? section
          : {
              ...section,
              colors: section.colors.map((group) =>
                group.id !== colorGroupId
                  ? group
                  : {
                      ...group,
                      sizes: group.sizes.map((size) =>
                        size.id === sizeId
                          ? { ...size, [field]: value }
                          : size
                      ),
                    }
              ),
            }
      )
    );

    setResult(null);
  }

  function changeQuantity(
    sectionId,
    colorGroupId,
    sizeId,
    amount
  ) {
    setSections((prev) =>
      prev.map((section) =>
        section.id !== sectionId
          ? section
          : {
              ...section,
              colors: section.colors.map((group) =>
                group.id !== colorGroupId
                  ? group
                  : {
                      ...group,
                      sizes: group.sizes.map((size) => {
                        if (size.id !== sizeId) return size;

                        const current = Math.max(
                          1,
                          Number(size.quantity) || 1
                        );

                        return {
                          ...size,
                          quantity: Math.max(
                            1,
                            current + amount
                          ),
                        };
                      }),
                    }
              ),
            }
      )
    );

    setResult(null);
  }

  function openBulkEditor(sectionId, colorGroupId) {
    setBulkEditor({
      sectionId,
      colorGroupId,
      text: "",
    });
  }

  function applyBulkEditor() {
    if (!bulkEditor) return;

    const parsed = parseBulkSizes(bulkEditor.text);

    if (!parsed.length) {
      setErrors([
        "입력 형식을 확인해주세요. 예: 480x2100x2",
      ]);
      return;
    }

    setSections((prev) =>
      prev.map((section) => {
        if (section.id !== bulkEditor.sectionId) {
          return section;
        }

        return {
          ...section,
          colors: section.colors.map((group) => {
            if (group.id !== bulkEditor.colorGroupId) {
              return group;
            }

            const onlyBlank =
              group.sizes.length === 1 &&
              isBlankSize(group.sizes[0]);

            return {
              ...group,
              sizes: onlyBlank
                ? parsed
                : [...group.sizes, ...parsed],
            };
          }),
        };
      })
    );

    setBulkEditor(null);
    setErrors([]);
    setResult(null);
  }

  function resetAll() {
    setRolls([createRoll()]);
    setSections([createSection()]);
    setResult(null);
    setErrors([]);
    setBulkEditor(null);
  }

  function calculate() {
    setErrors([]);
    setResult(null);
    setCalculating(true);

    window.setTimeout(() => {
      try {
        const response = optimizeCutting({
          rolls,
          sections,
          rollMode,
          iterations,
        });

        setErrors(response.errors || []);
        setResult(response.result || null);
      } catch (error) {
        console.error(error);

        setErrors([
          error?.message ||
            "재단 계산 중 오류가 발생했습니다.",
        ]);
      } finally {
        setCalculating(false);
      }
    }, 30);
  }

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>FILM CUTTING</p>
            <h1 className={styles.title}>필름 재단</h1>
            <p className={styles.description}>
              폭 {FILM_WIDTH}mm · 컬러별 보유 롤 최적 재단
            </p>
          </div>

          <button
            type="button"
            className={styles.resetButton}
            onClick={resetAll}
          >
            전체 초기화
          </button>
        </header>

        <div className={styles.summaryBar}>
          <SummaryPill
            label="롤"
            value={`${inputSummary.rollCount}개`}
          />
          <SummaryPill
            label="컬러"
            value={`${inputSummary.colorCount}종`}
          />
          <SummaryPill
            label="부위"
            value={`${inputSummary.sectionCount}개`}
          />
          <SummaryPill
            label="재단"
            value={`${inputSummary.pieceCount}장`}
          />
        </div>

        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <span className={styles.step}>1</span>
              <div>
                <h2>보유 필름</h2>
                <p>컬러와 실제 남은 롤 길이를 입력하세요.</p>
              </div>
            </div>

            <button
              type="button"
              className={styles.blackButton}
              onClick={addRoll}
            >
              + 롤
            </button>
          </div>

          <div className={styles.rollList}>
            {rolls.map((roll, index) => (
              <div
                key={roll.id}
                className={styles.rollRow}
              >
                <strong className={styles.rowIndex}>
                  {index + 1}
                </strong>

                <input
                  className={styles.colorInput}
                  value={roll.color}
                  placeholder="S115"
                  onChange={(e) =>
                    updateRoll(
                      roll.id,
                      "color",
                      e.target.value
                    )
                  }
                />

                <div className={styles.lengthInput}>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={roll.lengthM}
                    placeholder="11"
                    onChange={(e) =>
                      updateRoll(
                        roll.id,
                        "lengthM",
                        e.target.value
                      )
                    }
                  />
                  <span>m</span>
                </div>

                <select
                  className={styles.grainSelect}
                  value={
                    roll.grainDirection ? "grain" : "free"
                  }
                  onChange={(e) =>
                    updateRoll(
                      roll.id,
                      "grainDirection",
                      e.target.value === "grain"
                    )
                  }
                >
                  <option value="free">결 없음</option>
                  <option value="grain">결 있음</option>
                </select>

                <button
                  type="button"
                  className={styles.iconDelete}
                  disabled={rolls.length <= 1}
                  onClick={() => removeRoll(roll.id)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </section>
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <span className={styles.step}>2</span>

              <div>
                <h2>재단 입력</h2>
                <p>위치와 부위별로 컬러와 사이즈를 입력하세요.</p>
              </div>
            </div>

            <button
              type="button"
              className={styles.blackButton}
              onClick={addSection}
            >
              + 다음 부위
            </button>
          </div>

          {sections.map((section, sectionIndex) => (
            <article
              key={section.id}
              className={styles.sectionCard}
            >
              <div className={styles.sectionHeader}>
                <strong>#{sectionIndex + 1}</strong>

                <div className={styles.sectionActions}>
                  <button
                    type="button"
                    onClick={() => copySection(section.id)}
                  >
                    복사
                  </button>

                  <button
                    type="button"
                    disabled={sections.length <= 1}
                    onClick={() =>
                      removeSection(section.id)
                    }
                  >
                    삭제
                  </button>
                </div>
              </div>

              <div className={styles.locationRow}>
                <label>
                  <span>시공 위치</span>

                  <input
                    value={section.location}
                    placeholder="방1"
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
                    placeholder="샤시"
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

              {section.colors.map((group, colorIndex) => (
                <div
                  key={group.id}
                  className={styles.colorBlock}
                >
                  <div className={styles.colorBlockHeader}>
                    <div className={styles.colorTitle}>
                      <span>컬러 {colorIndex + 1}</span>

                      <select
                        value={group.color}
                        onChange={(e) =>
                          updateColorGroup(
                            section.id,
                            group.id,
                            e.target.value
                          )
                        }
                      >
                        <option value="">컬러 선택</option>

                        {colors.map((color) => (
                          <option
                            key={color}
                            value={color}
                          >
                            {color}
                          </option>
                        ))}
                      </select>
                    </div>

                    <button
                      type="button"
                      className={styles.textDelete}
                      disabled={
                        section.colors.length <= 1
                      }
                      onClick={() =>
                        removeColorGroup(
                          section.id,
                          group.id
                        )
                      }
                    >
                      컬러 삭제
                    </button>
                  </div>

                  <div className={styles.sizeList}>
                    {group.sizes.map(
                      (size, sizeIndex) => (
                        <div
                          key={size.id}
                          className={styles.sizeRow}
                        >
                          <span className={styles.sizeIndex}>
                            {sizeIndex + 1}
                          </span>

                          <input
                            className={styles.dimensionInput}
                            type="number"
                            inputMode="numeric"
                            value={size.width}
                            placeholder="480"
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

                          <span className={styles.multiply}>
                            ×
                          </span>

                          <input
                            className={styles.dimensionInput}
                            type="number"
                            inputMode="numeric"
                            value={size.height}
                            placeholder="2100"
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

                          <span className={styles.mm}>mm</span>

                          <QuantityStepper
                            value={size.quantity}
                            onMinus={() =>
                              changeQuantity(
                                section.id,
                                group.id,
                                size.id,
                                -1
                              )
                            }
                            onPlus={() =>
                              changeQuantity(
                                section.id,
                                group.id,
                                size.id,
                                1
                              )
                            }
                            onChange={(value) =>
                              updateSize(
                                section.id,
                                group.id,
                                size.id,
                                "quantity",
                                Math.max(
                                  1,
                                  Number(value) || 1
                                )
                              )
                            }
                          />

                          <button
                            type="button"
                            className={styles.iconDelete}
                            disabled={
                              group.sizes.length <= 1
                            }
                            onClick={() =>
                              removeSize(
                                section.id,
                                group.id,
                                size.id
                              )
                            }
                          >
                            ×
                          </button>
                        </div>
                      )
                    )}
                  </div>

                  <div className={styles.sizeActions}>
                    <button
                      type="button"
                      onClick={() =>
                        addSize(section.id, group.id)
                      }
                    >
                      + 사이즈
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        openBulkEditor(
                          section.id,
                          group.id
                        )
                      }
                    >
                      여러개 한번에
                    </button>
                  </div>

                  {bulkEditor?.sectionId === section.id &&
                    bulkEditor?.colorGroupId === group.id && (
                      <div className={styles.bulkBox}>
                        <p>한 줄에 하나씩 입력하세요.</p>

                        <textarea
                          autoFocus
                          value={bulkEditor.text}
                          placeholder={
                            "480x2100x2\n400x2100\n340x2100"
                          }
                          onChange={(e) =>
                            setBulkEditor((prev) => ({
                              ...prev,
                              text: e.target.value,
                            }))
                          }
                        />

                        <small>
                          가로 × 세로 × 수량 / 수량 생략 시 1장
                        </small>

                        <div className={styles.bulkActions}>
                          <button
                            type="button"
                            onClick={() =>
                              setBulkEditor(null)
                            }
                          >
                            취소
                          </button>

                          <button
                            type="button"
                            className={styles.applyButton}
                            onClick={applyBulkEditor}
                          >
                            적용
                          </button>
                        </div>
                      </div>
                    )}
                </div>
              ))}

              <button
                type="button"
                className={styles.addColorButton}
                disabled={!colors.length}
                onClick={() =>
                  addColorGroup(section.id)
                }
              >
                + 다른 컬러
              </button>
            </article>
          ))}
        </section>

        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <span className={styles.step}>3</span>

              <div>
                <h2>최적 재단 계산</h2>
                <p>입력된 치수로 실제 배치를 계산합니다.</p>
              </div>
            </div>
          </div>

          <div className={styles.optionRow}>
            <label>
              <span>롤 사용 기준</span>

              <select
                value={rollMode}
                onChange={(e) =>
                  setRollMode(e.target.value)
                }
              >
                <option value="waste">
                  사용 길이 최소
                </option>
                <option value="short-first">
                  짧은 롤 우선
                </option>
              </select>
            </label>

            <label>
              <span>계산 정밀도</span>

              <select
                value={iterations}
                onChange={(e) =>
                  setIterations(
                    Number(e.target.value)
                  )
                }
              >
                <option value={150}>빠르게</option>
                <option value={350}>보통</option>
                <option value={800}>정밀</option>
              </select>
            </label>
          </div>

          <button
            type="button"
            className={styles.calculateButton}
            disabled={calculating}
            onClick={calculate}
          >
            {calculating
              ? "계산 중..."
              : "최적 재단 계산"}
          </button>

          {errors.length > 0 && (
            <div className={styles.errorBox}>
              {errors.map((error, index) => (
                <p key={index}>• {error}</p>
              ))}
            </div>
          )}
        </section>

        {result && (
          <section className={styles.resultArea}>
            <div className={styles.resultHeader}>
              <div>
                <p className={styles.eyebrow}>
                  CUTTING RESULT
                </p>
                <h2>재단 결과</h2>
              </div>

              <button
                type="button"
                onClick={() => setResult(null)}
              >
                닫기
              </button>
            </div>

            <div className={styles.resultSummary}>
              <SummaryPill
                label="사용 롤"
                value={`${result.summary.usedRollCount}개`}
              />
              <SummaryPill
                label="사용 길이"
                value={formatMeterFromMm(
                  result.summary.totalUsedLength
                )}
              />
              <SummaryPill
                label="잔여"
                value={formatMeterFromMm(
                  result.summary.totalRemainingLength
                )}
              />
              <SummaryPill
                label="효율"
                value={`${result.summary.efficiency}%`}
              />
            </div>

            {result.usedRolls.map((roll, index) => (
              <ResultRollCard
                key={`${roll.id}-${index}`}
                roll={roll}
                index={index}
              />
            ))}
          </section>
        )}
      </div>
    </main>
  );
}

function SummaryPill({ label, value }) {
  return (
    <div className={styles.summaryPill}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function QuantityStepper({
  value,
  onMinus,
  onPlus,
  onChange,
}) {
  return (
    <div className={styles.quantityStepper}>
      <button
        type="button"
        onClick={onMinus}
        disabled={Number(value) <= 1}
      >
        −
      </button>

      <input
        type="number"
        inputMode="numeric"
        min="1"
        value={value}
        onChange={(e) =>
          onChange(e.target.value)
        }
      />

      <button
        type="button"
        onClick={onPlus}
      >
        +
      </button>
    </div>
  );
}

/* =========================================================
   실제 재단 이미지
========================================================= */

function CuttingDiagram({ roll }) {
  const usedLength = Math.max(
    Number(roll.usedLength) || 1,
    1
  );

  const diagramWidth = 1220;

  const meterLines = [];

  for (
    let y = 0;
    y <= usedLength;
    y += 1000
  ) {
    meterLines.push(y);
  }

  if (
    meterLines[meterLines.length - 1] !==
    usedLength
  ) {
    meterLines.push(usedLength);
  }

  return (
    <div
      style={{
        marginTop: 14,
        marginBottom: 14,
        padding: 8,
        background: "#eef1f4",
        borderRadius: 12,
      }}
    >
      <div
        style={{
          marginBottom: 8,
          fontSize: 13,
          fontWeight: 900,
          color: "#111827",
        }}
      >
        재단도 · 폭 1220mm
      </div>

      <svg
        viewBox={`0 0 ${diagramWidth} ${usedLength}`}
        style={{
          display: "block",
          width: "100%",
          height: "auto",
          background: "#fff",
          border: "2px solid #111827",
          borderRadius: 6,
        }}
        preserveAspectRatio="xMidYMin meet"
      >
        <rect
          x="0"
          y="0"
          width={diagramWidth}
          height={usedLength}
          fill="#ffffff"
        />

        {meterLines.map((y) => (
          <g key={`meter-${y}`}>
            <line
              x1="0"
              y1={y}
              x2={diagramWidth}
              y2={y}
              stroke="#94a3b8"
              strokeWidth="3"
              strokeDasharray="14 12"
            />

            {y < usedLength && (
              <text
                x="12"
                y={y + 35}
                fontSize="28"
                fontWeight="700"
                fill="#64748b"
              >
                {y}mm
              </text>
            )}
          </g>
        ))}

        {roll.placements.map(
          (piece, pieceIndex) => {
            const w = Number(piece.width);
            const h = Number(piece.height);

            const smallWidth = w < 180;
            const smallHeight = h < 350;
            const tiny =
              smallWidth || smallHeight;

            return (
              <g key={piece.id}>
                <rect
                  x={piece.x}
                  y={piece.y}
                  width={piece.width}
                  height={piece.height}
                  fill={
                    pieceIndex % 3 === 0
                      ? "#dbeafe"
                      : pieceIndex % 3 === 1
                      ? "#dcfce7"
                      : "#fef3c7"
                  }
                  stroke="#111827"
                  strokeWidth="4"
                />

                {tiny ? (
                  <text
                    x={
                      piece.x +
                      piece.width / 2
                    }
                    y={
                      piece.y +
                      piece.height / 2
                    }
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="34"
                    fontWeight="900"
                    fill="#111827"
                  >
                    #{pieceIndex + 1}
                  </text>
                ) : (
                  <>
                    <text
                      x={
                        piece.x +
                        piece.width / 2
                      }
                      y={piece.y + 55}
                      textAnchor="middle"
                      fontSize="38"
                      fontWeight="900"
                      fill="#111827"
                    >
                      #{pieceIndex + 1}
                    </text>

                    <text
                      x={
                        piece.x +
                        piece.width / 2
                      }
                      y={piece.y + 105}
                      textAnchor="middle"
                      fontSize="34"
                      fontWeight="800"
                      fill="#111827"
                    >
                      {piece.location}
                    </text>

                    <text
                      x={
                        piece.x +
                        piece.width / 2
                      }
                      y={piece.y + 150}
                      textAnchor="middle"
                      fontSize="30"
                      fontWeight="700"
                      fill="#334155"
                    >
                      {piece.part}
                    </text>

                    <text
                      x={
                        piece.x +
                        piece.width / 2
                      }
                      y={piece.y + 195}
                      textAnchor="middle"
                      fontSize="28"
                      fontWeight="800"
                      fill="#475569"
                    >
                      {piece.originalWidth}×
                      {piece.originalHeight}
                    </text>
                  </>
                )}
              </g>
            );
          }
        )}

        <line
          x1="0"
          y1={usedLength}
          x2={diagramWidth}
          y2={usedLength}
          stroke="#dc2626"
          strokeWidth="8"
        />

        <text
          x={diagramWidth - 15}
          y={Math.max(35, usedLength - 15)}
          textAnchor="end"
          fontSize="30"
          fontWeight="900"
          fill="#dc2626"
        >
          사용 끝 {usedLength}mm
        </text>
      </svg>
    </div>
  );
}

function ResultRollCard({ roll, index }) {
  return (
    <article className={styles.resultRoll}>
      <div className={styles.resultRollTop}>
        <div>
          <small>ROLL {index + 1}</small>
          <h3>{roll.color}</h3>
        </div>

        <div className={styles.resultRollNumbers}>
          <span>
            보유{" "}
            <b>
              {formatMeterFromMm(
                roll.lengthMm
              )}
            </b>
          </span>

          <span>
            사용{" "}
            <b>
              {formatMeterFromMm(
                roll.usedLength
              )}
            </b>
          </span>

          <span>
            잔여{" "}
            <b>
              {formatMeterFromMm(
                roll.remainingLength
              )}
            </b>
          </span>

          <span>
            효율 <b>{roll.efficiency}%</b>
          </span>
        </div>
      </div>

      <CuttingDiagram roll={roll} />

      <div className={styles.resultPieceList}>
        {roll.placements.map(
          (piece, pieceIndex) => (
            <div
              key={piece.id}
              className={styles.resultPiece}
            >
              <strong>
                #{pieceIndex + 1}
              </strong>

              <div>
                <b>
                  {piece.location} ·{" "}
                  {piece.part}
                </b>

                <span>
                  {piece.originalWidth}×
                  {piece.originalHeight}mm
                  {piece.rotated
                    ? " · 회전"
                    : ""}
                </span>
              </div>

              <em>{piece.color}</em>
            </div>
          )
        )}
      </div>
    </article>
  );
                    }
