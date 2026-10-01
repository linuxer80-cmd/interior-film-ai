export const FILM_WIDTH = 1220;

const WIDE_THRESHOLD = 600;
const LONG_THRESHOLD = 1500;
const SAME_LENGTH_MIN_TOLERANCE = 80;
const SAME_LENGTH_RATIO = 0.06;
const MAX_ANCHOR_CANDIDATES = 24;
const EXTRA_ROLL_LIMIT_MM = 200000;

const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const txt = (v) => String(v ?? "").trim();
const colorKey = (v) => txt(v).toUpperCase();
const round1 = (v) => Math.round(v * 10) / 10;

export function formatMeterFromMm(value) {
  return `${(toNum(value) / 1000).toFixed(2)}m`;
}

export function getUniqueColors(rolls = []) {
  return [...new Set(rolls.map((r) => colorKey(r.color)).filter(Boolean))];
}

function normalizeRolls(rolls = []) {
  return rolls
    .map((roll, index) => ({
      id: roll.id || `roll-${index + 1}`,
      index,
      color: colorKey(roll.color),
      lengthM: toNum(roll.lengthM),
      lengthMm: Math.round(toNum(roll.lengthM) * 1000),
      grainDirection: roll.grainDirection === true,
    }))
    .filter((roll) => roll.color || roll.lengthMm > 0);
}

function validSize(size) {
  return toNum(size?.width) > 0 || toNum(size?.height) > 0;
}

function getColorGrainMap(rolls) {
  const map = new Map();

  rolls.forEach((roll) => {
    if (!map.has(roll.color)) {
      map.set(roll.color, roll.grainDirection);
    } else if (roll.grainDirection) {
      map.set(roll.color, true);
    }
  });

  return map;
}

function orientationsForDimensions(width, height, canRotate) {
  const result = [];

  if (width <= FILM_WIDTH) {
    result.push({
      width,
      height,
      rotated: false,
    });
  }

  if (
    canRotate &&
    height <= FILM_WIDTH &&
    width !== height
  ) {
    result.push({
      width: height,
      height: width,
      rotated: true,
    });
  }

  return result;
}

export function validateCuttingInput({
  rolls = [],
  sections = [],
}) {
  const errors = [];
  const normalizedRolls = normalizeRolls(rolls);

  if (!normalizedRolls.length) {
    errors.push("보유 필름 롤을 1개 이상 입력해주세요.");
  }

  normalizedRolls.forEach((roll, index) => {
    if (!roll.color) {
      errors.push(`${index + 1}번 롤의 컬러번호를 입력해주세요.`);
    }

    if (roll.lengthMm <= 0) {
      errors.push(`${index + 1}번 롤의 길이를 확인해주세요.`);
    }
  });

  const rollsByColor = new Map();

  normalizedRolls.forEach((roll) => {
    if (!rollsByColor.has(roll.color)) {
      rollsByColor.set(roll.color, []);
    }

    rollsByColor.get(roll.color).push(roll);
  });

  let actualPieceCount = 0;

  sections.forEach((section, sectionIndex) => {
    const location = txt(section.location);
    const part = txt(section.part);

    (section.colors || []).forEach((group) => {
      const color = colorKey(group.color);

      (group.sizes || []).forEach((size, sizeIndex) => {
        if (!validSize(size)) return;

        actualPieceCount += 1;

        const width = Math.round(toNum(size.width));
        const height = Math.round(toNum(size.height));
        const quantity = Math.floor(toNum(size.quantity) || 1);

        if (!location) {
          errors.push(
            `${sectionIndex + 1}번 항목의 시공 위치를 입력해주세요.`
          );
        }

        if (!part) {
          errors.push(
            `${location || `${sectionIndex + 1}번 위치`}의 시공 부위를 입력해주세요.`
          );
        }

        if (!color) {
          errors.push(
            `${location || "위치"} / ${part || "부위"}의 컬러를 선택해주세요.`
          );
          return;
        }

        if (width <= 0 || height <= 0) {
          errors.push(
            `${location} / ${part} / ${color}의 ${
              sizeIndex + 1
            }번 가로·세로를 확인해주세요.`
          );
          return;
        }

        if (quantity <= 0) {
          errors.push(
            `${location} / ${part} / ${color}의 ${
              sizeIndex + 1
            }번 수량을 확인해주세요.`
          );
        }

        const colorRolls = rollsByColor.get(color) || [];

        if (!colorRolls.length) {
          errors.push(
            `${location} / ${part}에서 사용하는 ${color} 롤이 없습니다.`
          );
          return;
        }

        const hasGrain = colorRolls.some((r) => r.grainDirection);

        const maxRollLength = Math.max(
          ...colorRolls.map((r) => r.lengthMm)
        );

        const orientations = orientationsForDimensions(
          width,
          height,
          !hasGrain
        );

        const canFit = orientations.some(
          (o) => o.height <= maxRollLength
        );

        if (!canFit) {
          errors.push(
            `${location} / ${part} / ${color} ${width}×${height}mm는 등록된 롤에 들어가지 않습니다.`
          );
        }
      });
    });
  });

  if (actualPieceCount === 0) {
    errors.push("재단 사이즈를 1개 이상 입력해주세요.");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function expandPieces(sections, grainMap) {
  const pieces = [];
  let sequence = 1;

  sections.forEach((section, sectionIndex) => {
    const location = txt(section.location);
    const part = txt(section.part);

    (section.colors || []).forEach((group, colorIndex) => {
      const color = colorKey(group.color);

      if (!color) return;

      const canRotate = !grainMap.get(color);

      (group.sizes || []).forEach((size, sizeIndex) => {
        if (!validSize(size)) return;

        const width = Math.round(toNum(size.width));
        const height = Math.round(toNum(size.height));

        if (width <= 0 || height <= 0) return;

        const quantity = Math.max(
          1,
          Math.floor(toNum(size.quantity) || 1)
        );

        for (let q = 0; q < quantity; q += 1) {
          pieces.push({
            id: `piece-${sequence++}`,
            sectionIndex,
            colorIndex,
            sizeIndex,
            quantityIndex: q + 1,
            location,
            part,
            color,
            originalWidth: width,
            originalHeight: height,
            width,
            height,
            area: width * height,
            canRotate,
            rotated: false,
          });
        }
      });
    });
  });

  return pieces;
}

function pieceOrientations(piece) {
  return orientationsForDimensions(
    piece.originalWidth,
    piece.originalHeight,
    piece.canRotate
  );
}

function isWideLongOrientation(orientation) {
  return (
    orientation.width > WIDE_THRESHOLD &&
    orientation.height >= LONG_THRESHOLD
  );
}

function isLongOrientation(orientation) {
  return orientation.height >= LONG_THRESHOLD;
}

function piecePriority(piece) {
  const options = pieceOrientations(piece);

  let wideLong = 0;
  let long = 0;
  let maxHeight = 0;
  let maxWidth = 0;

  options.forEach((orientation) => {
    if (isWideLongOrientation(orientation)) wideLong = 1;
    if (isLongOrientation(orientation)) long = 1;

    maxHeight = Math.max(maxHeight, orientation.height);
    maxWidth = Math.max(maxWidth, orientation.width);
  });

  return (
    wideLong * 1e12 +
    long * 1e10 +
    maxHeight * 1e6 +
    maxWidth * 1e3 +
    piece.area
  );
}

function intersects(a, b) {
  return !(
    b.x >= a.x + a.width ||
    b.x + b.width <= a.x ||
    b.y >= a.y + a.height ||
    b.y + b.height <= a.y
  );
}

function contains(outer, inner) {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

function splitFreeRect(freeRect, usedRect) {
  if (!intersects(freeRect, usedRect)) {
    return [freeRect];
  }

  const out = [];

  const freeRight =
    freeRect.x + freeRect.width;

  const freeBottom =
    freeRect.y + freeRect.height;

  const usedRight =
    usedRect.x + usedRect.width;

  const usedBottom =
    usedRect.y + usedRect.height;

  if (usedRect.y > freeRect.y) {
    out.push({
      x: freeRect.x,
      y: freeRect.y,
      width: freeRect.width,
      height: usedRect.y - freeRect.y,
    });
  }

  if (usedBottom < freeBottom) {
    out.push({
      x: freeRect.x,
      y: usedBottom,
      width: freeRect.width,
      height: freeBottom - usedBottom,
    });
  }

  if (usedRect.x > freeRect.x) {
    out.push({
      x: freeRect.x,
      y: freeRect.y,
      width: usedRect.x - freeRect.x,
      height: freeRect.height,
    });
  }

  if (usedRight < freeRight) {
    out.push({
      x: usedRight,
      y: freeRect.y,
      width: freeRight - usedRight,
      height: freeRect.height,
    });
  }

  return out.filter(
    (rect) =>
      rect.width > 0 &&
      rect.height > 0
  );
}

function pruneFreeRects(rects) {
  return rects.filter((rect, index) => {
    for (let i = 0; i < rects.length; i += 1) {
      if (
        i !== index &&
        contains(rects[i], rect)
      ) {
        return false;
      }
    }

    return true;
  });
}

function updateFreeRects(
  freeRects,
  placedRect
) {
  const next = [];

  freeRects.forEach((rect) => {
    next.push(
      ...splitFreeRect(
        rect,
        placedRect
      )
    );
  });

  return pruneFreeRects(next);
}

function createEmptyBatch(
  height,
  type = "batch"
) {
  return {
    height,
    type,

    placements: [],

    freeRects: [
      {
        x: 0,
        y: 0,
        width: FILM_WIDTH,
        height,
      },
    ],

    usedArea: 0,
    rowUsedWidth: 0,
  };
}

function placeOnBatch(
  batch,
  piece,
  placement
) {
  const placed = {
    ...piece,

    x: placement.x,
    y: placement.y,

    width: placement.width,
    height: placement.height,

    rotated: placement.rotated,
  };

  batch.placements.push(placed);

  batch.freeRects =
    updateFreeRects(
      batch.freeRects,
      placed
    );

  batch.usedArea +=
    placed.width *
    placed.height;

  return placed;
}

function sameLengthTolerance(height) {
  return Math.max(
    SAME_LENGTH_MIN_TOLERANCE,
    Math.round(
      height *
        SAME_LENGTH_RATIO
    )
  );
}

/*
  같은 길이 또는 비슷한 길이의 재단물끼리
  폭 1220mm를 최대한 채웁니다.

  예:
  600 + 600 = 1200
  480 + 400 + 340 = 1220
*/
function findBestRow(
  anchorPiece,
  anchorOrientation,
  remaining
) {
  const tolerance =
    sameLengthTolerance(
      anchorOrientation.height
    );

  const room =
    FILM_WIDTH -
    anchorOrientation.width;

  if (room <= 0) {
    return [
      {
        piece: anchorPiece,
        ...anchorOrientation,
        anchor: true,
      },
    ];
  }

  const candidates =
    remaining
      .filter(
        (piece) =>
          piece.id !==
          anchorPiece.id
      )
      .map((piece) => {
        const options =
          pieceOrientations(
            piece
          )
            .filter(
              (orientation) =>
                orientation.width <= room &&
                orientation.height <=
                  anchorOrientation.height &&
                anchorOrientation.height -
                  orientation.height <=
                  tolerance
            )
            .map(
              (
                orientation
              ) => {
                const gap =
                  anchorOrientation.height -
                  orientation.height;

                const exactHeightBonus =
                  gap === 0
                    ? 200000
                    : Math.max(
                        0,
                        100000 -
                          gap * 900
                      );

                return {
                  piece,
                  ...orientation,
                  gap,

                  score:
                    orientation.width *
                      10000 +
                    exactHeightBonus +
                    10000,
                };
              }
            );

        return {
          piece,
          options,
        };
      })
      .filter(
        (item) =>
          item.options.length
      );

  let dp =
    Array(
      room + 1
    ).fill(null);

  dp[0] = {
    score: 0,
    picks: [],
  };

  candidates.forEach(
    (candidate) => {
      const next =
        dp.map((state) =>
          state
            ? {
                score:
                  state.score,

                picks:
                  state.picks,
              }
            : null
        );

      for (
        let used = 0;
        used <= room;
        used += 1
      ) {
        const state =
          dp[used];

        if (!state) {
          continue;
        }

        candidate.options.forEach(
          (option) => {
            const newWidth =
              used +
              option.width;

            if (
              newWidth >
              room
            ) {
              return;
            }

            const newScore =
              state.score +
              option.score;

            if (
              !next[newWidth] ||
              newScore >
                next[newWidth]
                  .score
            ) {
              next[newWidth] = {
                score:
                  newScore,

                picks: [
                  ...state.picks,
                  option,
                ],
              };
            }
          }
        );
      }

      dp = next;
    }
  );

  let best = {
    score: -Infinity,
    picks: [],
    usedWidth: 0,
  };

  dp.forEach(
    (
      state,
      usedWidth
    ) => {
      if (!state) return;

      const totalWidth =
        anchorOrientation.width +
        usedWidth;

      const leftover =
        FILM_WIDTH -
        totalWidth;

      let score =
        state.score +
        totalWidth *
          25000 +
        state.picks.length *
          25000;

      if (
        leftover === 0
      ) {
        score +=
          30000000;
      } else if (
        leftover <= 20
      ) {
        score +=
          22000000;
      } else if (
        leftover <= 40
      ) {
        score +=
          15000000;
      } else if (
        leftover <= 80
      ) {
        score +=
          7000000;
      }

      if (
        score >
        best.score
      ) {
        best = {
          score,
          picks:
            state.picks,
          usedWidth,
        };
      }
    }
  );

  return [
    {
      piece:
        anchorPiece,

      ...anchorOrientation,

      anchor: true,
    },

    ...best.picks.map(
      (pick) => ({
        ...pick,
        anchor: false,
      })
    ),
  ];
}

function placeRow(
  batch,
  row
) {
  let x = 0;

  row.forEach(
    (item) => {
      placeOnBatch(
        batch,
        item.piece,
        {
          x,
          y: 0,

          width:
            item.width,

          height:
            item.height,

          rotated:
            item.rotated,
        }
      );

      x +=
        item.width;
    }
  );

  batch.rowUsedWidth =
    x;
}

function placementScore(
  freeRect,
  orientation,
  piece
) {
  const gapW =
    freeRect.width -
    orientation.width;

  const gapH =
    freeRect.height -
    orientation.height;

  const areaWaste =
    freeRect.width *
      freeRect.height -
    orientation.width *
      orientation.height;

  let score =
    areaWaste *
      1.2 +
    Math.min(
      gapW,
      gapH
    ) *
      400 +
    Math.max(
      gapW,
      gapH
    ) *
      20;

  if (
    gapW === 0 &&
    gapH === 0
  ) {
    score -=
      5000000;
  } else if (
    gapW === 0 ||
    gapH === 0
  ) {
    score -=
      900000;
  }

  score -=
    piece.area *
      0.04;

  score +=
    freeRect.y *
      15 +
    freeRect.x;

  return score;
}

function findPlacementInBatch(
  batch,
  piece
) {
  let best = null;

  pieceOrientations(
    piece
  ).forEach(
    (
      orientation
    ) => {
      if (
        orientation.height >
        batch.height
      ) {
        return;
      }

      batch.freeRects.forEach(
        (freeRect) => {
          if (
            orientation.width >
              freeRect.width ||
            orientation.height >
              freeRect.height
          ) {
            return;
          }

          const score =
            placementScore(
              freeRect,
              orientation,
              piece
            );

          if (
            !best ||
            score <
              best.score
          ) {
            best = {
              x:
                freeRect.x,

              y:
                freeRect.y,

              width:
                orientation.width,

              height:
                orientation.height,

              rotated:
                orientation.rotated,

              score,
            };
          }
        }
      );
    }
  );

  return best;
}

function difficultySort(
  a,
  b
) {
  if (
    b.area !==
    a.area
  ) {
    return (
      b.area -
      a.area
    );
  }

  const aMax =
    Math.max(
      a.originalWidth,
      a.originalHeight
    );

  const bMax =
    Math.max(
      b.originalWidth,
      b.originalHeight
    );

  if (
    bMax !==
    aMax
  ) {
    return (
      bMax -
      aMax
    );
  }

  return (
    b.originalHeight -
    a.originalHeight
  );
}

/*
  같은 Batch의 남는 2D 공간을
  작은 재단물로 계속 채웁니다.
*/
function fillBatch2D(
  batch,
  remaining,
  excludedIds =
    new Set()
) {
  const candidates =
    remaining
      .filter(
        (piece) =>
          !excludedIds.has(
            piece.id
          )
      )
      .sort(
        difficultySort
      );

  const placedIds =
    new Set();

  let changed = true;

  while (changed) {
    changed = false;

    for (
      const piece of
      candidates
    ) {
      if (
        placedIds.has(
          piece.id
        )
      ) {
        continue;
      }

      const placement =
        findPlacementInBatch(
          batch,
          piece
        );

      if (!placement) {
        continue;
      }

      placeOnBatch(
        batch,
        piece,
        placement
      );

      placedIds.add(
        piece.id
      );

      changed = true;
    }
  }

  return placedIds;
}

function finalizeBatch(
  batch
) {
  const totalArea =
    FILM_WIDTH *
    batch.height;

  const usedWidth =
    batch.placements.reduce(
      (
        max,
        piece
      ) =>
        Math.max(
          max,
          piece.x +
            piece.width
        ),
      0
    );

  return {
    ...batch,

    usedWidth,

    wasteWidth:
      Math.max(
        0,
        FILM_WIDTH -
          usedWidth
      ),

    wasteArea:
      Math.max(
        0,
        totalArea -
          batch.usedArea
      ),

    efficiency:
      totalArea > 0
        ? round1(
            (
              batch.usedArea /
              totalArea
            ) *
              100
          )
        : 0,

    pieceIds:
      new Set(
        batch.placements.map(
          (piece) =>
            piece.id
        )
      ),
  };
}

function buildBatchCandidate(
  anchorPiece,
  anchorOrientation,
  remaining
) {
  const batch =
    createEmptyBatch(
      anchorOrientation.height,

      isWideLongOrientation(
        anchorOrientation
      )
        ? "wide-long"
        : isLongOrientation(
            anchorOrientation
          )
        ? "long"
        : "row"
    );

  const row =
    findBestRow(
      anchorPiece,
      anchorOrientation,
      remaining
    );

  placeRow(
    batch,
    row
  );

  const excluded =
    new Set(
      row.map(
        (item) =>
          item.piece.id
      )
    );

  fillBatch2D(
    batch,
    remaining,
    excluded
  );

  return finalizeBatch(
    batch
  );
}

function candidateScore(
  batch
) {
  const avgUsedWidth =
    batch.height > 0
      ? batch.usedArea /
        batch.height
      : 0;

  const rowWaste =
    Math.max(
      0,
      FILM_WIDTH -
        batch.rowUsedWidth
    );

  const pieceCount =
    batch.placements.length;

  let score =
    avgUsedWidth *
      100000 +
    pieceCount *
      350000 -
    batch.wasteArea *
      0.5;

  if (
    batch.type ===
    "wide-long"
  ) {
    score +=
      30000000;
  } else if (
    batch.type ===
    "long"
  ) {
    score +=
      12000000;
  }

  if (
    rowWaste === 0
  ) {
    score +=
      25000000;
  } else if (
    rowWaste <= 20
  ) {
    score +=
      18000000;
  } else if (
    rowWaste <= 40
  ) {
    score +=
      12000000;
  } else if (
    rowWaste <= 80
  ) {
    score +=
      5000000;
  }

  if (
    pieceCount === 1 &&
    batch.height <= 300
  ) {
    score -=
      35000000;
  } else if (
    pieceCount === 1 &&
    batch.height <= 700
  ) {
    score -=
      12000000;
  }

  return score;
}

function selectAnchorPieces(
  remaining
) {
  const priority =
    [...remaining].sort(
      (a, b) =>
        piecePriority(b) -
        piecePriority(a)
    );

  const area =
    [...remaining].sort(
      difficultySort
    );

  const selected = [];
  const seen =
    new Set();

  [
    ...priority.slice(
      0,
      16
    ),

    ...area.slice(
      0,
      16
    ),
  ].forEach(
    (piece) => {
      if (
        !seen.has(
          piece.id
        )
      ) {
        seen.add(
          piece.id
        );

        selected.push(
          piece
        );
      }
    }
  );

  return selected.slice(
    0,
    MAX_ANCHOR_CANDIDATES
  );
}

/*
  현재 롤의 남은 길이에 들어갈 수 있는
  Batch만 생성합니다.
*/
function buildBestBatch(
  remaining,
  maxHeight =
    Infinity
) {
  const anchors =
    selectAnchorPieces(
      remaining
    );

  let best = null;

  anchors.forEach(
    (piece) => {
      pieceOrientations(
        piece
      ).forEach(
        (
          orientation
        ) => {
          if (
            orientation.height >
            maxHeight
          ) {
            return;
          }

          const batch =
            buildBatchCandidate(
              piece,
              orientation,
              remaining
            );

          if (
            batch.height >
            maxHeight
          ) {
            return;
          }

          const score =
            candidateScore(
              batch
            );

          if (
            !best ||
            score >
              best.score
          ) {
            best = {
              batch,
              score,
            };
          }
        }
      );
    }
  );

  return best;
}

function createRollState(
  roll
) {
  return {
    ...roll,

    placements: [],

    batches: [],

    usedLength: 0,

    remainingLength:
      roll.lengthMm,

    usedArea: 0,

    efficiency: 0,
  };
}

function placeBatchOnRoll(
  roll,
  batch
) {
  const start =
    roll.usedLength;

  const end =
    start +
    batch.height;

  const placements =
    batch.placements.map(
      (piece) => ({
        ...piece,

        y:
          start +
          piece.y,
      })
    );

  roll.placements.push(
    ...placements
  );

  roll.batches.push({
    index:
      roll.batches.length,

    start,
    end,

    height:
      batch.height,

    type:
      batch.type,

    usedWidth:
      batch.usedWidth,

    wasteWidth:
      batch.wasteWidth,

    usedArea:
      batch.usedArea,

    wasteArea:
      batch.wasteArea,

    efficiency:
      batch.efficiency,

    pieceIds:
      placements.map(
        (piece) =>
          piece.id
      ),
  });

  roll.usedLength =
    end;

  roll.remainingLength =
    Math.max(
      0,
      roll.lengthMm -
        roll.usedLength
    );

  roll.usedArea +=
    batch.usedArea;

  const consumedArea =
    FILM_WIDTH *
    Math.max(
      1,
      roll.usedLength
    );

  roll.efficiency =
    round1(
      (
        roll.usedArea /
        consumedArea
      ) *
        100
    );
}

function removeBatchPieces(
  remaining,
  batch
) {
  return remaining.filter(
    (piece) =>
      !batch.pieceIds.has(
        piece.id
      )
  );
}

function cloneColorRolls(
  colorRolls
) {
  return colorRolls.map(
    (roll) =>
      createRollState(
        roll
      )
  );
}

/*
  현재 가진 롤에 다 넣고도 남은 재단물을
  새 필름에서 최적으로 자른다고 가정하여
  추가로 필요한 길이를 계산합니다.
*/
function estimateAdditionalLength(
  pieces
) {
  let remaining =
    [...pieces];

  let total = 0;
  let guard = 0;

  while (
    remaining.length &&
    guard < 10000
  ) {
    guard += 1;

    const best =
      buildBestBatch(
        remaining,
        EXTRA_ROLL_LIMIT_MM
      );

    if (
      !best?.batch ||
      !best.batch
        .placements.length
    ) {
      const fallback =
        remaining.reduce(
          (
            sum,
            piece
          ) => {
            const options =
              pieceOrientations(
                piece
              );

            const minHeight =
              options.length
                ? Math.min(
                    ...options.map(
                      (o) =>
                        o.height
                    )
                  )
                : 0;

            return (
              sum +
              minHeight
            );
          },
          0
        );

      total +=
        fallback;

      break;
    }

    total +=
      best.batch.height;

    remaining =
      removeBatchPieces(
        remaining,
        best.batch
      );
  }

  return total;
}

function colorPlanMetrics(
  rolls,
  remaining
) {
  const totalUsedLength =
    rolls.reduce(
      (sum, roll) =>
        sum +
        roll.usedLength,
      0
    );

  const totalUsedArea =
    rolls.reduce(
      (sum, roll) =>
        sum +
        roll.usedArea,
      0
    );

  const totalConsumedArea =
    rolls.reduce(
      (sum, roll) =>
        sum +
        FILM_WIDTH *
          roll.usedLength,
      0
    );

  const wasteArea =
    Math.max(
      0,
      totalConsumedArea -
        totalUsedArea
    );

  const usedRollCount =
    rolls.filter(
      (roll) =>
        roll.usedLength >
        0
    ).length;

  const shortageMm =
    estimateAdditionalLength(
      remaining
    );

  return {
    shortageMm,
    totalUsedLength,
    wasteArea,
    usedRollCount,
  };
}

/*
  여러 계산 결과 비교 순서

  1. 부족 길이가 적은 것
  2. 실제 사용 길이가 적은 것
  3. 난단 면적이 적은 것
  4. 사용 롤 수가 적은 것
*/
function isBetterPlan(
  next,
  current
) {
  if (!current) {
    return true;
  }

  const a =
    next.metrics;

  const b =
    current.metrics;

  if (
    a.shortageMm !==
    b.shortageMm
  ) {
    return (
      a.shortageMm <
      b.shortageMm
    );
  }

  if (
    a.totalUsedLength !==
    b.totalUsedLength
  ) {
    return (
      a.totalUsedLength <
      b.totalUsedLength
    );
  }

  if (
    a.wasteArea !==
    b.wasteArea
  ) {
    return (
      a.wasteArea <
      b.wasteArea
    );
  }

  return (
    a.usedRollCount <
    b.usedRollCount
  );
}

/*
  지정한 롤 순서대로 계산

  각 롤의 실제 남은 길이를 보면서
  그 롤에 맞는 Batch를 새로 생성합니다.
*/
function packColorByOrder(
  pieces,
  colorRolls,
  orderIndexes
) {
  const states =
    cloneColorRolls(
      colorRolls
    );

  let remaining =
    [...pieces];

  for (
    const rollIndex of
    orderIndexes
  ) {
    const roll =
      states[
        rollIndex
      ];

    if (!roll) {
      continue;
    }

    let guard = 0;

    while (
      remaining.length &&
      roll.remainingLength >
        0 &&
      guard < 10000
    ) {
      guard += 1;

      const best =
        buildBestBatch(
          remaining,
          roll.remainingLength
        );

      if (
        !best?.batch ||
        !best.batch
          .placements.length
      ) {
        break;
      }

      placeBatchOnRoll(
        roll,
        best.batch
      );

      remaining =
        removeBatchPieces(
          remaining,
          best.batch
        );
    }
  }

  return {
    rolls:
      states,

    remaining,

    metrics:
      colorPlanMetrics(
        states,
        remaining
      ),
  };
}

/*
  모든 보유 롤을 동시에 확인해서

  현재 남은 재단물에 가장 잘 맞는
  "롤 + 재단 Batch"를 매번 선택합니다.
*/
function packColorAdaptive(
  pieces,
  colorRolls
) {
  const states =
    cloneColorRolls(
      colorRolls
    );

  let remaining =
    [...pieces];

  let guard = 0;

  while (
    remaining.length &&
    guard < 20000
  ) {
    guard += 1;

    let bestChoice =
      null;

    states.forEach(
      (
        roll,
        rollIndex
      ) => {
        if (
          roll.remainingLength <=
          0
        ) {
          return;
        }

        const candidate =
          buildBestBatch(
            remaining,
            roll.remainingLength
          );

        if (
          !candidate?.batch
        ) {
          return;
        }

        const after =
          roll.remainingLength -
          candidate.batch.height;

        let pairScore =
          candidate.score;

        /*
          롤 끝에 애매한 짧은 잔량이
          남지 않는 배치를 약간 우선
        */
        if (
          after === 0
        ) {
          pairScore +=
            4000000;
        } else if (
          after <= 300
        ) {
          pairScore +=
            2500000;
        } else if (
          after <= 700
        ) {
          pairScore +=
            1000000;
        }

        /*
          이미 사용 중인 롤은
          이어서 쓰는 것을 약간 우선
        */
        if (
          roll.usedLength > 0
        ) {
          pairScore +=
            500000;
        }

        if (
          !bestChoice ||
          pairScore >
            bestChoice.score
        ) {
          bestChoice = {
            rollIndex,

            batch:
              candidate.batch,

            score:
              pairScore,
          };
        }
      }
    );

    if (
      !bestChoice
    ) {
      break;
    }

    const roll =
      states[
        bestChoice.rollIndex
      ];

    placeBatchOnRoll(
      roll,
      bestChoice.batch
    );

    remaining =
      removeBatchPieces(
        remaining,
        bestChoice.batch
      );
  }

  return {
    rolls:
      states,

    remaining,

    metrics:
      colorPlanMetrics(
        states,
        remaining
      ),
  };
}

function makeIndexOrder(
  length
) {
  return Array.from(
    {
      length,
    },
    (
      _,
      index
    ) => index
  );
}

/*
  컬러 하나에 대해

  1. 입력된 롤 순서
  2. 짧은 롤 우선
  3. 긴 롤 우선
  4. 모든 롤 동시 비교

  네 가지를 실제 계산한 후
  가장 좋은 결과를 사용합니다.
*/
function optimizeColorAgainstRolls(
  pieces,
  colorRolls,
  rollMode
) {
  if (
    !colorRolls.length
  ) {
    return {
      rolls: [],

      remaining:
        [...pieces],

      metrics: {
        shortageMm:
          estimateAdditionalLength(
            pieces
          ),

        totalUsedLength: 0,

        wasteArea: 0,

        usedRollCount: 0,
      },
    };
  }

  const baseOrder =
    makeIndexOrder(
      colorRolls.length
    );

  const shortFirst =
    [...baseOrder].sort(
      (a, b) =>
        colorRolls[a]
          .lengthMm -
          colorRolls[b]
            .lengthMm ||
        colorRolls[a].index -
          colorRolls[b]
            .index
    );

  const longFirst =
    [...baseOrder].sort(
      (a, b) =>
        colorRolls[b]
          .lengthMm -
          colorRolls[a]
            .lengthMm ||
        colorRolls[a].index -
          colorRolls[b]
            .index
    );

  const plans = [];

  plans.push(
    packColorByOrder(
      pieces,
      colorRolls,
      baseOrder
    )
  );

  plans.push(
    packColorByOrder(
      pieces,
      colorRolls,
      shortFirst
    )
  );

  plans.push(
    packColorByOrder(
      pieces,
      colorRolls,
      longFirst
    )
  );

  plans.push(
    packColorAdaptive(
      pieces,
      colorRolls
    )
  );

  let best = null;

  plans.forEach(
    (plan) => {
      if (
        isBetterPlan(
          plan,
          best
        )
      ) {
        best = plan;
      }
    }
  );

  /*
    짧은 롤 우선 모드라도
    부족량이나 총사용량이 더 나빠지는
    결과를 억지로 선택하지 않습니다.

    품질이 같을 때 짧은 롤 결과를 우선.
  */
  if (
    rollMode ===
      "short-first" &&
    plans[1] &&
    best &&
    plans[1].metrics
      .shortageMm ===
      best.metrics
        .shortageMm &&
    plans[1].metrics
      .totalUsedLength ===
      best.metrics
        .totalUsedLength &&
    plans[1].metrics
      .wasteArea <=
      best.metrics
        .wasteArea
  ) {
    best =
      plans[1];
  }

  return best;
}

function finalizeResult(
  rollStates,
  unplaced
) {
  const usedRolls =
    rollStates.filter(
      (roll) =>
        roll.placements
          .length > 0
    );

  const unusedRolls =
    rollStates.filter(
      (roll) =>
        roll.placements
          .length === 0
    );

  usedRolls.forEach(
    (roll) => {
      roll.placements.sort(
        (a, b) =>
          a.y !== b.y
            ? a.y - b.y
            : a.x - b.x
      );

      roll.batches.sort(
        (a, b) =>
          a.start -
          b.start
      );
    }
  );

  const totalUsedLength =
    usedRolls.reduce(
      (sum, roll) =>
        sum +
        roll.usedLength,
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

  const efficiency =
    totalConsumedArea > 0
      ? round1(
          (
            totalPieceArea /
            totalConsumedArea
          ) *
            100
        )
      : 0;

  const totalBatchCount =
    usedRolls.reduce(
      (sum, roll) =>
        sum +
        roll.batches
          .length,
      0
    );

  return {
    success:
      unplaced.length ===
      0,

    rolls:
      rollStates,

    usedRolls,

    unusedRolls,

    unplaced,

    summary: {
      usedRollCount:
        usedRolls.length,

      unusedRollCount:
        unusedRolls.length,

      totalBatchCount,

      totalUsedLength,

      totalRemainingLength,

      totalPieceArea,

      totalConsumedArea,

      efficiency,
    },
  };
}

/*
  최종 계산

  1. 컬러별 재단물 분리
  2. 해당 컬러의 실제 보유 롤 길이 확인
  3. 각 롤에 들어갈 수 있는 재단 Batch를 그때그때 생성
  4. 여러 롤 배치 전략 비교
  5. 그래도 남는 재단물만 추가 필요 길이 계산
*/
export function optimizeCutting({
  rolls = [],
  sections = [],
  rollMode = "waste",
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
      success: false,

      errors:
        validation.errors,

      result: null,
    };
  }

  const normalizedRolls =
    normalizeRolls(
      rolls
    );

  const grainMap =
    getColorGrainMap(
      normalizedRolls
    );

  const pieces =
    expandPieces(
      sections,
      grainMap
    );

  const piecesByColor =
    new Map();

  pieces.forEach(
    (piece) => {
      if (
        !piecesByColor.has(
          piece.color
        )
      ) {
        piecesByColor.set(
          piece.color,
          []
        );
      }

      piecesByColor
        .get(piece.color)
        .push(piece);
    }
  );

  const finalRollStates =
    normalizedRolls.map(
      createRollState
    );

  const stateIndexById =
    new Map(
      finalRollStates.map(
        (
          roll,
          index
        ) => [
          roll.id,
          index,
        ]
      )
    );

  const unplaced = [];

  const shortageMessages =
    [];

  for (
    const [
      color,
      colorPieces,
    ] of
    piecesByColor.entries()
  ) {
    const colorRolls =
      normalizedRolls.filter(
        (roll) =>
          roll.color ===
          color
      );

    const plan =
      optimizeColorAgainstRolls(
        colorPieces,
        colorRolls,
        rollMode
      );

    /*
      선택된 컬러 최적 결과를
      전체 롤 상태에 반영
    */
    plan.rolls.forEach(
      (
        plannedRoll
      ) => {
        const index =
          stateIndexById.get(
            plannedRoll.id
          );

        if (
          index !== undefined
        ) {
          finalRollStates[
            index
          ] =
            plannedRoll;
        }
      }
    );

    /*
      현재 가진 롤에 다 안 들어간 경우
    */
    if (
      plan.remaining.length
    ) {
      unplaced.push(
        ...plan.remaining
      );

      const shortageMm =
        plan.metrics
          .shortageMm;

      if (
        shortageMm > 0
      ) {
        const shortageMeter =
          Math.ceil(
            shortageMm / 10
          ) / 100;

        shortageMessages.push(
          `${color} 필름이 ${shortageMeter.toFixed(
            2
          )}m 모자랍니다.`
        );
      } else {
        shortageMessages.push(
          `${color} 필름의 보유 롤 길이 조합으로 남은 재단물을 배치할 수 없습니다.`
        );
      }
    }
  }

  const result =
    finalizeResult(
      finalRollStates,
      unplaced
    );

  if (
    unplaced.length
  ) {
    return {
      success: false,

      errors:
        shortageMessages.length
          ? shortageMessages
          : [
              "현재 등록된 롤로 모든 재단물을 배치할 수 없습니다.",
            ],

      result: null,
    };
  }

  return {
    success: true,

    errors: [],

    result,
  };
}
