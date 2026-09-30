export const FILM_WIDTH = 1220;

const DEFAULT_ITERATIONS = 350;
const MAX_ITERATIONS = 1500;

function n(value) {
  const v = Number(value);
  return Number.isFinite(v) ? v : 0;
}

function text(value) {
  return String(value ?? "").trim();
}

function colorKey(value) {
  return text(value).toUpperCase();
}

function shuffle(list) {
  const out = [...list];

  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }

  return out;
}

function clonePieces(list) {
  return list.map((item) => ({ ...item }));
}

function normalizeRolls(rolls = []) {
  return rolls.map((roll, index) => ({
    id: roll.id || `roll-${index + 1}`,
    index,

    color: colorKey(roll.color),

    lengthM: n(roll.lengthM),

    lengthMm: Math.round(
      n(roll.lengthM) * 1000
    ),

    grainDirection:
      roll.grainDirection === true,
  }));
}

export function validateCuttingInput({
  rolls = [],
  sections = [],
}) {
  const errors = [];

  const normalizedRolls =
    normalizeRolls(rolls);

  if (normalizedRolls.length === 0) {
    errors.push(
      "보유 필름 롤을 1개 이상 입력해주세요."
    );
  }

  normalizedRolls.forEach(
    (roll, index) => {
      if (!roll.color) {
        errors.push(
          `${index + 1}번 롤의 컬러번호를 입력해주세요.`
        );
      }

      if (roll.lengthMm <= 0) {
        errors.push(
          `${index + 1}번 롤의 길이를 확인해주세요.`
        );
      }
    }
  );

  if (
    !Array.isArray(sections) ||
    sections.length === 0
  ) {
    errors.push(
      "시공 위치와 부위를 1개 이상 입력해주세요."
    );
  }

  sections.forEach(
    (section, sectionIndex) => {
      const location =
        text(section.location);

      const part =
        text(section.part);

      if (!location) {
        errors.push(
          `${sectionIndex + 1}번 항목의 시공 위치를 입력해주세요.`
        );
      }

      if (!part) {
        errors.push(
          `${sectionIndex + 1}번 항목의 시공 부위를 입력해주세요.`
        );
      }

      if (
        !Array.isArray(section.colors) ||
        section.colors.length === 0
      ) {
        errors.push(
          `${location || `${sectionIndex + 1}번 위치`} / ${
            part || "부위"
          }에 컬러를 추가해주세요.`
        );

        return;
      }

      section.colors.forEach(
        (group, colorIndex) => {
          const color =
            colorKey(group.color);

          const sameColorRolls =
            normalizedRolls.filter(
              (roll) =>
                roll.color === color
            );

          if (!color) {
            errors.push(
              `${location || "위치"} / ${
                part || "부위"
              }의 컬러 ${colorIndex + 1}을 선택해주세요.`
            );

            return;
          }

          if (
            sameColorRolls.length === 0
          ) {
            errors.push(
              `${location} / ${part}에서 사용하는 ${color} 롤이 등록되어 있지 않습니다.`
            );
          }

          if (
            !Array.isArray(group.sizes) ||
            group.sizes.length === 0
          ) {
            errors.push(
              `${location} / ${part} / ${color}의 재단 사이즈를 입력해주세요.`
            );

            return;
          }

          group.sizes.forEach(
            (size, sizeIndex) => {
              const width =
                Math.round(
                  n(size.width)
                );

              const height =
                Math.round(
                  n(size.height)
                );

              const quantity =
                Math.floor(
                  n(size.quantity)
                );

              if (
                width <= 0 ||
                height <= 0
              ) {
                errors.push(
                  `${location} / ${part} / ${color}의 ${
                    sizeIndex + 1
                  }번 가로·세로를 확인해주세요.`
                );

                return;
              }

              if (
                quantity <= 0
              ) {
                errors.push(
                  `${location} / ${part} / ${color}의 ${
                    sizeIndex + 1
                  }번 수량을 확인해주세요.`
                );
              }

              if (
                sameColorRolls.length >
                0
              ) {
                const canFitSomeRoll =
                  sameColorRolls.some(
                    (roll) => {
                      if (
                        roll.grainDirection
                      ) {
                        return (
                          width <=
                            FILM_WIDTH &&
                          height <=
                            roll.lengthMm
                        );
                      }

                      const normal =
                        width <=
                          FILM_WIDTH &&
                        height <=
                          roll.lengthMm;

                      const rotated =
                        height <=
                          FILM_WIDTH &&
                        width <=
                          roll.lengthMm;

                      return (
                        normal ||
                        rotated
                      );
                    }
                  );

                if (!canFitSomeRoll) {
                  errors.push(
                    `${location} / ${part} / ${color} ${width}×${height}mm는 등록된 ${color} 롤에 들어가지 않습니다.`
                  );
                }
              }
            }
          );
        }
      );
    }
  );

  return {
    valid:
      errors.length === 0,

    errors,
  };
}
function expandSections(
  sections = []
) {
  const pieces = [];

  let sequence = 1;

  sections.forEach(
    (section, sectionIndex) => {
      const location =
        text(section.location);

      const part =
        text(section.part);

      (
        section.colors || []
      ).forEach(
        (group, colorIndex) => {
          const color =
            colorKey(group.color);

          (
            group.sizes || []
          ).forEach(
            (size, sizeIndex) => {
              const width =
                Math.round(
                  n(size.width)
                );

              const height =
                Math.round(
                  n(size.height)
                );

              const quantity =
                Math.max(
                  1,
                  Math.floor(
                    n(size.quantity) ||
                      1
                  )
                );

              for (
                let q = 0;
                q < quantity;
                q += 1
              ) {
                pieces.push({
                  id:
                    `piece-${sequence++}`,

                  sectionIndex,

                  colorIndex,

                  sizeIndex,

                  location,

                  part,

                  color,

                  originalWidth:
                    width,

                  originalHeight:
                    height,

                  width,

                  height,

                  area:
                    width *
                    height,

                  quantity,

                  quantityIndex:
                    q + 1,

                  label:
                    quantity > 1
                      ? `${location} · ${part} ${q + 1}`
                      : `${location} · ${part}`,
                });
              }
            }
          );
        }
      );
    }
  );

  return pieces;
}

function orientationsFor(
  piece,
  roll
) {
  const result = [];

  if (
    piece.width <=
      FILM_WIDTH &&
    piece.height <=
      roll.lengthMm
  ) {
    result.push({
      width:
        piece.width,

      height:
        piece.height,

      rotated:
        false,
    });
  }

  if (
    !roll.grainDirection &&
    piece.height <=
      FILM_WIDTH &&
    piece.width <=
      roll.lengthMm &&
    piece.width !==
      piece.height
  ) {
    result.push({
      width:
        piece.height,

      height:
        piece.width,

      rotated:
        true,
    });
  }

  return result;
}

function intersects(a, b) {
  return !(
    b.x >=
      a.x + a.width ||
    b.x + b.width <=
      a.x ||
    b.y >=
      a.y + a.height ||
    b.y + b.height <=
      a.y
  );
}

function contains(
  outer,
  inner
) {
  return (
    inner.x >=
      outer.x &&
    inner.y >=
      outer.y &&
    inner.x +
      inner.width <=
      outer.x +
        outer.width &&
    inner.y +
      inner.height <=
      outer.y +
        outer.height
  );
}

function splitFreeRect(
  freeRect,
  usedRect
) {
  if (
    !intersects(
      freeRect,
      usedRect
    )
  ) {
    return [freeRect];
  }

  const out = [];

  const freeRight =
    freeRect.x +
    freeRect.width;

  const freeBottom =
    freeRect.y +
    freeRect.height;

  const usedRight =
    usedRect.x +
    usedRect.width;

  const usedBottom =
    usedRect.y +
    usedRect.height;

  if (
    usedRect.y >
    freeRect.y
  ) {
    out.push({
      x:
        freeRect.x,

      y:
        freeRect.y,

      width:
        freeRect.width,

      height:
        usedRect.y -
        freeRect.y,
    });
  }

  if (
    usedBottom <
    freeBottom
  ) {
    out.push({
      x:
        freeRect.x,

      y:
        usedBottom,

      width:
        freeRect.width,

      height:
        freeBottom -
        usedBottom,
    });
  }

  if (
    usedRect.x >
    freeRect.x
  ) {
    out.push({
      x:
        freeRect.x,

      y:
        freeRect.y,

      width:
        usedRect.x -
        freeRect.x,

      height:
        freeRect.height,
    });
  }

  if (
    usedRight <
    freeRight
  ) {
    out.push({
      x:
        usedRight,

      y:
        freeRect.y,

      width:
        freeRight -
        usedRight,

      height:
        freeRect.height,
    });
  }

  return out.filter(
    (rect) =>
      rect.width > 0 &&
      rect.height > 0
  );
}

function pruneFreeRects(
  rects
) {
  return rects.filter(
    (rect, index) => {
      for (
        let i = 0;
        i < rects.length;
        i += 1
      ) {
        if (
          i !== index &&
          contains(
            rects[i],
            rect
          )
        ) {
          return false;
        }
      }

      return true;
    }
  );
}

function updateFreeRects(
  freeRects,
  placed
) {
  let next = [];

  freeRects.forEach(
    (rect) => {
      next.push(
        ...splitFreeRect(
          rect,
          placed
        )
      );
    }
  );

  return pruneFreeRects(
    next
  );
      }
function createRollState(
  roll
) {
  return {
    ...roll,

    placements: [],

    usedLength:
      0,

    remainingLength:
      roll.lengthMm,

    usedArea:
      0,

    efficiency:
      0,

    freeRects: [
      {
        x: 0,

        y: 0,

        width:
          FILM_WIDTH,

        height:
          roll.lengthMm,
      },
    ],
  };
}

function findBestPlacement(
  roll,
  piece,
  placementMode
) {
  let best = null;

  const orientations =
    orientationsFor(
      piece,
      roll
    );

  orientations.forEach(
    (orientation) => {
      roll.freeRects.forEach(
        (freeRect) => {
          if (
            orientation.width >
              freeRect.width ||
            orientation.height >
              freeRect.height
          ) {
            return;
          }

          const x =
            freeRect.x;

          const y =
            freeRect.y;

          const newUsedLength =
            Math.max(
              roll.usedLength,
              y +
                orientation.height
            );

          const lengthIncrease =
            newUsedLength -
            roll.usedLength;

          const remainW =
            freeRect.width -
            orientation.width;

          const remainH =
            freeRect.height -
            orientation.height;

          const shortSide =
            Math.min(
              remainW,
              remainH
            );

          const longSide =
            Math.max(
              remainW,
              remainH
            );

          let score;

          if (
            placementMode ===
            "tight"
          ) {
            score =
              shortSide *
                100000 +
              longSide *
                100 +
              lengthIncrease *
                10 +
              y;
          } else if (
            placementMode ===
            "length"
          ) {
            score =
              lengthIncrease *
                1000000 +
              y * 100 +
              shortSide *
                10 +
              longSide;
          } else {
            score =
              lengthIncrease *
                1000000 +
              shortSide *
                1000 +
              longSide +
              y * 0.01;
          }

          if (
            !best ||
            score <
              best.score
          ) {
            best = {
              x,

              y,

              width:
                orientation.width,

              height:
                orientation.height,

              rotated:
                orientation.rotated,

              newUsedLength,

              score,
            };
          }
        }
      );
    }
  );

  return best;
}

function placePiece(
  roll,
  piece,
  placement
) {
  const placed = {
    ...piece,

    x:
      placement.x,

    y:
      placement.y,

    width:
      placement.width,

    height:
      placement.height,

    rotated:
      placement.rotated,
  };

  roll.placements.push(
    placed
  );

  roll.freeRects =
    updateFreeRects(
      roll.freeRects,
      placed
    );

  roll.usedLength =
    Math.max(
      roll.usedLength,
      placed.y +
        placed.height
    );

  roll.usedArea +=
    placed.width *
    placed.height;

  roll.remainingLength =
    Math.max(
      0,
      roll.lengthMm -
        roll.usedLength
    );

  const consumedArea =
    FILM_WIDTH *
    Math.max(
      1,
      roll.usedLength
    );

  roll.efficiency =
    (
      roll.usedArea /
      consumedArea
    ) * 100;
}

function findBestRoll(
  rolls,
  piece,
  placementMode,
  rollMode
) {
  let best = null;

  rolls.forEach(
    (roll) => {
      if (
        roll.color !==
        piece.color
      ) {
        return;
      }

      const placement =
        findBestPlacement(
          roll,
          piece,
          placementMode
        );

      if (!placement) {
        return;
      }

      const projectedLength =
        Math.max(
          roll.usedLength,
          placement.y +
            placement.height
        );

      const lengthIncrease =
        projectedLength -
        roll.usedLength;

      const remaining =
        roll.lengthMm -
        projectedLength;

      const isNewRoll =
        roll.placements
          .length === 0;

      let score =
        placement.score;

      if (
        rollMode ===
        "short-first"
      ) {
        score +=
          roll.lengthMm *
            100 +
          remaining *
            10;
      } else {
        score +=
          lengthIncrease *
            100000 +
          remaining;
      }

      if (isNewRoll) {
        score += 1500;
      }

      if (
        !best ||
        score <
          best.score
      ) {
        best = {
          roll,

          placement,

          score,
        };
      }
    }
  );

  return best;
}

function packOnce({
  rolls,
  pieces,
  placementMode,
  rollMode,
}) {
  const rollStates =
    rolls.map(
      createRollState
    );

  const unplaced = [];

  pieces.forEach(
    (piece) => {
      const best =
        findBestRoll(
          rollStates,
          piece,
          placementMode,
          rollMode
        );

      if (!best) {
        unplaced.push(
          piece
        );

        return;
      }

      placePiece(
        best.roll,
        piece,
        best.placement
      );
    }
  );

  return finalizeResult(
    rollStates,
    unplaced
  );
    }
function finalizeResult(
  rolls,
  unplaced
) {
  rolls.forEach(
    (roll) => {
      roll.usedLength =
        Math.round(
          roll.usedLength
        );

      roll.remainingLength =
        Math.max(
          0,
          roll.lengthMm -
            roll.usedLength
        );

      roll.efficiency =
        Math.round(
          roll.efficiency *
            10
        ) / 10;

      roll.placements.sort(
        (a, b) =>
          a.y !== b.y
            ? a.y - b.y
            : a.x - b.x
      );
    }
  );

  const usedRolls =
    rolls.filter(
      (roll) =>
        roll.placements
          .length > 0
    );

  const unusedRolls =
    rolls.filter(
      (roll) =>
        roll.placements
          .length === 0
    );

  const totalUsedLength =
    usedRolls.reduce(
      (sum, roll) =>
        sum +
        roll.usedLength,
      0
    );

  const totalOriginalLength =
    usedRolls.reduce(
      (sum, roll) =>
        sum +
        roll.lengthMm,
      0
    );

  const totalRemainingLength =
    usedRolls.reduce(
      (sum, roll) =>
        sum +
        roll.remainingLength,
      0
    );

  const totalPieceArea =
    usedRolls.reduce(
      (sum, roll) =>
        sum +
        roll.usedArea,
      0
    );

  const totalConsumedArea =
    usedRolls.reduce(
      (sum, roll) =>
        sum +
        FILM_WIDTH *
          roll.usedLength,
      0
    );

  const wastedArea =
    Math.max(
      0,
      totalConsumedArea -
        totalPieceArea
    );

  const efficiency =
    totalConsumedArea > 0
      ? (
          totalPieceArea /
          totalConsumedArea
        ) * 100
      : 0;

  const byColor = {};

  usedRolls.forEach(
    (roll) => {
      if (
        !byColor[
          roll.color
        ]
      ) {
        byColor[
          roll.color
        ] = {
          color:
            roll.color,

          usedRolls:
            0,

          usedLength:
            0,

          remainingLength:
            0,

          pieceCount:
            0,
        };
      }

      byColor[
        roll.color
      ].usedRolls += 1;

      byColor[
        roll.color
      ].usedLength +=
        roll.usedLength;

      byColor[
        roll.color
      ].remainingLength +=
        roll.remainingLength;

      byColor[
        roll.color
      ].pieceCount +=
        roll.placements.length;
    }
  );

  return {
    success:
      unplaced.length === 0,

    rolls,

    usedRolls,

    unusedRolls,

    unplaced,

    byColor:
      Object.values(
        byColor
      ),

    summary: {
      usedRollCount:
        usedRolls.length,

      unusedRollCount:
        unusedRolls.length,

      totalUsedLength,

      totalOriginalLength,

      totalRemainingLength,

      totalPieceArea,

      totalConsumedArea,

      wastedArea,

      efficiency:
        Math.round(
          efficiency *
            10
        ) / 10,
    },
  };
}

function scoreResult(
  result,
  rollMode
) {
  if (
    result.unplaced
      .length > 0
  ) {
    return (
      1_000_000_000_000 +
      result.unplaced
        .length *
        1_000_000_000 +
      result.summary
        .totalUsedLength
    );
  }

  const s =
    result.summary;

  if (
    rollMode ===
    "short-first"
  ) {
    const openedLength =
      result.usedRolls.reduce(
        (sum, roll) =>
          sum +
          roll.lengthMm,
        0
      );

    return (
      openedLength *
        10000 +
      s.totalUsedLength *
        100 +
      s.wastedArea /
        1000 +
      s.usedRollCount *
        10
    );
  }

  return (
    s.totalUsedLength *
      100000 +
    s.wastedArea +
    s.usedRollCount *
      1000
  );
}

function createOrders(
  pieces
) {
  return [
    [...pieces].sort(
      (a, b) =>
        b.area -
        a.area
    ),

    [...pieces].sort(
      (a, b) =>
        Math.max(
          b.width,
          b.height
        ) -
        Math.max(
          a.width,
          a.height
        )
    ),

    [...pieces].sort(
      (a, b) =>
        b.height -
          a.height ||
        b.width -
          a.width
    ),

    [...pieces].sort(
      (a, b) =>
        b.width -
          a.width ||
        b.height -
          a.height
    ),

    [...pieces].sort(
      (a, b) =>
        a.color.localeCompare(
          b.color
        ) ||
        b.area -
          a.area
    ),

    [...pieces].sort(
      (a, b) =>
        a.sectionIndex -
          b.sectionIndex ||
        a.colorIndex -
          b.colorIndex ||
        b.area -
          a.area
    ),
  ];
      }
export function optimizeCutting({
  rolls = [],
  sections = [],

  rollMode = "waste",

  iterations =
    DEFAULT_ITERATIONS,
} = {}) {
  const validation =
    validateCuttingInput({
      rolls,
      sections,
    });

  if (
    !validation.valid
  ) {
    return {
      success:
        false,

      errors:
        validation.errors,

      result:
        null,
    };
  }

  const normalizedRolls =
    normalizeRolls(
      rolls
    );

  const pieces =
    expandSections(
      sections
    );

  const placementModes = [
    "balanced",
    "length",
    "tight",
  ];

  const baseOrders =
    createOrders(
      pieces
    );

  let bestResult =
    null;

  let bestScore =
    Infinity;

  const testOrder =
    (order) => {
      placementModes.forEach(
        (placementMode) => {
          const result =
            packOnce({
              rolls:
                normalizedRolls,

              pieces:
                clonePieces(
                  order
                ),

              placementMode,

              rollMode,
            });

          const score =
            scoreResult(
              result,
              rollMode
            );

          if (
            score <
            bestScore
          ) {
            bestScore =
              score;

            bestResult =
              result;
          }
        }
      );
    };

  baseOrders.forEach(
    testOrder
  );

  const safeIterations =
    Math.max(
      0,

      Math.min(
        Math.floor(
          n(iterations) ||
            DEFAULT_ITERATIONS
        ),

        MAX_ITERATIONS
      )
    );

  for (
    let i = 0;
    i <
    safeIterations;
    i += 1
  ) {
    testOrder(
      shuffle(
        pieces
      )
    );
  }

  if (!bestResult) {
    return {
      success:
        false,

      errors: [
        "재단 결과를 계산하지 못했습니다.",
      ],

      result:
        null,
    };
  }

  if (
    bestResult.unplaced
      .length > 0
  ) {
    return {
      success:
        false,

      errors: [
        "현재 등록된 롤 길이로 모든 재단물을 배치할 수 없습니다.",
      ],

      result:
        bestResult,
    };
  }

  return {
    success:
      true,

    errors:
      [],

    result:
      bestResult,
  };
}

export function formatMm(
  value
) {
  return `${Math.round(
    n(value)
  ).toLocaleString()}mm`;
}

export function formatMeterFromMm(
  value
) {
  return `${(
    n(value) / 1000
  ).toFixed(2)}m`;
}

export function getUniqueColors(
  rolls = []
) {
  return [
    ...new Set(
      normalizeRolls(
        rolls
      )
        .map(
          (roll) =>
            roll.color
        )
        .filter(Boolean)
    ),
  ];
}
