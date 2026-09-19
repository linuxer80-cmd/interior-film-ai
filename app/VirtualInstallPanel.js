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
 * group의 모든 설명 문자열 합치기
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
 * 특정 단어 존재 여부
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
 * 반환 예:
 *
 * [
 *   { key: "upper", label: "상부장" },
 *   { key: "lower", label: "하부장" },
 *   { key: "fridge", label: "냉장고장" }
 * ]
 *
 * =========================================================
 */

function detectInstallAreas(groups = []) {
  if (!Array.isArray(groups)) {
    return [];
  }

  const groupTexts = groups.map(
    getGroupText
  );

  const fullText =
    groupTexts.join(" ");

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
   * -------------------------------------------------------
   * 상부장
   * -------------------------------------------------------
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
   * -------------------------------------------------------
   * 하부장
   * -------------------------------------------------------
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
   * AI가 단순히 '싱크대'라고만 분석한 경우에는
   * 기존 동작을 유지하기 위해
   * 상부장 + 하부장 기본 생성
   */

  const genericSink =
    includesAny(fullText, [
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
   * -------------------------------------------------------
   * 냉장고장
   * -------------------------------------------------------
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
   * -------------------------------------------------------
   * 키큰장
   * -------------------------------------------------------
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
   * -------------------------------------------------------
   * 팬트리장
   * -------------------------------------------------------
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
   * -------------------------------------------------------
   * 아일랜드장
   * -------------------------------------------------------
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
   * -------------------------------------------------------
   * 중복 제거
   * -------------------------------------------------------
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
   * 부분톤은 최소 2부위 이상일 때만
   */

  if (unique.length < 2) {
    return [];
  }

  return unique;
}

/*
 * =========================================================
 * 필름 데이터를 API용으로 정리
 * =========================================================
 */

function makeFilmPayload(
  area,
  film
) {
  return {
    areaKey: area?.key || "",
    areaLabel: area?.label || "",

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
   * 부분 톤 사용 여부
   */

  const [
    useSplitTone,
    setUseSplitTone,
  ] = useState(false);

  /*
   * 추가 부위 필름
   *
   * 예:
   * {
   *   lower: {...},
   *   fridge: {...}
   * }
   */

  const [
    areaFilms,
    setAreaFilms,
  ] = useState({});

  /*
   * =======================================================
   * 시공 부위 자동 판정
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
   * 첫 번째 부위는
   * 메인 FilmColorPicker에서 선택한 product 사용
   */

  const primaryArea =
    installAreas[0] || null;

  const secondaryAreas =
    installAreas.slice(1);

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

    const imageExists =
      images.some(
        (item) =>
          item.id ===
          selectedImageId
      );

    if (!imageExists) {
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
   * 부분톤 불가능하면 초기화
   * =======================================================
   */

  useEffect(() => {
    if (!canSplitTone) {
      setUseSplitTone(false);
      setAreaFilms({});
    }
  }, [canSplitTone]);

  /*
   * =======================================================
   * 분석 부위가 변경되면
   * 존재하지 않는 부위의 선택값 제거
   * =======================================================
   */

  useEffect(() => {
    const validKeys =
      new Set(
        secondaryAreas.map(
          (area) => area.key
        )
      );

    setAreaFilms((previous) => {
      const next = {};

      for (
        const [key, value]
        of Object.entries(previous)
      ) {
        if (validKeys.has(key)) {
          next[key] = value;
        }
      }

      return next;
    });
  }, [
    installAreas
      .map((area) => area.key)
      .join("|"),
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
   * 특정 부위 필름 선택
   * =======================================================
   */

  function selectAreaFilm(
    areaKey,
    film
  ) {
    setAreaFilms(
      (previous) => ({
        ...previous,
        [areaKey]: film,
      })
    );
  }

  /*
   * =======================================================
   * 부분톤 필름 배열
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
        (area, index) => {
          const film =
            index === 0
              ? product
              : areaFilms[
                  area.key
                ] || null;

          return {
            area,
            film,
          };
        }
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
    if (loading) return;

    /*
     * 부분톤 사용 시
     * 모든 추가 부위 필름 선택 확인
     */

    if (
      useSplitTone &&
      canSplitTone
    ) {
      const missingArea =
        secondaryAreas.find(
          (area) =>
            !areaFilms[area.key]
        );

      if (missingArea) {
        setMessage(
          `❌ ${missingArea.label}에 적용할 필름을 선택해주세요.`
        );

        return;
      }
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
       * 동적 부분톤 데이터
       * ===================================================
       */

      formData.append(
        "useSplitTone",
        useSplitTone &&
        canSplitTone
          ? "true"
          : "false"
      );

      if (
        useSplitTone &&
        canSplitTone
      ) {
        const areaPayload =
          selectedAreaFilms.map(
            ({ area, film }) =>
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

      if (
        result?.multiReferenceUsed
      ) {
        setMessage(
          `✅ ${result.referenceCount || installAreas.length}개 부위의 실제 필름 샘플을 참고한 부분 톤 가상시공이 완성되었습니다.`
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
        }}
      >
        가상 시공 미리보기
      </h2>

      {/* 사진 선택 */}

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

      {/* 기본 필름 */}

      <div
        style={{
          marginTop: "14px",
          padding: "14px",
          borderRadius: "12px",
          background: "#f3f4f6",
          lineHeight: 1.6,
        }}
      >
        <div>
          {useSplitTone &&
          primaryArea
            ? `${primaryArea.label} 필름`
            : "선택 필름"}
          :{" "}
          <strong>
            {product.brand}{" "}
            {product.product_code}
          </strong>
        </div>

        <div>
          {product.color_description ||
            product.color_family}
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
              maxWidth: "180px",
              marginTop: "10px",
              borderRadius: "10px",
              border:
                "1px solid #e5e7eb",
            }}
          />
        )}
      </div>

      {/* ===================================================
          부분 톤 기능
          =================================================== */}

      {canSplitTone && (
        <div
          style={{
            marginTop: "16px",
            padding: "16px",
            border:
              "1px solid #d1d5db",
            borderRadius: "14px",
            background: "#fafafa",
          }}
        >
          <strong>
            부분 톤 차이
          </strong>

          <p
            style={{
              margin:
                "7px 0 12px",
              color:
                "#6b7280",
              fontSize:
                "14px",
              lineHeight: 1.6,
            }}
          >
            감지된 시공 부위별로
            서로 다른 필름을 선택할 수
            있습니다.
          </p>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "6px",
              marginBottom: "12px",
            }}
          >
            {installAreas.map(
              (area) => (
                <span
                  key={area.key}
                  style={{
                    padding:
                      "6px 9px",
                    borderRadius:
                      "20px",
                    background:
                      "#eef2ff",
                    fontSize:
                      "13px",
                    fontWeight:
                      "bold",
                  }}
                >
                  {area.label}
                </span>
              )
            )}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "1fr 1fr",
              gap: "8px",
            }}
          >
            <button
              type="button"
              onClick={() => {
                setUseSplitTone(
                  false
                );

                setAreaFilms({});
              }}
              style={{
                padding:
                  "13px 8px",
                borderRadius:
                  "11px",
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
              onClick={() =>
                setUseSplitTone(
                  true
                )
              }
              style={{
                padding:
                  "13px 8px",
                borderRadius:
                  "11px",
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
          추가 부위별 필름 선택
          =================================================== */}

      {useSplitTone &&
        canSplitTone && (
          <>
            <div
              style={{
                marginTop: "16px",
                padding: "14px",
                borderRadius:
                  "12px",
                background:
                  "#eef2ff",
                lineHeight: 1.6,
              }}
            >
              <strong>
                {primaryArea?.label}
              </strong>
              <br />

              {product.brand}{" "}
              <strong>
                {product.product_code}
              </strong>

              <br />

              {product.color_description ||
                product.color_family}
            </div>

            {secondaryAreas.map(
              (
                area,
                index
              ) => {
                const selected =
                  areaFilms[
                    area.key
                  ];

                return (
                  <div
                    key={
                      area.key
                    }
                    style={{
                      marginTop:
                        "18px",
                      paddingTop:
                        "8px",
                      borderTop:
                        "2px solid #e5e7eb",
                    }}
                  >
                    <h3
                      style={{
                        marginBottom:
                          "6px",
                      }}
                    >
                      {area.label} 필름 선택
                    </h3>

                    <p
                      style={{
                        marginTop: 0,
                        color:
                          "#6b7280",
                        lineHeight:
                          1.6,
                      }}
                    >
                      {area.label}에
                      적용할 필름을
                      선택해주세요.
                    </p>

                    <FilmColorPicker
                      key={`${area.key}-${index}`}
                      onSelect={(
                        film
                      ) =>
                        selectAreaFilm(
                          area.key,
                          film
                        )
                      }
                    />

                    {selected && (
                      <div
                        style={{
                          marginTop:
                            "12px",
                          padding:
                            "13px",
                          borderRadius:
                            "12px",
                          background:
                            "#eef2ff",
                          lineHeight:
                            1.6,
                        }}
                      >
                        <strong>
                          {
                            area.label
                          }
                        </strong>

                        <br />

                        {
                          selected.brand
                        }{" "}

                        <strong>
                          {
                            selected.product_code
                          }
                        </strong>

                        <br />

                        {selected.color_description ||
                          selected.color_family}
                      </div>
                    )}
                  </div>
                );
              }
            )}
          </>
        )}

      {/* 생성 버튼 */}

      {!resultUrl && (
        <button
          type="button"
          disabled={loading}
          onClick={
            generateVirtualImage
          }
          style={{
            width: "100%",
            marginTop: "18px",
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

      {/* 결과 */}

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
