"use client";

export default function WorkerInviteModal({
  worker,
  inviteUrl = "",
  message = "",
  loading = false,
  onCopy,
  onShare,
  onClose,
}) {
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
        zIndex: 1300,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "30px 12px",
        background: "rgba(15,23,42,0.60)",
        overflowY: "auto",
      }}
    >
      <div
        onClick={(event) =>
          event.stopPropagation()
        }
        style={{
          width: "100%",
          maxWidth: "500px",
          padding: "16px",
          borderRadius: "15px",
          background: "#ffffff",
          boxShadow:
            "0 20px 50px rgba(0,0,0,0.20)",
        }}
      >
        {/* =========================
            제목
        ========================= */}

        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "10px",
          }}
        >
          <div>
            <div
              style={{
                color: "#111827",
                fontSize: "17px",
                fontWeight: "900",
              }}
            >
              🔗 시공자 계정 초대
            </div>

            <div
              style={{
                marginTop: "4px",
                color: "#64748b",
                fontSize: "12px",
              }}
            >
              {worker?.name || "시공자"}님에게
              보낼 계정 등록 링크입니다.
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
              fontSize: "26px",
              cursor: loading
                ? "default"
                : "pointer",
            }}
          >
            ×
          </button>
        </div>

        {/* =========================
            메시지
        ========================= */}

        {message && (
          <div
            style={{
              marginTop: "14px",
              padding: "10px 12px",
              borderRadius: "9px",

              background:
                message.startsWith("✅")
                  ? "#f0fdf4"
                  : "#fef2f2",

              color:
                message.startsWith("✅")
                  ? "#166534"
                  : "#b91c1c",

              fontSize: "12px",
              fontWeight: "700",
              whiteSpace: "pre-wrap",
            }}
          >
            {message}
          </div>
        )}

        {/* =========================
            생성 중
        ========================= */}

        {loading && (
          <div
            style={{
              marginTop: "14px",
              padding: "16px",
              border:
                "1px solid #e2e8f0",
              borderRadius: "10px",
              color: "#64748b",
              textAlign: "center",
              fontSize: "13px",
              fontWeight: "700",
            }}
          >
            초대 링크를 생성하고
            있습니다...
          </div>
        )}

        {/* =========================
            초대 링크
        ========================= */}

        {!loading && inviteUrl && (
          <>
            <div
              style={{
                marginTop: "14px",
                color: "#334155",
                fontSize: "12px",
                fontWeight: "800",
              }}
            >
              초대 링크
            </div>

            <div
              style={{
                marginTop: "6px",
                padding: "11px",
                border:
                  "1px solid #cbd5e1",
                borderRadius: "9px",
                background: "#f8fafc",
                color: "#334155",
                fontSize: "11px",
                lineHeight: "1.5",
                wordBreak: "break-all",
                userSelect: "all",
              }}
            >
              {inviteUrl}
            </div>

            {/* =====================
                복사 / 공유
            ===================== */}

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "1fr 1fr",
                gap: "8px",
                marginTop: "12px",
              }}
            >
              <button
                type="button"
                onClick={onCopy}
                style={{
                  padding: "11px",
                  border:
                    "1px solid #cbd5e1",
                  borderRadius: "9px",
                  background: "#ffffff",
                  color: "#334155",
                  fontSize: "13px",
                  fontWeight: "800",
                  cursor: "pointer",
                }}
              >
                📋 링크 복사
              </button>

              <button
                type="button"
                onClick={onShare}
                style={{
                  padding: "11px",
                  border: "none",
                  borderRadius: "9px",
                  background: "#2563eb",
                  color: "#ffffff",
                  fontSize: "13px",
                  fontWeight: "800",
                  cursor: "pointer",
                }}
              >
                📤 공유하기
              </button>
            </div>

            {/* =====================
                안내
            ===================== */}

            <div
              style={{
                marginTop: "10px",
                padding: "9px 10px",
                borderRadius: "8px",
                background: "#fff7ed",
                color: "#9a3412",
                fontSize: "11px",
                lineHeight: "1.5",
              }}
            >
              이 초대 링크는 시공자
              본인에게만 전달해주세요.
              초대는 7일 후 만료됩니다.
            </div>
          </>
        )}

        {/* =========================
            닫기
        ========================= */}

        <button
          type="button"
          disabled={loading}
          onClick={onClose}
          style={{
            width: "100%",
            marginTop: "14px",
            padding: "11px",
            border:
              "1px solid #cbd5e1",
            borderRadius: "9px",
            background: "#ffffff",
            color: "#475569",
            fontSize: "13px",
            fontWeight: "800",
            cursor: loading
              ? "default"
              : "pointer",
          }}
        >
          닫기
        </button>
      </div>
    </div>
  );
          }
