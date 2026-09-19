"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

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
      ? group.photos.flatMap(
          (photo) => [
            photo?.analysis
              ?.category,
            photo?.analysis
              ?.subCategory,
            photo?.analysis
              ?.sub_category,
            photo?.analysis
              ?.description,

            ...(Array.isArray(
              photo?.analysis
                ?.tags
            )
              ? photo.analysis
                  .tags
              : []),
          ]
        )
      : []),
  ]
    .filter(Boolean)
    .join(" ");
}

function includesAny(
  text,
  words
) {
  const normalized =
    normalizeText(text);

  return words.some((word) =>
    normalized.includes(
      normalizeText(word)
    )
  );
}

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

  const hasUpper =
    includesAny(fullText, [
      "상부장",
      "상부 장",
      "벽장",
      "벽부장",
      "wall cabinet",
      "upper cabinet",
    ]);

  const hasLower =
    includesAny(fullText, [
      "하부장",
      "하부 장",
      "베이스장",
      "base cabinet",
      "lower cabinet",
    ]);

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

  const unique = [];
  const seen = new Set();

  for (const area of areas) {
    if (
      !seen.has(area.key)
    ) {
      seen.add(area.key);
      unique.push(area);
    }
  }

  if (unique.length < 2) {
    return [];
  }

  return unique;
}

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
      film?.product_code ||
      "",

    productName:
      film?.product_name ||
      "",

    texture:
      film?.texture || "",

    colorFamily:
      film?.color_family ||
      "",

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

export default function VirtualInstallPanel({
  images,
  product,
  groups = [],
  useSplitTone = false,
  areaFilms = {},
  onRequestDetail,
}) {
  /*
   * 선택된 사진 ID 배열
   */

  const [
    selectedImageIds,
    setSelectedImageIds,
  ] = useState([]);

  /*
   * 사진별 가상시공 결과
   */

  const [
    results,
    setResults,
  ] = useState([]);

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    message,
    setMessage,
  ] = useState("");

  const [
    progress,
    setProgress,
  ] = useState({
    current: 0,
    total: 0,
  });

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
   * 사진이 추가되면 전체 사진을
   * 기본 선택
   */

  useEffect(() => {
    const validIds =
      new Set(
        (images || []).map(
          (item) =>
            item.id
        )
      );

    setSelectedImageIds(
      (previous) => {
        const kept =
          previous.filter(
            (id) =>
              validIds.has(id)
          );

        if (
          kept.length > 0
        ) {
          return kept;
        }

        return (
          images || []
        ).map(
          (item) =>
            item.id
        );
      }
    );
  }, [images]);

  /*
   * 선택된 실제 사진 객체
   */

  const selectedImages =
    useMemo(
      () =>
        (images || []).filter(
          (item) =>
            selectedImageIds.includes(
              item.id
            )
        ),
      [
        images,
        selectedImageIds,
      ]
    );

  /*
   * 필름 또는 사진 선택이 바뀌면
   * 이전 결과 초기화
   */

  useEffect(() => {
    setResults([]);
    setMessage("");
  }, [
    product?.id,
    selectedImageIds.join(
      "|"
    ),
    useSplitTone,
    areaFilms,
  ]);

  /*
   * API에 전달할 부위별 필름
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

  function toggleImage(id) {
    if (loading) {
      return;
    }

    setSelectedImageIds(
      (previous) =>
        previous.includes(id)
          ? previous.filter(
              (value) =>
                value !== id
            )
          : [
              ...previous,
              id,
            ]
    );
  }

  /*
   * 사진 한 장에 사용할
   * API 요청 데이터 생성
   */

  function makeRequestForm(
    image
  ) {
    const formData =
      new FormData();

    formData.append(
      "image",
      image.file
    );

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
      product.color_hex ||
        ""
    );

    formData.append(
      "sampleImageUrl",
      product.sample_image_path ||
        ""
    );

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

    return formData;
  }

  /*
   * 선택된 사진을 순서대로
   * 가상시공
   */

  async function generateVirtualImages() {
    if (
      loading ||
      selectedImages.length ===
        0
    ) {
      return;
    }

    setLoading(true);
    setResults([]);

    setProgress({
      current: 0,
      total:
        selectedImages.length,
    });

    setMessage(
      "선택한 사진을 순서대로 가상 시공하고 있습니다."
    );

    const completed = [];

    try {
      for (
        let index = 0;
        index <
        selectedImages.length;
        index += 1
      ) {
        const image =
          selectedImages[
            index
          ];

        setProgress({
          current:
            index + 1,
          total:
            selectedImages.length,
        });

        setMessage(
          `사진 ${
            index + 1
          }/${
            selectedImages.length
          } 가상 시공 중...`
        );

        const response =
          await fetch(
            "/api/virtual-install",
            {
              method:
                "POST",

              body:
                makeRequestForm(
                  image
                ),
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
              `사진 ${
                index + 1
              } 가상 시공에 실패했습니다.`
          );
        }

        completed.push({
          image,
          imageUrl:
            result.imageUrl,
        });

        /*
         * 한 장 완료될 때마다
         * 바로 화면에 표시
         */

        setResults([
          ...completed,
        ]);
      }

      setMessage(
        `✅ 선택한 사진 ${completed.length}장의 가상 시공이 완료되었습니다.`
      );
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
   * 필름이나 사진이 없으면
   * 패널 표시하지 않음
   */

  if (
    !product ||
    !images?.length
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
        borderRadius: "17px",
        background: "#ffffff",
        boxShadow:
          "0 8px 24px rgba(15,23,42,0.05)",
      }}
    >
      {/* 제목 */}

      <div
        style={{
          display: "flex",
          alignItems:
            "center",
          justifyContent:
            "space-between",
          gap: "10px",
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: "18px",
          }}
        >
          🎨 가상시공
        </h2>

        <span
          style={{
            color: "#6b7280",
            fontSize: "12px",
          }}
        >
          {
            selectedImageIds.length
          }
          장 선택
        </span>
      </div>

      {/* 선택 필름 요약 */}

      <div
        style={{
          display: "flex",
          alignItems:
            "center",
          gap: "10px",
          marginTop: "11px",
          padding: "10px",
          borderRadius: "12px",
          background: "#f3f4f6",
        }}
      >
        {product.sample_image_path ? (
          <img
            src={
              product.sample_image_path
            }
            alt="선택 필름"
            style={{
              width: "47px",
              height: "47px",
              objectFit:
                "cover",
              borderRadius:
                "9px",
            }}
          />
        ) : (
          <div
            style={{
              width: "47px",
              height: "47px",
              borderRadius:
                "9px",
              background:
                product.color_hex ||
                "#ffffff",
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
              color: "#6b7280",
              fontSize: "11px",
            }}
          >
            선택 필름
          </div>

          <div
            style={{
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
              product
            )}
          </div>

          <div
            style={{
              color: "#6b7280",
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

      {/* 부위별 필름 안내 */}

      {useSplitTone &&
        canSplitTone && (
          <div
            style={{
              marginTop: "10px",
              padding: "8px 10px",
              borderRadius: "9px",
              background: "#f5f3ff",
              color: "#5b21b6",
              fontSize: "12px",
              fontWeight: "bold",
            }}
          >
            부위별로 선택한 필름을
            적용합니다.
          </div>
        )}

      {/* 사진 선택 제목 */}

      <div
        style={{
          display: "flex",
          alignItems:
            "center",
          justifyContent:
            "space-between",
          marginTop: "13px",
          marginBottom: "7px",
        }}
      >
        <strong
          style={{
            fontSize: "13px",
          }}
        >
          가상시공할 사진
        </strong>

        <button
          type="button"
          disabled={loading}
          onClick={() =>
            setSelectedImageIds(
              selectedImageIds.length ===
                images.length
                ? []
                : images.map(
                    (item) =>
                      item.id
                  )
            )
          }
          style={{
            border: "none",
            background:
              "transparent",
            color: "#5b21b6",
            fontSize: "12px",
            fontWeight: "bold",
          }}
        >
          {selectedImageIds.length ===
          images.length
            ? "전체 해제"
            : "전체 선택"}
        </button>
      </div>

      {/* 사진 목록 */}

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(2, minmax(0, 1fr))",
          gap: "8px",
        }}
      >
        {images.map(
          (
            item,
            index
          ) => {
            const checked =
              selectedImageIds.includes(
                item.id
              );

            return (
              <button
                key={item.id}
                type="button"
                disabled={
                  loading
                }
                onClick={() =>
                  toggleImage(
                    item.id
                  )
                }
                aria-pressed={
                  checked
                }
                style={{
                  position:
                    "relative",
                  padding: "2px",
                  borderRadius:
                    "11px",
                  border:
                    checked
                      ? "3px solid #5b21b6"
                      : "1px solid #d1d5db",
                  background:
                    "#ffffff",
                  overflow:
                    "hidden",
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
                      "4 / 3",
                    objectFit:
                      "cover",
                    borderRadius:
                      "7px",
                  }}
                />

                <span
                  style={{
                    position:
                      "absolute",
                    right: "7px",
                    top: "7px",
                    width: "24px",
                    height: "24px",
                    display:
                      "grid",
                    placeItems:
                      "center",
                    borderRadius:
                      "50%",
                    background:
                      checked
                        ? "#5b21b6"
                        : "rgba(255,255,255,0.9)",
                    color:
                      checked
                        ? "#ffffff"
                        : "#9ca3af",
                    fontWeight:
                      "bold",
                    boxShadow:
                      "0 2px 7px rgba(0,0,0,.15)",
                  }}
                >
                  ✓
                </span>
              </button>
            );
          }
        )}
      </div>

      {/* 실행 버튼 */}

      <button
        type="button"
        disabled={
          loading ||
          selectedImages.length ===
            0
        }
        onClick={
          generateVirtualImages
        }
        style={{
          width: "100%",
          marginTop: "12px",
          padding: "15px",
          border: "none",
          borderRadius: "12px",
          background: "#5d4037",
          color: "#ffffff",
          fontSize: "16px",
          fontWeight: "bold",
          opacity:
            loading ||
            selectedImages.length ===
              0
              ? 0.55
              : 1,
        }}
      >
        {loading
          ? `가상 시공 중 ${progress.current}/${progress.total}`
          : `선택한 ${selectedImages.length}장 가상 시공하기`}
      </button>

      {/* 진행 표시 */}

      {loading && (
        <div
          style={{
            height: "7px",
            marginTop: "9px",
            borderRadius:
              "999px",
            background: "#e5e7eb",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${
                progress.total
                  ? (progress.current /
                      progress.total) *
                    100
                  : 0
              }%`,
              height: "100%",
              borderRadius:
                "999px",
              background: "#5b21b6",
              transition:
                "width .3s ease",
            }}
          />
        </div>
      )}

      {/* 상태 메시지 */}

      {message && (
        <div
          style={{
            marginTop: "9px",
            padding: "9px 10px",
            borderRadius: "9px",
            background: "#f8fafc",
            fontSize: "13px",
            lineHeight: 1.5,
          }}
        >
          {message}
        </div>
      )}

      {/* 가상시공 결과 */}

      {results.length > 0 && (
        <div
          style={{
            marginTop: "14px",
          }}
        >
          <strong>
            가상시공 결과{" "}
            {results.length}장
          </strong>

          <div
            style={{
              display: "grid",
              gap: "12px",
              marginTop: "9px",
            }}
          >
            {results.map(
              (
                item,
                index
              ) => (
                <div
                  key={
                    item.image.id
                  }
                  style={{
                    padding: "10px",
                    border:
                      "1px solid #e5e7eb",
                    borderRadius:
                      "12px",
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(2, minmax(0, 1fr))",
                      gap: "7px",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize:
                            "12px",
                          fontWeight:
                            "bold",
                        }}
                      >
                        원본{" "}
                        {index + 1}
                      </div>

                      <img
                        src={
                          item.image
                            .preview
                        }
                        alt={`원본 ${
                          index + 1
                        }`}
                        style={{
                          display:
                            "block",
                          width:
                            "100%",
                          marginTop:
                            "4px",
                          borderRadius:
                            "8px",
                        }}
                      />
                    </div>

                    <div>
                      <div
                        style={{
                          fontSize:
                            "12px",
                          fontWeight:
                            "bold",
                        }}
                      >
                        가상시공
                      </div>

                      <img
                        src={
                          item.imageUrl
                        }
                        alt={`가상 시공 결과 ${
                          index + 1
                        }`}
                        style={{
                          display:
                            "block",
                          width:
                            "100%",
                          marginTop:
                            "4px",
                          borderRadius:
                            "8px",
                        }}
                      />
                    </div>
                  </div>

                  <a
                    href={
                      item.imageUrl
                    }
                    download={`virtual-${
                      product.product_code ||
                      "film"
                    }-${index + 1}.webp`}
                    style={{
                      display:
                        "block",
                      marginTop:
                        "7px",
                      padding: "9px",
                      border:
                        "1px solid #d1d5db",
                      borderRadius:
                        "9px",
                      color:
                        "#111827",
                      textAlign:
                        "center",
                      textDecoration:
                        "none",
                      fontSize:
                        "13px",
                      fontWeight:
                        "bold",
                    }}
                  >
                    결과{" "}
                    {index + 1} 저장
                  </a>
                </div>
              )
            )}
          </div>

          <button
            type="button"
            onClick={
              onRequestDetail
            }
            style={{
              width: "100%",
              marginTop: "10px",
              padding: "14px",
              border: "none",
              borderRadius: "10px",
              background: "#111827",
              color: "#ffffff",
              fontSize: "16px",
              fontWeight: "bold",
            }}
          >
            이 색상으로 상세견적 신청
          </button>

          <button
            type="button"
            disabled={loading}
            onClick={
              generateVirtualImages
            }
            style={{
              width: "100%",
              marginTop: "8px",
              padding: "12px",
              border:
                "1px solid #d1d5db",
              borderRadius: "10px",
              background: "#ffffff",
              fontWeight: "bold",
            }}
          >
            가상 시공 다시 만들기
          </button>
        </div>
      )}

      <p
        style={{
          margin: "11px 0 0",
          color: "#6b7280",
          fontSize: "11px",
          lineHeight: 1.5,
        }}
      >
        가상 이미지는 이해를 돕기
        위한 참고용이며 실제 필름의
        색상과 차이가 있을 수 있습니다.
      </p>
    </section>
  );
}
