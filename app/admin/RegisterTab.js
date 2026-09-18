import {
  inputStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
  sectionStyle,
} from "./adminStyles";

export default function RegisterTab({
  category,
  setCategory,
  actualCost,
  setActualCost,
  material,
  setMaterial,
  memo,
  setMemo,
  beforeImages,
  setBeforeImages,
  afterImages,
  setAfterImages,
  loading,
  handleSave,
  message,
  similarityThreshold,
  setSimilarityThreshold,
  settingLoading,
  saveSimilaritySetting,
  settingMessage,
}) {
  return (
    <>
      <section style={sectionStyle}>
        <h2 style={{ marginTop: 0 }}>
          시공사례 등록
        </h2>

        <label style={labelStyle}>
          시공 부위
        </label>

        <input
          value={category}
          onChange={(event) =>
            setCategory(event.target.value)
          }
          placeholder="예: 문·문틀, 싱크대, 중문"
          style={{
            ...inputStyle,
            marginBottom: "12px",
          }}
        />

        <label style={labelStyle}>
          실제 시공금액
        </label>

        <input
          value={actualCost}
          onChange={(event) =>
            setActualCost(event.target.value)
          }
          inputMode="numeric"
          placeholder="예: 180000"
          style={{
            ...inputStyle,
            marginBottom: "12px",
          }}
        />

        <label style={labelStyle}>
          사용 자재
        </label>

        <input
          value={material}
          onChange={(event) =>
            setMaterial(event.target.value)
          }
          placeholder="예: 현대 L&C GS245"
          style={{
            ...inputStyle,
            marginBottom: "12px",
          }}
        />

        <label style={labelStyle}>
          메모
        </label>

        <textarea
          value={memo}
          onChange={(event) =>
            setMemo(event.target.value)
          }
          placeholder="특이사항"
          rows={4}
          style={{
            ...inputStyle,
            resize: "vertical",
            marginBottom: "14px",
          }}
        />

        <label style={labelStyle}>
          시공 전 사진
        </label>

        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(event) =>
            setBeforeImages(
              Array.from(
                event.target.files || []
              )
            )
          }
          style={{
            ...inputStyle,
            marginBottom: "8px",
          }}
        />

        <div style={countStyle}>
          선택 {beforeImages.length}장
        </div>

        <label style={labelStyle}>
          시공 후 사진
        </label>

        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(event) =>
            setAfterImages(
              Array.from(
                event.target.files || []
              )
            )
          }
          style={{
            ...inputStyle,
            marginBottom: "8px",
          }}
        />

        <div style={countStyle}>
          선택 {afterImages.length}장
        </div>

        <button
          type="button"
          disabled={loading}
          onClick={handleSave}
          style={primaryButtonStyle}
        >
          {loading
            ? "AI 분석 + 저장 중..."
            : "시공사례 저장"}
        </button>
      </section>

      {message && (
        <pre
          style={{
            whiteSpace: "pre-wrap",
            background: "#ffffff",
            border: "1px solid #e5e7eb",
            borderRadius: "12px",
            padding: "14px",
          }}
        >
          {message}
        </pre>
      )}

      <section style={sectionStyle}>
        <h3 style={{ marginTop: 0 }}>
          AI 검색 설정
        </h3>

        <div
          style={{
            fontSize: "14px",
            color: "#6b7280",
            marginBottom: "8px",
          }}
        >
          현재 유사도 기준:{" "}
          {Math.round(
            Number(similarityThreshold) * 100
          )}
          %
        </div>

        <input
          type="number"
          min="0"
          max="1"
          step="0.01"
          value={similarityThreshold}
          onChange={(event) =>
            setSimilarityThreshold(
              event.target.value
            )
          }
          style={{
            ...inputStyle,
            marginBottom: "8px",
          }}
        />

        <button
          type="button"
          disabled={settingLoading}
          onClick={saveSimilaritySetting}
          style={secondaryButtonStyle}
        >
          {settingLoading
            ? "저장 중..."
            : "유사도 설정 저장"}
        </button>

        {settingMessage && (
          <div
            style={{
              marginTop: "10px",
              whiteSpace: "pre-wrap",
            }}
          >
            {settingMessage}
          </div>
        )}
      </section>
    </>
  );
}

const labelStyle = {
  display: "block",
  fontWeight: "bold",
  marginBottom: "6px",
};

const countStyle = {
  fontSize: "13px",
  color: "#6b7280",
  marginBottom: "14px",
};
