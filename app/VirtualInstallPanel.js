"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

export default function VirtualInstallPanel({
  images,
  product,
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

  const [loading, setLoading] =
    useState(false);

  const [message, setMessage] =
    useState("");

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

  useEffect(() => {
    setResultUrl("");
    setMessage("");
  }, [
    product?.id,
    selectedImageId,
  ]);

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

  async function generateVirtualImage() {
    if (loading) return;

    setLoading(true);
    setResultUrl("");

    setMessage(
      "가상 시공 이미지를 만들고 있습니다. 잠시 기다려주세요."
    );

    try {
      const formData =
        new FormData();

      formData.append(
        "image",
        selectedImage.file
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

      setMessage(
        "✅ 가상 시공 이미지가 완성되었습니다."
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
      <h2 style={{ marginTop: 0 }}>
        가상 시공 미리보기
      </h2>

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

      <div
        style={{
          marginTop: "14px",
          padding: "14px",
          borderRadius: "12px",
          background: "#f3f4f6",
          lineHeight: 1.6,
        }}
      >
        선택 필름:{" "}
        <strong>
          {product.brand}{" "}
          {product.product_code}
        </strong>
        <br />
        {product.color_description ||
          product.color_family}
      </div>

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
                  width: "100%",
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
                  width: "100%",
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
        참고용이며 실제 색상과 차이가
        있을 수 있습니다.
      </p>
    </section>
  );
      }
