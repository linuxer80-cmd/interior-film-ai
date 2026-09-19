"use client";

import { useRef } from "react";

export default function EstimatePhotoUploader({
  images = [],
  loading = false,
  imageLoading = false,
  message = "",
  onAddImages,
  onRemoveImage,
  onAnalyze,
}) {
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);

  const disabled =
    loading || imageLoading;

  const photoButtonStyle = {
    flex: 1,
    minHeight: "72px",
    border: "1px solid #d1d5db",
    borderRadius: "14px",
    background: "#ffffff",
    fontSize: "16px",
    fontWeight: "bold",
    cursor: disabled
      ? "default"
      : "pointer",
    opacity: disabled
      ? 0.65
      : 1,
  };

  const sectionStyle = {
    marginTop: "24px",
    padding: "20px",
    background: "#ffffff",
    borderRadius: "18px",
    boxShadow:
      "0 8px 24px rgba(15,23,42,0.06)",
  };

  async function handleFileChange(event) {
    const files =
      event.target.files;

    if (
      files &&
      files.length > 0 &&
      onAddImages
    ) {
      await onAddImages(files);
    }

    // 같은 사진을 다시 선택할 수 있도록 초기화
    event.target.value = "";
  }

  return (
    <section style={sectionStyle}>
      <h2
        style={{
          marginTop: 0,
        }}
      >
        1. 시공할 곳 사진
      </h2>

      <p
        style={{
          color: "#6b7280",
          lineHeight: 1.6,
        }}
      >
        최대 10장까지 선택할 수
        있습니다. 같은 부위를 여러
        각도로 촬영하면 정확도가
        좋아집니다.
      </p>

      {/* 휴대폰 카메라 */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{
          display: "none",
        }}
        onChange={
          handleFileChange
        }
      />

      {/* 갤러리 여러 장 선택 */}
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{
          display: "none",
        }}
        onChange={
          handleFileChange
        }
      />

      <div
        style={{
          display: "flex",
          gap: "10px",
        }}
      >
        <button
          type="button"
          style={
            photoButtonStyle
          }
          disabled={disabled}
          onClick={() =>
            cameraInputRef.current?.click()
          }
        >
          📷
          <br />
          사진 촬영
        </button>

        <button
          type="button"
          style={
            photoButtonStyle
          }
          disabled={disabled}
          onClick={() =>
            galleryInputRef.current?.click()
          }
        >
          🖼️
          <br />
          여러 사진 선택
        </button>
      </div>

      {images.length > 0 && (
        <>
          <div
            style={{
              marginTop: "14px",
              padding: "12px",
              background:
                "#f3f4f6",
              borderRadius:
                "10px",
              fontWeight:
                "bold",
            }}
          >
            ✅ 선택한 사진{" "}
            {images.length}장
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(3, minmax(0, 1fr))",
              gap: "8px",
              marginTop: "12px",
            }}
          >
            {images.map(
              (item, index) => (
                <div
                  key={item.id}
                  style={{
                    position:
                      "relative",
                  }}
                >
                  <img
                    src={
                      item.preview
                    }
                    alt={`고객 사진 ${
                      index + 1
                    }`}
                    loading="lazy"
                    decoding="async"
                    style={{
                      width: "100%",
                      aspectRatio:
                        "1 / 1",
                      objectFit:
                        "cover",
                      borderRadius:
                        "10px",
                      display:
                        "block",
                    }}
                  />

                  <button
                    type="button"
                    disabled={
                      disabled
                    }
                    onClick={() =>
                      onRemoveImage?.(
                        item.id
                      )
                    }
                    aria-label={`${
                      index + 1
                    }번째 사진 삭제`}
                    style={{
                      position:
                        "absolute",
                      top: "5px",
                      right: "5px",
                      width: "30px",
                      height: "30px",
                      border: "none",
                      borderRadius:
                        "50%",
                      background:
                        "rgba(17,24,39,.85)",
                      color: "#ffffff",
                      fontSize:
                        "16px",
                      cursor:
                        disabled
                          ? "default"
                          : "pointer",
                    }}
                  >
                    ×
                  </button>
                </div>
              )
            )}
          </div>
        </>
      )}

      <button
        type="button"
        onClick={() =>
          onAnalyze?.()
        }
        disabled={
          loading ||
          imageLoading ||
          !images.length
        }
        style={{
          width: "100%",
          marginTop: "18px",
          padding: "18px",
          border: "none",
          borderRadius:
            "14px",
          background:
            "#111827",
          color: "#ffffff",
          fontSize: "18px",
          fontWeight:
            "bold",
          cursor: "pointer",
          opacity:
            loading ||
            imageLoading ||
            !images.length
              ? 0.65
              : 1,
        }}
      >
        {imageLoading
          ? "사진 준비 중..."
          : loading
            ? "AI 분석 중..."
            : `${
                images.length ||
                ""
              }장 AI 견적 확인`}
      </button>

      {message && (
        <div
          style={{
            marginTop: "16px",
            padding: "14px",
            borderRadius:
              "12px",
            background:
              "#f3f4f6",
            lineHeight: 1.6,
          }}
        >
          {message}
        </div>
      )}
    </section>
  );
}
