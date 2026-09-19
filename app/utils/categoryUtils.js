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

  // ----------------------------------------------------
  // 문 / 문틀 / 중문 / 방화문
  // ----------------------------------------------------

  if (
    text.includes("방문") ||
    text.includes("문틀") ||
    text.includes("중문") ||
    text.includes("방화문") ||
    text.includes("현관문") ||
    text.includes("도어") ||
    text.includes("슬라이딩")
  ) {
    return "door";
  }

  // ----------------------------------------------------
  // 싱크대 / 주방
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
    text.includes("벽체")
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
