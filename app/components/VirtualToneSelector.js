"use client";

import { useMemo, useState } from "react";
import FilmColorPicker from "../FilmColorPicker";

function normalizeText(value) {
  return String(value || "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

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

          ...(Array.isArray(
            photo?.analysis?.tags
          )
            ? photo.analysis.tags
            : []),
        ])
      : []),
  ]
    .filter(Boolean)
    .join(" ");
}

function includesAny(text, words) {
  const normalized =
    normalizeText(text);

  return words.some((word) =>
    normalized.includes(
      normalizeText(word)
    )
  );
}

export function detectInstallAreas(
  groups = []
) {
  if (!Array.isArray(groups)) {
    return [];
  }

  const fullText = groups
    .map(getGroupText)
    .join(" ");

  /*
   * 문짝·문틀
   */

  const hasDoor = includesAny(
    fullText,
    [
      "방문",
      "방화문",
      "도어",
      "문짝",
      "도어패널",
    ]
  );

  const hasDoorFrame = includesAny(
    fullText,
    [
      "문틀",
      "도어프레임",
      "도어 프레임",
      "jamb",
      "casing",
    ]
  );

  if (
    hasDoor &&
    hasDoorFrame
  ) {
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
   * 주방
   */

  const kitchenContext =
    includesAny(fullText, [
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

  const hasUpper = includesAny(
    fullText,
    [
      "상부장",
      "상부 장",
      "벽장",
      "벽부장",
      "wall cabinet",
      "upper cabinet",
    ]
  );

  const hasLower = includesAny(
    fullText,
    [
      "하부장",
      "하부 장",
      "베이스장",
      "base cabinet",
      "lower cabinet",
    ]
  );

  const genericSink = includesAny(
    fullText,
    [
      "싱크대",
      "주방가구",
      "주방 가구",
    ]
  );

  if (
    hasUpper ||
    genericSink
  ) {
    areas.push({
      key: "upper",
      label: "상부장",
      type: "kitchen",
    });
  }

  if (
    hasLower ||
    genericSink
  ) {
    areas.push({
      key: "lower",
      label: "하부장",
      type: "kitchen",
    });
  }

  const hasFridge = includesAny(
    fullText,
    [
      "냉장고장",
      "냉장고 장",
      "냉장고수납장",
      "냉장고 수납장",
      "냉장고옆장",
      "냉장고 옆장",
      "refrigerator cabinet",
      "fridge cabinet",
    ]
  );

  if (hasFridge) {
    areas.push({
      key: "fridge",
      label: "냉장고장",
      type: "kitchen",
    });
  }

  const hasTall = includesAny(
    fullText,
    [
      "키큰장",
      "키큰 장",
      "키높이장",
      "키높이 장",
      "톨장",
      "tall cabinet",
    ]
  );

  if (hasTall) {
    areas.push({
      key: "tall",
      label: "키큰장",
      type: "kitchen",
    });
  }

  const hasPantry = includesAny(
    fullText,
    [
      "팬트리장",
      "팬트리 장",
      "팬트리",
      "pantry cabinet",
    ]
  );

  if (hasPantry) {
    areas.push({
      key: "pantry",
      label: "팬트리장",
      type: "kitchen",
    });
  }

  const hasIsland = includesAny(
    fullText,
    [
      "아일랜드장",
      "아일랜드 장",
      "아일랜드",
      "island cabinet",
    ]
  );

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
   * 두 부위 이상일 때만 표시
   */

  if (unique.length < 2) {
    return [];
  }

  return unique;
}

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

export default function VirtualToneSelector({
  groups = [],
  product = null,

  useSplitTone = false,
  onUseSplitToneChange,

  areaFilms = {},
  onAreaFilmsChange,
}) {
  const [
    editingAreaKey,
    setEditingAreaKey,
  ] = useState("");

  const installAreas = useMemo(
    () =>
      detectInstallAreas(groups),
    [groups]
  );

  /*
   * 부분시공이 가능한 부위가
   * 두 개 미만이면 표시하지 않음
   */

  if (
    installAreas.length < 2
  ) {
    return null;
  }

  function getAreaFilm(
    areaKey
  ) {
    return (
      areaFilms?.[areaKey] ||
      product
    );
  }

  function isChanged(areaKey) {
    const selected =
      areaFilms?.[areaKey];

    if (!selected) {
      return false;
    }

    if (!product) {
      return true;
    }

    if (
      selected?.id &&
      product?.id
    ) {
      return (
        selected.id !==
        product.id
      );
    }

    return (
      selected?.product_code !==
      product?.product_code
    );
  }

  /*
   * 부위별 필름 선택
   */

  function handleAreaFilmSelect(
    areaKey,
    film
  ) {
    if (!film) {
      return;
    }

    onAreaFilmsChange?.({
      ...(areaFilms || {}),
      [areaKey]: film,
    });

    /*
     * 선택 완료 후 목록 자동 닫기
     */

    setEditingAreaKey("");
  }

  /*
   * 한 부위를 기본 필름으로 복원
   */

  function resetAreaFilm(
    areaKey
  ) {
    const next = {
      ...(areaFilms || {}),
    };

    delete next[areaKey];

    onAreaFilmsChange?.(next);

    setEditingAreaKey("");
  }

  /*
   * 모든 부위를 기본 필름으로 복원
   */

  function resetAllAreaFilms() {
    onAreaFilmsChange?.({});

    setEditingAreaKey("");
  }

  const changedAreaCount =
    installAreas.filter(
      (area) =>
        isChanged(area.key)
    ).length;

  return (
    <section
      style={{
        marginTop: "12px",
        padding: "14px",
        border:
          "1px solid #e5e7eb",
        borderRadius: "16px",
        background: "#ffffff",
      }}
    >
      {/* 제목 */}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent:
            "space-between",
          gap: "10px",
        }}
      >
        <div>
          <div
            style={{
              fontSize: "16px",
              fontWeight: "bold",
            }}
          >
            부위별 컬러
          </div>

          <div
            style={{
              marginTop: "2px",
              color: "#6b7280",
              fontSize: "12px",
            }}
          >
            원하는 부위만 다른 필름을
            선택하세요.
          </div>
        </div>

        <span
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
        </span>
      </div>

      {/* 전체 동일·부위별 선택 */}

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "1fr 1fr",
          gap: "7px",
          marginTop: "11px",
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
            padding: "10px 7px",
            borderRadius: "10px",
            border:
              !useSplitTone
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
            fontSize: "13px",
          }}
        >
          모두 같은 컬러
        </button>

        <button
          type="button"
          disabled={!product}
          onClick={() => {
            if (!product) {
              return;
            }

            onUseSplitToneChange?.(
              true
            );

            setEditingAreaKey("");
          }}
          style={{
            padding: "10px 7px",
            borderRadius: "10px",
            border:
              useSplitTone
                ? "2px solid #5d4037"
                : "1px solid #d1d5db",
            background:
              useSplitTone
                ? "#5d4037"
                : "#ffffff",
            color:
              useSplitTone
                ? "#ffffff"
                : product
                  ? "#111827"
                  : "#9ca3af",
            fontWeight: "bold",
            fontSize: "13px",
            opacity:
              product ? 1 : 0.6,
          }}
        >
          부위별 컬러 선택
        </button>
      </div>

      {!product && (
        <div
          style={{
            marginTop: "9px",
            padding: "9px 10px",
            borderRadius: "9px",
            background: "#fff7ed",
            color: "#9a3412",
            fontSize: "12px",
          }}
        >
          먼저 기본 필름을
          선택해주세요.
        </div>
      )}

      {/* 부위별 컬러 목록 */}

      {useSplitTone &&
        product && (
          <div
            style={{
              display: "grid",
              gap: "7px",
              marginTop: "11px",
            }}
          >
            {installAreas.map(
              (area) => {
                const film =
                  getAreaFilm(
                    area.key
                  );

                const changed =
                  isChanged(
                    area.key
                  );

                const editing =
                  editingAreaKey ===
                  area.key;

                return (
                  <div
                    key={area.key}
                  >
                    <div
                      style={{
                        display:
                          "flex",
                        alignItems:
                          "center",
                        gap: "9px",
                        padding: "9px",
                        border:
                          editing
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
                      {/* 필름 샘플 */}

                      {film
                        ?.sample_image_path ? (
                        <img
                          src={
                            film.sample_image_path
                          }
                          alt={`${area.label} 필름`}
                          style={{
                            width: "43px",
                            height:
                              "43px",
                            flex:
                              "0 0 43px",
                            objectFit:
                              "cover",
                            borderRadius:
                              "8px",
                            border:
                              "1px solid #e5e7eb",
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: "43px",
                            height:
                              "43px",
                            flex:
                              "0 0 43px",
                            borderRadius:
                              "8px",
                            border:
                              "1px solid #e5e7eb",
                            background:
                              film
                                ?.color_hex ||
                              "#f3f4f6",
                          }}
                        />
                      )}

                      {/* 부위·필름 정보 */}

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
                              다른 컬러
                            </span>
                          )}
                        </div>

                        <div
                          style={{
                            marginTop:
                              "2px",
                            fontSize:
                              "13px",
                            fontWeight:
                              "bold",
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
                        onClick={() =>
                          setEditingAreaKey(
                            editing
                              ? ""
                              : area.key
                          )
                        }
                        style={{
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
                              : "#111827",
                          fontSize:
                            "12px",
                          fontWeight:
                            "bold",
                        }}
                      >
                        {editing
                          ? "닫기"
                          : "변경"}
                      </button>
                    </div>

                    {/* 선택한 부위의 필름 목록 */}

                    {editing && (
                      <div
                        style={{
                          marginTop:
                            "7px",
                          padding: "10px",
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
                            {area.label} 컬러
                            선택
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
                              }}
                            >
                              기본 컬러
                            </button>
                          )}
                        </div>

                        <FilmColorPicker
                          key={`tone-picker-${area.key}`}
                          onSelect={(
                            filmValue
                          ) =>
                            handleAreaFilmSelect(
                              area.key,
                              filmValue
                            )
                          }
                        />
                      </div>
                    )}
                  </div>
                );
              }
            )}

            {/* 선택 요약 */}

            <div
              style={{
                display: "flex",
                alignItems:
                  "center",
                justifyContent:
                  "space-between",
                gap: "8px",
                padding: "9px 10px",
                borderRadius: "9px",
                background: "#f8fafc",
                color: "#475569",
                fontSize: "12px",
              }}
            >
              <span>
                {changedAreaCount ===
                0
                  ? `모든 부위에 ${
                      product.product_code ||
                      "기본"
                    } 적용`
                  : `${changedAreaCount}개 부위 컬러 변경 완료`}
              </span>

              {changedAreaCount >
                0 && (
                <button
                  type="button"
                  onClick={
                    resetAllAreaFilms
                  }
                  style={{
                    padding:
                      "5px 7px",
                    border:
                      "1px solid #d1d5db",
                    borderRadius:
                      "7px",
                    background:
                      "#ffffff",
                    color:
                      "#374151",
                    fontSize:
                      "10px",
                    fontWeight:
                      "bold",
                  }}
                >
                  전체 초기화
                </button>
              )}
            </div>
          </div>
        )}
    </section>
  );
                            }
