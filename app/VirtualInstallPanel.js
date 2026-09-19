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
   * 단순 싱크대 분석일 경우
   * 기존처럼 상부장 + 하부장 기본 생성
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

  const seen =
    new Set();

  for (const area of areas) {
    if (!seen.has(area.key)) {
      seen.add(area.key);
      unique.push(area);
    }
  }

  /*
   * 2부위 미만이면
   * 부분톤 기능 사용 안 함
   */

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
 * 필름 이름
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

/*
 * =========================================================
 * 필름 설명
 * =========================================================
 */

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

  /*
   * 부분톤 사용 여부
   */

  const [
    useSplitTone,
    setUseSplitTone,
  ] = useState(false);

  /*
   * 부위별 변경 필름
   *
   * 값이 없으면 메인 product 사용
   */

  const [
    areaFilms,
    setAreaFilms,
  ] = useState({});

  /*
   * 현재 열려있는 필름 선택기
   *
   * 한 번에 하나만 열림
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
   * 필름 / 사진 변경 시 결과 초기화
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
   * 부분톤 불가능해지면 초기화
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
   * 분석 부위 변경 시
   * 필요 없는 저장값 제거
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
   * 특정 부위에 실제 적용되는 필름
   *
   * 별도 선택값이 없으면
   * 메인 product
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
   * 필름 변경
   *
   * 선택 즉시 Picker 닫기
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

    setEditingAreaKey("");
  }

  /*
   * =======================================================
   * 메인 필름으로 되돌리기
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
   * 모든 부위 메인 필름
   * =======================================================
   */

  function resetAllAreaFilms() {
    setAreaFilms({});
    setEditingAreaKey("");
  }

  /*
   * =======================================================
   * API에 보낼 부위별 필름
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
   * 메인 필름과 다른 부위 개수
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
       * ===================================================
       * 기본 필름
       * ===================================================
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
       * ===================================================
       * 부분톤
       * ===================================================
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
       * ===================================================
       * API
       * ===================================================
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
        padding: "18px",
        border:
          "1px solid #e5e7eb",
        borderRadius: "18px",
        background: "#ffffff",
      }}
    >
      <h2
        style={{
          marginTop: 0,
          marginBottom:
            "14px",
        }}
      >
        가상 시공 미리보기
      </h2>

      {/* ===================================================
          사진 선택
          =================================================== */}

      {images.length > 1 && (
        <>
          <strong>
            가상 시공할 사진 선택
          </strong>

          <div
            style={{
              display: "flex",
              gap: "8px",
              overflowX: "auto",
              marginTop: "10px",
              paddingBottom: "5px",
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
                      "0 0 82px",
                    padding: "3px",
                    borderRadius:
                      "10px",
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
                        "6px",
                    }}
                  />
                </button>
              )
            )}
          </div>
        </>
      )}

      {/* ===================================================
          메인 선택 필름
          =================================================== */}

      <div
        style={{
          marginTop: "14px",
          padding: "14px",
          borderRadius: "12px",
          background: "#f3f4f6",
          lineHeight: 1.55,
        }}
      >
        <div
          style={{
            fontSize: "13px",
            color: "#6b7280",
            marginBottom: "3px",
          }}
        >
          선택 필름
        </div>

        <strong>
          {getFilmTitle(
            product
          )}
        </strong>

        <div>
          {getFilmDescription(
            product
          )}
        </div>

        {product.sample_image_path && (
          <img
            src={
              product.sample_image_path
            }
            alt={`${product.product_code} 필름 샘플`}
            style={{
              display: "block",
              width: "100%",
              maxWidth: "150px",
              marginTop: "9px",
              borderRadius: "9px",
              border:
                "1px solid #e5e7eb",
            }}
          />
        )}
      </div>

      {/* ===================================================
          부분톤 선택
          =================================================== */}

      {canSplitTone && (
        <div
          style={{
            marginTop: "14px",
            padding: "14px",
            border:
              "1px solid #d1d5db",
            borderRadius: "14px",
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

          <p
            style={{
              margin:
                "5px 0 11px",
              color:
                "#6b7280",
              fontSize:
                "13px",
              lineHeight: 1.5,
            }}
          >
            필요한 부위만 필름을
            변경할 수 있습니다.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "1fr 1fr",
              gap: "7px",
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
                  "12px 7px",
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
                  "12px 7px",
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
              }}
            >
              부분 톤 다르게
            </button>
          </div>
        </div>
      )}

      {/* ===================================================
          부위별 필름 카드
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
                      "6px 9px",
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
                gap: "8px",
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
                      <div
                        style={{
                          padding:
                            "11px 12px",
                          border:
                            editing
                              ? "2px solid #5d4037"
                              : changed
                                ? "1px solid #a78bfa"
                                : "1px solid #e5e7eb",
                          borderRadius:
                            "12px",
                          background:
                            changed
                              ? "#f5f3ff"
                              : "#ffffff",
                        }}
                      >
                        <div
                          style={{
                            display:
                              "flex",
                            alignItems:
                              "center",
                            gap:
                              "10px",
                          }}
                        >
                          {film
                            ?.sample_image_path && (
                            <img
                              src={
                                film.sample_image_path
                              }
                              alt=""
                              style={{
                                width:
                                  "48px",
                                height:
                                  "48px",
                                flex:
                                  "0 0 48px",
                                objectFit:
                                  "cover",
                                borderRadius:
                                  "8px",
                                border:
                                  "1px solid #e5e7eb",
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
                                fontSize:
                                  "13px",
                                fontWeight:
                                  "bold",
                                marginBottom:
                                  "2px",
                              }}
                            >
                              {
                                area.label
                              }

                              {changed && (
                                <span
                                  style={{
                                    marginLeft:
                                      "6px",
                                    color:
                                      "#7c3aed",
                                    fontSize:
                                      "11px",
                                  }}
                                >
                                  다른 필름
                                </span>
                              )}
                            </div>

                            <div
                              style={{
                                fontSize:
                                  "14px",
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
                                marginTop:
                                  "1px",
                                color:
                                  "#6b7280",
                                fontSize:
                                  "12px",
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
                                "9px 11px",
                              border:
                                "1px solid #d1d5db",
                              borderRadius:
                                "9px",
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
                                "13px",
                            }}
                          >
                            {editing
                              ? "닫기"
                              : "필름 변경"}
                          </button>
                        </div>

                        {changed && (
                          <button
                            type="button"
                            onClick={() =>
                              resetAreaFilm(
                                area.key
                              )
                            }
                            style={{
                              marginTop:
                                "8px",
                              padding:
                                "6px 9px",
                              border:
                                "none",
                              borderRadius:
                                "7px",
                              background:
                                "#ede9fe",
                              color:
                                "#5b21b6",
                              fontSize:
                                "12px",
                              fontWeight:
                                "bold",
                            }}
                          >
                            메인 필름으로
                          </button>
                        )}
                      </div>

                      {/* ===================================
                          현재 선택한 한 부위만
                          FilmColorPicker 표시
                          =================================== */}

                      {editing && (
                        <div
                          style={{
                            marginTop:
                              "8px",
                            padding:
                              "12px",
                            border:
                              "1px solid #d1d5db",
                            borderRadius:
                              "12px",
                            background:
                              "#ffffff",
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
                              gap:
                                "8px",
                              marginBottom:
                                "10px",
                            }}
                          >
                            <div>
                              <strong>
                                {
                                  area.label
                                }{" "}
                                필름 변경
                              </strong>

                              <div
                                style={{
                                  marginTop:
                                    "2px",
                                  color:
                                    "#6b7280",
                                  fontSize:
                                    "12px",
                                }}
                              >
                                선택하면
                                자동으로
                                닫힙니다.
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() =>
                                setEditingAreaKey(
                                  ""
                                )
                              }
                              style={{
                                padding:
                                  "7px 10px",
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
                              닫기
                            </button>
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

            {/* 현재 조합 요약 */}

            <div
              style={{
                marginTop:
                  "10px",
                padding:
                  "10px 12px",
                borderRadius:
                  "10px",
                background:
                  "#f8fafc",
                color:
                  "#475569",
                fontSize:
                  "12px",
                lineHeight: 1.55,
              }}
            >
              {changedAreaCount ===
              0
                ? `현재 ${installAreas.length}개 부위 모두 ${product.product_code} 필름이 적용됩니다.`
                : `${installAreas.length}개 부위 중 ${changedAreaCount}개 부위에 다른 필름을 적용합니다.`}
            </div>
          </div>
        )}

      {/* ===================================================
          생성 버튼
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
            marginTop: "16px",
            padding: "16px",
            border: "none",
            borderRadius: "13px",
            background: "#5d4037",
            color: "#ffffff",
            fontSize: "17px",
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
            marginTop: "12px",
            padding: "12px",
            borderRadius: "10px",
            background: "#f8fafc",
            lineHeight: 1.6,
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
              gap: "8px",
              marginTop: "16px",
            }}
          >
            <div>
              <strong>
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
                    "7px",
                  borderRadius:
                    "12px",
                }}
              />
            </div>

            <div>
              <strong>
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
                    "7px",
                  borderRadius:
                    "12px",
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
              marginTop: "12px",
              padding: "14px",
              border:
                "1px solid #d1d5db",
              borderRadius:
                "12px",
              color: "#111827",
              textAlign:
                "center",
              textDecoration:
                "none",
              fontWeight:
                "bold",
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
              marginTop: "10px",
              padding: "15px",
              border: "none",
              borderRadius:
                "12px",
              background:
                "#111827",
              color: "#ffffff",
              fontSize: "17px",
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
              marginTop: "10px",
              padding: "14px",
              border:
                "1px solid #d1d5db",
              borderRadius:
                "12px",
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
          marginBottom: 0,
          color: "#6b7280",
          fontSize: "12px",
          lineHeight: 1.6,
        }}
      >
        가상 이미지는 이해를 돕기 위한
        참고용이며 실제 필름의 색상과
        차이가 있을 수 있습니다.
      </p>
    </section>
  );
      }
