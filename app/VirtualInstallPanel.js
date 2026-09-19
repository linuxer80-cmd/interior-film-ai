"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import FilmColorPicker from "./FilmColorPicker";

/*
 * =========================================================
 * 사진 고유값
 * =========================================================
 */

function getImageId(image, index) {
  return String(
    image?.id ||
      image?.key ||
      image?.name ||
      image?.file?.name ||
      index
  );
}

/*
 * =========================================================
 * 사진 미리보기 주소
 * =========================================================
 */

function getImagePreview(image) {
  return (
    image?.preview ||
    image?.previewUrl ||
    image?.url ||
    image?.src ||
    ""
  );
}

/*
 * =========================================================
 * 가상시공 종류
 * =========================================================
 */

const TARGET_TYPES = [
  {
    key: "kitchen",
    label: "싱크대·주방가구",
    description:
      "상부장·하부장·냉장고장 등을 시공합니다.",
  },
  {
    key: "door",
    label: "문·문틀",
    description:
      "문짝과 문틀을 구분해 시공합니다.",
  },
];

/*
 * =========================================================
 * 종류별 자동 적용 부위
 *
 * 사용자가 시공 부위를 체크하는 방식이 아닙니다.
 * 선택한 종류에 포함된 부위를 AI가 사진에서 찾아 적용합니다.
 * 사진에 없는 부위는 새로 만들지 않습니다.
 * =========================================================
 */

const TARGET_AREAS = {
  kitchen: [
    {
      key: "kitchen_upper",
      label: "상부장",
    },
    {
      key: "kitchen_lower",
      label: "하부장",
    },
    {
      key: "fridge_cabinet",
      label: "냉장고장",
    },
    {
      key: "tall_cabinet",
      label: "키큰장",
    },
    {
      key: "pantry_cabinet",
      label: "팬트리장",
    },
    {
      key: "island_cabinet",
      label: "아일랜드장",
    },
  ],

  door: [
    {
      key: "door_leaf",
      label: "문짝",
    },
    {
      key: "door_frame",
      label: "문틀",
    },
  ],
};

/*
 * =========================================================
 * 필름 API 데이터
 * =========================================================
 */

function makeFilmPayload(area, film) {
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
    return "필름을 선택하세요";
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
 * 결과 이미지 저장
 * =========================================================
 */

function downloadImage(
  imageUrl,
  fileName
) {
  if (!imageUrl) {
    return;
  }

  const link =
    document.createElement("a");

  link.href = imageUrl;
  link.download =
    fileName ||
    "virtual-install.webp";

  document.body.appendChild(link);
  link.click();
  link.remove();
}

/*
 * =========================================================
 * 공통 버튼
 * =========================================================
 */

function SelectButton({
  active,
  title,
  description,
  onClick,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%",
        padding: "13px",
        border: active
          ? "2px solid #6d28d9"
          : "1px solid #d1d5db",
        borderRadius: "12px",
        background: active
          ? "#f5f3ff"
          : "#ffffff",
        color: "#111827",
        textAlign: "left",
        cursor: "pointer",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent:
            "space-between",
          gap: "8px",
        }}
      >
        <strong
          style={{
            fontSize: "14px",
          }}
        >
          {title}
        </strong>

        <span
          style={{
            width: "22px",
            height: "22px",
            flex: "0 0 22px",
            display: "flex",
            alignItems: "center",
            justifyContent:
              "center",
            borderRadius: "50%",
            background: active
              ? "#6d28d9"
              : "#e5e7eb",
            color: "#ffffff",
            fontSize: "13px",
            fontWeight: "900",
          }}
        >
          {active ? "✓" : ""}
        </span>
      </div>

      {description && (
        <div
          style={{
            marginTop: "4px",
            color: "#6b7280",
            fontSize: "11px",
            lineHeight: 1.45,
          }}
        >
          {description}
        </div>
      )}
    </button>
  );
}

/*
 * =========================================================
 * 메인
 * =========================================================
 */

export default function VirtualInstallPanel({
  images = [],
  product,
  groups = [],
  useSplitTone = false,
  areaFilms = {},
  onUseSplitToneChange,
  onAreaFilmsChange,
  onRequestDetail,
}) {
  /*
   * 한 번에 선택할 사진 하나
   */
  const [
    selectedImageId,
    setSelectedImageId,
  ] = useState("");

  /*
   * 싱크대 또는 문·문틀
   */
  const [
    targetType,
    setTargetType,
  ] = useState("");

  /*
   * 모두 같은 컬러 또는 여러 톤
   */
  const [
    colorMode,
    setColorMode,
  ] = useState(
    useSplitTone
      ? "multi"
      : "single"
  );

  /*
   * 이 화면에서 사용하는 부위별 필름
   */
  const [
    localAreaFilms,
    setLocalAreaFilms,
  ] = useState(
    areaFilms || {}
  );

  const [
    result,
    setResult,
  ] = useState(null);

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    message,
    setMessage,
  ] = useState("");

  /*
   * 사진이 처음 들어오면 첫 번째 사진을 자동 선택합니다.
   */
  useEffect(() => {
    if (!images.length) {
      setSelectedImageId("");
      setResult(null);
      return;
    }

    const exists =
      images.some(
        (image, index) =>
          getImageId(
            image,
            index
          ) ===
          selectedImageId
      );

    if (!exists) {
      setSelectedImageId(
        getImageId(
          images[0],
          0
        )
      );
    }
  }, [
    images,
    selectedImageId,
  ]);

  /*
   * 부모에 저장된 부위별 필름과 동기화합니다.
   */
  useEffect(() => {
    setLocalAreaFilms(
      areaFilms || {}
    );
  }, [areaFilms]);

  /*
   * 부모의 여러 톤 상태와 동기화합니다.
   */
  useEffect(() => {
    setColorMode(
      useSplitTone
        ? "multi"
        : "single"
    );
  }, [useSplitTone]);

  /*
   * 사진·필름·옵션이 변경되면 이전 결과를 초기화합니다.
   */
  useEffect(() => {
    setResult(null);
    setMessage("");
  }, [
    selectedImageId,
    targetType,
    colorMode,
    product?.id,
    localAreaFilms,
  ]);

  /*
   * 현재 선택한 사진
   */
  const selectedImage =
    useMemo(() => {
      return (
        images.find(
          (image, index) =>
            getImageId(
              image,
              index
            ) ===
            selectedImageId
        ) || null
      );
    }, [
      images,
      selectedImageId,
    ]);

  /*
   * 선택 종류에 해당하는 자동 시공 부위
   */
  const targetAreas =
    useMemo(() => {
      return (
        TARGET_AREAS[
          targetType
        ] || []
      );
    }, [targetType]);

  /*
   * 여러 톤 사용 시 모든 부위에 기본 필름을 채웁니다.
   */
  useEffect(() => {
    if (
      colorMode !==
        "multi" ||
      !targetAreas.length ||
      !product
    ) {
      return;
    }

    setLocalAreaFilms(
      (previous) => {
        const next = {
          ...previous,
        };

        targetAreas.forEach(
          (area) => {
            if (!next[area.key]) {
              next[area.key] =
                product;
            }
          }
        );

        return next;
      }
    );
  }, [
    colorMode,
    targetAreas,
    product,
  ]);

  /*
   * 사진 하나 선택
   *
   * 기존처럼 여러 장을 동시에 체크하지 않고
   * 누른 사진 하나만 선택합니다.
   */
  function selectImage(
    imageId
  ) {
    if (loading) {
      return;
    }

    setSelectedImageId(
      imageId
    );

    setTargetType("");
  }

  /*
   * 시공 종류 선택
   */
  function selectTargetType(
    nextType
  ) {
    if (loading) {
      return;
    }

    setTargetType(
      nextType
    );
  }

  /*
   * 컬러 방식 선택
   */
  function selectColorMode(
    nextMode
  ) {
    if (loading) {
      return;
    }

    setColorMode(
      nextMode
    );

    const split =
      nextMode === "multi";

    if (
      onUseSplitToneChange
    ) {
      onUseSplitToneChange(
        split
      );
    }
  }

  /*
   * 부위별 필름 선택
   */
  function selectAreaFilm(
    areaKey,
    film
  ) {
    const next = {
      ...localAreaFilms,
      [areaKey]:
        film || product,
    };

    setLocalAreaFilms(
      next
    );

    if (
      onAreaFilmsChange
    ) {
      onAreaFilmsChange(
        next
      );
    }
  }

  /*
   * API 전송 데이터 만들기
   */
  function makeRequestForm() {
    const formData =
      new FormData();

    formData.append(
      "image",
      selectedImage.file
    );

    formData.append(
      "targetType",
      targetType
    );

    formData.append(
      "brand",
      product?.brand || ""
    );

    formData.append(
      "productCode",
      product?.product_code ||
        ""
    );

    formData.append(
      "productName",
      product?.product_name ||
        ""
    );

    formData.append(
      "texture",
      product?.texture || ""
    );

    formData.append(
      "colorFamily",
      product?.color_family ||
        ""
    );

    formData.append(
      "colorDescription",
      product?.color_description ||
        ""
    );

    formData.append(
      "colorHex",
      product?.color_hex ||
        ""
    );

    formData.append(
      "sampleImageUrl",
      product?.sample_image_path ||
        ""
    );

    const multiTone =
      colorMode === "multi";

    formData.append(
      "useSplitTone",
      multiTone
        ? "true"
        : "false"
    );

    /*
     * 모든 부위에 같은 컬러를 적용할 때도
     * 해당 종류의 적용 부위를 API에 명확하게 전달합니다.
     */
    const films =
      targetAreas.map(
        (area) =>
          makeFilmPayload(
            area,
            multiTone
              ? localAreaFilms[
                  area.key
                ] || product
              : product
          )
      );

    formData.append(
      "areaFilms",
      JSON.stringify(
        films
      )
    );

    return formData;
  }

  /*
   * 가상시공 실행
   */
  async function generateVirtualImage() {
    if (loading) {
      return;
    }

    if (!selectedImage) {
      setMessage(
        "가상시공할 사진을 선택해주세요."
      );
      return;
    }

    if (!targetType) {
      setMessage(
        "싱크대·주방가구 또는 문·문틀을 선택해주세요."
      );
      return;
    }

    if (!product) {
      setMessage(
        "먼저 필름 컬러를 선택해주세요."
      );
      return;
    }

    if (
      colorMode ===
      "multi"
    ) {
      const missing =
        targetAreas.find(
          (area) =>
            !localAreaFilms[
              area.key
            ]
        );

      if (missing) {
        setMessage(
          `${missing.label} 필름을 선택해주세요.`
        );
        return;
      }
    }

    setLoading(true);
    setResult(null);
    setMessage(
      "선택한 사진을 가상 시공하고 있습니다."
    );

    try {
      const response =
        await fetch(
          "/api/virtual-install",
          {
            method: "POST",
            body:
              makeRequestForm(),
          }
        );

      const data =
        await response
          .json()
          .catch(
            () => ({})
          );

      if (
        !response.ok ||
        !data?.imageUrl
      ) {
        throw new Error(
          data?.error ||
            "가상시공에 실패했습니다."
        );
      }

      setResult({
        image:
          selectedImage,
        imageUrl:
          data.imageUrl,
      });

      setMessage(
        "✅ 선택한 사진의 가상 시공이 완료되었습니다."
      );
    } catch (error) {
      console.error(
        "가상시공 오류:",
        error
      );

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

  if (
    !Array.isArray(images) ||
    !images.length ||
    !product
  ) {
    return null;
  }

  return (
    <section
      style={{
        marginTop: "14px",
        padding: "15px",
        border:
          "1px solid #e5e7eb",
        borderRadius: "18px",
        background:
          "#ffffff",
      }}
    >
      <div
        style={{
          fontSize: "18px",
          fontWeight: "900",
          color: "#111827",
        }}
      >
        가상 시공
      </div>

      <div
        style={{
          marginTop: "4px",
          color: "#6b7280",
          fontSize: "12px",
          lineHeight: 1.55,
        }}
      >
        사진 한 장과 시공 종류를 선택한 뒤
        컬러를 적용해보세요.
      </div>

      {/* 선택 필름 */}
      <div
        style={{
          marginTop: "13px",
          padding: "12px",
          borderRadius: "12px",
          background: "#f3f4f6",
        }}
      >
        <div
          style={{
            color: "#6b7280",
            fontSize: "11px",
            fontWeight: "700",
          }}
        >
          기본 선택 필름
        </div>

        <div
          style={{
            marginTop: "3px",
            color: "#111827",
            fontSize: "16px",
            fontWeight: "900",
          }}
        >
          {getFilmTitle(
            product
          )}
        </div>

        <div
          style={{
            marginTop: "2px",
            color: "#6b7280",
            fontSize: "12px",
          }}
        >
          {product.color_description ||
            product.color_family ||
            product.product_name ||
            ""}
        </div>
      </div>

      {/* 1. 사진 한 장 선택 */}
      <div
        style={{
          marginTop: "18px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent:
              "space-between",
            gap: "8px",
          }}
        >
          <strong
            style={{
              fontSize: "15px",
            }}
          >
            1. 가상시공할 사진
          </strong>

          <span
            style={{
              color: "#6d28d9",
              fontSize: "11px",
              fontWeight: "800",
            }}
          >
            한 장만 선택
          </span>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(2, minmax(0, 1fr))",
            gap: "9px",
            marginTop: "9px",
          }}
        >
          {images.map(
            (image, index) => {
              const imageId =
                getImageId(
                  image,
                  index
                );

              const active =
                selectedImageId ===
                imageId;

              return (
                <button
                  key={imageId}
                  type="button"
                  disabled={
                    loading
                  }
                  onClick={() =>
                    selectImage(
                      imageId
                    )
                  }
                  style={{
                    position:
                      "relative",
                    minWidth: 0,
                    padding: "4px",
                    border: active
                      ? "3px solid #6d28d9"
                      : "1px solid #d1d5db",
                    borderRadius:
                      "13px",
                    background:
                      "#ffffff",
                    cursor:
                      loading
                        ? "default"
                        : "pointer",
                  }}
                >
                  <img
                    src={getImagePreview(
                      image
                    )}
                    alt={`사진 ${
                      index + 1
                    }`}
                    style={{
                      display:
                        "block",
                      width: "100%",
                      aspectRatio:
                        "4 / 3",
                      objectFit:
                        "cover",
                      borderRadius:
                        "9px",
                    }}
                  />

                  <span
                    style={{
                      position:
                        "absolute",
                      top: "8px",
                      right: "8px",
                      width: "30px",
                      height: "30px",
                      display: "flex",
                      alignItems:
                        "center",
                      justifyContent:
                        "center",
                      borderRadius:
                        "50%",
                      background: active
                        ? "#6d28d9"
                        : "rgba(17,24,39,0.55)",
                      color:
                        "#ffffff",
                      fontSize:
                        "17px",
                      fontWeight:
                        "900",
                    }}
                  >
                    {active
                      ? "✓"
                      : ""}
                  </span>

                  <span
                    style={{
                      display:
                        "block",
                      padding:
                        "6px 3px 3px",
                      color:
                        "#111827",
                      fontSize:
                        "12px",
                      fontWeight:
                        "800",
                    }}
                  >
                    사진 {index + 1}
                  </span>
                </button>
              );
            }
          )}
        </div>
      </div>

      {/* 2. 시공 종류 */}
      <div
        style={{
          marginTop: "19px",
        }}
      >
        <strong
          style={{
            display: "block",
            marginBottom: "8px",
            fontSize: "15px",
          }}
        >
          2. 시공 종류
        </strong>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(2, minmax(0, 1fr))",
            gap: "8px",
          }}
        >
          {TARGET_TYPES.map(
            (type) => (
              <SelectButton
                key={type.key}
                active={
                  targetType ===
                  type.key
                }
                title={
                  type.label
                }
                description={
                  type.description
                }
                onClick={() =>
                  selectTargetType(
                    type.key
                  )
                }
              />
            )
          )}
        </div>
      </div>

      {/* 3. 컬러 적용 방식 */}
      {targetType && (
        <div
          style={{
            marginTop: "19px",
          }}
        >
          <strong
            style={{
              display: "block",
              marginBottom: "8px",
              fontSize: "15px",
            }}
          >
            3. 컬러 적용 방식
          </strong>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(2, minmax(0, 1fr))",
              gap: "8px",
            }}
          >
            <SelectButton
              active={
                colorMode ===
                "single"
              }
              title="모두 같은 컬러"
              description="기본 선택 필름을 전체 부위에 적용"
              onClick={() =>
                selectColorMode(
                  "single"
                )
              }
            />

            <SelectButton
              active={
                colorMode ===
                "multi"
              }
              title="부위별 여러 톤"
              description="각 부위의 필름을 따로 선택"
              onClick={() =>
                selectColorMode(
                  "multi"
                )
              }
            />
          </div>
        </div>
      )}

      {/* 모두 같은 컬러 안내 */}
      {targetType &&
        colorMode ===
          "single" && (
          <div
            style={{
              marginTop: "12px",
              padding: "12px",
              borderRadius:
                "11px",
              background:
                "#f5f3ff",
              color:
                "#5b21b6",
              fontSize:
                "12px",
              fontWeight:
                "700",
              lineHeight: 1.55,
            }}
          >
            {targetType ===
            "kitchen"
              ? "사진에 실제로 보이는 상부장·하부장·냉장고장·키큰장·팬트리장·아일랜드장에 같은 컬러를 적용합니다."
              : "사진에 실제로 보이는 문짝과 문틀에 같은 컬러를 적용합니다."}
          </div>
        )}

      {/* 부위별 여러 톤 */}
      {targetType &&
        colorMode ===
          "multi" && (
          <div
            style={{
              marginTop: "14px",
            }}
          >
            <div
              style={{
                marginBottom:
                  "10px",
                color:
                  "#5b21b6",
                fontSize:
                  "12px",
                fontWeight:
                  "800",
              }}
            >
              부위별 필름 선택
            </div>

            {targetAreas.map(
              (area) => {
                const film =
                  localAreaFilms[
                    area.key
                  ] || product;

                return (
                  <div
                    key={
                      area.key
                    }
                    style={{
                      marginBottom:
                        "12px",
                      padding:
                        "12px",
                      border:
                        "1px solid #e5e7eb",
                      borderRadius:
                        "13px",
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
                      }}
                    >
                      <strong
                        style={{
                          fontSize:
                            "15px",
                          color:
                            "#111827",
                        }}
                      >
                        {area.label}
                      </strong>

                      <span
                        style={{
                          maxWidth:
                            "65%",
                          color:
                            "#6d28d9",
                          fontSize:
                            "12px",
                          fontWeight:
                            "800",
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
                      </span>
                    </div>

                    <FilmColorPicker
                      value={film}
                      onSelect={(
                        selectedFilm
                      ) =>
                        selectAreaFilm(
                          area.key,
                          selectedFilm ||
                            product
                        )
                      }
                    />
                  </div>
                );
              }
            )}

            <div
              style={{
                padding: "11px",
                borderRadius:
                  "10px",
                background:
                  "#f9fafb",
                color:
                  "#6b7280",
                fontSize:
                  "11px",
                lineHeight: 1.5,
              }}
            >
              사진에 없는 가구나 부위는 새로
              만들지 않고 자동으로 제외합니다.
            </div>
          </div>
        )}

      {/* 실행 버튼 */}
      {targetType && (
        <button
          type="button"
          disabled={
            loading ||
            !selectedImage
          }
          onClick={
            generateVirtualImage
          }
          style={{
            width: "100%",
            marginTop: "17px",
            padding: "15px",
            border: "none",
            borderRadius:
              "13px",
            background:
              loading
                ? "#9ca3af"
                : "#6b463c",
            color: "#ffffff",
            fontSize: "16px",
            fontWeight: "900",
            cursor:
              loading
                ? "default"
                : "pointer",
          }}
        >
          {loading
            ? "가상 시공 중..."
            : "선택한 사진 가상 시공하기"}
        </button>
      )}

      {/* 상태 메시지 */}
      {message && (
        <div
          style={{
            marginTop: "12px",
            padding: "12px",
            borderRadius: "11px",
            background:
              message.startsWith(
                "❌"
              )
                ? "#fef2f2"
                : "#f9fafb",
            color:
              message.startsWith(
                "❌"
              )
                ? "#b91c1c"
                : "#374151",
            fontSize: "13px",
            lineHeight: 1.5,
          }}
        >
          {message}
        </div>
      )}

      {/* 결과 */}
      {result && (
        <div
          style={{
            marginTop: "20px",
          }}
        >
          <div
            style={{
              marginBottom: "9px",
              fontSize: "17px",
              fontWeight: "900",
              color: "#111827",
            }}
          >
            가상시공 결과
          </div>

          <div
            style={{
              padding: "10px",
              border:
                "1px solid #e5e7eb",
              borderRadius:
                "15px",
              background:
                "#ffffff",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(2, minmax(0, 1fr))",
                gap: "8px",
              }}
            >
              <div>
                <div
                  style={{
                    marginBottom:
                      "5px",
                    fontSize:
                      "12px",
                    fontWeight:
                      "800",
                  }}
                >
                  원본
                </div>

                <img
                  src={getImagePreview(
                    result.image
                  )}
                  alt="원본"
                  style={{
                    display:
                      "block",
                    width: "100%",
                    aspectRatio:
                      "4 / 3",
                    objectFit:
                      "cover",
                    borderRadius:
                      "10px",
                  }}
                />
              </div>

              <div>
                <div
                  style={{
                    marginBottom:
                      "5px",
                    fontSize:
                      "12px",
                    fontWeight:
                      "800",
                  }}
                >
                  가상시공
                </div>

                <img
                  src={
                    result.imageUrl
                  }
                  alt="가상시공 결과"
                  style={{
                    display:
                      "block",
                    width: "100%",
                    aspectRatio:
                      "4 / 3",
                    objectFit:
                      "cover",
                    borderRadius:
                      "10px",
                  }}
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                downloadImage(
                  result.imageUrl,
                  `virtual-install-${Date.now()}.webp`
                )
              }
              style={{
                width: "100%",
                marginTop: "10px",
                padding: "12px",
                border:
                  "1px solid #d1d5db",
                borderRadius:
                  "10px",
                background:
                  "#ffffff",
                color:
                  "#111827",
                fontSize:
                  "14px",
                fontWeight:
                  "800",
                cursor:
                  "pointer",
              }}
            >
              결과 이미지 저장
            </button>
          </div>

          {onRequestDetail && (
            <button
              type="button"
              onClick={
                onRequestDetail
              }
              style={{
                width: "100%",
                marginTop: "12px",
                padding: "15px",
                border: "none",
                borderRadius:
                  "12px",
                background:
                  "#111827",
                color:
                  "#ffffff",
                fontSize:
                  "16px",
                fontWeight:
                  "900",
                cursor:
                  "pointer",
              }}
            >
              이 색상으로 상세견적 신청
            </button>
          )}
        </div>
      )}
    </section>
  );
          }
