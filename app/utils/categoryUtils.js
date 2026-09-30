// app/utils/categoryUtils.js

// ======================================================
// 인테리어필름 자동견적
// 카테고리 분류 관련 공통 함수
// ======================================================


// ------------------------------------------------------
// 카테고리 명칭을 검색/그룹화용 값으로 통일
// ------------------------------------------------------

export function normalizeCategory(value) {
  const text = String(value || "")
    .trim()
    .toLowerCase();

  // A cabinet door is furniture even when another field says "door/frame".
  // Check these before the broad door/doorframe aliases below.
  if (text.includes("붙박이장") || text.includes("옷장") || text.includes("wardrobe") || text.includes("closet")) {
    return "closet";
  }
  if (text.includes("신발장") || text.includes("현관장") || text.includes("shoe cabinet")) {
    return "shoe";
  }
  if (text.includes("냉장고장")) {
    return "kitchen";
  }
  // A named cabinet/fixture remains that fixture when its label includes "도어".
  if (/싱크대|주방|상부장|하부장/.test(text)) return "kitchen";
  if (/화장대|서랍장/.test(text)) return "vanity";
  if (/샷시|창틀|창문/.test(text)) return "window";

  // ----------------------------------------------------
  // 중문
  //
  // 방문/문틀과 시공금액 차이가 크므로
  // 별도 견적 그룹으로 분리
  // ----------------------------------------------------

  if (
    text.includes("중문")
  ) {
    return "middle_door";
  }

  // ----------------------------------------------------
  // 방화문 / 현관 방화문
  //
  // 일반 방문/문틀과 시공금액 차이가 있으므로
  // 별도 견적 그룹으로 분리
  // ----------------------------------------------------

  if (
    text.includes("방화문")
  ) {
    return "fire_door";
  }

  // ----------------------------------------------------
  // 문 / 문틀
  //
  // 중문과 방화문은 위에서 먼저 분리했으므로
  // 여기에는 일반 방문/문틀 계열만 들어옵니다.
  // ----------------------------------------------------

  if (
    text.includes("방문") ||
    text.includes("문틀") ||
    text.includes("현관문") ||
    text.includes("도어") ||
    text.includes("슬라이딩")
  ) {
    return "door";
  }

  // ----------------------------------------------------
  // 싱크대 / 주방
  //
  // AI가 아래처럼 표현을 달리해도
  // 모두 같은 kitchen 견적 그룹으로 통일합니다.
  //
  // 싱크대
  // 주방 가구
  // 상부장
  // 하부장
  // 냉장고장
  // 싱크대상하부장
  // ----------------------------------------------------

  if (
    text.includes("싱크대") ||
    text.includes("주방") ||
    text.includes("상부장") ||
    text.includes("하부장") ||
    text.includes("냉장고장")
  ) {
    return "kitchen";
  }

  // ----------------------------------------------------
  // 붙박이장 / 옷장
  // ----------------------------------------------------

  if (
    text.includes("붙박이장") ||
    text.includes("옷장")
  ) {
    return "closet";
  }

  // ----------------------------------------------------
  // 신발장 / 현관장
  // ----------------------------------------------------

  if (
    text.includes("신발장") ||
    text.includes("현관장")
  ) {
    return "shoe";
  }

  // ----------------------------------------------------
  // 화장대 / 서랍장
  // ----------------------------------------------------

  if (
    text.includes("화장대") ||
    text.includes("서랍장")
  ) {
    return "vanity";
  }

  // ----------------------------------------------------
  // 샷시 / 창틀
  // ----------------------------------------------------

  if (
    text.includes("샷시") ||
    text.includes("창틀") ||
    text.includes("창문")
  ) {
    return "window";
  }

  // ----------------------------------------------------
  // 몰딩 / 걸레받이
  // ----------------------------------------------------

  if (
    text.includes("몰딩") ||
    text.includes("걸레받이")
  ) {
    return "molding";
  }

  // ----------------------------------------------------
  // 아트월 / 벽체
  // ----------------------------------------------------

  if (
    text.includes("아트월") ||
    text.includes("벽체") ||
    text.includes("벽면")
  ) {
    return "wall";
  }

  return text || "other";
}


// ------------------------------------------------------
// AI 분석 결과에서 그룹 키 생성
//
// category + sub_category를 같이 사용해서
// normalizeCategory()로 통일
// ------------------------------------------------------

export function getGroupKey(analysis) {
  if (!analysis) {
    return "other";
  }

  if (Object.hasOwn(TARGET_LABELS, analysis.target_type || "")) return analysis.target_type;

  return normalizeCategory(
    `${analysis.category || ""} ${
      analysis.sub_category || ""
    }`
  );
}


// ------------------------------------------------------
// 여러 사진을 같은 시공 부위별로 그룹화
// ------------------------------------------------------

export function groupPhotosByCategory(
  analyzedPhotos = []
) {
  const groupMap = new Map();

  for (const photo of analyzedPhotos) {
    const analysis =
      photo?.analysis || {};

    const key =
      getGroupKey(analysis);

    if (!groupMap.has(key)) {
      groupMap.set(key, {
        key,

        category:
          analysis.category ||
          "기타",

        subCategory:
          analysis.sub_category ||
          "",

        photos: [],
      });
    }

    const group =
      groupMap.get(key);

    group.photos.push(photo);

    // 처음 데이터에 카테고리가 없고
    // 뒤 사진에는 있는 경우 보완

    if (
      (!group.category ||
        group.category === "기타") &&
      analysis.category
    ) {
      group.category =
        analysis.category;
    }

    if (
      !group.subCategory &&
      analysis.sub_category
    ) {
      group.subCategory =
        analysis.sub_category;
    }
  }

  return Array.from(
    groupMap.values()
  );
}


// ------------------------------------------------------
// 카테고리 화면 표시용 이름
//
// 내부 검색용 key와
// 고객에게 보여줄 이름을 분리
// ------------------------------------------------------

export function getCategoryLabel(key) {
  const labels = {
    door: "문 · 문틀",

    middle_door: "중문",

    fire_door: "방화문",

    kitchen: "싱크대 · 주방",

    closet: "붙박이장 · 옷장",

    shoe: "신발장 · 현관장",

    vanity: "화장대 · 서랍장",

    window: "샷시 · 창틀",

    molding: "몰딩 · 걸레받이",

    wall: "아트월 · 벽체",

    other: "기타",
  };

  return (
    labels[key] ||
    key ||
    "기타"
  );
}

// Estimate scope is separate from the broad category used by film/color controls.
const TARGET_LABELS = {
  door: ["문 및 문틀", "방문 및 문틀"],
  middle_door: ["문 및 문틀", "중문"],
  fire_door: ["문 및 문틀", "방화문 및 문틀"],
  kitchen: ["주방 가구", "주방 가구"],
  closet: ["붙박이장", "붙박이장 문짝"],
  shoe: ["신발장", "신발장 문짝"],
  vanity: ["화장대 · 서랍장", "화장대 · 서랍장"],
  window: ["샷시 및 창틀", "샷시 및 창틀"],
  molding: ["몰딩", "몰딩"],
  wall: ["벽면", "벽면"],
  other: ["기타", "분류 확인 필요"],
};
const SCOPES = {
  kitchen_lower: "싱크대 하부장",
  kitchen_upper: "싱크대 상부장",
  kitchen_full: "싱크대 상부장과 하부장",
  kitchen_fridge: "냉장고장",
};
const knownCategory = (value) => {
  const text = String(value || "").trim();
  if (Object.hasOwn(TARGET_LABELS, text)) return text;
  if (text === "벽면") return "wall";
  if (["문", "문 및 문틀", "문·문틀"].includes(text)) return "door";
  const key = normalizeCategory(text);
  return Object.hasOwn(TARGET_LABELS, key) ? key : "other";
};
const family = (key) => ["door", "middle_door", "fire_door"].includes(key) ? "door" : key;

export function getConstructionScope(analysis = {}) {
  if (getGroupKey(analysis) !== "kitchen") return "whole";
  const explicit = String(analysis.construction_scope || "");
  if (Object.hasOwn(SCOPES, explicit)) return explicit;
  // Only target labels, never background descriptions/tags or inferred dimensions.
  const text = `${analysis.sub_category || ""} ${analysis.category || ""}`.replace(/\s+/g, "");
  if (/아님|아닌|제외|없음|미포함/.test(text)) return "unknown";
  const fridge = text.includes("냉장고장");
  const upper = text.includes("상부장");
  const lower = text.includes("하부장");
  if (fridge && (upper || lower)) return "unknown";
  if (fridge) return "kitchen_fridge";
  if ((upper && lower) || /싱크대전체|주방전체|상하부장/.test(text)) return "kitchen_full";
  if (lower) return "kitchen_lower";
  if (upper) return "kitchen_upper";
  return "unknown";
}

export function getEstimateGroupKey(analysis = {}) {
  return `${getGroupKey(analysis)}:${getConstructionScope(analysis)}`;
}

export const ESTIMATE_TARGET_OPTIONS = [
  ["door", "방문 · 문틀"], ["middle_door", "중문"], ["fire_door", "방화문"],
  ["closet", "붙박이장"], ["shoe", "신발장"],
  ["kitchen_fridge", "냉장고장"], ["kitchen_lower", "싱크대 하부장"],
  ["kitchen_upper", "싱크대 상부장"], ["kitchen_full", "싱크대 상부장 + 하부장"],
  ["vanity", "화장대 · 서랍장"], ["window", "샷시 · 창틀"],
  ["molding", "몰딩"], ["wall", "벽면"],
];

export function applyEstimateTarget(analysis, choice) {
  if (!ESTIMATE_TARGET_OPTIONS.some(([value]) => value === choice)) return analysis;
  const target = Object.hasOwn(SCOPES, choice) ? "kitchen" : choice;
  const labels = TARGET_LABELS[target];
  return {
    ...analysis, target_type: target, category: labels[0],
    sub_category: SCOPES[choice] || labels[1],
    construction_scope: SCOPES[choice] ? choice : "whole",
    classification_confidence: "high", requires_confirmation: false, confirmation_reason: null,
    description: SCOPES[choice] || labels[1], tags: [],
    classification_evidence: "고객이 선택한 시공 대상", user_selected_target: true,
  };
}

// A category describes an object's kind, not its physical identity.
// Customer choices and verified door identities join alternate views.
export function buildEstimatePhotoGroups(photos = []) {
  const ids = new Set(photos.map((photo) => photo.id));
  const groups = new Map();
  photos.forEach((photo, index) => {
    const analysis = photo.analysis || {};
    const subjectId = ids.has(photo.subjectId) ? photo.subjectId : photo.id;
    const key = `${subjectId}:${getEstimateGroupKey(analysis)}`;
    if (!groups.has(key)) groups.set(key, {
      key, subjectId, scope: getConstructionScope(analysis),
      category: analysis.category || "시공 부위", subCategory: analysis.sub_category || "",
      requiresConfirmation: false, confirmationReasons: [], subjectRequiresConfirmation: false, subjectSource: photo.subjectSource || "manual", photos: [], photoNumbers: [],
    });
    const group = groups.get(key);
    group.photos.push(photo);
    group.photoNumbers.push(index + 1);
    group.subjectRequiresConfirmation ||= Boolean(analysis.subject_requires_confirmation);
    group.requiresConfirmation ||= Boolean(analysis.subject_requires_confirmation || analysis.requires_confirmation || analysis.classification_confidence === "low");
    if (analysis.requires_confirmation && analysis.confirmation_reason && !group.confirmationReasons.includes(analysis.confirmation_reason)) {
      group.confirmationReasons.push(analysis.confirmation_reason);
    }
  });
  return Array.from(groups.values());
}

export function assignEstimateSubject(images, id, selectedId) {
  const index = images.findIndex((photo) => photo.id === id);
  if (index < 0) return images;
  if (selectedId === "auto") return images.map((photo) => {
    if (photo.id !== id && photo.subjectId !== id) return photo;
    const { subjectId, ...rest } = photo;
    return rest;
  });
  const parent = images.slice(0, index).find((photo) => photo.id === selectedId);
  const subjectId = parent ? (parent.subjectId || parent.id) : id;
  // Move the selected root and its explicitly linked views together.
  return images.map((photo) => photo.id === id || photo.subjectId === id || (parent && photo.id === subjectId) ? { ...photo, subjectId } : photo);
}

export function normalizeAnalysisClassification(analysis) {
  if (!analysis || typeof analysis !== "object" || Array.isArray(analysis)) {
    throw new Error("사진 분석 결과 형식이 올바르지 않습니다.");
  }
  const categoryKey = knownCategory(analysis.category);
  const detailKey = ["도어", "문짝", "측판", "상단 수납부", "수납부", "전체"].includes(String(analysis.sub_category || "").trim()) ? "other" : knownCategory(analysis.sub_category);
  const declared = Object.hasOwn(TARGET_LABELS, analysis.target_type || "") ? analysis.target_type : null;
  const candidates = [declared, categoryKey, detailKey].filter((key) => key && key !== "other");
  const specificDoors = [...new Set(candidates.filter((key) => key === "middle_door" || key === "fire_door"))];
  const conflict = new Set(candidates.map(family)).size > 1 || specificDoors.length > 1;
  const target = conflict ? "other" : (specificDoors[0] || declared || (detailKey !== "other" ? detailKey : categoryKey));
  const scope = getConstructionScope({ ...analysis, target_type: target });
  // Identifying a target is separate from verifying its count, scope and price.
  // Open/cropped doors can be identifiable; mergeDoorViews still requires a
  // confirmed single doorway before pricing, followed by visual case comparison.
  const partialKitchen = target === "kitchen" && ["kitchen_lower", "kitchen_upper", "kitchen_full"].includes(scope);
  const comparablePartial = partialKitchen || target === "door";
  const incomplete = analysis.view_completeness === "unclear" || (analysis.view_completeness === "partial" && !comparablePartial);
  const reason = conflict ? "conflicting_targets" : analysis.view_completeness === "unclear" ? "unclear_view"
    : incomplete ? "incomplete_view" : !candidates.length || target === "other" ? "unknown_target"
    : analysis.classification_confidence === "low" ? "low_confidence" : null;
  const uncertain = Boolean(reason);
  const labels = TARGET_LABELS[target] || TARGET_LABELS.other;
  const result = {
    ...analysis,
    target_type: target,
    category: labels[0],
    sub_category: target === "kitchen" ? String(analysis.sub_category || labels[1]) : labels[1],
    classification_confidence: uncertain ? "low" : (analysis.classification_confidence === "high" ? "high" : "medium"),
    requires_confirmation: uncertain || target === "other",
    confirmation_reason: reason,
  };
  // Preserve a refrigerator cue from the original category before replacing it
  // with the generic canonical kitchen label.
  result.construction_scope = scope;
  const labelScope = getConstructionScope({ ...analysis, target_type: target, construction_scope: null });
  if (target === "kitchen" && labelScope !== "unknown" && labelScope !== result.construction_scope) {
    result.requires_confirmation = true;
    result.classification_confidence = "low";
    result.confirmation_reason = "conflicting_scope";
  }
  if (target === "kitchen") {
    result.sub_category = SCOPES[result.construction_scope] || "시공 범위 확인 필요";
    if (result.construction_scope === "unknown") {
      result.requires_confirmation = true;
      result.confirmation_reason = "unknown_scope";
    }
  }
  return result;
}

export function isMatchingConstructionScope(analysis, candidate) {
  const key = getGroupKey(analysis);
  if (key !== getGroupKey(candidate)) return false;
  if (key !== "kitchen") return key !== "other";
  const scope = getConstructionScope(analysis);
  return scope !== "unknown" && scope === getConstructionScope(candidate);
}

export function selectEstimateCases(rows, analysis, limit = 10) {
  const seen = new Set();
  return (Array.isArray(rows) ? rows : [])
    .filter((item) => Number.isFinite(Number(item.actual_cost)) && Number(item.actual_cost) > 0 && isMatchingConstructionScope(analysis, item))
    .sort((a, b) => Number(b.similarity || 0) - Number(a.similarity || 0))
    .filter((item) => {
      // Without an ID, do not collapse unrelated jobs just because their prices match.
      const id = item.work_item_id || item.id;
      if (!id) return true;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    }).slice(0, limit);
}
