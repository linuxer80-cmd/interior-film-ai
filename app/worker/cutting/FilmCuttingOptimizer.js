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

function normalizeColor(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function parseBulkSizes(value) {
  const rows = [];

  String(value || "")
    .split(/\r?\n/)
    .forEach((line) => {
      const numbers = line
        .replace(/,/g, "")
        .match(/\d+(?:\.\d+)?/g);

      if (!numbers || numbers.length < 2) {
        return;
      }

      const width = Math.round(
        Number(numbers[0])
      );

      const height = Math.round(
        Number(numbers[1])
      );

      const quantity =
        numbers.length >= 3
          ? Math.max(
              1,
              Math.floor(
                Number(numbers[2]) || 1
              )
            )
          : 1;

      if (width <= 0 || height <= 0) {
        return;
      }

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
  return (
    !Number(size.width) &&
    !Number(size.height)
  );
}

export default function FilmCuttingOptimizer() {
  const [rolls, setRolls] = useState(() => [
    createRoll(),
  ]);

  const [sections, setSections] = useState(
    () => [createSection()]
  );

  const [rollMode, setRollMode] =
    useState("waste");

  const [iterations, setIterations] =
    useState(350);

  const [result, setResult] =
    useState(null);

  const [errors, setErrors] =
    useState([]);

  const [calculating, setCalculating] =
    useState(false);

  const [bulkEditor, setBulkEditor] =
    useState(null);

  /*
    중요:
    컬러 목록은 현재 입력한 보유 롤에서 직접 생성합니다.

    S115 11m
    S115 50m
    W123 20m

    => 컬러 선택에는
       S115
       W123
       두 개가 표시됩니다.
  */
  const colors = useMemo(() => {
    return [
      ...new Set(
        rolls
          .map((roll) =>
            normalizeColor(roll.color)
          )
          .filter(Boolean)
      ),
    ];
  }, [rolls]);

  const inputSummary = useMemo(() => {
    const validRolls = rolls.filter(
      (roll) =>
        normalizeColor(roll.color) &&
        Number(roll.lengthM) > 0
    );

    let sizeCount = 0;
    let pieceCount = 0;

    sections.forEach((section) => {
      section.colors.forEach((group) => {
        group.sizes.forEach((size) => {
          if (
            Number(size.width) > 0 &&
            Number(size.height) > 0
          ) {
            sizeCount += 1;

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
      sizeCount,
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
    setRolls((prev) => [
      ...prev,
      createRoll(),
    ]);

    setResult(null);
  }

  function removeRoll(id) {
    setRolls((prev) => {
      if (prev.length <= 1) {
        return prev;
      }

      return prev.filter(
        (roll) => roll.id !== id
      );
    });

    setResult(null);
  }

  function addSection() {
    setSections((prev) => {
      const last =
        prev[prev.length - 1];

      const previousLocation =
        last?.location || "";

      return [
        ...prev,
        createSection(
          previousLocation,
          colors[0] || ""
        ),
      ];
    });

    setResult(null);
  }

  function removeSection(sectionId) {
    setSections((prev) => {
      if (prev.length <= 1) {
        return prev;
      }

      return prev.filter(
        (section) =>
          section.id !== sectionId
      );
    });

    setResult(null);
  }

  function copySection(sectionId) {
    setSections((prev) => {
      const source = prev.find(
        (section) =>
          section.id === sectionId
      );

      if (!source) {
        return prev;
      }

      const copied = {
        ...source,
        id: makeId("section"),

        colors: source.colors.map(
          (group) => ({
            ...group,
            id: makeId("color"),

            sizes: group.sizes.map(
              (size) => ({
                ...size,
                id: makeId("size"),
              })
            ),
          })
        ),
      };

      const index = prev.findIndex(
        (section) =>
          section.id === sectionId
      );

      const next = [...prev];

      next.splice(
        index + 1,
        0,
        copied
      );

      return next;
    });

    setResult(null);
  }

  function updateSection(
    sectionId,
    field,
    value
  ) {
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

    setResult(null);
  }

  /*
    컬러 추가:
    아직 이 부위에서 사용하지 않은 컬러를
    자동으로 먼저 선택합니다.

    단, 이후 드롭다운에서는 모든 보유 컬러를
    자유롭게 선택할 수 있습니다.
  */
  function addColorGroup(sectionId) {
    setSections((prev) =>
      prev.map((section) => {
        if (section.id !== sectionId) {
          return section;
        }

        const usedColors = new Set(
          section.colors
            .map((group) =>
              normalizeColor(group.color)
            )
            .filter(Boolean)
        );

        const nextColor =
          colors.find(
            (color) =>
              !usedColors.has(color)
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

    setResult(null);
  }

  function removeColorGroup(
    sectionId,
    colorGroupId
  ) {
    setSections((prev) =>
      prev.map((section) => {
        if (section.id !== sectionId) {
          return section;
        }

        if (
          section.colors.length <= 1
        ) {
          return section;
        }

        return {
          ...section,

          colors:
            section.colors.filter(
              (group) =>
                group.id !==
                colorGroupId
            ),
        };
      })
    );

    setResult(null);
  }

  /*
    컬러 선택 제한 제거.

    예:
    보유 롤
    S115
    W123

    방1 / 샤시에서도
    S115, W123 모두 선택 가능.
  */
  function updateColorGroup(
    sectionId,
    colorGroupId,
    color
  ) {
    const normalized =
      normalizeColor(color);

    setSections((prev) =>
      prev.map((section) => {
        if (section.id !== sectionId) {
          return section;
        }

        return {
          ...section,

          colors:
            section.colors.map(
              (group) =>
                group.id ===
                colorGroupId
                  ? {
                      ...group,
                      color:
                        normalized,
                    }
                  : group
            ),
        };
      })
    );

    setResult(null);
  }

  function addSize(
    sectionId,
    colorGroupId
  ) {
    setSections((prev) =>
      prev.map((section) => {
        if (section.id !== sectionId) {
          return section;
        }

        return {
          ...section,

          colors:
            section.colors.map(
              (group) =>
                group.id ===
                colorGroupId
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

    setResult(null);
  }

  function removeSize(
    sectionId,
    colorGroupId,
    sizeId
  ) {
    setSections((prev) =>
      prev.map((section) => {
        if (section.id !== sectionId) {
          return section;
        }

        return {
          ...section,

          colors:
            section.colors.map(
              (group) => {
                if (
                  group.id !==
                  colorGroupId
                ) {
                  return group;
                }

                if (
                  group.sizes.length <=
                  1
                ) {
                  return group;
                }

                return {
                  ...group,

                  sizes:
                    group.sizes.filter(
                      (size) =>
                        size.id !==
                        sizeId
                    ),
                };
              }
            ),
        };
      })
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
      prev.map((section) => {
        if (section.id !== sectionId) {
          return section;
        }

        return {
          ...section,

          colors:
            section.colors.map(
              (group) => {
                if (
                  group.id !==
                  colorGroupId
                ) {
                  return group;
                }

                return {
                  ...group,

                  sizes:
                    group.sizes.map(
                      (size) =>
                        size.id === sizeId
                          ? {
                              ...size,
                              [field]:
                                value,
                            }
                          : size
                    ),
                };
              }
            ),
        };
      })
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
      prev.map((section) => {
        if (section.id !== sectionId) {
          return section;
        }

        return {
          ...section,

          colors:
            section.colors.map(
              (group) => {
                if (
                  group.id !==
                  colorGroupId
                ) {
                  return group;
                }

                return {
                  ...group,

                  sizes:
                    group.sizes.map(
                      (size) => {
                        if (
                          size.id !==
                          sizeId
                        ) {
                          return size;
                        }

                        const current =
                          Math.max(
                            1,
                            Number(
                              size.quantity
                            ) || 1
                          );

                        return {
                          ...size,

                          quantity:
                            Math.max(
                              1,
                              current +
                                amount
                            ),
                        };
                      }
                    ),
                };
              }
            ),
        };
      })
    );

    setResult(null);
  }

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
    if (!bulkEditor) {
      return;
    }

    const parsed =
      parseBulkSizes(
        bulkEditor.text
      );

    if (parsed.length === 0) {
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

          colors:
            section.colors.map(
              (group) => {
                if (
                  group.id !==
                  bulkEditor.colorGroupId
                ) {
                  return group;
                }

                const onlyBlank =
                  group.sizes.length ===
                    1 &&
                  isBlankSize(
                    group.sizes[0]
                  );

                return {
                  ...group,

                  sizes: onlyBlank
                    ? parsed
                    : [
                        ...group.sizes,
                        ...parsed,
                      ],
                };
              }
            ),
        };
      })
    );

    setErrors([]);
    setBulkEditor(null);
    setResult(null);
  }

  function resetAll() {
    setRolls([
      createRoll(),
    ]);

    setSections([
      createSection(),
    ]);

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
        const response =
          optimizeCutting({
            rolls,
            sections,
            rollMode,
            iterations,
          });

        setErrors(
          response.errors || []
        );

        setResult(
          response.result || null
        );
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
            <p className={styles.eyebrow}>
              FILM CUTTING
            </p>

            <h1 className={styles.title}>
              필름 재단
            </h1>

            <p className={styles.description}>
              폭 {FILM_WIDTH}mm ·
              컬러별 보유 롤 최적 재단
            </p>
          </div>

          <button
            type="button"
            className={
              styles.resetButton
            }
            onClick={resetAll}
          >
            전체 초기화
          </button>
        </header>

        <div
          className={
            styles.summaryBar
          }
        >
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

        <section
          className={
            styles.card
          }
        >
          <div
            className={
              styles.cardHeader
            }
          >
            <div>
              <span
                className={
                  styles.step
                }
              >
                1
              </span>

              <div>
                <h2>
                  보유 필름
                </h2>

                <p>
                  컬러와 실제 남은
                  롤 길이를 입력하세요.
                </p>
              </div>
            </div>

            <button
              type="button"
              className={
                styles.blackButton
              }
              onClick={addRoll}
            >
              + 롤
            </button>
          </div>

          <div
            className={
              styles.rollList
            }
          >
            {rolls.map(
              (roll, index) => (
                <div
                  key={roll.id}
                  className={
                    styles.rollRow
                  }
                >
                  <strong
                    className={
                      styles.rowIndex
                    }
                  >
                    {index + 1}
                  </strong>

                  <input
                    className={
                      styles.colorInput
                    }
                    value={
                      roll.color
                    }
                    placeholder="S115"
                    autoCapitalize="characters"
                    onChange={(e) =>
                      updateRoll(
                        roll.id,
                        "color",
                        e.target.value
                      )
                    }
                  />

                  <div
                    className={
                      styles.lengthInput
                    }
                  >
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.1"
                      value={
                        roll.lengthM
                      }
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
                    className={
                      styles.grainSelect
                    }
                    value={
                      roll.grainDirection
                        ? "grain"
                        : "free"
                    }
                    onChange={(e) =>
                      updateRoll(
                        roll.id,
                        "grainDirection",
                        e.target
                          .value ===
                          "grain"
                      )
                    }
                  >
                    <option value="free">
                      결 없음
                    </option>

                    <option value="grain">
                      결 있음
                    </option>
                  </select>

                  <button
                    type="button"
                    className={
                      styles.iconDelete
                    }
                    disabled={
                      rolls.length <= 1
                    }
                    onClick={() =>
                      removeRoll(
                        roll.id
                      )
                    }
                  >
                    ×
                  </button>
                </div>
              )
            )}
          </div>
        </section>

        <section
          className={
            styles.card
          }
        >
          <div
            className={
              styles.cardHeader
            }
          >
            <div>
              <span
                className={
                  styles.step
                }
              >
                2
              </span>

              <div>
                <h2>
                  재단 입력
                </h2>

                <p>
                  위치와 부위별로
                  컬러와 사이즈를
                  입력하세요.
                </p>
              </div>
            </div>

            <button
              type="button"
              className={
                styles.blackButton
              }
              onClick={
                addSection
              }
            >
              + 다음 부위
            </button>
          </div>
          {sections.map(
            (
              section,
              sectionIndex
            ) => (
              <article
                key={
                  section.id
                }
                className={
                  styles.sectionCard
                }
              >
                <div
                  className={
                    styles.sectionHeader
                  }
                >
                  <strong>
                    #{sectionIndex + 1}
                  </strong>

                  <div
                    className={
                      styles.sectionActions
                    }
                  >
                    <button
                      type="button"
                      onClick={() =>
                        copySection(
                          section.id
                        )
                      }
                    >
                      복사
                    </button>

                    <button
                      type="button"
                      disabled={
                        sections.length <=
                        1
                      }
                      onClick={() =>
                        removeSection(
                          section.id
                        )
                      }
                    >
                      삭제
                    </button>
                  </div>
                </div>

                <div
                  className={
                    styles.locationRow
                  }
                >
                  <label>
                    <span>
                      시공 위치
                    </span>

                    <input
                      value={
                        section.location
                      }
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
                    <span>
                      시공 부위
                    </span>

                    <input
                      value={
                        section.part
                      }
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

                {section.colors.map(
                  (
                    group,
                    colorIndex
                  ) => (
                    <div
                      key={
                        group.id
                      }
                      className={
                        styles.colorBlock
                      }
                    >
                      <div
                        className={
                          styles.colorBlockHeader
                        }
                      >
                        <div
                          className={
                            styles.colorTitle
                          }
                        >
                          <span>
                            컬러{" "}
                            {colorIndex +
                              1}
                          </span>

                          <select
                            value={
                              group.color
                            }
                            onChange={(e) =>
                              updateColorGroup(
                                section.id,
                                group.id,
                                e.target
                                  .value
                              )
                            }
                          >
                            <option value="">
                              컬러 선택
                            </option>

                            {colors.map(
                              (color) => (
                                <option
                                  key={
                                    color
                                  }
                                  value={
                                    color
                                  }
                                >
                                  {color}
                                </option>
                              )
                            )}
                          </select>
                        </div>

                        <button
                          type="button"
                          className={
                            styles.textDelete
                          }
                          disabled={
                            section
                              .colors
                              .length <= 1
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

                      <div
                        className={
                          styles.sizeList
                        }
                      >
                        {group.sizes.map(
                          (
                            size,
                            sizeIndex
                          ) => (
                            <div
                              key={
                                size.id
                              }
                              className={
                                styles.sizeRow
                              }
                            >
                              <span
                                className={
                                  styles.sizeIndex
                                }
                              >
                                {sizeIndex +
                                  1}
                              </span>

                              <input
                                className={
                                  styles.dimensionInput
                                }
                                type="number"
                                inputMode="numeric"
                                min="1"
                                value={
                                  size.width
                                }
                                placeholder="480"
                                onChange={(e) =>
                                  updateSize(
                                    section.id,
                                    group.id,
                                    size.id,
                                    "width",
                                    e.target
                                      .value
                                  )
                                }
                              />

                              <span
                                className={
                                  styles.multiply
                                }
                              >
                                ×
                              </span>

                              <input
                                className={
                                  styles.dimensionInput
                                }
                                type="number"
                                inputMode="numeric"
                                min="1"
                                value={
                                  size.height
                                }
                                placeholder="2100"
                                onChange={(e) =>
                                  updateSize(
                                    section.id,
                                    group.id,
                                    size.id,
                                    "height",
                                    e.target
                                      .value
                                  )
                                }
                              />

                              <span
                                className={
                                  styles.mm
                                }
                              >
                                mm
                              </span>

                              <QuantityStepper
                                value={
                                  size.quantity
                                }
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
                                onChange={(
                                  value
                                ) =>
                                  updateSize(
                                    section.id,
                                    group.id,
                                    size.id,
                                    "quantity",
                                    Math.max(
                                      1,
                                      Number(
                                        value
                                      ) || 1
                                    )
                                  )
                                }
                              />

                              <button
                                type="button"
                                className={
                                  styles.iconDelete
                                }
                                disabled={
                                  group
                                    .sizes
                                    .length <=
                                  1
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

                      <div
                        className={
                          styles.sizeActions
                        }
                      >
                        <button
                          type="button"
                          onClick={() =>
                            addSize(
                              section.id,
                              group.id
                            )
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

                      {bulkEditor?.sectionId ===
                        section.id &&
                        bulkEditor?.colorGroupId ===
                          group.id && (
                          <div
                            className={
                              styles.bulkBox
                            }
                          >
                            <p>
                              한 줄에 하나씩
                              입력하세요.
                            </p>

                            <textarea
                              autoFocus
                              value={
                                bulkEditor.text
                              }
                              placeholder={
                                "480x2100x2\n400x2100\n340x2100"
                              }
                              onChange={(
                                e
                              ) =>
                                setBulkEditor(
                                  (
                                    prev
                                  ) => ({
                                    ...prev,

                                    text:
                                      e
                                        .target
                                        .value,
                                  })
                                )
                              }
                            />

                            <small>
                              가로 × 세로 ×
                              수량 / 수량
                              생략 시 1장
                            </small>

                            <div
                              className={
                                styles.bulkActions
                              }
                            >
                              <button
                                type="button"
                                onClick={
                                  closeBulkEditor
                                }
                              >
                                취소
                              </button>

                              <button
                                type="button"
                                className={
                                  styles.applyButton
                                }
                                onClick={
                                  applyBulkEditor
                                }
                              >
                                적용
                              </button>
                            </div>
                          </div>
                        )}
                    </div>
                  )
                )}

                <button
                  type="button"
                  className={
                    styles.addColorButton
                  }
                  disabled={
                    colors.length === 0
                  }
                  onClick={() =>
                    addColorGroup(
                      section.id
                    )
                  }
                >
                  + 다른 컬러
                </button>
              </article>
            )
          )}
        </section>

        <section
          className={
            styles.card
          }
        >
          <div
            className={
              styles.cardHeader
            }
          >
            <div>
              <span
                className={
                  styles.step
                }
              >
                3
              </span>

              <div>
                <h2>
                  최적 재단 계산
                </h2>

                <p>
                  현재 입력값으로
                  재단 배치를 계산합니다.
                </p>
              </div>
            </div>
          </div>

          <div
            className={
              styles.optionRow
            }
          >
            <label>
              <span>
                롤 사용 기준
              </span>

              <select
                value={
                  rollMode
                }
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
                value={
                  iterations
                }
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
            className={
              styles.calculateButton
            }
            disabled={
              calculating
            }
            onClick={calculate}
          >
            {calculating
              ? "계산 중..."
              : "최적 재단 계산"}
          </button>

          {errors.length > 0 && (
            <div
              className={
                styles.errorBox
              }
            >
              {errors.map(
                (
                  error,
                  index
                ) => (
                  <p key={index}>
                    {error}
                  </p>
                )
              )}
            </div>
          )}
        </section>

        {result && (
          <section
            className={
              styles.resultArea
            }
          >
            <div
              className={
                styles.resultHeader
              }
            >
              <div>
                <p
                  className={
                    styles.eyebrow
                  }
                >
                  RESULT
                </p>

                <h2>
                  현재 재단 결과
                </h2>
              </div>

              <button
                type="button"
                onClick={() =>
                  setResult(null)
                }
              >
                닫기
              </button>
            </div>

            <div
              className={
                styles.resultSummary
              }
            >
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

            {result.usedRolls.map(
              (
                roll,
                index
              ) => (
                <ResultRollCard
                  key={`${roll.id}-${index}`}
                  roll={roll}
                  index={index}
                />
              )
            )}
          </section>
        )}
      </div>
    </main>
  );
}

function SummaryPill({
  label,
  value,
}) {
  return (
    <div
      className={
        styles.summaryPill
      }
    >
      <span>
        {label}
      </span>

      <strong>
        {value}
      </strong>
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
    <div
      className={
        styles.quantityStepper
      }
    >
      <button
        type="button"
        onClick={
          onMinus
        }
        disabled={
          Number(value) <= 1
        }
      >
        −
      </button>

      <input
        type="number"
        inputMode="numeric"
        min="1"
        value={value}
        onChange={(e) =>
          onChange(
            e.target.value
          )
        }
      />

      <button
        type="button"
        onClick={
          onPlus
        }
      >
        +
      </button>
    </div>
  );
}

function ResultRollCard({
  roll,
  index,
}) {
  return (
    <article
      className={
        styles.resultRoll
      }
    >
      <div
        className={
          styles.resultRollTop
        }
      >
        <div>
          <small>
            ROLL {index + 1}
          </small>

          <h3>
            {roll.color}
          </h3>
        </div>

        <div
          className={
            styles.resultRollNumbers
          }
        >
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
        </div>
      </div>

      <div
        className={
          styles.resultPieceList
        }
      >
        {roll.placements.map(
          (
            piece,
            pieceIndex
          ) => (
            <div
              key={
                piece.id
              }
              className={
                styles.resultPiece
              }
            >
              <strong>
                #{pieceIndex + 1}
              </strong>

              <div>
                <b>
                  {piece.location}
                  {" · "}
                  {piece.part}
                </b>

                <span>
                  {
                    piece.originalWidth
                  }
                  ×
                  {
                    piece.originalHeight
                  }
                  mm
                  {piece.rotated
                    ? " · 회전"
                    : ""}
                </span>
              </div>

              <em>
                {piece.color}
              </em>
            </div>
          )
        )}
      </div>
    </article>
  );
                        }
