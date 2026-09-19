"use client";

export default function LeadForm({
  customerName = "",
  phone = "",
  region = "",
  privacyAgree = false,

  leadLoading = false,
  leadComplete = false,
  leadMessage = "",

  onCustomerNameChange,
  onPhoneChange,
  onRegionChange,
  onPrivacyAgreeChange,
  onSubmit,
}) {
  const sectionStyle = {
    marginTop: "24px",
    padding: "22px",
    border: "2px solid #111827",
    borderRadius: "20px",
    background: "#ffffff",
  };

  const inputStyle = {
    width: "100%",
    padding: "15px",
    marginTop: "7px",
    fontSize: "16px",
    border: "1px solid #d1d5db",
    borderRadius: "12px",
    boxSizing: "border-box",
  };

  return (
    <section style={sectionStyle}>
      <h2
        style={{
          textAlign: "center",
        }}
      >
        💬 정확한 견적 상담받기
      </h2>

      <p
        style={{
          textAlign: "center",
          color: "#6b7280",
          lineHeight: 1.6,
        }}
      >
        사진과 AI 견적을 담당자가
        확인한 후 안내해드립니다.
      </p>

      {leadComplete ? (
        <div
          style={{
            padding: "22px",
            borderRadius: "14px",
            textAlign: "center",
            background: "#ecfdf5",
            lineHeight: 1.8,
          }}
        >
          <div
            style={{
              fontSize: "25px",
            }}
          >
            ✅
          </div>

          <strong>
            상담 신청 완료
          </strong>

          <br />

          확인 후 연락드리겠습니다.
        </div>
      ) : (
        <form
          onSubmit={(event) => {
            if (onSubmit) {
              onSubmit(event);
            }
          }}
        >
          {/* 이름 */}

          <label
            style={{
              display: "block",
              marginBottom: "16px",
              fontWeight: "bold",
            }}
          >
            이름

            <input
              value={customerName}
              onChange={(event) =>
                onCustomerNameChange?.(
                  event.target.value
                )
              }
              placeholder="성함"
              autoComplete="name"
              disabled={leadLoading}
              style={inputStyle}
            />
          </label>

          {/* 연락처 */}

          <label
            style={{
              display: "block",
              marginBottom: "16px",
              fontWeight: "bold",
            }}
          >
            연락처

            <input
              type="tel"
              inputMode="numeric"
              value={phone}
              onChange={(event) =>
                onPhoneChange?.(
                  event.target.value
                )
              }
              placeholder="010-0000-0000"
              autoComplete="tel"
              disabled={leadLoading}
              style={inputStyle}
            />
          </label>

          {/* 시공 지역 */}

          <label
            style={{
              display: "block",
              marginBottom: "16px",
              fontWeight: "bold",
            }}
          >
            시공 지역

            <input
              value={region}
              onChange={(event) =>
                onRegionChange?.(
                  event.target.value
                )
              }
              placeholder="예: 인천 송도"
              disabled={leadLoading}
              style={inputStyle}
            />
          </label>

          {/* 개인정보 동의 */}

          <label
            style={{
              display: "flex",
              gap: "9px",
              alignItems: "flex-start",
              fontSize: "14px",
              lineHeight: 1.5,
              color: "#4b5563",
              marginTop: "14px",
            }}
          >
            <input
              type="checkbox"
              checked={privacyAgree}
              disabled={leadLoading}
              onChange={(event) =>
                onPrivacyAgreeChange?.(
                  event.target.checked
                )
              }
              style={{
                width: "20px",
                height: "20px",
                flexShrink: 0,
              }}
            />

            <span>
              상담을 위한 이름, 연락처,
              시공지역, 사진 및 견적정보
              수집과 상담 연락에
              동의합니다.
            </span>
          </label>

          {/* 메시지 */}

          {leadMessage && (
            <div
              style={{
                marginTop: "15px",
                padding: "12px",
                borderRadius: "10px",
                background: "#f3f4f6",
                lineHeight: 1.6,
              }}
            >
              {leadMessage}
            </div>
          )}

          {/* 상담 신청 */}

          <button
            type="submit"
            disabled={leadLoading}
            style={{
              width: "100%",
              marginTop: "20px",
              padding: "18px",
              border: "none",
              borderRadius: "14px",
              background: "#111827",
              color: "#ffffff",
              fontSize: "18px",
              fontWeight: "bold",

              cursor: leadLoading
                ? "default"
                : "pointer",

              opacity: leadLoading
                ? 0.65
                : 1,
            }}
          >
            {leadLoading
              ? "상담 신청 중..."
              : "무료 정확한 견적 상담 신청"}
          </button>
        </form>
      )}
    </section>
  );
              }
