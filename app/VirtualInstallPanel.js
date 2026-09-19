"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

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
 *
 * VirtualToneSelector와 동일한 기준을 사용한다.
 * =========================================================
 */

function detectInstallAreas(
  groups = []
) {
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
   * 주방
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

  /*
   * 하부장
   */

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

  /*
   * 일반 싱크대
   */

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

  /*
   * 냉장고장
   */

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

  /*
   * 키큰장
   */

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

  /*
   * 팬트리장
   */

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

  /*
   * 아일랜드장
   */

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
   * 2개 이상일 때만
   * 부분 톤 사용
   */

  if (unique.length < 2) {
    return [];
  }

  return unique;
}

/*
 * =========================================================
 * API용 부위별 필름 데이터
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
      film?.color_description ||
      "",

    colorHex:
      film?.color_hex || "",

    sampleImageUrl:
      film?.sample_image_path ||
      "",
  };
}

/*
 * =========================================================
 * 필름 제목
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

function getFilmDescription(
  film
) {
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
  images = [],
  product = null,
  groups = [],

  /*
   * page.js / VirtualToneSelector에서
   * 관리되는 부분 톤 상태
   */

  useSplitTone = false,
  areaFilms = {},

  onRequestDetail,
}) {
  /*
   * =======================================================
   * 상태
   * =======================================================
   */

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
   * =======================================================
   * 시공 부위
   * =======================================================
   */

  const installAreas =
    useMemo(
      () =>
        detectInstallAreas(
          groups
        ),
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
        images?.[0] ||
        null
      );
    }, [
      images,
      selectedImageId,
    ]);

  /*
   * =======================================================
   * 필름/사진/부분톤이 바뀌면
   * 이전 가상시공 결과 초기화
   * =======================================================
   */

  useEffect(() => {
    setResultUrl("");
    setMessage("");
  }, [
    product?.id,
    product?.product_code,
    selectedImageId,
    useSplitTone,
    areaFilms,
  ]);

  /*
   * =======================================================
   * API로 보낼 부위별 필름
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
            areaFilms?.[
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
   * 기본 필름과 다른 부위 수
   * =======================================================
   */

  const changedAreaCount =
    useMemo(() => {
      if (
        !product ||
        !canSplitTone
      ) {
        return 0;
      }

      return installAreas.filter(
        (area) => {
          const selected =
            areaFilms?.[
              area.key
            ];

          if (!selected) {
            return false;
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
            selected
              ?.product_code !==
            product
              ?.product_code
          );
        }
      ).length;
    }, [
      installAreas,
      areaFilms,
      product,
      canSplitTone,
    ]);

  /*
   * =======================================================
   * 가상시공 생성
   * =======================================================
   */

  async function generateVirtualImage() {
    if (loading) {
      return;
    }

    if (!product) {
      setMessage(
        "❌ 먼저 필름을 선택해주세요."
      );

      return;
    }

    if (!selectedImage) {
      setMessage(
        "❌ 가상 시공할 사진을 선택해주세요."
      );

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
       * ---------------------------------------------------
       * 고객 사진
       * ---------------------------------------------------
       */

      formData.append(
        "image",
        selectedImage.file
      );

      /*
       * ---------------------------------------------------
       * 기본 필름
       * ---------------------------------------------------
       */

      formData.append(
        "brand",
        product.brand || ""
      );

      formData.append(
        "productCode",
        product.product_code ||
          ""
      );

      formData.append(
        "productName",
        product.product_name ||
          ""
      );

      formData.append(
        "texture",
        product.texture || ""
      );

      formData.append(
        "colorFamily",
        product.color_family ||
          ""
      );

      formData.append(
        "colorDescription",
        product.color_description ||
          ""
      );

      formData.append(
        "colorHex",
        product.color_hex || ""
      );

      formData.append(
        "sampleImageUrl",
        product.sample_image_path ||
          ""
      );

      /*
       * ---------------------------------------------------
       * 부분 톤
       * ---------------------------------------------------
       */

      const splitEnabled =
        Boolean(
          useSplitTone &&
            canSplitTone
        );

      formData.append(
        "useSplitTone",
        splitEnabled
          ? "true"
          : "false"
      );

      /*
       * 부분 톤을 사용하는 경우
       * 모든 인식 부위를 전송
       *
       * 별도로 변경하지 않은 부위는
       * 기본 product가 들어간다.
       */

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
       * ---------------------------------------------------
       * API 호출
       * ---------------------------------------------------
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
          .catch(() => ({}));

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

      /*
       * ---------------------------------------------------
       * 완료 메시지
       * ---------------------------------------------------
       */

      if (
        result
          ?.multiReferenceUsed
      ) {
        setMessage(
          `✅ ${installAreas.length}개 시공 부위를 구분한 가상 시공 이미지가 완성되었습니다.`
        );
      } else if (
        result
          ?.sampleReferenceUsed
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
   * 아직 필름을 선택하지 않은 경우
   *
   * VirtualToneSelector는 page.js에서 별도로 보이므로
   * 여기서는 가상시공 실행 영역만 숨긴다.
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
   * 화면
   * =======================================================
   */

  return (
    <section
      style={{
        marginTop: "14px",
        padding: "16px",
        border:
          "1px solid #e5e7eb",
        borderRadius: "18px",
        background: "#ffffff",
      }}
    >
      {/* =================================================
          제목
          ================================================= */}

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
          <h2
            style={{
              margin: 0,
              fontSize: "20px",
            }}
          >
            가상 시공 미리보기
          </h2>

          <div
            style={{
              marginTop: "4px",
              color: "#6b7280",
              fontSize: "12px",
            }}
          >
            선택한 실제 필름을
            고객 사진에 적용합니다.
          </div>
        </div>

        {useSplitTone &&
          canSplitTone && (
            <div
              style={{
                flex: "0 0 auto",
                padding:
                  "5px 8px",
                borderRadius:
                  "20px",
                background:
                  "#f3e8ff",
                color:
                  "#6b21a8",
                fontSize:
                  "11px",
                fontWeight:
                  "bold",
              }}
            >
              {installAreas.length}
              개 부위
            </div>
          )}
      </div>

      {/* =================================================
          선택 필름 요약
          ================================================= */}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          marginTop: "12px",
          padding: "10px",
          borderRadius: "11px",
          background: "#f8fafc",
        }}
      >
        {product
          .sample_image_path ? (
          <img
            src={
              product.sample_image_path
            }
            alt={`${product.product_code || ""} 필름 샘플`}
            style={{
              width: "50px",
              height: "50px",
              flex: "0 0 50px",
              objectFit: "cover",
              borderRadius: "8px",
              border:
                "1px solid #e5e7eb",
              background:
                "#ffffff",
            }}
          />
        ) : (
          <div
            style={{
              width: "50px",
              height: "50px",
              flex: "0 0 50px",
              borderRadius: "8px",
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
              color: "#6b7280",
              fontSize: "11px",
            }}
          >
            기본 필름
          </div>

          <div
            style={{
              marginTop: "1px",
              fontWeight: "bold",
              fontSize: "15px",
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
              marginTop: "1px",
              color: "#4b5563",
              fontSize: "12px",
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

      {/* =================================================
          부분 톤 적용 요약
          ================================================= */}

      {useSplitTone &&
        canSplitTone && (
          <div
            style={{
              marginTop: "9px",
              padding:
                "9px 10px",
              borderRadius:
                "9px",
              background:
                "#faf5ff",
              color:
                "#6b21a8",
              fontSize:
                "12px",
              lineHeight: 1.5,
            }}
          >
            {changedAreaCount >
            0
              ? `${installAreas.length}개 부위 중 ${changedAreaCount}개 부위에 다른 필름을 적용합니다.`
              : `${installAreas.length}개 부위를 각각 구분하여 가상 시공합니다.`}
          </div>
        )}

      {/* =================================================
          부위별 적용 필름 간단 요약
          ================================================= */}

      {useSplitTone &&
        canSplitTone && (
          <div
            style={{
              display: "grid",
              gap: "5px",
              marginTop: "9px",
            }}
          >
            {installAreas.map(
              (area) => {
                const film =
                  areaFilms?.[
                    area.key
                  ] ||
                  product;

                const changed =
                  Boolean(
                    areaFilms?.[
                      area.key
                    ] &&
                      (
                        areaFilms?.[
                          area.key
                        ]?.id
                          ? areaFilms[
                              area.key
                            ].id !==
                            product?.id
                          : areaFilms[
                              area.key
                            ]
                              ?.product_code !==
                            product
                              ?.product_code
                      )
                  );

                return (
                  <div
                    key={
                      area.key
                    }
                    style={{
                      display:
                        "flex",
                      alignItems:
                        "center",
                      gap: "7px",
                      padding:
                        "7px 8px",
                      border:
                        "1px solid #e5e7eb",
                      borderRadius:
                        "8px",
                      background:
                        changed
                          ? "#faf5ff"
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
                            "30px",
                          height:
                            "30px",
                          flex:
                            "0 0 30px",
                          objectFit:
                            "cover",
                          borderRadius:
                            "5px",
                          border:
                            "1px solid #e5e7eb",
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width:
                            "30px",
                          height:
                            "30px",
                          flex:
                            "0 0 30px",
                          borderRadius:
                            "5px",
                          border:
                            "1px solid #e5e7eb",
                          background:
                            film
                              ?.color_hex ||
                            "#ffffff",
                        }}
                      />
                    )}

                    <strong
                      style={{
                        flex:
                          "0 0 68px",
                        fontSize:
                          "12px",
                      }}
                    >
                      {area.label}
                    </strong>

                    <div
                      style={{
                        flex: 1,
                        minWidth: 0,
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
                      {film
                        ?.product_code ||
                        "기본 필름"}
                    </div>

                    {changed && (
                      <span
                        style={{
                          flex:
                            "0 0 auto",
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
                );
              }
            )}
          </div>
        )}

      {/* =================================================
          사진 선택
          ================================================= */}

      {images.length > 1 && (
        <div
          style={{
            marginTop: "13px",
          }}
        >
          <div
            style={{
              fontWeight: "bold",
              fontSize: "13px",
              marginBottom: "7px",
            }}
          >
            가상 시공할 사진
          </div>

          <div
            style={{
              display: "flex",
              gap: "7px",
              overflowX: "auto",
              paddingBottom: "3px",
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
                    padding: "2px",
                    borderRadius:
                      "9px",
                    border:
                      selectedImage
                        ?.id ===
                      item.id
                        ? "3px solid #111827"
                        : "1px solid #d1d5db",
                    background:
                      "#ffffff",
                    cursor:
                      "pointer",
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
                      width: "100%",
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

      {/* =================================================
          생성 버튼
          ================================================= */}

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
            cursor:
              loading
                ? "default"
                : "pointer",
            opacity:
              loading
                ? 0.65
                : 1,
          }}
        >
          {loading
            ? "가상 시공 생성 중..."
            : useSplitTone &&
                canSplitTone
              ? `${installAreas.length}개 부위로 가상 시공하기`
              : "이 필름으로 가상 시공하기"}
        </button>
      )}

      {/* =================================================
          메시지
          ================================================= */}

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

      {/* =================================================
          결과
          ================================================= */}

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
            {/* 원본 */}

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
                  width: "100%",
                  marginTop: "5px",
                  borderRadius:
                    "10px",
                }}
              />
            </div>

            {/* 결과 */}

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
                  width: "100%",
                  marginTop: "5px",
                  borderRadius:
                    "10px",
                }}
              />
            </div>
          </div>

          {/* 저장 */}

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
              borderRadius: "10px",
              color: "#111827",
              textAlign: "center",
              textDecoration:
                "none",
              fontWeight: "bold",
              fontSize: "14px",
            }}
          >
            가상 시공 이미지 저장
          </a>

          {/* 상세견적 */}

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
              borderRadius: "10px",
              background: "#111827",
              color: "#ffffff",
              fontSize: "16px",
              fontWeight: "bold",
              cursor: "pointer",
            }}
          >
            이 색상으로 상세견적 신청
          </button>

          {/* 다시 생성 */}

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
              borderRadius: "10px",
              background: "#ffffff",
              fontWeight: "bold",
              cursor:
                loading
                  ? "default"
                  : "pointer",
              opacity:
                loading
                  ? 0.65
                  : 1,
            }}
          >
            {loading
              ? "다시 생성 중..."
              : "가상 시공 다시 만들기"}
          </button>
        </>
      )}

      {/* =================================================
          안내
          ================================================= */}

      <p
        style={{
          margin: "12px 0 0",
          color: "#6b7280",
          fontSize: "11px",
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
