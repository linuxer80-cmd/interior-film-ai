"use client";

import { useEffect, useState } from "react";
import {
  formatDateTime,
  toDateTimeLocalValue,
} from "./siteDetailUtils";

/* =========================================================
   현장 일정 표시 / 수정
========================================================= */

export default function SiteScheduleEditor({
  site,
  reportOpen = false,
  updateSiteSchedule,
  reloadSites,
}) {
  const [scheduleEditOpen, setScheduleEditOpen] =
    useState(false);

  const [scheduleStart, setScheduleStart] =
    useState("");

  const [scheduleEnd, setScheduleEnd] =
    useState("");

  const [scheduleSaving, setScheduleSaving] =
    useState(false);

  const [scheduleMessage, setScheduleMessage] =
    useState("");

  /* =======================================================
     현장 변경 시 상태 초기화
  ======================================================= */

  useEffect(() => {
    setScheduleEditOpen(false);
    setScheduleSaving(false);
    setScheduleMessage("");

    setScheduleStart(
      toDateTimeLocalValue(
        site?.schedule_start,
      ),
    );

    setScheduleEnd(
      toDateTimeLocalValue(
        site?.schedule_end,
      ),
    );
  }, [site?.id]);

  /* =======================================================
     일정 값 변경 시 입력값 동기화
  ======================================================= */

  useEffect(() => {
    if (scheduleEditOpen) {
      return;
    }

    setScheduleStart(
      toDateTimeLocalValue(
        site?.schedule_start,
      ),
    );

    setScheduleEnd(
      toDateTimeLocalValue(
        site?.schedule_end,
      ),
    );
  }, [
    site?.schedule_start,
    site?.schedule_end,
    scheduleEditOpen,
  ]);

  /* =======================================================
     일정 수정 시작
  ======================================================= */

  function openScheduleEditor() {
    setScheduleMessage("");

    setScheduleStart(
      toDateTimeLocalValue(
        site?.schedule_start,
      ),
    );

    setScheduleEnd(
      toDateTimeLocalValue(
        site?.schedule_end,
      ),
    );

    setScheduleEditOpen(true);
  }

  /* =======================================================
     일정 수정 취소
  ======================================================= */

  function cancelScheduleEditor() {
    if (scheduleSaving) {
      return;
    }

    setScheduleMessage("");

    setScheduleStart(
      toDateTimeLocalValue(
        site?.schedule_start,
      ),
    );

    setScheduleEnd(
      toDateTimeLocalValue(
        site?.schedule_end,
      ),
    );

    setScheduleEditOpen(false);
  }

  /* =======================================================
     일정 저장
  ======================================================= */

  async function saveSchedule() {
    if (scheduleSaving) {
      return;
    }

    if (
      typeof updateSiteSchedule !==
      "function"
    ) {
      setScheduleMessage(
        "❌ 일정 변경 기능을 사용할 수 없습니다.",
      );
      return;
    }

    if (!site?.id) {
      setScheduleMessage(
        "❌ 현장 정보를 확인할 수 없습니다.",
      );
      return;
    }

    if (!scheduleStart) {
      setScheduleMessage(
        "❌ 시작 일시를 입력해주세요.",
      );
      return;
    }

    const startDate =
      new Date(scheduleStart);

    if (
      Number.isNaN(
        startDate.getTime(),
      )
    ) {
      setScheduleMessage(
        "❌ 시작 일시가 올바르지 않습니다.",
      );
      return;
    }

    let endDate = null;

    if (scheduleEnd) {
      endDate =
        new Date(scheduleEnd);

      if (
        Number.isNaN(
          endDate.getTime(),
        )
      ) {
        setScheduleMessage(
          "❌ 종료 일시가 올바르지 않습니다.",
        );
        return;
      }

      if (
        endDate.getTime() <
        startDate.getTime()
      ) {
        setScheduleMessage(
          "❌ 종료 일시는 시작 일시보다 빠를 수 없습니다.",
        );
        return;
      }
    }

    setScheduleSaving(true);
    setScheduleMessage("");

    try {
      /*
       * datetime-local 값은
       * 브라우저의 로컬시간입니다.
       *
       * Supabase timestamptz 저장을 위해
       * ISO 문자열로 변환합니다.
       */

      const result =
        await updateSiteSchedule({
          siteId: site.id,

          scheduleStart:
            startDate.toISOString(),

          scheduleEnd:
            endDate
              ? endDate.toISOString()
              : null,
        });

      if (!result?.success) {
        setScheduleMessage(
          `❌ ${
            result?.error ||
            "일정을 변경하지 못했습니다."
          }`,
        );
        return;
      }

      setScheduleMessage(
        "✅ 시공 일정이 변경되었습니다.",
      );

      setScheduleEditOpen(false);

      /*
       * 현장 목록을 다시 읽어
       * 상세정보와 목록의 일정을 동기화합니다.
       */

      if (
        typeof reloadSites ===
        "function"
      ) {
        await reloadSites();
      }
    } catch (error) {
      console.error(
        "현장 일정 변경 오류:",
        error,
      );

      setScheduleMessage(
        `❌ 일정 변경 오류: ${
          error?.message ||
          "알 수 없는 오류"
        }`,
      );
    } finally {
      setScheduleSaving(false);
    }
  }

  /* =======================================================
     일정 표시
  ======================================================= */

  const scheduleText =
    site?.schedule_end
      ? `${formatDateTime(
          site?.schedule_start,
        )}\n~ ${formatDateTime(
          site?.schedule_end,
        )}`
      : formatDateTime(
          site?.schedule_start,
        );

  if (!site) {
    return null;
  }

  /* =======================================================
     화면
  ======================================================= */

  return (
    <>
      {/* =========================
          현재 일정
      ========================= */}

      <DetailRow
        label="일정"
        value={scheduleText}
      />

      {/* =========================
          일정 변경

          완료보고 작성 중이거나
          이미 완료된 현장은 숨깁니다.
      ========================= */}

      {!reportOpen &&
        site.status !== "completed" && (
          <div
            style={{
              padding: "10px 0 12px",

              borderBottom:
                "1px solid #f1f5f9",
            }}
          >
            {!scheduleEditOpen ? (
              /* =====================
                 일정 변경 버튼
              ===================== */

              <button
                type="button"
                onClick={
                  openScheduleEditor
                }
                disabled={
                  scheduleSaving
                }
                style={{
                  width: "100%",

                  border:
                    "1px solid #bfdbfe",

                  borderRadius: "9px",

                  padding: "10px",

                  background:
                    "#eff6ff",

                  color: "#1d4ed8",

                  fontSize: "12px",

                  fontWeight: "900",

                  cursor:
                    scheduleSaving
                      ? "not-allowed"
                      : "pointer",

                  opacity:
                    scheduleSaving
                      ? 0.6
                      : 1,
                }}
              >
                📅 일정 변경
              </button>
            ) : (
              /* =====================
                 일정 수정 화면
              ===================== */

              <div
                style={{
                  padding: "12px",

                  border:
                    "1px solid #bfdbfe",

                  borderRadius:
                    "11px",

                  background:
                    "#f8fbff",
                }}
              >
                <div
                  style={{
                    fontSize: "13px",

                    fontWeight: "900",

                    color: "#1e3a8a",
                  }}
                >
                  📅 시공 일정 변경
                </div>

                <div
                  style={{
                    marginTop: "5px",

                    fontSize: "11px",

                    lineHeight: "1.5",

                    color: "#64748b",
                  }}
                >
                  저장하면 배정된
                  시공자에게 변경된 일정이
                  알림으로 전달됩니다.
                </div>

                {/* =====================
                    시작 일시
                ===================== */}

                <label
                  style={{
                    display: "block",

                    marginTop: "12px",
                  }}
                >
                  <div
                    style={{
                      marginBottom: "5px",

                      fontSize: "12px",

                      fontWeight: "800",

                      color: "#334155",
                    }}
                  >
                    시작 일시
                  </div>

                  <input
                    type="datetime-local"
                    value={scheduleStart}
                    onChange={(event) =>
                      setScheduleStart(
                        event.target.value,
                      )
                    }
                    disabled={
                      scheduleSaving
                    }
                    style={{
                      width: "100%",

                      boxSizing:
                        "border-box",

                      padding: "10px",

                      border:
                        "1px solid #cbd5e1",

                      borderRadius:
                        "9px",

                      background:
                        "#ffffff",

                      color: "#111827",

                      fontSize: "14px",
                    }}
                  />
                </label>

                {/* =====================
                    종료 일시
                ===================== */}

                <label
                  style={{
                    display: "block",

                    marginTop: "10px",
                  }}
                >
                  <div
                    style={{
                      marginBottom: "5px",

                      fontSize: "12px",

                      fontWeight: "800",

                      color: "#334155",
                    }}
                  >
                    종료 일시
                  </div>

                  <input
                    type="datetime-local"
                    value={scheduleEnd}
                    onChange={(event) =>
                      setScheduleEnd(
                        event.target.value,
                      )
                    }
                    disabled={
                      scheduleSaving
                    }
                    style={{
                      width: "100%",

                      boxSizing:
                        "border-box",

                      padding: "10px",

                      border:
                        "1px solid #cbd5e1",

                      borderRadius:
                        "9px",

                      background:
                        "#ffffff",

                      color: "#111827",

                      fontSize: "14px",
                    }}
                  />
                </label>

                {/* =====================
                    취소 / 저장
                ===================== */}

                <div
                  style={{
                    display: "grid",

                    gridTemplateColumns:
                      "1fr 1fr",

                    gap: "7px",

                    marginTop: "12px",
                  }}
                >
                  <button
                    type="button"
                    onClick={
                      cancelScheduleEditor
                    }
                    disabled={
                      scheduleSaving
                    }
                    style={{
                      border:
                        "1px solid #cbd5e1",

                      borderRadius:
                        "9px",

                      padding: "10px",

                      background:
                        "#ffffff",

                      color: "#475569",

                      fontSize: "12px",

                      fontWeight: "800",

                      cursor:
                        scheduleSaving
                          ? "not-allowed"
                          : "pointer",

                      opacity:
                        scheduleSaving
                          ? 0.6
                          : 1,
                    }}
                  >
                    취소
                  </button>

                  <button
                    type="button"
                    onClick={
                      saveSchedule
                    }
                    disabled={
                      scheduleSaving
                    }
                    style={{
                      border: "none",

                      borderRadius:
                        "9px",

                      padding: "10px",

                      background:
                        "#2563eb",

                      color: "#ffffff",

                      fontSize: "12px",

                      fontWeight: "900",

                      cursor:
                        scheduleSaving
                          ? "not-allowed"
                          : "pointer",

                      opacity:
                        scheduleSaving
                          ? 0.6
                          : 1,
                    }}
                  >
                    {scheduleSaving
                      ? "저장 중..."
                      : "일정 저장"}
                  </button>
                </div>
              </div>
            )}

            {/* =====================
                일정 저장 메시지
            ===================== */}

            {scheduleMessage && (
              <div
                style={{
                  marginTop: "8px",

                  padding: "9px 10px",

                  borderRadius: "8px",

                  background:
                    scheduleMessage.startsWith(
                      "✅",
                    )
                      ? "#f0fdf4"
                      : "#fef2f2",

                  color:
                    scheduleMessage.startsWith(
                      "✅",
                    )
                      ? "#166534"
                      : "#b91c1c",

                  fontSize: "11px",

                  fontWeight: "800",

                  whiteSpace:
                    "pre-wrap",

                  wordBreak:
                    "break-word",
                }}
              >
                {scheduleMessage}
              </div>
            )}
          </div>
        )}
    </>
  );
}

/* =========================================================
   상세정보 한 줄
========================================================= */

function DetailRow({
  label,
  value,
}) {
  return (
    <div
      style={{
        display: "grid",

        gridTemplateColumns:
          "90px 1fr",

        gap: "10px",

        padding: "10px 0",

        borderBottom:
          "1px solid #f1f5f9",

        fontSize: "13px",
      }}
    >
      <div
        style={{
          color: "#64748b",

          fontWeight: "700",
        }}
      >
        {label}
      </div>

      <div
        style={{
          color: "#111827",

          fontWeight: "600",

          whiteSpace: "pre-wrap",

          wordBreak: "break-word",
        }}
      >
        {value}
      </div>
    </div>
  );
          }
