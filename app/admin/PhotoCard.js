import {
  inputStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
} from "./adminStyles";

export default function PhotoCard({
  photo,
  jobPhotoUrls,
  loadingPhotoId,
  editingPhotoId,
  setPreviewPhoto,
  loadSingleJobPhoto,
  startPhotoEdit,
  deletePhoto,
  editPhotoType,
  setEditPhotoType,
  editPhotoCategory,
  setEditPhotoCategory,
  editPhotoSubCategory,
  setEditPhotoSubCategory,
  editPhotoDescription,
  setEditPhotoDescription,
  photoEditLoading,
  savePhotoEdit,
  cancelPhotoEdit,
}) {
  const url = jobPhotoUrls[photo.id];
  const loadingPhoto = loadingPhotoId === photo.id;
  const editing = editingPhotoId === photo.id;

  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: "12px",
        padding: "12px",
        marginBottom: "10px",
        background: "#fafafa",
      }}
    >
      <div
        style={{
          fontWeight: "bold",
          marginBottom: "8px",
        }}
      >
        {photo.photo_type === "before"
          ? "시공 전"
          : photo.photo_type === "after"
          ? "시공 후"
          : photo.photo_type || "사진"}
      </div>

      {url ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          onClick={() => setPreviewPhoto(url)}
          style={{
            width: "100%",
            maxHeight: "300px",
            objectFit: "contain",
            borderRadius: "10px",
            cursor: "pointer",
            background: "#111827",
            marginBottom: "10px",
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => loadSingleJobPhoto(photo)}
          disabled={loadingPhoto}
          style={secondaryButtonStyle}
        >
          {loadingPhoto
            ? "사진 불러오는 중..."
            : "📷 사진 보기"}
        </button>
      )}

      {!editing ? (
        <>
          <div
            style={{
              fontSize: "14px",
              marginTop: "10px",
              lineHeight: 1.6,
            }}
          >
            <div>
              <b>분류:</b> {photo.category || "-"}
            </div>

            <div>
              <b>세부:</b> {photo.sub_category || "-"}
            </div>

            <div>
              <b>AI 설명:</b> {photo.ai_description || "-"}
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "8px",
              marginTop: "10px",
            }}
          >
            <button
              type="button"
              onClick={() => startPhotoEdit(photo)}
              style={secondaryButtonStyle}
            >
              수정
            </button>

            <button
              type="button"
              onClick={() => deletePhoto(photo)}
              style={{
                ...secondaryButtonStyle,
                color: "#b91c1c",
              }}
            >
              삭제
            </button>
          </div>
        </>
      ) : (
        <div style={{ marginTop: "10px" }}>
          <select
            value={editPhotoType}
            onChange={(e) =>
              setEditPhotoType(e.target.value)
            }
            style={{
              ...inputStyle,
              marginBottom: "8px",
            }}
          >
            <option value="before">시공 전</option>
            <option value="after">시공 후</option>
            <option value="history">기타 시공사진</option>
          </select>

          <input
            value={editPhotoCategory}
            onChange={(e) =>
              setEditPhotoCategory(e.target.value)
            }
            placeholder="카테고리"
            style={{
              ...inputStyle,
              marginBottom: "8px",
            }}
          />

          <input
            value={editPhotoSubCategory}
            onChange={(e) =>
              setEditPhotoSubCategory(e.target.value)
            }
            placeholder="세부 분류"
            style={{
              ...inputStyle,
              marginBottom: "8px",
            }}
          />

          <textarea
            value={editPhotoDescription}
            onChange={(e) =>
              setEditPhotoDescription(e.target.value)
            }
            placeholder="AI 설명"
            rows={4}
            style={{
              ...inputStyle,
              resize: "vertical",
              marginBottom: "8px",
            }}
          />

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "8px",
            }}
          >
            <button
              type="button"
              disabled={photoEditLoading}
              onClick={() => savePhotoEdit(photo)}
              style={primaryButtonStyle}
            >
              {photoEditLoading ? "저장 중..." : "저장"}
            </button>

            <button
              type="button"
              onClick={cancelPhotoEdit}
              style={secondaryButtonStyle}
            >
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  );
                }
