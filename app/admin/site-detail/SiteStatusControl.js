"use client";

/* =========================================================
   현장 상태 관리
========================================================= */

export default function SiteStatusControl({
  site,
  reportOpen = false,
  updateSiteStatus,
}) {
  if (!site || reportOpen) {
    return null;
  }

  /* =======================================================
     상태 변경
  ======================================================= */

  async function changeStatus(nextStatus) {
    if (
      typeof updateSiteStatus !== "function"
    ) {
      return;
    }

    /*
     * completed 상태는 여기서 직접 변경하지 않습니다.
     *
     * 완료보고가 정상 저장된 뒤
     * 기존 완료보고 로직에서 자동으로 완료 처리합니다.
     */

    if (nextStatus === "completed") {
      return;
    }

    await updateSiteStatus(
      site.id,
      nextStatus,
    );
  }

  /* =======================================================
     화면
  ======================================================= */

  return (
    <section
      style={{
        marginTop: "18px",

        paddingTop: "14px",

        borderTop:
          "1px solid #e5e7eb",
      }}
    >
      {/* =========================
          제목
      ========================= */}

      <div
        style={{
          marginBottom: "8px",

          fontSize: "13px",

          fontWeight: "800",

          color: "#334155",
        }}
      >
        현장 상태
      </div>

      {/* =========================
          완료된 현장
      ========================= */}

      {site.status ===
      "completed" ? (
        <CompletedStatus />
      ) : (
        <>
          {/* =====================
              상태 변경 버튼
          ===================== */}

          <div
            style={{
              display: "grid",

              gridTemplateColumns:
                "1fr 1fr",

              gap: "7px",
            }}
          >
            <StatusButton
              active={
                site.status ===
                "consulting"
              }
              onClick={() =>
                changeStatus(
                  "consulting",
                )
              }
            >
              상담중
            </StatusButton>

            <StatusButton
              active={
                site.status ===
                "scheduled"
              }
              onClick={() =>
                changeStatus(
                  "scheduled",
                )
              }
            >
              시공 예정
            </StatusButton>

            <StatusButton
              active={
                site.status ===
                "in_progress"
              }
              onClick={() =>
                changeStatus(
                  "in_progress",
                )
              }
            >
              시공 중
            </StatusButton>

            <StatusButton
              active={
                site.status ===
                "cancelled"
              }
              onClick={() =>
                changeStatus(
                  "cancelled",
                )
              }
            >
              취소
            </StatusButton>
          </div>

          {/* =====================
              상담중 안내
          ===================== */}

          {site.status ===
            "consulting" && (
            <div
              style={{
                marginTop: "8px",

                padding: "10px",

                borderRadius: "9px",

                background: "#fff7ed",

                color: "#9a3412",

                fontSize: "11px",

                fontWeight: "700",

                lineHeight: "1.5",
              }}
            >
              상담중 현장입니다. 일정이
              확정되면 위의 일정 변경에서
              시작 일시를 저장하면 시공
              예정으로 자동 변경됩니다.
            </div>
          )}

          {/* =====================
              완료 안내
          ===================== */}

          <div
            style={{
              marginTop: "8px",

              padding: "10px",

              borderRadius: "9px",

              background: "#f8fafc",

              color: "#64748b",

              fontSize: "11px",

              lineHeight: "1.5",
            }}
          >
            시공 완료 상태는 아래
            완료보고를 저장하면 자동으로
            변경됩니다.
          </div>
        </>
      )}
    </section>
  );
}

/* =========================================================
   완료 상태
========================================================= */

function CompletedStatus() {
  return (
    <div
      style={{
        padding: "12px",

        border:
          "1px solid #bbf7d0",

        borderRadius: "10px",

        background: "#f0fdf4",

        color: "#166534",

        fontSize: "13px",

        fontWeight: "800",

        textAlign: "center",
      }}
    >
      ✅ 시공 완료된 현장입니다.
    </div>
  );
}

/* =========================================================
   상태 버튼
========================================================= */

function StatusButton({
  active,
  onClick,
  children,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: active
          ? "1px solid #111827"
          : "1px solid #cbd5e1",

        borderRadius: "9px",

        padding: "10px 8px",

        background: active
          ? "#111827"
          : "#ffffff",

        color: active
          ? "#ffffff"
          : "#334155",

        fontSize: "12px",

        fontWeight: "800",

        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
                 }
