"use client";

import { useMemo, useState } from "react";
import FilmColorPicker from "../FilmColorPicker";

/*
 * =========================================================
 * 문자열 정리
 * =========================================================
 */

function normalizeText(value) {
  return String(value || "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

/*
 * =========================================================
 * group 내용 합치기
 * =========================================================
 */

function getGroupText(group) {
  return [
    group?.key,
    group?.category,
    group?.subCategory,
    group?.sub_category,
    group?.name,
    group?.label,
    group?.title,
    group?.description,
    group?.ai_description,

    ...(Array.isArray(group?.photos)
      ? group.photos.flatMap((photo) => [
          photo?.analysis?.category,
          photo?.analysis?.subCategory,
          photo?.analysis?.sub_category,
          photo?.analysis?.description,

          ...(Array.isArray(photo?.analysis?.tags)
            ? photo.analysis.tags
            : []),
        ])
      : []),
  ]
    .filter(Boolean)
    .join(" ");
}

/*
 * =========================================================
 * 특정 단어 포함 여부
 * =========================================================
 */

function includesAny(text, words) {
  const normalized = normalizeText(text);

  return words.some((word) =>
    normalized.includes(normalizeText(word))
  );
}

/*
 * =========================================================
 * 시공 부위 자동 판정
 * =========================================================
 */

export function detectInstallAreas(groups = []) {
  if (!Array.isArray(groups)) {
    return [];
  }

  const fullText = groups
    .map(getGroupText)
    .join(" ");

  /*
   * -------------------------------------------------------
   * 문 / 문틀
   * -------------------------------------------------------
   */

  const hasDoor = includesAny(fullText, [
    "방문",
    "방화문",
    "도어",
    "문짝",
    "도어패널",
  ]);

  const hasDoorFrame = includesAny(fullText, [
    "문틀",
    "도어프레임",
    "도어 프레임",
    "jamb",
    "casing",
  ]);

  if (hasDoor && hasDoorFrame) {
    return [
      {
        key: "door_leaf",
        label: "문짝",
        type: "door",
      },
      {
        key: "door_frame",
        label: "문틀",
        type: "door",
      },
    ];
  }

  /*
   * -------------------------------------------------------
   * 주방
   * -------------------------------------------------------
   */

  const kitchenContext = includesAny(fullText, [
    "싱크대",
    "주방",
    "주방가구",
    "상부장",
    "하부장",
    "냉장고장",
    "키큰장",
    "키큰 장",
    "팬트리장",
    "팬트리 장",
    "아일랜드",
    "아일랜드장",
  ]);

  if (!kitchenContext) {
    return [];
  }

  const areas = [];

  /*
   * 상부장
   */

  const hasUpper = includesAny(fullText, [
    "상부장",
    "상부 장",
    "벽장",
    "벽부장",
    "wall cabinet",
    "upper cabinet",
  ]);

  /*
   * 하부장
   */

  const hasLower = includesAny(fullText, [
    "하부장",
    "하부 장",
    "베이스장",
    "base cabinet",
    "lower cabinet",
  ]);

  /*
   * 일반 싱크대로 분석된 경우
   * 기본적으로 상부장 + 하부장 생성
   */

  const genericSink = includesAny(fullText, [
    "싱크대",
    "주방가구",
    "주방 가구",
  ]);

  if (hasUpper || genericSink) {
    areas.push({
      key: "upper",
      label: "상부장",
      type: "kitchen",
    });
  }

  if (hasLower || genericSink) {
    areas.push({
      key: "lower",
      label: "하부장",
      type: "kitchen",
    });
  }

  /*
   * 냉장고장
   */

  const hasFridge = includesAny(fullText, [
    "냉장고장",
    "냉장고 장",
    "냉장고수납장",
    "냉장고 수납장",
    "냉장고옆장",
    "냉장고 옆장",
    "refrigerator cabinet",
    "fridge cabinet",
  ]);

  if (hasFridge) {
    areas.push({
      key: "fridge",
      label: "냉장고장",
      type: "kitchen",
    });
  }

  /*
   * 키큰장
   */

  const hasTall = includesAny(fullText, [
    "키큰장",
    "키큰 장",
    "키높이장",
    "키높이 장",
    "톨장",
    "tall cabinet",
  ]);

  if (hasTall) {
    areas.push({
      key: "tall",
      label: "키큰장",
      type: "kitchen",
    });
  }

  /*
   * 팬트리장
   */

  const hasPantry = includesAny(fullText, [
    "팬트리장",
    "팬트리 장",
    "팬트리",
    "pantry cabinet",
  ]);

  if (hasPantry) {
    areas.push({
      key: "pantry",
      label: "팬트리장",
      type: "kitchen",
    });
  }

  /*
   * 아일랜드장
   */

  const hasIsland = includesAny(fullText, [
    "아일랜드장",
    "아일랜드 장",
    "아일랜드",
    "island cabinet",
  ]);

  if (hasIsland) {
    areas.push({
      key: "island",
      label: "아일랜드장",
      type: "kitchen",
    });
  }

  /*
   * 중복 제거
   */

  const unique = [];
  const seen = new Set();

  for (const area of areas) {
    if (!seen.has(area.key)) {
      seen.add(area.key);
      unique.push(area);
    }
  }

  /*
   * 2개 이상일 때만
   * 부분 톤 기능 활성화
   */

  if (unique.length < 2) {
    return [];
  }

  return unique;
}

/*
 * =========================================================
 * 필름 제목
 * =========================================================
 */

function getFilmTitle(film) {
  if (!film) {
    return "필름 선택 전";
  }

  return [
    film.brand,
    film.product_code,
  ]
    .filter(Boolean)
    .join(" ");
}

/*
 * =========================================================
 * 필름 설명
 * =========================================================
 */

function getFilmDescription(film) {
  if (!film) {
    return "먼저 기본 필름을 선택해주세요.";
  }

  return (
    film.color_description ||
    film.color_family ||
    film.product_name ||
    ""
  );
}

/*
 * =========================================================
 * VirtualToneSelector
 * =========================================================
 */

export default function VirtualToneSelector({
  groups = [],
  product = null,

  useSplitTone = false,
  onUseSplitToneChange,

  areaFilms = {},
  onAreaFilmsChange,
}) {
  /*
   * 현재 필름을 변경하고 있는 부위
   */

  const [
    editingAreaKey,
    setEditingAreaKey,
  ] = useState("");

  /*
   * =======================================================
   * 시공 부위 계산
   * =======================================================
   */

  const installAreas = useMemo(
    () => detectInstallAreas(groups),
    [groups]
  );

  const canSplitTone =
    installAreas.length >= 2;

  /*
   * 부분톤 대상이 아니면 아무것도 표시하지 않음
   */

  if (!canSplitTone) {
    return null;
  }

  /*
   * =======================================================
   * 특정 부위에 적용되는 필름
   * =======================================================
   */

  function getAreaFilm(areaKey) {
    return areaFilms?.[areaKey] || product;
  }

  /*
   * =======================================================
   * 부위 필름 변경
   * =======================================================
   */

  function handleAreaFilmSelect(
    areaKey,
    film
  ) {
    if (!film) {
      return;
    }

    const next = {
      ...(areaFilms || {}),
      [areaKey]: film,
    };

    onAreaFilmsChange?.(next);

    /*
     * 선택하면 자동으로 닫기
     */

    setEditingAreaKey("");
  }

  /*
   * =======================================================
   * 한 부위 기본 필름으로 복귀
   * =======================================================
   */

  function resetAreaFilm(areaKey) {
    const next = {
      ...(areaFilms || {}),
    };

    delete next[areaKey];

    onAreaFilmsChange?.(next);

    setEditingAreaKey("");
  }

  /*
   * =======================================================
   * 전부 기본 필름으로 복귀
   * =======================================================
   */

  function resetAllAreaFilms() {
    onAreaFilmsChange?.({});

    setEditingAreaKey("");
  }

  /*
   * =======================================================
   * 변경된 부위 수
   * =======================================================
   */

  const changedAreaCount =
    installAreas.filter((area) => {
      const selected =
        areaFilms?.[area.key];

      if (!selected) {
        return false;
      }

      /*
       * 기본 필름이 아직 없는 경우에는
       * 부위별 선택 자체를 변경으로 봄
       */

      if (!product) {
        return true;
      }

      if (
        selected?.id &&
        product?.id
      ) {
        return (
          selected.id !== product.id
        );
      }

      return (
        selected?.product_code !==
        product?.product_code
      );
    }).length;

  /*
   * =======================================================
   * 화면
   * =======================================================
   */

  return (
    <section
      style={{
        marginTop: "14px",
        padding: "14px",
        border:
          "1px solid #d1d5db",
        borderRadius: "16px",
        background: "#ffffff",
      }}
    >
      {/* 제목 */}

      <div
        style={{
          display: "flex",
          justifyContent:
            "space-between",
          alignItems: "center",
          gap: "10px",
        }}
      >
        <div>
          <div
            style={{
              fontWeight: "bold",
              fontSize: "17px",
              color: "#111827",
            }}
          >
            부분 톤 차이
          </div>

          <div
            style={{
              marginTop: "3px",
              color: "#6b7280",
              fontSize: "12px",
              lineHeight: 1.5,
            }}
          >
            AI가 인식한 시공 부위별로
            다른 필름을 적용할 수 있습니다.
          </div>
        </div>

        <div
          style={{
            padding: "5px 8px",
            borderRadius: "20px",
            background: "#f3f4f6",
            color: "#4b5563",
            fontSize: "11px",
            fontWeight: "bold",
            whiteSpace: "nowrap",
          }}
        >
          {installAreas.length}개 부위
        </div>
      </div>

      {/* 한 가지 / 부위별 */}

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "1fr 1fr",
          gap: "8px",
          marginTop: "12px",
        }}
      >
        <button
          type="button"
          onClick={() => {
            onUseSplitToneChange?.(
              false
            );

            resetAllAreaFilms();
          }}
          style={{
            padding: "12px 8px",
            borderRadius: "10px",
            border: !useSplitTone
              ? "2px solid #111827"
              : "1px solid #d1d5db",
            background:
              !useSplitTone
                ? "#111827"
                : "#ffffff",
            color:
              !useSplitTone
                ? "#ffffff"
                : "#111827",
            fontWeight: "bold",
            fontSize: "14px",
            cursor: "pointer",
          }}
        >
          한 가지 필름
        </button>

        <button
          type="button"
          onClick={() => {
            onUseSplitToneChange?.(
              true
            );

            setEditingAreaKey("");
          }}
          style={{
            padding: "12px 8px",
            borderRadius: "10px",
            border: useSplitTone
              ? "2px solid #5d4037"
              : "1px solid #d1d5db",
            background:
              useSplitTone
                ? "#5d4037"
                : "#ffffff",
            color:
              useSplitTone
                ? "#ffffff"
                : "#111827",
            fontWeight: "bold",
            fontSize: "14px",
            cursor: "pointer",
          }}
        >
          부위별 톤 다르게
        </button>
      </div>

      {/* 안내 */}

      {!product && (
        <div
          style={{
            marginTop: "10px",
            padding: "10px 11px",
            borderRadius: "9px",
            background: "#fff7ed",
            color: "#9a3412",
            fontSize: "12px",
            lineHeight: 1.5,
          }}
        >
          먼저 아래에서 기본 필름을
          선택해주세요. 기본 필름 선택 후
          필요한 부위만 다른 필름으로
          변경할 수 있습니다.
        </div>
      )}

      {/* =================================================
          부위별 톤
          ================================================= */}

      {useSplitTone && (
        <div
          style={{
            marginTop: "13px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent:
                "space-between",
              alignItems: "center",
              gap: "8px",
              marginBottom: "8px",
            }}
          >
            <strong
              style={{
                fontSize: "14px",
              }}
            >
              부위별 필름
            </strong>

            {changedAreaCount > 0 && (
              <button
                type="button"
                onClick={
                  resetAllAreaFilms
                }
                style={{
                  padding: "6px 9px",
                  border:
                    "1px solid #d1d5db",
                  borderRadius: "8px",
                  background:
                    "#ffffff",
                  color: "#374151",
                  fontSize: "11px",
                  fontWeight: "bold",
                  cursor: "pointer",
                }}
              >
                모두 기본 필름
              </button>
            )}
          </div>

          <div
            style={{
              display: "grid",
              gap: "7px",
            }}
          >
            {installAreas.map(
              (area) => {
                const film =
                  getAreaFilm(
                    area.key
                  );

                const selectedAreaFilm =
                  areaFilms?.[
                    area.key
                  ];

                let changed = false;

                if (
                  selectedAreaFilm
                ) {
                  if (!product) {
                    changed = true;
                  } else if (
                    selectedAreaFilm?.id &&
                    product?.id
                  ) {
                    changed =
                      selectedAreaFilm.id !==
                      product.id;
                  } else {
                    changed =
                      selectedAreaFilm
                        ?.product_code !==
                      product
                        ?.product_code;
                  }
                }

                const editing =
                  editingAreaKey ===
                  area.key;

                return (
                  <div
                    key={area.key}
                  >
                    {/* 부위 카드 */}

                    <div
                      style={{
                        display: "flex",
                        alignItems:
                          "center",
                        gap: "9px",
                        padding:
                          "9px 10px",
                        border: editing
                          ? "2px solid #5d4037"
                          : changed
                            ? "1px solid #a78bfa"
                            : "1px solid #e5e7eb",
                        borderRadius:
                          "11px",
                        background:
                          changed
                            ? "#f5f3ff"
                            : "#ffffff",
                      }}
                    >
                      {/* 샘플 */}

                      {film
                        ?.sample_image_path ? (
                        <img
                          src={
                            film.sample_image_path
                          }
                          alt=""
                          style={{
                            width: "44px",
                            height: "44px",
                            flex:
                              "0 0 44px",
                            objectFit:
                              "cover",
                            borderRadius:
                              "7px",
                            border:
                              "1px solid #e5e7eb",
                            background:
                              "#ffffff",
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: "44px",
                            height: "44px",
                            flex:
                              "0 0 44px",
                            borderRadius:
                              "7px",
                            border:
                              "1px solid #e5e7eb",
                            background:
                              film
                                ?.color_hex ||
                              "#f3f4f6",
                          }}
                        />
                      )}

                      {/* 정보 */}

                      <div
                        style={{
                          flex: 1,
                          minWidth: 0,
                        }}
                      >
                        <div
                          style={{
                            display:
                              "flex",
                            alignItems:
                              "center",
                            gap: "5px",
                          }}
                        >
                          <strong
                            style={{
                              fontSize:
                                "13px",
                            }}
                          >
                            {area.label}
                          </strong>

                          {changed && (
                            <span
                              style={{
                                padding:
                                  "2px 5px",
                                borderRadius:
                                  "10px",
                                background:
                                  "#ede9fe",
                                color:
                                  "#6d28d9",
                                fontSize:
                                  "9px",
                                fontWeight:
                                  "bold",
                              }}
                            >
                              변경
                            </span>
                          )}
                        </div>

                        <div
                          style={{
                            marginTop:
                              "2px",
                            fontWeight:
                              "bold",
                            fontSize:
                              "13px",
                            whiteSpace:
                              "nowrap",
                            overflow:
                              "hidden",
                            textOverflow:
                              "ellipsis",
                          }}
                        >
                          {getFilmTitle(
                            film
                          )}
                        </div>

                        <div
                          style={{
                            marginTop:
                              "1px",
                            color:
                              "#6b7280",
                            fontSize:
                              "11px",
                            whiteSpace:
                              "nowrap",
                            overflow:
                              "hidden",
                            textOverflow:
                              "ellipsis",
                          }}
                        >
                          {getFilmDescription(
                            film
                          )}
                        </div>
                      </div>

                      {/* 변경 버튼 */}

                      <button
                        type="button"
                        disabled={
                          !product
                        }
                        onClick={() => {
                          if (!product) {
                            return;
                          }

                          setEditingAreaKey(
                            editing
                              ? ""
                              : area.key
                          );
                        }}
                        style={{
                          flex:
                            "0 0 auto",
                          padding:
                            "8px 10px",
                          border:
                            "1px solid #d1d5db",
                          borderRadius:
                            "8px",
                          background:
                            editing
                              ? "#5d4037"
                              : "#ffffff",
                          color:
                            editing
                              ? "#ffffff"
                              : !product
                                ? "#9ca3af"
                                : "#111827",
                          fontWeight:
                            "bold",
                          fontSize:
                            "12px",
                          cursor:
                            product
                              ? "pointer"
                              : "not-allowed",
                          opacity:
                            product
                              ? 1
                              : 0.65,
                        }}
                      >
                        {editing
                          ? "닫기"
                          : "변경"}
                      </button>
                    </div>

                    {/* =====================================
                        해당 부위 필름 선택
                        ===================================== */}

                    {editing &&
                      product && (
                        <div
                          style={{
                            marginTop:
                              "7px",
                            padding:
                              "10px",
                            border:
                              "1px solid #d1d5db",
                            borderRadius:
                              "11px",
                            background:
                              "#fafafa",
                          }}
                        >
                          <div
                            style={{
                              display:
                                "flex",
                              alignItems:
                                "center",
                              justifyContent:
                                "space-between",
                              gap: "8px",
                              marginBottom:
                                "8px",
                            }}
                          >
                            <strong
                              style={{
                                fontSize:
                                  "13px",
                              }}
                            >
                              {area.label} 필름
                              변경
                            </strong>

                            {changed && (
                              <button
                                type="button"
                                onClick={() =>
                                  resetAreaFilm(
                                    area.key
                                  )
                                }
                                style={{
                                  padding:
                                    "6px 8px",
                                  border:
                                    "none",
                                  borderRadius:
                                    "7px",
                                  background:
                                    "#ede9fe",
                                  color:
                                    "#5b21b6",
                                  fontSize:
                                    "11px",
                                  fontWeight:
                                    "bold",
                                  cursor:
                                    "pointer",
                                }}
                              >
                                기본 필름으로
                              </button>
                            )}
                          </div>

                          <FilmColorPicker
                            key={`tone-picker-${area.key}`}
                            onSelect={(
                              selectedFilm
                            ) =>
                              handleAreaFilmSelect(
                                area.key,
                                selectedFilm
                              )
                            }
                          />
                        </div>
                      )}
                  </div>
                );
              }
            )}
          </div>

          {/* 요약 */}

          <div
            style={{
              marginTop: "9px",
              padding: "9px 10px",
              borderRadius: "9px",
              background: "#f8fafc",
              color: "#475569",
              fontSize: "12px",
              lineHeight: 1.5,
            }}
          >
            {!product
              ? `${installAreas.length}개 시공 부위를 인식했습니다.`
              : changedAreaCount ===
                  0
                ? `${installAreas.length}개 부위 모두 ${product.product_code || "기본"} 필름이 적용됩니다.`
                : `${installAreas.length}개 부위 중 ${changedAreaCount}개 부위의 필름을 다르게 선택했습니다.`}
          </div>
        </div>
      )}
    </section>
  );
}
