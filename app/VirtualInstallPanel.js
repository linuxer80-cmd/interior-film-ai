"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import FilmColorPicker from "./FilmColorPicker";

/*
 * =========================================================
 * 시공 부위 판정
 * =========================================================
 */

function detectSplitType(groups = []) {
  const text = groups
    .map((group) =>
      [
        group?.key,
        group?.category,
        group?.subCategory,
      ]
        .filter(Boolean)
        .join(" ")
    )
    .join(" ")
    .toLowerCase();

  /*
   * 냉장고장은 주방으로 분석될 수 있지만
   * 사용자가 부위 분리를 원하지 않으므로
   * 가장 먼저 제외
   */
  if (
    text.includes("냉장고장") ||
    text.includes("냉장고 장")
  ) {
    return null;
  }

  /*
   * 붙박이장
   */
  if (
    text.includes("붙박이장") ||
    text.includes("옷장")
  ) {
    return null;
  }

  /*
   * 신발장
   */
  if (
    text.includes("신발장") ||
    text.includes("현관장")
  ) {
    return null;
  }

  /*
   * 싱크대
   */
  if (
    text.includes("싱크대") ||
    text.includes("상부장") ||
    text.includes("하부장") ||
    text.includes("주방가구") ||
    text.includes("주방 가구")
  ) {
    return "kitchen";
  }

  /*
   * 문 + 문틀
   */
  if (
    text.includes("방문") ||
    text.includes("방화문") ||
    text.includes("문틀") ||
    text.includes("도어")
  ) {
    return "door";
  }

  return null;
}


/*
 * =========================================================
 * 부위 명칭
 * =========================================================
 */

function getSplitLabels(type) {
  if (type === "kitchen") {
    return {
      first: "상부장",
      second: "하부장",
    };
  }

  if (type === "door") {
    return {
      first: "문짝",
      second: "문틀",
    };
  }

  return null;
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
   * 부분 톤 차이 사용 여부
   */
  const [
    useSplitTone,
    setUseSplitTone,
  ] = useState(false);

  /*
   * 두 번째 필름
   */
  const [
    secondaryFilm,
    setSecondaryFilm,
  ] = useState(null);


  /*
   * =======================================================
   * 시공부위 판정
   * =======================================================
   */

  const splitType =
    useMemo(
      () =>
        detectSplitType(groups),
      [groups]
    );

  const splitLabels =
    useMemo(
      () =>
        getSplitLabels(
          splitType
        ),
      [splitType]
    );


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
   * 필름 / 사진 변경 시 결과 초기화
   * =======================================================
   */

  useEffect(() => {
    setResultUrl("");
    setMessage("");
  }, [
    product?.id,
    secondaryFilm?.id,
    selectedImageId,
    useSplitTone,
  ]);


  /*
   * 분리 불가능한 부위가 되면
   * 부분톤 자동 해제
   */
  useEffect(() => {
    if (!splitType) {
      setUseSplitTone(false);
      setSecondaryFilm(null);
    }
  }, [splitType]);


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

    if (
      useSplitTone &&
      splitType &&
      !secondaryFilm
    ) {
      setMessage(
        `❌ ${splitLabels?.second || "두 번째 부위"}에 적용할 필름을 선택해주세요.`
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
       * 고객사진
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
       * 부분 톤 정보
       * ===================================================
       */

      formData.append(
        "splitType",
        useSplitTone
          ? splitType || ""
          : ""
      );

      formData.append(
        "useSplitTone",
        useSplitTone
          ? "true"
          : "false"
      );


      /*
       * ===================================================
       * 두 번째 필름
       * ===================================================
       */

      if (
        useSplitTone &&
        secondaryFilm
      ) {
        formData.append(
          "secondaryBrand",
          secondaryFilm.brand || ""
        );

        formData.append(
          "secondaryProductCode",
          secondaryFilm.product_code || ""
        );

        formData.append(
          "secondaryProductName",
          secondaryFilm.product_name || ""
        );

        formData.append(
          "secondaryTexture",
          secondaryFilm.texture || ""
        );

        formData.append(
          "secondaryColorFamily",
          secondaryFilm.color_family || ""
        );

        formData.append(
          "secondaryColorDescription",
          secondaryFilm.color_description || ""
        );

        formData.append(
          "secondaryColorHex",
          secondaryFilm.color_hex || ""
        );

        formData.append(
          "secondarySampleImageUrl",
          secondaryFilm.sample_image_path || ""
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
        result?.splitReferenceUsed
      ) {
        setMessage(
          "✅ 두 가지 실제 필름 샘플을 참고한 부분 톤 가상시공이 완성되었습니다."
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
          splitLabels
            ? `${splitLabels.first} 필름`
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

      {splitType &&
        splitLabels && (
          <div
            style={{
              marginTop: "16px",
              padding: "16px",
              border:
                "1px solid #d1d5db",
              borderRadius: "14px",
              background:
                "#fafafa",
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
              {splitType ===
              "kitchen"
                ? "상부장과 하부장을 서로 다른 필름으로 미리 볼 수 있습니다."
                : "문짝과 문틀을 서로 다른 필름으로 미리 볼 수 있습니다."}
            </p>

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
                  setSecondaryFilm(
                    null
                  );
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


      {/* 두 번째 필름 선택 */}

      {splitType &&
        splitLabels &&
        useSplitTone && (
          <div
            style={{
              marginTop: "16px",
              paddingTop: "4px",
              borderTop:
                "2px solid #e5e7eb",
            }}
          >
            <h3>
              {splitLabels.second} 필름 선택
            </h3>

            <p
              style={{
                color:
                  "#6b7280",
                lineHeight: 1.6,
              }}
            >
              {splitLabels.first}에는{" "}
              <strong>
                {product.product_code}
              </strong>
              , {splitLabels.second}에는
              아래에서 선택하는 필름이
              적용됩니다.
            </p>

            <FilmColorPicker
              onSelect={
                setSecondaryFilm
              }
            />

            {secondaryFilm && (
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
                  lineHeight: 1.6,
                }}
              >
                <strong>
                  {splitLabels.second}
                </strong>
                <br />

                {
                  secondaryFilm.brand
                }{" "}
                <strong>
                  {
                    secondaryFilm.product_code
                  }
                </strong>

                <br />

                {secondaryFilm.color_description ||
                  secondaryFilm.color_family}
              </div>
            )}
          </div>
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
            ? "부분 톤으로 가상 시공하기"
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
