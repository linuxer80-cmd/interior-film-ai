"use client";

import { koreanDay } from "../../utils/workerCalendar";

function formatNumber(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  const onlyNumber = String(value).replace(/[^\d]/g, "");
  if (!onlyNumber) return "";

  return Number(onlyNumber).toLocaleString("ko-KR");
}

export default function WorkerFormModal({
  editingWorker,
  inline = false,
  relationshipType = null,
  selfRegistration = false,
  form,
  loading = false,
  saveDisabled = false,
  localMessage = "",
  updateField,
  onSubmit,
  onClose,
}) {
  const isEdit = Boolean(editingWorker);
  const freelancer = isEdit && relationshipType === "freelancer";

  function handleWageChange(event) {
    const rawValue = event.target.value.replace(/[^\d]/g, "");
    updateField?.("daily_wage", rawValue);
  }

  return (
    <div
      onClick={inline ? undefined : () => { if (!loading) onClose?.(); }}
      style={{
        position: inline ? "relative" : "fixed",
        inset: inline ? undefined : 0,
        zIndex: inline ? "auto" : 1500,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "12px",
        boxSizing: "border-box",
        background: inline ? "#f8fafc" : "rgba(15,23,42,0.60)",
        overflow: inline ? "visible" : "hidden",
      }}
    >
      <div
        onClick={event => event.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: "500px",
          maxHeight: inline ? "none" : "calc(100dvh - 24px)",
          overflowY: inline ? "visible" : "auto",
          overscrollBehavior: "contain",
          boxSizing: "border-box",
          padding: "18px",
          borderRadius: "16px",
          background: "#ffffff",
          boxShadow: "0 20px 50px rgba(0,0,0,0.20)",
        }}
      >
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
              {isEdit
                ? "👷 시공자 정보 수정"
                : selfRegistration
                  ? "👷 관리자 본인 시공자 등록"
                  : "👷 신규 시공자 등록"}
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
                ? freelancer ? "협력 프리랜서의 기본 일당은 본인만 수정할 수 있습니다." : "전화번호와 기본 일당을 수정할 수 있습니다."
                : "이름, 전화번호와 기본 일당을 입력해주세요."}
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

        <form onSubmit={onSubmit} style={{ marginTop: "20px" }}>
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
              onChange={event =>
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

          <div style={{ height: "16px" }} />
          <FieldLabel required>전화번호</FieldLabel>

          <input
            type="tel"
            value={form?.phone || ""}
            disabled={loading}
            onChange={event =>
              updateField?.("phone", event.target.value)
            }
            placeholder="예: 010-1234-5678"
            autoComplete="tel"
            style={inputStyle}
          />

          <div style={{ height: "16px" }} />
          <FieldLabel required>{freelancer ? "개인 등록 일당 (조회 전용)" : "기본 일당"}</FieldLabel>

          <div style={{ position: "relative" }}>
            <input
              type="text"
              inputMode="numeric"
              aria-label="기본 일당"
              value={formatNumber(form?.daily_wage)}
              disabled={loading || freelancer}
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
            팀장비용은 시공자 관리 목록의 ‘팀장비용 설정’에서
            업체 공통으로 정합니다. 이 시공자가 팀장으로 일한 날에는
            기본 일당에 해당 금액이 자동으로 더해집니다.
          </div>

          {freelancer && <p style={{fontSize:12,color:"#64748b"}}>프리랜서 일당은 시공자 개인설정에서 변경합니다. 현장별 합의 금액은 현장 배정에서 관리하세요.</p>}
          <div hidden={freelancer || (isEdit && Number(form.daily_wage) === Number(editingWorker.daily_wage))}>
          <div style={{ height: 16 }} />
          <FieldLabel required>기본 일당 적용 시작일</FieldLabel>

          <input
            aria-label="기본 일당 적용 시작일"
            type="date"
            value={form?.pay_rate_effective_from || ""}
            min={editingWorker?.pay_rate_effective_from || "2000-01-01"}
            max={koreanDay()}
            required
            disabled={loading}
            onChange={event =>
              updateField?.("pay_rate_effective_from", event.target.value)
            }
            style={inputStyle}
          />

          <p
            style={{
              margin: "7px 0 0",
              color: "#64748b",
              fontSize: 12,
              lineHeight: 1.6,
            }}
          >
            직원·미연결 시공자의 기본 일당입니다. 협력 시공자로 연결한 뒤 새로 배정하는 날짜는 본인 등록 일당을 적용합니다. 기본 일당을 변경하면 이 날짜부터 새 금액을 적용하고
            이전 단가는 보관합니다. 이번 달 전체에 적용하려면
            월초 날짜를 선택하세요. 같은 적용일의 금액은 수정됩니다.
          </p>

          </div>
          <details style={{ marginTop: 18 }}><summary style={{ cursor: "pointer", fontWeight: 700 }}>추가정보 · 메모 / 계좌 / 출발 주소</summary>
          <label style={{ display: "block", marginTop: 20, fontWeight: 700 }}>
            시공자 메모 (선택)
            <textarea value={form.memo || ""} maxLength={1000} rows={3}
              disabled={loading} onChange={event => updateField?.("memo", event.target.value)}
              placeholder="예: 싱크대 시공 능숙, 차량 있음, 주말 작업 가능"
              style={{ ...inputStyle, resize: "vertical", marginTop: 8 }} />
          </label>
          <p style={{ color: "#64748b", fontSize: 12 }}>작업 특성이나 전달사항을 기록하세요. 민감한 개인정보는 적지 마세요.</p>

          {[
            ["bank_name", "은행명", "예: 국민은행", 100],
            ["account_number", "계좌번호", "숫자와 하이픈으로 입력", 50],
            ["account_holder", "예금주", "통장에 표시된 예금주", 100],
            [
              "departure_address",
              "출발 주소",
              "도로명·건물번호까지 입력 (예: 인천 서구 …)",
              300,
            ],
          ].map(([key, label, placeholder, maxLength]) => (
            <label
              key={key}
              style={{ display: "block", marginTop: 16 }}
            >
              <span
                style={{
                  display: "block",
                  marginBottom: 7,
                  fontWeight: 700,
                }}
              >
                {label}
              </span>

              <input
                type="text"
                inputMode={key === "account_number" ? "numeric" : undefined}
                autoComplete="off"
                value={form?.[key] || ""}
                maxLength={maxLength}
                disabled={loading}
                placeholder={placeholder}
                onChange={event =>
                  updateField?.(key, event.target.value)
                }
                style={inputStyle}
              />
            </label>
          ))}

          <p style={{ color: "#64748b", fontSize: 12, lineHeight: 1.6 }}>
            계좌와 출발 주소는 관리자 전용입니다.
            출발 주소는 본인 현장의 자동차 이동시간 계산에 사용합니다.
            상세 동·호수는 입력하지 않아도 됩니다.
          </p>

          </details>

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
              disabled={loading || saveDisabled}
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
        <span style={{ marginLeft: "3px", color: "#ef4444" }}>
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
