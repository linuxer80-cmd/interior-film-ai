"use client";

function formatNumber(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  const onlyNumber = String(value).replace(/[^\d]/g, "");

  if (!onlyNumber) {
    return "";
  }

  return Number(onlyNumber).toLocaleString("ko-KR");
}

export default function WorkerFormModal({
  editingWorker,
  form,
  loading = false,
  localMessage = "",
  updateField,
  onSubmit,
  onClose,
}) {
  const isEdit = Boolean(editingWorker);

  function handleWageChange(event) {
    const rawValue = event.target.value.replace(/[^\d]/g, "");

    updateField?.("daily_wage", rawValue);
  }

  return (
    <div
      onClick={() => {
        if (!loading) {
          onClose?.();
        }
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1250,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "30px 12px",
        background: "rgba(15,23,42,0.60)",
        overflowY: "auto",
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: "500px",
          padding: "18px",
          borderRadius: "16px",
          background: "#ffffff",
          boxShadow: "0 20px 50px rgba(0,0,0,0.20)",
        }}
      >
        {/* 제목 */}

        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "12px",
          }}
        >
          <div>
            <div
              style={{
                color: "#111827",
                fontSize: "19px",
                fontWeight: "900",
              }}
            >
              {isEdit ? "👷 시공자 정보 수정" : "👷 신규 시공자 등록"}
            </div>

            <div
              style={{
                marginTop: "5px",
                color: "#64748b",
                fontSize: "12px",
                lineHeight: "1.5",
              }}
            >
              {isEdit
                ? "전화번호와 기본 일당을 수정할 수 있습니다."
                : "이름, 전화번호, 기본 일당을 입력해주세요."}
            </div>
          </div>

          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            style={{
              border: "none",
              background: "transparent",
              color: "#64748b",
              fontSize: "27px",
              cursor: loading ? "default" : "pointer",
            }}
          >
            ×
          </button>
        </div>

        <form
          onSubmit={onSubmit}
          style={{
            marginTop: "20px",
          }}
        >
          {/* 이름 */}

          <FieldLabel required>이름</FieldLabel>

          {isEdit ? (
            <div
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "12px",
                border: "1px solid #e2e8f0",
                borderRadius: "10px",
                background: "#f8fafc",
                color: "#334155",
                fontSize: "14px",
                fontWeight: "800",
              }}
            >
              {editingWorker?.name || form?.name || "-"}
            </div>
          ) : (
            <input
              type="text"
              value={form?.name || ""}
              disabled={loading}
              onChange={(event) =>
                updateField?.("name", event.target.value)
              }
              placeholder="예: 홍길동"
              autoComplete="name"
              style={inputStyle}
            />
          )}

          {isEdit && (
            <div
              style={{
                marginTop: "6px",
                color: "#94a3b8",
                fontSize: "11px",
              }}
            >
              이름은 최초 등록 후 변경하지 않습니다.
            </div>
          )}

          {/* 전화번호 */}

          <div style={{ height: "16px" }} />

          <FieldLabel required>전화번호</FieldLabel>

          <input
            type="tel"
            value={form?.phone || ""}
            disabled={loading}
            onChange={(event) =>
              updateField?.("phone", event.target.value)
            }
            placeholder="예: 010-1234-5678"
            autoComplete="tel"
            style={inputStyle}
          />

          {/* 기본 일당 */}

          <div style={{ height: "16px" }} />

          <FieldLabel required>기본 일당</FieldLabel>

          <div
            style={{
              position: "relative",
            }}
          >
            <input
              type="text"
              inputMode="numeric"
              value={formatNumber(form?.daily_wage)}
              disabled={loading}
              onChange={handleWageChange}
              placeholder="예: 250,000"
              style={{
                ...inputStyle,
                paddingRight: "48px",
                textAlign: "right",
                fontWeight: "800",
              }}
            />

            <div
              style={{
                position: "absolute",
                top: "50%",
                right: "13px",
                transform: "translateY(-50%)",
                color: "#64748b",
                fontSize: "13px",
                fontWeight: "800",
                pointerEvents: "none",
              }}
            >
              원
            </div>
          </div>

          <div
            style={{
              marginTop: "7px",
              padding: "9px 10px",
              borderRadius: "8px",
              background: "#f8fafc",
              color: "#64748b",
              fontSize: "11px",
              lineHeight: "1.5",
            }}
          >
            기본 일당은 시공자의 기본 급여 기준입니다.
            현장별 실제 지급액은 추후 현장 정산에서 별도로 관리할 수 있습니다.
          </div>

          {/* 메시지 */}

          {localMessage && (
            <div
              style={{
                marginTop: "16px",
                padding: "10px 12px",
                borderRadius: "9px",
                background: localMessage.startsWith("✅")
                  ? "#f0fdf4"
                  : "#fef2f2",
                color: localMessage.startsWith("✅")
                  ? "#166534"
                  : "#b91c1c",
                fontSize: "12px",
                fontWeight: "700",
                lineHeight: "1.5",
                whiteSpace: "pre-wrap",
              }}
            >
              {localMessage}
            </div>
          )}

          {/* 버튼 */}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "9px",
              marginTop: "20px",
            }}
          >
            <button
              type="button"
              disabled={loading}
              onClick={onClose}
              style={{
                padding: "12px",
                border: "1px solid #cbd5e1",
                borderRadius: "10px",
                background: "#ffffff",
                color: "#475569",
                fontSize: "13px",
                fontWeight: "800",
                cursor: loading ? "default" : "pointer",
              }}
            >
              취소
            </button>

            <button
              type="submit"
              disabled={loading}
              style={{
                padding: "12px",
                border: "none",
                borderRadius: "10px",
                background: loading ? "#94a3b8" : "#111827",
                color: "#ffffff",
                fontSize: "13px",
                fontWeight: "900",
                cursor: loading ? "default" : "pointer",
              }}
            >
              {loading
                ? "저장 중..."
                : isEdit
                  ? "수정 저장"
                  : "시공자 등록"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FieldLabel({ children, required = false }) {
  return (
    <label
      style={{
        display: "block",
        marginBottom: "7px",
        color: "#334155",
        fontSize: "13px",
        fontWeight: "800",
      }}
    >
      {children}

      {required && (
        <span
          style={{
            marginLeft: "3px",
            color: "#ef4444",
          }}
        >
          *
        </span>
      )}
    </label>
  );
}

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "12px",
  border: "1px solid #cbd5e1",
  borderRadius: "10px",
  background: "#ffffff",
  color: "#111827",
  fontSize: "14px",
  outline: "none",
};
