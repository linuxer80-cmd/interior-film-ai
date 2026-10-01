export const FILM_WIDTH = 1220;

const LONG_THRESHOLD = 1500;
const WIDE_THRESHOLD = 600;

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
  return [
    ...new Set(
      rolls
        .map((r) => colorKey(r.color))
        .filter(Boolean)
    ),
  ];
}

function normalizeRolls(rolls = []) {
  return rolls
    .map((roll, index) => ({
      id: roll.id || `roll-${index + 1}`,
      index,
      color: colorKey(roll.color),
      lengthM: toNum(roll.lengthM),
      lengthMm: Math.round(
        toNum(roll.lengthM) * 1000
      ),
      grainDirection:
        roll.grainDirection === true,
    }))
    .filter(
      (roll) =>
        roll.color ||
        roll.lengthMm > 0
    );
}

function validSize(size) {
  return (
    toNum(size?.width) > 0 ||
    toNum(size?.height) > 0
  );
}

function getColorGrainMap(rolls) {
  const map = new Map();

  rolls.forEach((roll) => {
    if (!map.has(roll.color)) {
      map.set(
        roll.color,
        roll.grainDirection
      );
    } else if (
      roll.grainDirection
    ) {
      map.set(
        roll.color,
        true
      );
    }
  });

  return map;
}

function orientationsForDimensions(
  width,
  height,
  canRotate
) {
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

  const normalizedRolls =
    normalizeRolls(rolls);

  if (!normalizedRolls.length) {
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

      if (
        roll.lengthMm <= 0
      ) {
        errors.push(
          `${index + 1}번 롤의 길이를 확인해주세요.`
        );
      }
    }
  );

  const rollsByColor =
    new Map();

  normalizedRolls.forEach(
    (roll) => {
      if (
        !rollsByColor.has(
          roll.color
        )
      ) {
        rollsByColor.set(
          roll.color,
          []
        );
      }

      rollsByColor
        .get(roll.color)
        .push(roll);
    }
  );

  let actualPieceCount = 0;

  sections.forEach(
    (
      section,
      sectionIndex
    ) => {
      const location =
        txt(section.location);

      const part =
        txt(section.part);

      (
        section.colors || []
      ).forEach((group) => {
        const color =
          colorKey(
            group.color
          );

        (
          group.sizes || []
        ).forEach(
          (
            size,
            sizeIndex
          ) => {
            if (
              !validSize(size)
            ) {
              return;
            }

            actualPieceCount += 1;

            const width =
              Math.round(
                toNum(
                  size.width
                )
              );

            const height =
              Math.round(
                toNum(
                  size.height
                )
              );

            const quantity =
              Math.floor(
                toNum(
                  size.quantity
                )
              );

            if (!location) {
              errors.push(
                `${sectionIndex + 1}번 항목의 시공 위치를 입력해주세요.`
              );
            }

            if (!part) {
              errors.push(
                `${
                  location ||
                  `${sectionIndex + 1}번 위치`
                }의 시공 부위를 입력해주세요.`
              );
            }

            if (!color) {
              errors.push(
                `${
                  location ||
                  "위치"
                } / ${
                  part ||
                  "부위"
                }의 컬러를 선택해주세요.`
              );

              return;
            }

            if (
              width <= 0 ||
              height <= 0
            ) {
              errors.push(
                `${location} / ${part} / ${color}의 ${
                  sizeIndex +
                  1
                }번 가로·세로를 확인해주세요.`
              );

              return;
            }

            if (
              quantity <= 0
            ) {
              errors.push(
                `${location} / ${part} / ${color}의 ${
                  sizeIndex +
                  1
                }번 수량을 확인해주세요.`
              );
            }

            const colorRolls =
              rollsByColor.get(
                color
              ) || [];

            if (
              !colorRolls.length
            ) {
              errors.push(
                `${location} / ${part}에서 사용하는 ${color} 롤이 없습니다.`
              );

              return;
            }

            const hasGrain =
              colorRolls.some(
                (r) =>
                  r.grainDirection
              );

            const maxRollLength =
              Math.max(
                ...colorRolls.map(
                  (r) =>
                    r.lengthMm
                )
              );

            const orientations =
              orientationsForDimensions(
                width,
                height,
                !hasGrain
              );

            const canFit =
              orientations.some(
                (o) =>
                  o.height <=
                  maxRollLength
              );

            if (!canFit) {
              errors.push(
                `${location} / ${part} / ${color} ${width}×${height}mm는 등록된 롤에 들어가지 않습니다.`
              );
            }
          }
        );
      });
    }
  );

  if (
    actualPieceCount === 0
  ) {
    errors.push(
      "재단 사이즈를 1개 이상 입력해주세요."
    );
  }

  return {
    valid:
      errors.length === 0,
    errors,
  };
}

function expandPieces(
  sections,
  grainMap
) {
  const pieces = [];
  let sequence = 1;

  sections.forEach(
    (
      section,
      sectionIndex
    ) => {
      const location =
        txt(
          section.location
        );

      const part =
        txt(
          section.part
        );

      (
        section.colors || []
      ).forEach(
        (
          group,
          colorIndex
        ) => {
          const color =
            colorKey(
              group.color
            );

          if (!color) {
            return;
          }

          const canRotate =
            !grainMap.get(
              color
            );

          (
            group.sizes || []
          ).forEach(
            (
              size,
              sizeIndex
            ) => {
              if (
                !validSize(
                  size
                )
              ) {
                return;
              }

              const width =
                Math.round(
                  toNum(
                    size.width
                  )
                );

              const height =
                Math.round(
                  toNum(
                    size.height
                  )
                );

              if (
                width <= 0 ||
                height <= 0
              ) {
                return;
              }

              const quantity =
                Math.max(
                  1,
                  Math.floor(
                    toNum(
                      size.quantity
                    ) || 1
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

                  quantityIndex:
                    q + 1,

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

                  canRotate,

                  rotated:
                    false,
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

function pieceOrientations(
  piece
) {
  return orientationsForDimensions(
    piece.originalWidth,
    piece.originalHeight,
    piece.canRotate
  );
}

function isPriorityPiece(
  piece
) {
  return (
    piece.originalWidth >
      WIDE_THRESHOLD ||
    piece.originalHeight >=
      LONG_THRESHOLD
  );
}
function priorityRank(piece) {
  const wide =
    piece.originalWidth >
    WIDE_THRESHOLD
      ? 1
      : 0;

  const long =
    piece.originalHeight >=
    LONG_THRESHOLD
      ? 1
      : 0;

  return (
    wide *
      1_000_000_000 +
    long *
      100_000_000 +
    piece.originalHeight *
      10_000 +
    piece.originalWidth *
      10 +
    piece.area /
      1000
  );
}

/*
  우선 재단물은 사용자가 입력한
  가로/세로 방향을 우선 유지합니다.

  작은 재단물은 결 없음일 경우
  짧은 롤 길이를 쓰는 방향도 허용합니다.
*/
function chooseAnchorOrientation(
  piece,
  priority = true
) {
  const options =
    pieceOrientations(
      piece
    );

  if (!options.length) {
    return null;
  }

  const original =
    options.find(
      (o) =>
        !o.rotated
    );

  if (
    priority &&
    original
  ) {
    return original;
  }

  return [...options].sort(
    (a, b) => {
      if (
        a.height !==
        b.height
      ) {
        return (
          a.height -
          b.height
        );
      }

      return (
        b.width -
        a.width
      );
    }
  )[0];
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

/*
  배치 후 생긴 빈 공간을
  다시 여러 개의 사각형으로 분리합니다.

  이 방식 때문에
  600×1000 두 장처럼
  같은 난단 공간에 위/아래로
  계속 끼워 넣을 수 있습니다.
*/
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
    (r) =>
      r.width > 0 &&
      r.height > 0
  );
}

function pruneFreeRects(
  rects
) {
  return rects.filter(
    (rect, index) => {
      for (
        let i = 0;
        i <
        rects.length;
        i += 1
      ) {
        if (
          i === index
        ) {
          continue;
        }

        if (
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
  placedRect
) {
  let next = [];

  freeRects.forEach(
    (rect) => {
      next.push(
        ...splitFreeRect(
          rect,
          placedRect
        )
      );
    }
  );

  return pruneFreeRects(
    next
  );
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
        width:
          FILM_WIDTH,
        height,
      },
    ],

    usedArea: 0,
  };
}

function placeOnBatch(
  batch,
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

  batch.placements.push(
    placed
  );

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

function placeAnchor(
  batch,
  piece,
  orientation
) {
  return placeOnBatch(
    batch,
    piece,
    {
      x: 0,
      y: 0,

      width:
        orientation.width,

      height:
        orientation.height,

      rotated:
        orientation.rotated,
    }
  );
}

/*
  빈 공간에 어떤 조각을 넣을지 평가.

  - 공간에 딱 맞으면 강한 우선
  - 긴 재단 우선 단계에서는 높이가 비슷한 것 우선
  - 일반 난단 채우기에서는 큰 면적 조각을 우선
*/
function placementScore(
  freeRect,
  orientation,
  piece,
  mode = "fill"
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

  const exactW =
    gapW === 0
      ? 1
      : 0;

  const exactH =
    gapH === 0
      ? 1
      : 0;

  const exactBoth =
    exactW &&
    exactH
      ? 1
      : 0;

  let score =
    areaWaste * 2 +
    Math.min(
      gapW,
      gapH
    ) *
      800 +
    Math.max(
      gapW,
      gapH
    ) *
      25 +
    freeRect.y *
      12 +
    freeRect.x;

  if (exactBoth) {
    score -=
      20_000_000;
  } else if (
    exactW ||
    exactH
  ) {
    score -=
      2_000_000;
  }

  if (
    mode ===
    "priority"
  ) {
    const lengthGap =
      Math.max(
        0,
        freeRect.height -
          orientation.height
      );

    score +=
      lengthGap *
      1500;

    if (
      freeRect.y > 0
    ) {
      score +=
        300_000;
    }
  } else {
    score -=
      piece.area *
      0.02;
  }

  return score;
}

function findPlacementInBatch(
  batch,
  piece,
  mode = "fill"
) {
  let best = null;

  pieceOrientations(
    piece
  ).forEach(
    (orientation) => {
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
              piece,
              mode
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
            ) * 100
          )
        : 0,
  };
}

/*
  1단계

  먼저:
  - 가로 600 초과
  - 세로 1500 이상

  재단물을 기준으로
  큰 재단 차수를 먼저 만듭니다.

  이때 다른 긴 재단물도
  같은 차수 공간 안에 들어가면
  먼저 같이 넣습니다.
*/
function createPriorityBatches(
  pieces
) {
  let remainingPriority =
    pieces
      .filter(
        isPriorityPiece
      )
      .sort(
        (a, b) =>
          priorityRank(b) -
          priorityRank(a)
      );

  const batches = [];

  const placedIds =
    new Set();

  while (
    remainingPriority.length
  ) {
    const anchor =
      remainingPriority[0];

    const orientation =
      chooseAnchorOrientation(
        anchor,
        true
      );

    if (!orientation) {
      remainingPriority =
        remainingPriority.slice(
          1
        );

      continue;
    }

    const type =
      anchor.originalWidth >
      WIDE_THRESHOLD
        ? "wide"
        : "long";

    const batch =
      createEmptyBatch(
        orientation.height,
        type
      );

    placeAnchor(
      batch,
      anchor,
      orientation
    );

    placedIds.add(
      anchor.id
    );

    const others =
      remainingPriority
        .slice(1)
        .sort(
          (a, b) =>
            priorityRank(b) -
            priorityRank(a)
        );

    others.forEach(
      (piece) => {
        const placement =
          findPlacementInBatch(
            batch,
            piece,
            "priority"
          );

        if (
          !placement
        ) {
          return;
        }

        placeOnBatch(
          batch,
          piece,
          placement
        );

        placedIds.add(
          piece.id
        );
      }
    );

    batches.push(
      finalizeBatch(
        batch
      )
    );

    remainingPriority =
      remainingPriority.filter(
        (piece) =>
          !placedIds.has(
            piece.id
          )
      );
  }

  return {
    batches,
    placedIds,
  };
}

/*
  난단에 넣을 순서.

  가장 중요한 변화:
  작은 재단 중에서도
  면적이 큰 것을 먼저 넣습니다.

  예:
  600×1000은
  100×1200보다 먼저
  큰 난단 공간에 들어갑니다.
*/
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
    bMax !== aMax
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
  2단계

  큰/긴 재단 차수를 모두 만든 뒤
  아직 남아있는 작은 조각들을
  새 페이지로 보내기 전에

  기존 차수들의 모든 2D 난단 공간을
  다시 검사해서 끼워 넣습니다.
*/
function fillExistingBatches(
  batches,
  pieces
) {
  const remaining = [];

  const ordered =
    [...pieces].sort(
      difficultySort
    );

  ordered.forEach(
    (piece) => {
      let best = null;

      batches.forEach(
        (
          batch,
          batchIndex
        ) => {
          const placement =
            findPlacementInBatch(
              batch,
              piece,
              "fill"
            );

          if (
            !placement
          ) {
            return;
          }

          const score =
            placement.score -
            batch.efficiency *
              1000;

          if (
            !best ||
            score <
              best.score
          ) {
            best = {
              batchIndex,
              placement,
              score,
            };
          }
        }
      );

      if (!best) {
        remaining.push(
          piece
        );

        return;
      }

      const batch =
        batches[
          best.batchIndex
        ];

      placeOnBatch(
        batch,
        piece,
        best.placement
      );

      batches[
        best.batchIndex
      ] =
        finalizeBatch(
          batch
        );
    }
  );

  return remaining;
}

function chooseSmallAnchor(
  remaining
) {
  const piece =
    [...remaining].sort(
      difficultySort
    )[0];

  if (!piece) {
    return null;
  }

  const orientation =
    chooseAnchorOrientation(
      piece,
      false
    );

  if (!orientation) {
    return null;
  }

  return {
    piece,
    orientation,
  };
}

/*
  3단계

  기존 큰 차수들의 난단을
  모두 채우고도 남는 조각만
  새 재단 차수를 만듭니다.
*/
function createSmallBatches(
  pieces
) {
  let remaining =
    [...pieces];

  const batches = [];

  while (
    remaining.length
  ) {
    const anchor =
      chooseSmallAnchor(
        remaining
      );

    if (!anchor) {
      break;
    }

    const batch =
      createEmptyBatch(
        anchor.orientation
          .height,
        "fill"
      );

    placeAnchor(
      batch,
      anchor.piece,
      anchor.orientation
    );

    const placedIds =
      new Set([
        anchor.piece.id,
      ]);

    const others =
      remaining
        .filter(
          (piece) =>
            piece.id !==
            anchor.piece.id
        )
        .sort(
          difficultySort
        );

    others.forEach(
      (piece) => {
        const placement =
          findPlacementInBatch(
            batch,
            piece,
            "fill"
          );

        if (
          !placement
        ) {
          return;
        }

        placeOnBatch(
          batch,
          piece,
          placement
        );

        placedIds.add(
          piece.id
        );
      }
    );

    batches.push(
      finalizeBatch(
        batch
      )
    );

    remaining =
      remaining.filter(
        (piece) =>
          !placedIds.has(
            piece.id
          )
      );
  }

  return {
    batches,
    remaining,
  };
}

/*
  컬러 하나의 최종 계산 흐름

  1. 큰/긴 재단 차수 생성
  2. 작은 조각을 기존 난단에 재배치
  3. 그래도 남은 것만 새 차수 생성
*/
function buildBatchesForColor(
  pieces
) {
  const priority =
    createPriorityBatches(
      pieces
    );

  const nonPriority =
    pieces.filter(
      (piece) =>
        !priority
          .placedIds
          .has(
            piece.id
          )
    );

  const afterFill =
    fillExistingBatches(
      priority.batches,
      nonPriority
    );

  const small =
    createSmallBatches(
      afterFill
    );

  return {
    batches: [
      ...priority.batches,
      ...small.batches,
    ],

    remaining:
      small.remaining,
  };
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
function chooseRollForBatch(
  rollStates,
  color,
  batchHeight,
  rollMode
) {
  const eligible =
    rollStates.filter(
      (roll) =>
        roll.color ===
          color &&
        roll.remainingLength >=
          batchHeight
    );

  if (
    !eligible.length
  ) {
    return null;
  }

  eligible.sort(
    (a, b) => {
      const aAfter =
        a.remainingLength -
        batchHeight;

      const bAfter =
        b.remainingLength -
        batchHeight;

      if (
        rollMode ===
        "short-first"
      ) {
        if (
          a.lengthMm !==
          b.lengthMm
        ) {
          return (
            a.lengthMm -
            b.lengthMm
          );
        }

        return (
          aAfter -
          bAfter
        );
      }

      const aOpenBonus =
        a.placements
          .length
          ? -800
          : 0;

      const bOpenBonus =
        b.placements
          .length
          ? -800
          : 0;

      return (
        aAfter +
        aOpenBonus -
        (
          bAfter +
          bOpenBonus
        )
      );
    }
  );

  return eligible[0];
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
      ) * 100
    );
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
        (a, b) => {
          if (
            a.y !== b.y
          ) {
            return (
              a.y -
              b.y
            );
          }

          return (
            a.x -
            b.x
          );
        }
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
    totalConsumedArea >
    0
      ? round1(
          (
            totalPieceArea /
            totalConsumedArea
          ) * 100
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
  최종 재단 알고리즘

  컬러별 계산

  1. 폭 600 초과 재단 우선
  2. 긴 재단 우선
  3. 이 기준으로 큰 Batch를 먼저 생성
  4. 작은 재단을 새 페이지로 보내기 전에
     기존 Batch의 2D 난단 공간을 전부 검색
  5. 난단에 들어가면 위/아래/옆으로 재배치
  6. 그래도 남은 것만 새 Batch 생성
  7. Batch 종료 지점에서는
     반드시 가로 전체 절단 가능
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

  const rollStates =
    normalizedRolls.map(
      createRollState
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

  const unplaced = [];

  for (
    const [
      color,
      colorPieces,
    ] of
    piecesByColor.entries()
  ) {
    const {
      batches,
      remaining,
    } =
      buildBatchesForColor(
        colorPieces
      );

    if (
      remaining.length
    ) {
      unplaced.push(
        ...remaining
      );
    }

    /*
      롤에 넣을 때도

      wide
      → long
      → fill

      순서 유지.
    */
    batches.sort(
      (a, b) => {
        const typeScore =
          (batch) => {
            if (
              batch.type ===
              "wide"
            ) {
              return 3;
            }

            if (
              batch.type ===
              "long"
            ) {
              return 2;
            }

            return 1;
          };

        const diff =
          typeScore(b) -
          typeScore(a);

        if (
          diff !== 0
        ) {
          return diff;
        }

        if (
          b.height !==
          a.height
        ) {
          return (
            b.height -
            a.height
          );
        }

        return (
          b.efficiency -
          a.efficiency
        );
      }
    );

    for (
      const batch of
      batches
    ) {
      const roll =
        chooseRollForBatch(
          rollStates,
          color,
          batch.height,
          rollMode
        );

      if (!roll) {
        unplaced.push(
          ...batch.placements
        );

        continue;
      }

      placeBatchOnRoll(
        roll,
        batch
      );
    }
  }

  const result =
    finalizeResult(
      rollStates,
      unplaced
    );

  if (
    unplaced.length
  ) {
    return {
      success: false,

      errors: [
        "현재 등록된 롤 길이로 모든 재단물을 배치할 수 없습니다.",
      ],

      result,
    };
  }

  return {
    success: true,

    errors: [],

    result,
  };
    }
