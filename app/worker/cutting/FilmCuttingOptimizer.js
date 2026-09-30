"use client";

import { useMemo, useState } from "react";
import styles from "./FilmCuttingOptimizer.module.css";

import CuttingInput from "./CuttingInput";
import CuttingResult from "./CuttingResult";

import {
  FILM_WIDTH,
  optimizeCutting,
} from "./cuttingOptimizer";

/* =========================================================
   기본 생성 함수
========================================================= */

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

function isBlankSize(size) {
  return !Number(size.width) && !Number(size.height);
}

/* =========================================================
   여러 사이즈 한번에 입력
   지원:
   480x2100
   480x2100x2
   480 × 2100 × 2
   480 2100 2
========================================================= */

function parseBulkSizes(value) {
  const result = [];

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
          ? Math.max(
              1,
              Math.floor(Number(numbers[2]) || 1)
            )
          : 1;

      if (width <= 0 || height <= 0) return;

      result.push({
        id: makeId("size"),
        width,
        height,
        quantity,
      });
    });

  return result;
}

/* =========================================================
   메인
========================================================= */

export default function FilmCuttingOptimizer() {
  const [rolls, setRolls] = useState(() => [
    createRoll(),
  ]);

  const [sections, setSections] = useState(() => [
    createSection(),
  ]);

  const [rollMode, setRollMode] = useState("waste");
  const [iterations, setIterations] = useState(350);

  const [result, setResult] = useState(null);
  const [errors, setErrors] = useState([]);
  const [calculating, setCalculating] = useState(false);

  const [bulkEditor, setBulkEditor] = useState(null);

  /* =======================================================
     보유 롤에서 실제 컬러 목록 생성
     S115 11m + S115 20m + W123 15m
     → S115, W123
  ======================================================= */

  const colors = useMemo(() => {
    return [
      ...new Set(
        rolls
          .map((roll) => normalizeColor(roll.color))
          .filter(Boolean)
      ),
    ];
  }, [rolls]);

  /* =======================================================
     상단 입력 현황
  ======================================================= */

  const summary = useMemo(() => {
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

  function clearResult() {
    setResult(null);
    setErrors([]);
  }

  /* =======================================================
     롤
  ======================================================= */

  function addRoll() {
    setRolls((prev) => [...prev, createRoll()]);
    clearResult();
  }

  function removeRoll(id) {
    setRolls((prev) => {
      if (prev.length <= 1) return prev;

      return prev.filter((roll) => roll.id !== id);
    });

    clearResult();
  }

  function updateRoll(id, field, value) {
    setRolls((prev) =>
      prev.map((roll) => {
        if (roll.id !== id) return roll;

        return {
          ...roll,
          [field]:
            field === "color"
              ? normalizeColor(value)
              : value,
        };
      })
    );

    clearResult();
  }

  /* =======================================================
     시공 위치 / 부위
  ======================================================= */

  function addSection() {
    setSections((prev) => {
      const previousLocation =
        prev[prev.length - 1]?.location || "";

      return [
        ...prev,
        createSection(
          previousLocation,
          colors[0] || ""
        ),
      ];
    });

    clearResult();
  }

  function removeSection(sectionId) {
    setSections((prev) => {
      if (prev.length <= 1) return prev;

      return prev.filter(
        (section) => section.id !== sectionId
      );
    });

    clearResult();
  }

  function updateSection(sectionId, field, value) {
    setSections((prev) =>
      prev.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              [field]: value,
            }
          : section
      )
    );

    clearResult();
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

    clearResult();
  }

  /* =======================================================
     컬러
  ======================================================= */

  function addColorGroup(sectionId) {
    setSections((prev) =>
      prev.map((section) => {
        if (section.id !== sectionId) return section;

        const usedColors = new Set(
          section.colors
            .map((group) =>
              normalizeColor(group.color)
            )
            .filter(Boolean)
        );

        const nextColor =
          colors.find(
            (color) => !usedColors.has(color)
          ) ||
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

    clearResult();
  }

  function removeColorGroup(
    sectionId,
    colorGroupId
  ) {
    setSections((prev) =>
      prev.map((section) => {
        if (section.id !== sectionId) return section;

        if (section.colors.length <= 1) {
          return section;
        }

        return {
          ...section,

          colors: section.colors.filter(
            (group) => group.id !== colorGroupId
          ),
        };
      })
    );

    clearResult();
  }

  function updateColorGroup(
    sectionId,
    colorGroupId,
    color
  ) {
    const normalized = normalizeColor(color);

    setSections((prev) =>
      prev.map((section) => {
        if (section.id !== sectionId) return section;

        return {
          ...section,

          colors: section.colors.map((group) =>
            group.id === colorGroupId
              ? {
                  ...group,
                  color: normalized,
                }
              : group
          ),
        };
      })
    );

    clearResult();
  }

  /* =======================================================
     재단 사이즈
  ======================================================= */

  function addSize(sectionId, colorGroupId) {
    setSections((prev) =>
      prev.map((section) => {
        if (section.id !== sectionId) return section;

        return {
          ...section,

          colors: section.colors.map((group) =>
            group.id === colorGroupId
              ? {
                  ...group,
                  sizes: [
                    ...group.sizes,
                    createSize(),
                  ],
                }
              : group
          ),
        };
      })
    );

    clearResult();
  }

  function removeSize(
    sectionId,
    colorGroupId,
    sizeId
  ) {
    setSections((prev) =>
      prev.map((section) => {
        if (section.id !== sectionId) return section;

        return {
          ...section,

          colors: section.colors.map((group) => {
            if (group.id !== colorGroupId) {
              return group;
            }

            if (group.sizes.length <= 1) {
              return group;
            }

            return {
              ...group,

              sizes: group.sizes.filter(
                (size) => size.id !== sizeId
              ),
            };
          }),
        };
      })
    );

    clearResult();
  }

  function updateSize(
    sectionId,
    colorGroupId,
    sizeId,
    field,
    value
  ) {
    setSections((prev) =>
      prev.map((section) => {
        if (section.id !== sectionId) return section;

        return {
          ...section,

          colors: section.colors.map((group) => {
            if (group.id !== colorGroupId) {
              return group;
            }

            return {
              ...group,

              sizes: group.sizes.map((size) =>
                size.id === sizeId
                  ? {
                      ...size,
                      [field]: value,
                    }
                  : size
              ),
            };
          }),
        };
      })
    );

    clearResult();
  }

  function changeQuantity(
    sectionId,
    colorGroupId,
    sizeId,
    amount
  ) {
    setSections((prev) =>
      prev.map((section) => {
        if (section.id !== sectionId) return section;

        return {
          ...section,

          colors: section.colors.map((group) => {
            if (group.id !== colorGroupId) {
              return group;
            }

            return {
              ...group,

              sizes: group.sizes.map((size) => {
                if (size.id !== sizeId) {
                  return size;
                }

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
            };
          }),
        };
      })
    );

    clearResult();
  }

  /* =======================================================
     여러 사이즈 한번에 입력
  ======================================================= */

  function openBulkEditor(
    sectionId,
    colorGroupId
  ) {
    setBulkEditor({
      sectionId,
      colorGroupId,
      text: "",
    });
  }

  function closeBulkEditor() {
    setBulkEditor(null);
  }

  function applyBulkEditor() {
    if (!bulkEditor) return;

    const parsed = parseBulkSizes(
      bulkEditor.text
    );

    if (!parsed.length) {
      setErrors([
        "입력 형식을 확인해주세요. 예: 480x2100x2",
      ]);

      return;
    }

    setSections((prev) =>
      prev.map((section) => {
        if (
          section.id !==
          bulkEditor.sectionId
        ) {
          return section;
        }

        return {
          ...section,

          colors: section.colors.map((group) => {
            if (
              group.id !==
              bulkEditor.colorGroupId
            ) {
              return group;
            }

            const onlyBlank =
              group.sizes.length === 1 &&
              isBlankSize(group.sizes[0]);

            return {
              ...group,

              sizes: onlyBlank
                ? parsed
                : [
                    ...group.sizes,
                    ...parsed,
                  ],
            };
          }),
        };
      })
    );

    setBulkEditor(null);
    setErrors([]);
    setResult(null);
  }

  /* =======================================================
     전체 초기화
  ======================================================= */

  function resetAll() {
    setRolls([createRoll()]);
    setSections([createSection()]);
    setRollMode("waste");
    setIterations(350);
    setResult(null);
    setErrors([]);
    setBulkEditor(null);
  }

  /* =======================================================
     계산
  ======================================================= */

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

  /* =======================================================
     화면
  ======================================================= */

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        {/* 상단 */}
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>
              FILM CUTTING
            </p>

            <h1 className={styles.title}>
              필름 재단
            </h1>

            <p className={styles.description}>
              폭 {FILM_WIDTH}mm · 컬러별 보유 롤
              최적 재단
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

        {/* 입력 현황 */}
        <div className={styles.summaryBar}>
          <SummaryPill
            label="롤"
            value={`${summary.rollCount}개`}
          />

          <SummaryPill
            label="컬러"
            value={`${summary.colorCount}종`}
          />

          <SummaryPill
            label="부위"
            value={`${summary.sectionCount}개`}
          />

          <SummaryPill
            label="재단"
            value={`${summary.pieceCount}장`}
          />
        </div>

        {/* 입력 */}
        <CuttingInput
          styles={styles}
          rolls={rolls}
          sections={sections}
          colors={colors}
          bulkEditor={bulkEditor}
          setBulkEditor={setBulkEditor}
          addRoll={addRoll}
          removeRoll={removeRoll}
          updateRoll={updateRoll}
          addSection={addSection}
          removeSection={removeSection}
          copySection={copySection}
          updateSection={updateSection}
          addColorGroup={addColorGroup}
          removeColorGroup={removeColorGroup}
          updateColorGroup={updateColorGroup}
          addSize={addSize}
          removeSize={removeSize}
          updateSize={updateSize}
          changeQuantity={changeQuantity}
          openBulkEditor={openBulkEditor}
          closeBulkEditor={closeBulkEditor}
          applyBulkEditor={applyBulkEditor}
        />

        {/* 계산 */}
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <span className={styles.step}>
                3
              </span>

              <div>
                <h2>
                  최적 재단 계산
                </h2>

                <p>
                  입력된 재단물을 보유 롤에 배치합니다.
                </p>
              </div>
            </div>
          </div>

          <div className={styles.optionRow}>
            <label>
              <span>
                롤 사용 기준
              </span>

              <select
                value={rollMode}
                onChange={(e) =>
                  setRollMode(
                    e.target.value
                  )
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
              <span>
                계산 정밀도
              </span>

              <select
                value={iterations}
                onChange={(e) =>
                  setIterations(
                    Number(
                      e.target.value
                    )
                  )
                }
              >
                <option value={150}>
                  빠르게
                </option>

                <option value={350}>
                  보통
                </option>

                <option value={800}>
                  정밀
                </option>
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
              {errors.map(
                (error, index) => (
                  <p key={index}>
                    • {error}
                  </p>
                )
              )}
            </div>
          )}
        </section>

        {/* 결과 */}
        <CuttingResult
          result={result}
          onClose={() =>
            setResult(null)
          }
        />
      </div>
    </main>
  );
}

function SummaryPill({
  label,
  value,
}) {
  return (
    <div className={styles.summaryPill}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
    }
