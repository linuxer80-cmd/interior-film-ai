"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import FilmColorPicker from "./FilmColorPicker";

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

/*
 * =========================================================
 * 특정 단어 포함 여부
 * =========================================================
 */

function includesAny(text, words) {
  const normalized =
    normalizeText(text);

  return words.some((word) =>
    normalized.includes(
      normalizeText(word)
    )
  );
}

/*
 * =========================================================
 * 시공 부위 자동 판정
 * =========================================================
 */

function detectInstallAreas(groups = []) {
  if (!Array.isArray(groups)) {
    return [];
  }

  const fullText =
    groups
      .map(getGroupText)
      .join(" ");

  /*
   * -------------------------------------------------------
   * 문 / 문틀
   * -------------------------------------------------------
   */

  const hasDoor =
    includesAny(fullText, [
      "방문",
      "방화문",
      "도어",
      "문짝",
      "도어패널",
    ]);

  const hasDoorFrame =
    includesAny(fullText, [
      "문틀",
      "도어프레임",
      "도어 프레임",
      "jamb",
      "casing",
    ]);

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
   * -------------------------------------------------------
   * 주방 여부
   * -------------------------------------------------------
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

  /*
   * 상부장
   */

  const hasUpper =
    includesAny(fullText, [
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

  const hasLower =
    includesAny(fullText, [
      "하부장",
      "하부 장",
      "베이스장",
      "base cabinet",
      "lower cabinet",
    ]);

  /*
   * 일반 싱크대로만 분석된 경우
   */

  const genericSink =
    includesAny(fullText, [
      "싱크대",
      "주방가구",
      "주방 가구",
    ]);

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

  /*
   * 냉장고장
   */

  const hasFridge =
    includesAny(fullText, [
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

  const hasTall =
    includesAny(fullText, [
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

  const hasPantry =
    includesAny(fullText, [
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

  const hasIsland =
    includesAny(fullText, [
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

  if (unique.length < 2) {
    return [];
  }

  return unique;
}

/*
 * =========================================================
 * API용 필름 데이터
 * =========================================================
 */

function makeFilmPayload(
  area,
  film
) {
  return {
    areaKey:
      area?.key || "",

    areaLabel:
      area?.label || "",

    brand:
      film?.brand || "",

    productCode:
      film?.product_code || "",

    productName:
      film?.product_name || "",

    texture:
      film?.texture || "",

    colorFamily:
      film?.color_family || "",

    colorDescription:
      film?.color_description || "",

    colorHex:
      film?.color_hex || "",

    sampleImageUrl:
      film?.sample_image_path || "",
  };
}

/*
 * =========================================================
 * 필름 표시용
 * =========================================================
 */

function getFilmTitle(film) {
  if (!film) {
    return "필름 미선택";
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
    return "";
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
 * 메인
 * =========================================================
 */

export default function VirtualInstallPanel({
  images,
  product,
  groups = [],
  onRequestDetail,
}) {
  const [
    selectedImageId,
    setSelectedImageId,
  ] = useState("");

  const [
    resultUrl,
    setResultUrl,
  ] = useState("");

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    message,
    setMessage,
  ] = useState("");

  const [
    useSplitTone,
    setUseSplitTone,
  ] = useState(false);

  /*
   * 부위별 변경 필름
   */

  const [
    areaFilms,
    setAreaFilms,
  ] = useState({});

  /*
   * 현재 열려있는 필름 선택기
   */

  const [
    editingAreaKey,
    setEditingAreaKey,
  ] = useState("");

  /*
   * =======================================================
   * 시공 부위
   * =======================================================
   */

  const installAreas =
    useMemo(
      () =>
        detectInstallAreas(groups),
      [groups]
    );

  const canSplitTone =
    installAreas.length >= 2;

  /*
   * =======================================================
   * 사진 기본 선택
   * =======================================================
   */

  useEffect(() => {
    if (!images?.length) {
      setSelectedImageId("");
      return;
    }

    const exists =
      images.some(
        (item) =>
          item.id ===
          selectedImageId
      );

    if (!exists) {
      setSelectedImageId(
        images[0].id
      );
    }
  }, [
    images,
    selectedImageId,
  ]);

  /*
   * =======================================================
   * 선택 사진
   * =======================================================
   */

  const selectedImage =
    useMemo(() => {
      return (
        images?.find(
          (item) =>
            item.id ===
            selectedImageId
        ) ||
        images?.[0]
      );
    }, [
      images,
      selectedImageId,
    ]);

  /*
   * =======================================================
   * 결과 초기화
   * =======================================================
   */

  useEffect(() => {
    setResultUrl("");
    setMessage("");
  }, [
    product?.id,
    selectedImageId,
    useSplitTone,
    areaFilms,
  ]);

  /*
   * =======================================================
   * 부분톤 불가능 시 초기화
   * =======================================================
   */

  useEffect(() => {
    if (!canSplitTone) {
      setUseSplitTone(false);
      setAreaFilms({});
      setEditingAreaKey("");
    }
  }, [canSplitTone]);

  /*
   * =======================================================
   * 분석 부위 변경 시 불필요한 값 제거
   * =======================================================
   */

  useEffect(() => {
    const validKeys =
      new Set(
        installAreas.map(
          (area) =>
            area.key
        )
      );

    setAreaFilms(
      (previous) => {
        const next = {};

        for (
          const [key, value]
          of Object.entries(
            previous
          )
        ) {
          if (
            validKeys.has(key)
          ) {
            next[key] =
              value;
          }
        }

        return next;
      }
    );

    if (
      editingAreaKey &&
      !validKeys.has(
        editingAreaKey
      )
    ) {
      setEditingAreaKey("");
    }
  }, [
    installAreas
      .map(
        (area) =>
          area.key
      )
      .join("|"),
  ]);

  /*
   * =======================================================
   * 부위에 적용되는 필름
   * =======================================================
   */

  function getAreaFilm(
    areaKey
  ) {
    return (
      areaFilms[areaKey] ||
      product
    );
  }

  /*
   * =======================================================
   * 부위 필름 선택
   * =======================================================
   */

  function handleAreaFilmSelect(
    areaKey,
    film
  ) {
    setAreaFilms(
      (previous) => ({
        ...previous,
        [areaKey]:
          film,
      })
    );

    /*
     * 선택하면 자동 접기
     */

    setEditingAreaKey("");
  }

  /*
   * =======================================================
   * 한 부위 메인 필름으로 복귀
   * =======================================================
   */

  function resetAreaFilm(
    areaKey
  ) {
    setAreaFilms(
      (previous) => {
        const next = {
          ...previous,
        };

        delete next[
          areaKey
        ];

        return next;
      }
    );

    setEditingAreaKey("");
  }

  /*
   * =======================================================
   * 전부 메인 필름으로
   * =======================================================
   */

  function resetAllAreaFilms() {
    setAreaFilms({});
    setEditingAreaKey("");
  }

  /*
   * =======================================================
   * API 전달 데이터
   * =======================================================
   */

  const selectedAreaFilms =
    useMemo(() => {
      if (
        !useSplitTone ||
        !canSplitTone ||
        !product
      ) {
        return [];
      }

      return installAreas.map(
        (area) => ({
          area,

          film:
            areaFilms[
              area.key
            ] ||
            product,
        })
      );
    }, [
      useSplitTone,
      canSplitTone,
      installAreas,
      product,
      areaFilms,
    ]);

  /*
   * =======================================================
   * 다른 필름 사용 부위 수
   * =======================================================
   */

  const changedAreaCount =
    useMemo(() => {
      return installAreas.filter(
        (area) => {
          const selected =
            areaFilms[
              area.key
            ];

          if (!selected) {
            return false;
          }

          return (
            selected.id !==
            product?.id
          );
        }
      ).length;
    }, [
      installAreas,
      areaFilms,
      product?.id,
    ]);

  /*
   * =======================================================
   * 렌더 조건
   * =======================================================
   */

  if (
    !product ||
    !selectedImage
  ) {
    return null;
  }

  /*
   * =======================================================
   * 가상시공 생성
   * =======================================================
   */

  async function generateVirtualImage() {
    if (loading) {
      return;
    }

    setLoading(true);
    setResultUrl("");

    setMessage(
      "가상 시공 이미지를 만들고 있습니다. 잠시 기다려주세요."
    );

    try {
      const formData =
        new FormData();

      /*
       * 고객 사진
       */

      formData.append(
        "image",
        selectedImage.file
      );

      /*
       * 기본 필름
       */

      formData.append(
        "brand",
        product.brand || ""
      );

      formData.append(
        "productCode",
        product.product_code || ""
      );

      formData.append(
        "productName",
        product.product_name || ""
      );

      formData.append(
        "texture",
        product.texture || ""
      );

      formData.append(
        "colorFamily",
        product.color_family || ""
      );

      formData.append(
        "colorDescription",
        product.color_description || ""
      );

      formData.append(
        "colorHex",
        product.color_hex || ""
      );

      formData.append(
        "sampleImageUrl",
        product.sample_image_path || ""
      );

      /*
       * 부분톤
       */

      const splitEnabled =
        useSplitTone &&
        canSplitTone;

      formData.append(
        "useSplitTone",
        splitEnabled
          ? "true"
          : "false"
      );

      if (splitEnabled) {
        const areaPayload =
          selectedAreaFilms.map(
            ({
              area,
              film,
            }) =>
              makeFilmPayload(
                area,
                film
              )
          );

        formData.append(
          "areaFilms",
          JSON.stringify(
            areaPayload
          )
        );
      }

      /*
       * API
       */

      const response =
        await fetch(
          "/api/virtual-install",
          {
            method: "POST",
            body: formData,
          }
        );

      const result =
        await response
          .json()
          .catch(
            () => ({})
          );

      if (
        !response.ok ||
        !result?.imageUrl
      ) {
        throw new Error(
          result?.error ||
            "가상 시공 이미지 생성에 실패했습니다."
        );
      }

      setResultUrl(
        result.imageUrl
      );

      if (
        result?.multiReferenceUsed
      ) {
        setMessage(
          `✅ ${installAreas.length}개 시공 부위를 구분한 가상 시공 이미지가 완성되었습니다.`
        );
      } else if (
        result?.sampleReferenceUsed
      ) {
        setMessage(
          "✅ 실제 필름 샘플을 참고한 가상 시공 이미지가 완성되었습니다."
        );
      } else {
        setMessage(
          "✅ 가상 시공 이미지가 완성되었습니다."
        );
      }
    } catch (error) {
      console.error(error);

      setMessage(
        `❌ ${
          error?.message ||
          "다시 시도해주세요."
        }`
      );
    } finally {
      setLoading(false);
    }
  }

  /*
   * =======================================================
   * 화면
   * =======================================================
   */

  return (
    <section
      style={{
        marginTop: "18px",
        padding: "16px",
        border:
          "1px solid #e5e7eb",
        borderRadius: "18px",
        background: "#ffffff",
      }}
    >
      <h2
        style={{
          margin:
            "0 0 14px",
        }}
      >
        가상 시공 미리보기
      </h2>

      {/* ===================================================
          1. 부분 톤 차이
          제목 바로 아래로 이동
          =================================================== */}

      {canSplitTone && (
        <div
          style={{
            padding: "13px",
            border:
              "1px solid #d1d5db",
            borderRadius: "13px",
            background: "#fafafa",
          }}
        >
          <div
            style={{
              fontWeight:
                "bold",
              fontSize:
                "16px",
            }}
          >
            부분 톤 차이
          </div>

          <div
            style={{
              marginTop:
                "3px",
              color:
                "#6b7280",
              fontSize:
                "13px",
            }}
          >
            필요한 부위만 다른 필름을
            선택할 수 있습니다.
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "1fr 1fr",
              gap: "7px",
              marginTop:
                "10px",
            }}
          >
            <button
              type="button"
              onClick={() => {
                setUseSplitTone(
                  false
                );

                resetAllAreaFilms();
              }}
              style={{
                padding:
                  "11px 6px",
                borderRadius:
                  "10px",
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
                fontWeight:
                  "bold",
                fontSize:
                  "14px",
              }}
            >
              한 가지 필름
            </button>

            <button
              type="button"
              onClick={() => {
                setUseSplitTone(
                  true
                );

                setEditingAreaKey(
                  ""
                );
              }}
              style={{
                padding:
                  "11px 6px",
                borderRadius:
                  "10px",
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
                    : "#111827",
                fontWeight:
                  "bold",
                fontSize:
                  "14px",
              }}
            >
              부분 톤 다르게
            </button>
          </div>
        </div>
      )}

      {/* ===================================================
          2. 선택 필름
          큰 카드 → 작은 가로 카드
          =================================================== */}

      <div
        style={{
          display: "flex",
          alignItems:
            "center",
          gap: "11px",
          marginTop:
            "12px",
          padding:
            "11px",
          borderRadius:
            "12px",
          background:
            "#f3f4f6",
        }}
      >
        {product.sample_image_path ? (
          <img
            src={
              product.sample_image_path
            }
            alt={`${product.product_code} 필름 샘플`}
            style={{
              width: "58px",
              height: "58px",
              flex:
                "0 0 58px",
              objectFit:
                "cover",
              borderRadius:
                "9px",
              border:
                "1px solid #e5e7eb",
              background:
                "#ffffff",
            }}
          />
        ) : (
          <div
            style={{
              width: "58px",
              height: "58px",
              flex:
                "0 0 58px",
              borderRadius:
                "9px",
              border:
                "1px solid #e5e7eb",
              background:
                product.color_hex ||
                "#ffffff",
            }}
          />
        )}

        <div
          style={{
            flex: 1,
            minWidth: 0,
          }}
        >
          <div
            style={{
              color:
                "#6b7280",
              fontSize:
                "12px",
              marginBottom:
                "2px",
            }}
          >
            선택 필름
          </div>

          <div
            style={{
              fontWeight:
                "bold",
              fontSize:
                "16px",
              whiteSpace:
                "nowrap",
              overflow:
                "hidden",
              textOverflow:
                "ellipsis",
            }}
          >
            {getFilmTitle(
              product
            )}
          </div>

          <div
            style={{
              color:
                "#4b5563",
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
            {getFilmDescription(
              product
            )}
          </div>
        </div>
      </div>

      {/* ===================================================
          3. 사진 선택
          =================================================== */}

      {images.length > 1 && (
        <div
          style={{
            marginTop:
              "12px",
          }}
        >
          <div
            style={{
              fontWeight:
                "bold",
              fontSize:
                "13px",
              marginBottom:
                "7px",
            }}
          >
            가상 시공할 사진
          </div>

          <div
            style={{
              display: "flex",
              gap: "7px",
              overflowX:
                "auto",
              paddingBottom:
                "3px",
            }}
          >
            {images.map(
              (
                item,
                index
              ) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() =>
                    setSelectedImageId(
                      item.id
                    )
                  }
                  style={{
                    flex:
                      "0 0 66px",
                    padding:
                      "2px",
                    borderRadius:
                      "9px",
                    border:
                      selectedImage?.id ===
                      item.id
                        ? "3px solid #111827"
                        : "1px solid #d1d5db",
                    background:
                      "#ffffff",
                  }}
                >
                  <img
                    src={
                      item.preview
                    }
                    alt={`사진 ${
                      index + 1
                    }`}
                    style={{
                      display:
                        "block",
                      width:
                        "100%",
                      aspectRatio:
                        "1 / 1",
                      objectFit:
                        "cover",
                      borderRadius:
                        "5px",
                    }}
                  />
                </button>
              )
            )}
          </div>
        </div>
      )}

      {/* ===================================================
          4. 부분톤 사용 시 부위별 필름
          =================================================== */}

      {useSplitTone &&
        canSplitTone && (
          <div
            style={{
              marginTop:
                "14px",
            }}
          >
            <div
              style={{
                display:
                  "flex",
                justifyContent:
                  "space-between",
                alignItems:
                  "center",
                gap: "8px",
                marginBottom:
                  "8px",
              }}
            >
              <strong>
                부위별 필름
              </strong>

              {changedAreaCount >
                0 && (
                <button
                  type="button"
                  onClick={
                    resetAllAreaFilms
                  }
                  style={{
                    padding:
                      "6px 8px",
                    border:
                      "1px solid #d1d5db",
                    borderRadius:
                      "8px",
                    background:
                      "#ffffff",
                    fontSize:
                      "12px",
                  }}
                >
                  모두 같은 필름
                </button>
              )}
            </div>

            <div
              style={{
                display:
                  "grid",
                gap: "7px",
              }}
            >
              {installAreas.map(
                (area) => {
                  const film =
                    getAreaFilm(
                      area.key
                    );

                  const changed =
                    Boolean(
                      areaFilms[
                        area.key
                      ] &&
                        areaFilms[
                          area.key
                        ]?.id !==
                          product?.id
                    );

                  const editing =
                    editingAreaKey ===
                    area.key;

                  return (
                    <div
                      key={
                        area.key
                      }
                    >
                      {/* 부위 카드 */}

                      <div
                        style={{
                          display:
                            "flex",
                          alignItems:
                            "center",
                          gap:
                            "9px",
                          padding:
                            "9px 10px",
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
                        {film
                          ?.sample_image_path ? (
                          <img
                            src={
                              film.sample_image_path
                            }
                            alt=""
                            style={{
                              width:
                                "43px",
                              height:
                                "43px",
                              flex:
                                "0 0 43px",
                              objectFit:
                                "cover",
                              borderRadius:
                                "7px",
                              border:
                                "1px solid #e5e7eb",
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              width:
                                "43px",
                              height:
                                "43px",
                              flex:
                                "0 0 43px",
                              borderRadius:
                                "7px",
                              border:
                                "1px solid #e5e7eb",
                              background:
                                film?.color_hex ||
                                "#ffffff",
                            }}
                          />
                        )}

                        <div
                          style={{
                            flex: 1,
                            minWidth: 0,
                          }}
                        >
                          <div
                            style={{
                              fontWeight:
                                "bold",
                              fontSize:
                                "13px",
                            }}
                          >
                            {
                              area.label
                            }

                            {changed && (
                              <span
                                style={{
                                  marginLeft:
                                    "5px",
                                  color:
                                    "#7c3aed",
                                  fontSize:
                                    "10px",
                                }}
                              >
                                변경
                              </span>
                            )}
                          </div>

                          <div
                            style={{
                              fontWeight:
                                "bold",
                              fontSize:
                                "14px",
                              whiteSpace:
                                "nowrap",
                              overflow:
                                "hidden",
                              textOverflow:
                                "ellipsis",
                            }}
                          >
                            {film
                              ?.product_code ||
                              ""}
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
                            flex:
                              "0 0 auto",
                            padding:
                              "8px 9px",
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
                            fontWeight:
                              "bold",
                            fontSize:
                              "12px",
                          }}
                        >
                          {editing
                            ? "닫기"
                            : "변경"}
                        </button>
                      </div>

                      {/* 필름 변경 선택기 */}

                      {editing && (
                        <div
                          style={{
                            marginTop:
                              "7px",
                            padding:
                              "11px",
                            border:
                              "1px solid #d1d5db",
                            borderRadius:
                              "11px",
                            background:
                              "#ffffff",
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
                              gap:
                                "8px",
                              marginBottom:
                                "8px",
                            }}
                          >
                            <strong
                              style={{
                                fontSize:
                                  "14px",
                              }}
                            >
                              {
                                area.label
                              }{" "}
                              필름 변경
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
                                기본 필름
                              </button>
                            )}
                          </div>

                          <FilmColorPicker
                            key={`picker-${area.key}`}
                            onSelect={(
                              film
                            ) =>
                              handleAreaFilmSelect(
                                area.key,
                                film
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
                marginTop:
                  "8px",
                padding:
                  "9px 10px",
                borderRadius:
                  "9px",
                background:
                  "#f8fafc",
                color:
                  "#475569",
                fontSize:
                  "12px",
              }}
            >
              {changedAreaCount ===
              0
                ? `현재 ${installAreas.length}개 부위 모두 ${product.product_code} 필름이 적용됩니다.`
                : `${installAreas.length}개 부위 중 ${changedAreaCount}개 부위의 필름을 다르게 선택했습니다.`}
            </div>
          </div>
        )}

      {/* ===================================================
          5. 생성 버튼
          =================================================== */}

      {!resultUrl && (
        <button
          type="button"
          disabled={loading}
          onClick={
            generateVirtualImage
          }
          style={{
            width: "100%",
            marginTop: "14px",
            padding: "15px",
            border: "none",
            borderRadius: "12px",
            background: "#5d4037",
            color: "#ffffff",
            fontSize: "16px",
            fontWeight: "bold",
            opacity:
              loading
                ? 0.65
                : 1,
          }}
        >
          {loading
            ? "가상 시공 생성 중..."
            : useSplitTone
              ? `${installAreas.length}개 부위로 가상 시공하기`
              : "이 필름으로 가상 시공하기"}
        </button>
      )}

      {/* 메시지 */}

      {message && (
        <div
          style={{
            marginTop: "10px",
            padding: "10px",
            borderRadius: "9px",
            background: "#f8fafc",
            lineHeight: 1.5,
            fontSize: "13px",
          }}
        >
          {message}
        </div>
      )}

      {/* ===================================================
          결과
          =================================================== */}

      {resultUrl && (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(2, minmax(0, 1fr))",
              gap: "7px",
              marginTop: "14px",
            }}
          >
            <div>
              <strong
                style={{
                  fontSize:
                    "13px",
                }}
              >
                원본
              </strong>

              <img
                src={
                  selectedImage.preview
                }
                alt="원본"
                style={{
                  display:
                    "block",
                  width:
                    "100%",
                  marginTop:
                    "5px",
                  borderRadius:
                    "10px",
                }}
              />
            </div>

            <div>
              <strong
                style={{
                  fontSize:
                    "13px",
                }}
              >
                가상 시공
              </strong>

              <img
                src={resultUrl}
                alt="가상 시공 결과"
                style={{
                  display:
                    "block",
                  width:
                    "100%",
                  marginTop:
                    "5px",
                  borderRadius:
                    "10px",
                }}
              />
            </div>
          </div>

          <a
            href={resultUrl}
            download={`virtual-${
              product.product_code ||
              "film"
            }.webp`}
            style={{
              display: "block",
              marginTop: "10px",
              padding: "12px",
              border:
                "1px solid #d1d5db",
              borderRadius:
                "10px",
              color: "#111827",
              textAlign:
                "center",
              textDecoration:
                "none",
              fontWeight:
                "bold",
              fontSize:
                "14px",
            }}
          >
            가상 시공 이미지 저장
          </a>

          <button
            type="button"
            onClick={
              onRequestDetail
            }
            style={{
              width: "100%",
              marginTop: "8px",
              padding: "14px",
              border: "none",
              borderRadius:
                "10px",
              background:
                "#111827",
              color: "#ffffff",
              fontSize: "16px",
              fontWeight:
                "bold",
            }}
          >
            이 색상으로 상세견적 신청
          </button>

          <button
            type="button"
            onClick={
              generateVirtualImage
            }
            disabled={loading}
            style={{
              width: "100%",
              marginTop: "8px",
              padding: "12px",
              border:
                "1px solid #d1d5db",
              borderRadius:
                "10px",
              background:
                "#ffffff",
              fontWeight:
                "bold",
            }}
          >
            {loading
              ? "다시 생성 중..."
              : "가상 시공 다시 만들기"}
          </button>
        </>
      )}

      <p
        style={{
          margin:
            "12px 0 0",
          color:
            "#6b7280",
          fontSize:
            "11px",
          lineHeight: 1.5,
        }}
      >
        가상 이미지는 이해를 돕기 위한
        참고용이며 실제 필름의 색상과
        차이가 있을 수 있습니다.
      </p>
    </section>
  );
    }
