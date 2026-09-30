export const FILM_WIDTH = 1220;

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
      rolls.map((r) => colorKey(r.color)).filter(Boolean)
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
      // 같은 컬러에서 설정이 섞이면 안전하게 결 있음으로 처리
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
        // 완전히 빈 행은 계산에서 무시
        if (!validSize(size)) return;

        actualPieceCount += 1;

        const width = Math.round(toNum(size.width));
        const height = Math.round(toNum(size.height));

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

/*
  기준 조각 선정

  1순위: 폭 600mm 초과
  2순위: 세로 길이가 긴 것
  3순위: 폭이 넓은 것
*/
function chooseAnchor(remaining) {
  const candidates = [];

  remaining.forEach((piece) => {
    pieceOrientations(piece).forEach((o) => {
      candidates.push({
        piece,
        ...o,
        wide: o.width > 600,
      });
    });
  });

  candidates.sort((a, b) => {
    if (a.wide !== b.wide) {
      return a.wide ? -1 : 1;
    }

    if (b.height !== a.height) {
      return b.height - a.height;
    }

    if (b.width !== a.width) {
      return b.width - a.width;
    }

    return b.piece.area - a.piece.area;
  });

  return candidates[0] || null;
}
/*
  기준 조각 옆 남는 폭에 들어갈 조각 조합 검색.

  우선:
  - 폭 합이 1220에 가까움
  - 기준 조각과 길이가 같음
  - 길이 차이가 작음
  - 조각 수가 지나치게 많지 않음

  모든 조각은 같은 재단 차수의 시작점에 맞춰 배치합니다.
  짧은 조각 아래쪽에는 난단이 생길 수 있지만,
  기준 길이 끝에서 한 번에 가로 절단 가능합니다.
*/
function findBestFillers(
  remaining,
  anchorId,
  remainingWidth,
  batchHeight
) {
  if (remainingWidth <= 0) {
    return [];
  }

  const candidates = remaining
    .filter((piece) => piece.id !== anchorId)
    .map((piece) => {
      const options = pieceOrientations(piece)
        .filter(
          (o) =>
            o.width <= remainingWidth &&
            o.height <= batchHeight
        )
        .map((o) => {
          const gap = batchHeight - o.height;

          let lengthBonus = 0;

          if (gap === 0) lengthBonus = 500000;
          else if (gap <= 50) lengthBonus = 350000;
          else if (gap <= 100) lengthBonus = 230000;
          else if (gap <= 200) lengthBonus = 120000;
          else if (gap <= 300) lengthBonus = 50000;
          else lengthBonus = -gap * 120;

          return {
            piece,
            ...o,
            gap,
            optionScore:
              o.width * 10000 +
              lengthBonus -
              1500, // 조각 수가 너무 많아지는 것 약간 감점
          };
        });

      return {
        piece,
        options,
      };
    })
    .filter((item) => item.options.length);

  /*
    0~남은폭(mm) DP.
    한 조각에서는 한 방향만 선택 가능.
  */
  let dp = Array(remainingWidth + 1).fill(null);

  dp[0] = {
    score: 0,
    picks: [],
  };

  candidates.forEach((candidate) => {
    const next = dp.map((state) =>
      state
        ? {
            score: state.score,
            picks: state.picks,
          }
        : null
    );

    for (let used = 0; used <= remainingWidth; used += 1) {
      const state = dp[used];

      if (!state) continue;

      candidate.options.forEach((option) => {
        const newWidth = used + option.width;

        if (newWidth > remainingWidth) return;

        const newScore =
          state.score + option.optionScore;

        if (
          !next[newWidth] ||
          newScore > next[newWidth].score
        ) {
          next[newWidth] = {
            score: newScore,
            picks: [
              ...state.picks,
              option,
            ],
          };
        }
      });
    }

    dp = next;
  });

  let best = {
    finalScore: -Infinity,
    picks: [],
    usedWidth: 0,
  };

  dp.forEach((state, usedWidth) => {
    if (!state) return;

    const left = remainingWidth - usedWidth;

    let finalScore =
      state.score +
      usedWidth * 25000 -
      left * 18000;

    // 남는 폭 0이면 매우 높은 가점
    if (left === 0) {
      finalScore += 5000000;
    } else if (left <= 20) {
      finalScore += 2500000;
    } else if (left <= 50) {
      finalScore += 1200000;
    }

    if (finalScore > best.finalScore) {
      best = {
        finalScore,
        picks: state.picks,
        usedWidth,
      };
    }
  });

  return best.picks;
}

function buildOneBatch(remaining) {
  const anchor = chooseAnchor(remaining);

  if (!anchor) return null;

  const batchHeight = anchor.height;

  const fillers = findBestFillers(
    remaining,
    anchor.piece.id,
    FILM_WIDTH - anchor.width,
    batchHeight
  );

  const selections = [
    {
      piece: anchor.piece,
      width: anchor.width,
      height: anchor.height,
      rotated: anchor.rotated,
      anchor: true,
    },
    ...fillers.map((f) => ({
      piece: f.piece,
      width: f.width,
      height: f.height,
      rotated: f.rotated,
      anchor: false,
    })),
  ];

  /*
    폭이 넓은 조각부터 왼쪽에 배치.
    동일 폭이면 긴 조각 우선.
  */
  selections.sort((a, b) => {
    if (a.anchor !== b.anchor) {
      return a.anchor ? -1 : 1;
    }

    if (b.width !== a.width) {
      return b.width - a.width;
    }

    return b.height - a.height;
  });

  let x = 0;

  const placements = selections.map((selection) => {
    const placed = {
      ...selection.piece,

      x,
      y: 0,

      width: selection.width,
      height: selection.height,
      rotated: selection.rotated,

      isAnchor: selection.anchor,
    };

    x += selection.width;

    return placed;
  });

  const usedArea = placements.reduce(
    (sum, piece) => sum + piece.width * piece.height,
    0
  );

  const totalArea = FILM_WIDTH * batchHeight;

  return {
    height: batchHeight,
    type:
      anchor.width > 600
        ? "wide-long"
        : "long",

    anchorId: anchor.piece.id,

    placements,

    pieceIds: new Set(
      placements.map((piece) => piece.id)
    ),

    usedWidth: x,
    wasteWidth: FILM_WIDTH - x,

    usedArea,
    wasteArea: Math.max(0, totalArea - usedArea),

    efficiency:
      totalArea > 0
        ? round1((usedArea / totalArea) * 100)
        : 0,
  };
}

function buildBatchesForColor(pieces) {
  let remaining = [...pieces];
  const batches = [];

  while (remaining.length) {
    const batch = buildOneBatch(remaining);

    if (!batch) break;

    batches.push(batch);

    remaining = remaining.filter(
      (piece) => !batch.pieceIds.has(piece.id)
    );
  }

  return {
    batches,
    remaining,
  };
}

function createRollState(roll) {
  return {
    ...roll,

    placements: [],
    batches: [],

    usedLength: 0,
    remainingLength: roll.lengthMm,

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
  const eligible = rollStates.filter(
    (roll) =>
      roll.color === color &&
      roll.remainingLength >= batchHeight
  );

  if (!eligible.length) return null;

  eligible.sort((a, b) => {
    const aAfter =
      a.remainingLength - batchHeight;

    const bAfter =
      b.remainingLength - batchHeight;

    if (rollMode === "short-first") {
      if (a.lengthMm !== b.lengthMm) {
        return a.lengthMm - b.lengthMm;
      }

      return aAfter - bAfter;
    }

    /*
      기본 모드:
      현재 배치를 넣고 가장 적게 남는 롤 우선.
      이미 사용 중인 롤이면 약간 우선.
    */
    const aScore =
      aAfter +
      (a.placements.length ? -500 : 0);

    const bScore =
      bAfter +
      (b.placements.length ? -500 : 0);

    return aScore - bScore;
  });

  return eligible[0];
}

function placeBatchOnRoll(roll, batch) {
  const start = roll.usedLength;
  const end = start + batch.height;

  const placements = batch.placements.map((piece) => ({
    ...piece,
    y: start,
  }));

  roll.placements.push(...placements);

  roll.batches.push({
    index: roll.batches.length,
    start,
    end,
    height: batch.height,
    type: batch.type,

    usedWidth: batch.usedWidth,
    wasteWidth: batch.wasteWidth,

    usedArea: batch.usedArea,
    wasteArea: batch.wasteArea,
    efficiency: batch.efficiency,

    pieceIds: placements.map((piece) => piece.id),
  });

  roll.usedLength = end;
  roll.remainingLength = Math.max(
    0,
    roll.lengthMm - roll.usedLength
  );

  roll.usedArea += batch.usedArea;

  const consumedArea =
    FILM_WIDTH * Math.max(1, roll.usedLength);

  roll.efficiency = round1(
    (roll.usedArea / consumedArea) * 100
  );
        }
function finalizeResult(
  rollStates,
  unplaced
) {
  const usedRolls = rollStates.filter(
    (roll) => roll.placements.length > 0
  );

  const unusedRolls = rollStates.filter(
    (roll) => roll.placements.length === 0
  );

  usedRolls.forEach((roll) => {
    roll.placements.sort((a, b) => {
      if (a.y !== b.y) return a.y - b.y;
      return a.x - b.x;
    });

    roll.batches.sort(
      (a, b) => a.start - b.start
    );
  });

  const totalUsedLength = usedRolls.reduce(
    (sum, roll) => sum + roll.usedLength,
    0
  );

  const totalRemainingLength = usedRolls.reduce(
    (sum, roll) => sum + roll.remainingLength,
    0
  );

  const totalPieceArea = usedRolls.reduce(
    (sum, roll) => sum + roll.usedArea,
    0
  );

  const totalConsumedArea = usedRolls.reduce(
    (sum, roll) =>
      sum + FILM_WIDTH * roll.usedLength,
    0
  );

  const efficiency =
    totalConsumedArea > 0
      ? round1(
          (totalPieceArea / totalConsumedArea) * 100
        )
      : 0;

  const totalBatchCount = usedRolls.reduce(
    (sum, roll) => sum + roll.batches.length,
    0
  );

  return {
    success: unplaced.length === 0,

    rolls: rollStates,
    usedRolls,
    unusedRolls,
    unplaced,

    summary: {
      usedRollCount: usedRolls.length,
      unusedRollCount: unusedRolls.length,

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
  새 핵심 알고리즘

  컬러별:
  1. 폭 600 초과 + 긴 것 우선
  2. 그 다음 긴 것
  3. 기준 조각 옆 남는 폭에
     길이가 같거나 비슷한 조각 조합
  4. 한 Batch가 끝나면 가로 절단
  5. 다음 Batch는 새 페이지
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

  if (!validation.valid) {
    return {
      success: false,
      errors: validation.errors,
      result: null,
    };
  }

  const normalizedRolls =
    normalizeRolls(rolls);

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

  pieces.forEach((piece) => {
    if (!piecesByColor.has(piece.color)) {
      piecesByColor.set(piece.color, []);
    }

    piecesByColor
      .get(piece.color)
      .push(piece);
  });

  const unplaced = [];

  /*
    컬러별로 완전히 독립 계산
  */
  for (const [color, colorPieces] of piecesByColor.entries()) {
    const {
      batches,
      remaining,
    } = buildBatchesForColor(colorPieces);

    if (remaining.length) {
      unplaced.push(...remaining);
    }

    /*
      긴 Batch부터 먼저 롤에 배정.
      긴 장척을 뒤로 미뤄 롤이 쪼개지는 문제 방지.
    */
    batches.sort((a, b) => {
      if (a.type !== b.type) {
        if (a.type === "wide-long") return -1;
        if (b.type === "wide-long") return 1;
      }

      if (b.height !== a.height) {
        return b.height - a.height;
      }

      return b.usedWidth - a.usedWidth;
    });

    for (const batch of batches) {
      const roll =
        chooseRollForBatch(
          rollStates,
          color,
          batch.height,
          rollMode
        );

      if (!roll) {
        unplaced.push(
          ...batch.placements.map((p) => ({
            ...p,
            x: 0,
            y: 0,
          }))
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

  if (unplaced.length) {
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
