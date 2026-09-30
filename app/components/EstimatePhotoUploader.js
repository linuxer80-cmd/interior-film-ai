"use client";

import { useRef } from "react";
import { ESTIMATE_TARGET_OPTIONS } from "../utils/categoryUtils";

export default function EstimatePhotoUploader({
  images = [],
  loading = false,
  imageLoading = false,
  message = "",
  onAddImages,
  onRemoveImage,
  onUpdatePhotoOptions,
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

    /*
     * 같은 사진을 다시 선택할 수 있도록 초기화
     */
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
        최대 10장까지 선택할 수 있습니다.
        같은 문을 여러 각도에서 찍은 사진은 AI가 비교해 한 세트로 묶습니다.
        아래에서 같은 대상 또는 별도 대상으로 직접 지정할 수도 있습니다.
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
                "repeat(2, minmax(0, 1fr))",
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

                  <div style={{ fontSize: 13, fontWeight: 700, marginTop: 8 }}>사진 {index + 1}</div>
                  <label style={{ display: "block", marginTop: 8, fontSize: 12 }}>
                    시공 부위
                    <select aria-label={`사진 ${index + 1} 시공 부위`} disabled={disabled}
                      value={item.targetChoice || ""} onChange={(event) => onUpdatePhotoOptions?.(item.id, { targetChoice: event.target.value })}
                      style={{ width: "100%", minHeight: 40, marginTop: 4, border: "1px solid #d1d5db", borderRadius: 8, background: "white", fontSize: 13 }}>
                      <option value="">AI 자동 인식</option>
                      {ESTIMATE_TARGET_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                  {<label style={{ display: "block", marginTop: 8, fontSize: 12 }}>
                    다른 사진과 같은 대상인가요?
                    <select aria-label={`사진 ${index + 1} 같은 대상 선택`} disabled={disabled}
                      value={item.subjectId || "auto"}
                      onChange={(event) => onUpdatePhotoOptions?.(item.id, { subjectId: event.target.value })}
                      style={{ width: "100%", minHeight: 40, marginTop: 4, border: "1px solid #d1d5db", borderRadius: 8, background: "white", fontSize: 13 }}>
                      <option value="auto">AI가 같은 문인지 비교</option>
                      <option value={item.id}>별도 대상 (각각 계산)</option>
                      {images.slice(0, index).filter((photo) => !photo.subjectId || photo.subjectId === photo.id).map((photo) => (
                        <option key={photo.id} value={photo.id}>사진 {images.findIndex((entry) => entry.id === photo.id) + 1}과 같은 대상</option>
                      ))}
                    </select>
                  </label>}

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
