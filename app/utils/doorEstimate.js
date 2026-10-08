import { getGroupKey } from "./categoryUtils.js";

export function isDoorPricingGroup(group) {
  const label = `${group?.category || ""} ${
    group?.subCategory || group?.sub_category || ""
  }`;

  if (/현관문|entrancedoor/i.test(label)) {
    return false;
  }

  return (
    getGroupKey({
      category: group?.category,
      sub_category:
        group?.subCategory || group?.sub_category,
    }) === "door"
  );
}

export function clampDoorQuantity(value, fallback = 1) {
  if (
    value === null ||
    value === undefined ||
    value === "" ||
    !Number.isFinite(Number(value))
  ) {
    return fallback;
  }

  return Math.min(
    50,
    Math.max(1, Math.floor(Number(value)))
  );
}

const amountKeys = ["min", "max", "average"];

const sumEstimates = (groups) =>
  Object.fromEntries(
    amountKeys.map((key) => [
      key,
      groups.reduce(
        (sum, group) =>
          sum + Number(group.estimate?.[key] || 0),
        0
      ),
    ])
  );

const validEstimate = (group) =>
  !group.requiresConfirmation &&
  group.estimate &&
  amountKeys.every(
    (key) =>
      Number.isFinite(Number(group.estimate[key])) &&
      Number(group.estimate[key]) > 0
  );

// 요청 수량은 사진당 배수가 아니라 현장 전체의 문·문틀 세트 수입니다.
export function calculateQuantityEstimate(
  groups = [],
  requestedQuantity = null,
  adjust = (value) => Number(value)
) {
  const displayedGroups = groups.map((group) => ({
    ...group,
    estimate: validEstimate(group)
      ? {
          ...group.estimate,
          ...Object.fromEntries(
            amountKeys.map((key) => [
              key,
              Math.round(adjust(group.estimate[key])),
            ])
          ),
        }
      : null,
  }));

  const doors = displayedGroups.filter(
    isDoorPricingGroup
  );

  const pricedDoors = doors.filter(validEstimate);

  const pricedOthers = displayedGroups.filter(
    (group) =>
      !isDoorPricingGroup(group) &&
      validEstimate(group)
  );

  const detectedCount = doors.length;

  const canScale =
    detectedCount > 0 &&
    pricedDoors.length === detectedCount;

  const quantity = canScale
    ? clampDoorQuantity(
        requestedQuantity,
        detectedCount
      )
    : detectedCount;

  const photographedTotal = sumEstimates(pricedDoors);

  const unitEstimate = canScale
    ? Object.fromEntries(
        amountKeys.map((key) => [
          key,
          photographedTotal[key] / detectedCount,
        ])
      )
    : null;

  const doorTotal = canScale
    ? Object.fromEntries(
        amountKeys.map((key) => [
          key,
          Math.round(unitEstimate[key] * quantity),
        ])
      )
    : photographedTotal;

  const others = sumEstimates(pricedOthers);

  const estimatedGroupCount =
    pricedDoors.length + pricedOthers.length;

  const pricing = {
    groups: displayedGroups,

    door: {
      detectedCount,
      pricedCount: pricedDoors.length,
      quantity,
      canScale,
      unitEstimate,
      photographedTotal,
      total: doorTotal,
    },

    total: estimatedGroupCount
      ? {
          ...Object.fromEntries(
            amountKeys.map((key) => [
              key,
              doorTotal[key] + others[key],
            ])
          ),
          estimatedGroupCount,
          totalGroupCount: groups.length,
          missingCount:
            groups.length - estimatedGroupCount,
        }
      : null,
  };

  // 화면의 상세 내역과 상담 신청의 견적 내역에 같은 계산을 사용합니다.
  if (pricing.total) {
    pricing.total.details = quantityEstimateDetails(
      pricing
    );
  }

  return pricing;
}

// 문·문틀을 하나의 합계 행으로 묶어 요청 총수량의 중복 반영을 막습니다.
export function quantityEstimateDetails(pricing) {
  const doors = pricing.groups.filter(
    isDoorPricingGroup
  );

  const details = pricing.groups
    .filter((group) => !isDoorPricingGroup(group))
    .map((group) => ({
      group_key: group.key,
      category: group.category,
      sub_category: group.subCategory,
      photo_count: group.photos?.length || 0,
      quantity: 1,
      estimate_min: group.estimate?.min ?? null,
      estimate_max: group.estimate?.max ?? null,
      estimate_average:
        group.estimate?.average ?? null,
    }));

  if (doors.length) {
    details.unshift({
      group_key: "door-total",
      category: "문 및 문틀",
      sub_category: "방문 및 문틀",

      photo_count: doors.reduce(
        (sum, group) =>
          sum + (group.photos?.length || 0),
        0
      ),

      detected_quantity:
        pricing.door.detectedCount,

      priced_quantity:
        pricing.door.pricedCount,

      quantity: pricing.door.quantity,

      unit_average:
        pricing.door.unitEstimate?.average ?? null,

      estimate_min: pricing.door.pricedCount
        ? pricing.door.total.min
        : null,

      estimate_max: pricing.door.pricedCount
        ? pricing.door.total.max
        : null,

      estimate_average: pricing.door.pricedCount
        ? pricing.door.total.average
        : null,

      partial: !pricing.door.canScale,
    });
  }

  return details;
}

// 같은 문이라는 근거가 명확한 사진만 묶습니다.
// 고객이 직접 나누거나 묶은 선택은 자동 병합으로 덮어쓰지 않습니다.
export function mergeDoorViews(photos) {
  const buckets = new Map();

  for (const photo of photos) {
    if (
      photo.subjectId ||
      getGroupKey(photo.analysis) !== "door"
    ) {
      continue;
    }

    const analysis = photo.analysis;

    if (
      analysis.object_confidence !== "high" ||
      !analysis.object_key ||
      !analysis.object_evidence?.trim() ||
      analysis.door_count !== 1
    ) {
      continue;
    }

    const key = analysis.object_key;

    if (!buckets.has(key)) {
      buckets.set(key, []);
    }

    buckets.get(key).push(photo);
  }

  const updates = new Map();

  for (const group of buckets.values()) {
    const representative = group.find(
      (photo) => !photo.analysis.requires_confirmation
    );

    if (!representative) continue;

    for (const photo of group) {
      updates.set(photo.id, {
        ...photo,
        subjectId: group[0].id,
        subjectSource: "ai",

        analysis: {
          ...photo.analysis,
          requires_confirmation: false,

          classification_confidence:
            representative.analysis
              .classification_confidence,

          subject_requires_confirmation: false,
        },
      });
    }
  }

  return photos.map(
    (photo) =>
      updates.get(photo.id) ||
      (
        getGroupKey(photo.analysis) === "door" &&
        !photo.subjectId
          ? {
              ...photo,
              analysis: {
                ...photo.analysis,
                subject_requires_confirmation: true,
              },
            }
          : photo
      )
  );
}
