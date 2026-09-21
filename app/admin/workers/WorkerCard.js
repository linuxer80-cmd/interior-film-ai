"use client";

export default function WorkerCard({
  worker,
  inviteLoading = false,
  onInvite,
  onEdit,
  onActiveChange,
}) {
  const active =
    worker?.is_active !== false;

  const accountLinked =
    Boolean(worker?.user_id);

  const specialties =
    Array.isArray(worker?.specialties)
      ? worker.specialties
      : [];

  return (
    <div
      style={{
        padding: "13px",
        border: "1px solid #e2e8f0",
        borderRadius: "12px",
        background: active
          ? "#ffffff"
          : "#f8fafc",
        opacity: active ? 1 : 0.7,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "10px",
        }}
      >
        {/* =========================
            시공자 정보
        ========================= */}

        <div
          style={{
            minWidth: 0,
            flex: "1 1 auto",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "6px",
            }}
          >
            <strong
              style={{
                color: "#111827",
                fontSize: "15px",
              }}
            >
              {worker?.name || "시공자"}
            </strong>

            {worker?.position && (
              <span
                style={{
                  padding: "3px 7px",
                  borderRadius: "999px",
                  background: "#eff6ff",
                  color: "#1d4ed8",
                  fontSize: "10px",
                  fontWeight: "800",
                }}
              >
                {worker.position}
              </span>
            )}

            {!active && (
              <span
                style={{
                  padding: "3px 7px",
                  borderRadius: "999px",
                  background: "#f1f5f9",
                  color: "#64748b",
                  fontSize: "10px",
                  fontWeight: "800",
                }}
              >
                비활성
              </span>
            )}
          </div>

          {/* 전화번호 */}

          {worker?.phone && (
            <div
              style={{
                marginTop: "6px",
                color: "#475569",
                fontSize: "12px",
              }}
            >
              📞 {worker.phone}
            </div>
          )}

          {/* 계정 상태 */}

          <div
            style={{
              marginTop: "8px",
            }}
          >
            {accountLinked ? (
              <span
                style={{
                  display: "inline-block",
                  padding: "5px 8px",
                  borderRadius: "999px",
                  background: "#f0fdf4",
                  color: "#166534",
                  fontSize: "10px",
                  fontWeight: "800",
                }}
              >
                ✅ 계정 연결됨
              </span>
            ) : (
              <span
                style={{
                  display: "inline-block",
                  padding: "5px 8px",
                  borderRadius: "999px",
                  background: "#fff7ed",
                  color: "#c2410c",
                  fontSize: "10px",
                  fontWeight: "800",
                }}
              >
                계정 미연결
              </span>
            )}
          </div>

          {/* 전문 분야 */}

          {specialties.length > 0 && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "4px",
                marginTop: "8px",
              }}
            >
              {specialties.map(
                (specialty, index) => (
                  <span
                    key={`${specialty}-${index}`}
                    style={{
                      padding: "4px 7px",
                      borderRadius: "6px",
                      background: "#f1f5f9",
                      color: "#475569",
                      fontSize: "10px",
                      fontWeight: "700",
                    }}
                  >
                    {specialty}
                  </span>
                ),
              )}
            </div>
          )}

          {/* 메모 */}

          {worker?.memo && (
            <div
              style={{
                marginTop: "8px",
                color: "#64748b",
                fontSize: "11px",
                lineHeight: "1.5",
                whiteSpace: "pre-wrap",
              }}
            >
              {worker.memo}
            </div>
          )}
        </div>

        {/* =========================
            버튼
        ========================= */}

        <div
          style={{
            display: "grid",
            gap: "5px",
            flex: "0 0 auto",
            minWidth: "82px",
          }}
        >
          {/* 계정 초대 */}

          {!accountLinked && active && (
            <button
              type="button"
              disabled={inviteLoading}
              onClick={onInvite}
              style={{
                padding: "7px 9px",
                border: "1px solid #2563eb",
                borderRadius: "8px",

                background: inviteLoading
                  ? "#dbeafe"
                  : "#eff6ff",

                color: "#1d4ed8",

                fontSize: "11px",
                fontWeight: "800",

                cursor: inviteLoading
                  ? "default"
                  : "pointer",
              }}
            >
              {inviteLoading
                ? "생성 중..."
                : "🔗 계정 초대"}
            </button>
          )}

          {/* 계정 연결 완료 */}

          {accountLinked && (
            <div
              style={{
                padding: "7px 8px",
                border: "1px solid #bbf7d0",
                borderRadius: "8px",
                background: "#f0fdf4",
                color: "#166534",
                fontSize: "10px",
                fontWeight: "800",
                textAlign: "center",
              }}
            >
              연결 완료
            </div>
          )}

          {/* 수정 */}

          <button
            type="button"
            onClick={onEdit}
            style={{
              padding: "7px 10px",
              border: "1px solid #cbd5e1",
              borderRadius: "8px",
              background: "#ffffff",
              color: "#334155",
              fontSize: "11px",
              fontWeight: "700",
              cursor: "pointer",
            }}
          >
            수정
          </button>

          {/* 활성/비활성 */}

          <button
            type="button"
            onClick={onActiveChange}
            style={{
              padding: "7px 10px",
              border: "1px solid #cbd5e1",
              borderRadius: "8px",

              background: active
                ? "#ffffff"
                : "#111827",

              color: active
                ? "#64748b"
                : "#ffffff",

              fontSize: "11px",
              fontWeight: "700",
              cursor: "pointer",
            }}
          >
            {active
              ? "비활성"
              : "재활성"}
          </button>
        </div>
      </div>
    </div>
  );
                }
