"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import SiteWorkerAssignment from "./SiteWorkerAssignment";
import SiteWorkReport from "./SiteWorkReport";
import SiteCompletedReport from "./SiteCompletedReport";
import SiteWorkReportReview from "./SiteWorkReportReview";
import useSiteWorkReport from "./hooks/useSiteWorkReport";

const STATUS_INFO = {
  scheduled: {
    label: "시공 예정",
    background: "#eff6ff",
    color: "#1d4ed8",
  },
  in_progress: {
    label: "시공 중",
    background: "#fff7ed",
    color: "#c2410c",
  },
  completed: {
    label: "시공 완료",
    background: "#f0fdf4",
    color: "#15803d",
  },
  cancelled: {
    label: "취소",
    background: "#f8fafc",
    color: "#64748b",
  },
};

const PHOTO_BUCKET = "work-photos";
const SIGNED_URL_SECONDS = 1800;

/* =========================================================
   날짜 표시
========================================================= */

function formatDateTime(value) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/* =========================================================
   datetime-local 값 변환
========================================================= */

function toDateTimeLocalValue(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const pad = (number) =>
    String(number).padStart(2, "0");

  return [
    date.getFullYear(),
    "-",
    pad(date.getMonth() + 1),
    "-",
    pad(date.getDate()),
    "T",
    pad(date.getHours()),
    ":",
    pad(date.getMinutes()),
  ].join("");
}

/* =========================================================
   금액 표시
========================================================= */

function formatWon(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "-";
  }

  const number = Number(value);

  if (Number.isNaN(number)) {
    return "-";
  }

  return `${number.toLocaleString("ko-KR")}원`;
}

/* =========================================================
   수량 표시
========================================================= */

function formatQuantity(value, unit) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "-";
  }

  const number = Number(value);

  const quantity = Number.isNaN(number)
    ? value
    : number.toLocaleString("ko-KR");

  return `${quantity}${unit ? ` ${unit}` : ""}`;
}

/* =========================================================
   팀장
========================================================= */

function getLeader(site) {
  const assignments = site?.site_workers || [];

  return assignments.find(
    (item) => item.role === "leader",
  );
}

/* =========================================================
   일반 시공자
========================================================= */

function getMembers(site) {
  const assignments = site?.site_workers || [];

  return assignments.filter(
    (item) => item.role === "member",
  );
}

/* =========================================================
   현장 상세
========================================================= */

export default function SiteDetailModal({
  companyId,

  site,
  onClose,

  updateSiteSchedule,
  updateSiteStatus,

  addSiteRequestPhotos,
  deleteSiteRequestPhoto,

  workers = [],
  workersLoading = false,

  loadWorkers,
  loadSiteWorkers,
  assignSiteWorkers,

  reloadSites,
}) {
  const [materials, setMaterials] = useState([]);
  const [photos, setPhotos] = useState([]);

  const [detailLoading, setDetailLoading] =
    useState(false);

  const [detailMessage, setDetailMessage] =
    useState("");

  /* =======================================================
     요청사진 관리
  ======================================================= */

  const [photoUploading, setPhotoUploading] =
    useState(false);

  const [photoDeletingId, setPhotoDeletingId] =
    useState(null);

  const [photoMessage, setPhotoMessage] =
    useState("");

  const photoInputRef = useRef(null);

  const [reportOpen, setReportOpen] =
    useState(false);

  /* =======================================================
     일정 수정
  ======================================================= */

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

  /*
   * 시공자 완료보고 존재 여부
   *
   * null  = 확인 중 / 조회 오류
   * false = 시공자 완료보고 없음
   * true  = 시공자 완료보고 있음
   */

  const [hasWorkerReport, setHasWorkerReport] =
    useState(null);

  const {
    reportSaving,
    reportMessage,
    submitWorkReport,
    clearReportMessage,
  } = useSiteWorkReport({
    companyId,
    reloadSites,
  });

  const status =
    STATUS_INFO[site?.status] ||
    STATUS_INFO.scheduled;

  const leader = getLeader(site);
  const members = getMembers(site);

  /* =======================================================
     현장 추가정보 로드
  ======================================================= */

  useEffect(() => {
    if (!site?.id) return;

    let cancelled = false;

    async function loadDetailData() {
      setDetailLoading(true);
      setDetailMessage("");

      try {
        /*
         * 1. 예정 시공 자재
         */

        const {
          data: materialData,
          error: materialError,
        } = await supabase
          .from("site_materials")
          .select(
            `
              id,
              brand,
              product_code,
              product_name,
              quantity,
              unit,
              unit_price,
              total_price,
              memo,
              material_type,
              created_at
            `,
          )
          .eq("site_id", site.id)
          .eq("material_type", "planned")
          .order("created_at", {
            ascending: true,
          });

        if (materialError) {
          throw materialError;
        }

        /*
         * 2. 현장 요청 사진
         */

        const {
          data: photoData,
          error: photoError,
        } = await supabase
          .from("site_photos")
          .select(
            `
              id,
              photo_type,
              storage_path,
              photo_url,
              description,
              created_at
            `,
          )
          .eq("site_id", site.id)
          .eq("photo_type", "request")
          .order("created_at", {
            ascending: true,
          });

        if (photoError) {
          throw photoError;
        }

        /*
         * 3. private Storage 사진 signed URL 생성
         */

        const signedPhotos = await Promise.all(
          (photoData || []).map(
            async (photo) => {
              if (!photo.storage_path) {
                return {
                  ...photo,
                  signed_url:
                    photo.photo_url || "",
                };
              }

              const {
                data: signedData,
                error: signedError,
              } = await supabase.storage
                .from(PHOTO_BUCKET)
                .createSignedUrl(
                  photo.storage_path,
                  SIGNED_URL_SECONDS,
                );

              if (signedError) {
                console.error(
                  "현장 요청사진 signed URL 오류:",
                  signedError,
                );

                return {
                  ...photo,
                  signed_url: "",
                };
              }

              return {
                ...photo,
                signed_url:
                  signedData?.signedUrl || "",
              };
            },
          ),
        );

        if (cancelled) return;

        setMaterials(materialData || []);
        setPhotos(signedPhotos || []);
      } catch (error) {
        console.error(
          "현장 상세정보 로드 오류:",
          error,
        );

        if (!cancelled) {
          setMaterials([]);
          setPhotos([]);

          setDetailMessage(
            `❌ 추가정보를 불러오지 못했습니다: ${
              error?.message || "알 수 없는 오류"
            }`,
          );
        }
      } finally {
        if (!cancelled) {
          setDetailLoading(false);
        }
      }
    }

    loadDetailData();

    return () => {
      cancelled = true;
    };
  }, [site?.id]);

  /* =======================================================
     현장 변경 시 상태 초기화
  ======================================================= */

  useEffect(() => {
    setReportOpen(false);
    setHasWorkerReport(null);

    setScheduleEditOpen(false);
    setScheduleSaving(false);
    setScheduleMessage("");

    setPhotoUploading(false);
    setPhotoDeletingId(null);
    setPhotoMessage("");

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

    if (
      typeof clearReportMessage === "function"
    ) {
      clearReportMessage();
    }
  }, [
    site?.id,
    clearReportMessage,
  ]);

  /* =======================================================
     site 일정 값 변경 시 입력값 동기화
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
     요청사진 다시 불러오기
  ======================================================= */

  async function refreshRequestPhotos() {
    if (!site?.id) {
      return;
    }

    const {
      data: photoData,
      error: photoError,
    } = await supabase
      .from("site_photos")
      .select(
        `
          id,
          photo_type,
          storage_path,
          photo_url,
          description,
          created_at
        `,
      )
      .eq("site_id", site.id)
      .eq("photo_type", "request")
      .order("created_at", {
        ascending: true,
      });

    if (photoError) {
      throw photoError;
    }

    const signedPhotos = await Promise.all(
      (photoData || []).map(
        async (photo) => {
          if (!photo.storage_path) {
            return {
              ...photo,
              signed_url:
                photo.photo_url || "",
            };
          }

          const {
            data: signedData,
            error: signedError,
          } = await supabase.storage
            .from(PHOTO_BUCKET)
            .createSignedUrl(
              photo.storage_path,
              SIGNED_URL_SECONDS,
            );

          if (signedError) {
            console.error(
              "현장 요청사진 signed URL 오류:",
              signedError,
            );

            return {
              ...photo,
              signed_url: "",
            };
          }

          return {
            ...photo,
            signed_url:
              signedData?.signedUrl || "",
          };
        },
      ),
    );

    setPhotos(signedPhotos || []);
  }

  /* =======================================================
     요청사진 추가
  ======================================================= */

  async function handleRequestPhotoFiles(event) {
    const files = Array.from(
      event.target.files || [],
    ).filter((file) =>
      file?.type?.startsWith("image/"),
    );

    event.target.value = "";

    if (files.length === 0) {
      return;
    }

    if (
      typeof addSiteRequestPhotos !== "function"
    ) {
      setPhotoMessage(
        "❌ 사진 추가 기능을 사용할 수 없습니다.",
      );
      return;
    }

    setPhotoUploading(true);
    setPhotoMessage("");

    try {
      const result =
        await addSiteRequestPhotos({
          siteId: site.id,
          files,
        });

      if (!result?.success) {
        setPhotoMessage(
          `❌ ${
            result?.error ||
            "사진을 등록하지 못했습니다."
          }`,
        );
        return;
      }

      await refreshRequestPhotos();

      setPhotoMessage(
        `✅ 요청사진 ${files.length}장이 등록되었습니다.`,
      );
    } catch (error) {
      console.error(
        "현장 요청사진 추가 오류:",
        error,
      );

      setPhotoMessage(
        `❌ 사진 등록 오류: ${
          error?.message || "알 수 없는 오류"
        }`,
      );
    } finally {
      setPhotoUploading(false);
    }
  }

  /* =======================================================
     요청사진 삭제
  ======================================================= */

  async function handleDeleteRequestPhoto(photo) {
    if (
      !photo?.id ||
      photoDeletingId ||
      photoUploading
    ) {
      return;
    }

    if (
      typeof deleteSiteRequestPhoto !== "function"
    ) {
      setPhotoMessage(
        "❌ 사진 삭제 기능을 사용할 수 없습니다.",
      );
      return;
    }

    const confirmed = window.confirm(
      "이 요청사진을 삭제할까요?",
    );

    if (!confirmed) {
      return;
    }

    setPhotoDeletingId(photo.id);
    setPhotoMessage("");

    try {
      const result =
        await deleteSiteRequestPhoto({
          siteId: site.id,
          photoId: photo.id,
          storagePath:
            photo.storage_path || null,
        });

      if (!result?.success) {
        setPhotoMessage(
          `❌ ${
            result?.error ||
            "사진을 삭제하지 못했습니다."
          }`,
        );
        return;
      }

      setPhotos((current) =>
        current.filter(
          (item) => item.id !== photo.id,
        ),
      );

      setPhotoMessage(
        result?.storageWarning
          ? "✅ 사진 정보는 삭제되었습니다. 저장소 파일 정리는 확인이 필요합니다."
          : "✅ 요청사진이 삭제되었습니다.",
      );
    } catch (error) {
      console.error(
        "현장 요청사진 삭제 오류:",
        error,
      );

      setPhotoMessage(
        `❌ 사진 삭제 오류: ${
          error?.message || "알 수 없는 오류"
        }`,
      );
    } finally {
      setPhotoDeletingId(null);
    }
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
     * completed는 여기서 직접 변경하지 않습니다.
     * 완료보고가 모두 정상 저장된 후
     * useSiteWorkReport에서만 완료 처리합니다.
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
      typeof updateSiteSchedule !== "function"
    ) {
      setScheduleMessage(
        "❌ 일정 변경 기능을 사용할 수 없습니다.",
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
       * datetime-local은 브라우저 로컬시간입니다.
       * ISO 문자열로 변환하여
       * Supabase timestamptz에 저장합니다.
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
       * 목록도 다시 읽어 site_workers 등
       * 상세 데이터가 최신 상태를 유지하도록 합니다.
       */

      if (
        typeof reloadSites === "function"
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
     시공자 배정 저장 후
  ======================================================= */

  async function handleAssignmentSaved() {
    if (
      typeof reloadSites === "function"
    ) {
      await reloadSites();
    }
  }

  /* =======================================================
     완료보고
  ======================================================= */

  function openWorkReport() {
    if (
      typeof clearReportMessage === "function"
    ) {
      clearReportMessage();
    }

    setReportOpen(true);
  }

  function closeWorkReport() {
    if (reportSaving) {
      return;
    }

    setReportOpen(false);

    if (
      typeof clearReportMessage === "function"
    ) {
      clearReportMessage();
    }
  }

  async function handleWorkReportSave(payload) {
    const success =
      await submitWorkReport(payload);

    if (!success) {
      return false;
    }

    setReportOpen(false);

    if (
      typeof onClose === "function"
    ) {
      onClose();
    }

    return true;
  }

  if (!site) {
    return null;
  }

  /* =======================================================
     화면
  ======================================================= */

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1001,

        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",

        padding: "24px 12px",

        background:
          "rgba(15,23,42,0.55)",

        overflowY: "auto",
      }}
    >
      <div
        onClick={(event) =>
          event.stopPropagation()
        }
        style={{
          width: "100%",
          maxWidth: "600px",
          padding: "16px",

          borderRadius: "16px",
          background: "#ffffff",

          boxShadow:
            "0 20px 50px rgba(0,0,0,0.20)",
        }}
      >
        {/* =========================
            상세 상단
        ========================= */}

        <div
          style={{
            display: "flex",
            justifyContent:
              "space-between",
            alignItems: "flex-start",
            gap: "10px",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "19px",
                fontWeight: "900",
                color: "#111827",
              }}
            >
              {site.site_name ||
                site.customer_name ||
                "현장 상세"}
            </div>

            <div
              style={{
                marginTop: "5px",
              }}
            >
              <span
                style={{
                  display: "inline-block",

                  padding: "5px 8px",

                  borderRadius: "999px",

                  background:
                    status.background,

                  color: status.color,

                  fontSize: "11px",

                  fontWeight: "800",
                }}
              >
                {status.label}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={
              reportSaving ||
              scheduleSaving
            }
            style={{
              border: "none",
              background: "transparent",
              fontSize: "26px",
              color: "#64748b",

              cursor:
                reportSaving ||
                scheduleSaving
                  ? "not-allowed"
                  : "pointer",

              opacity:
                reportSaving ||
                scheduleSaving
                  ? 0.5
                  : 1,
            }}
          >
            ×
          </button>
        </div>

        {/* =========================
            기본 정보
        ========================= */}

        <div
          style={{
            marginTop: "10px",
          }}
        >
          <DetailRow
            label="일정"
            value={
              site.schedule_end
                ? `${formatDateTime(
                    site.schedule_start,
                  )}\n~ ${formatDateTime(
                    site.schedule_end,
                  )}`
                : formatDateTime(
                    site.schedule_start,
                  )
            }
          />

          {/* =========================
              일정 변경
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
                <button
                  type="button"
                  onClick={
                    openScheduleEditor
                  }
                  disabled={scheduleSaving}
                  style={{
                    width: "100%",

                    border:
                      "1px solid #bfdbfe",

                    borderRadius: "9px",

                    padding: "10px",

                    background: "#eff6ff",

                    color: "#1d4ed8",

                    fontSize: "12px",
                    fontWeight: "900",

                    cursor: "pointer",
                  }}
                >
                  📅 일정 변경
                </button>
              ) : (
                <div
                  style={{
                    padding: "12px",

                    border:
                      "1px solid #bfdbfe",

                    borderRadius: "11px",

                    background: "#f8fbff",
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
                    저장하면 배정된 시공자에게
                    변경된 일정이 알림으로
                    전달됩니다.
                  </div>

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
                      disabled={scheduleSaving}
                      style={{
                        width: "100%",
                        boxSizing:
                          "border-box",

                        padding: "10px",

                        border:
                          "1px solid #cbd5e1",

                        borderRadius: "9px",

                        background: "#ffffff",

                        color: "#111827",

                        fontSize: "14px",
                      }}
                    />
                  </label>

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
                      disabled={scheduleSaving}
                      style={{
                        width: "100%",
                        boxSizing:
                          "border-box",

                        padding: "10px",

                        border:
                          "1px solid #cbd5e1",

                        borderRadius: "9px",

                        background: "#ffffff",

                        color: "#111827",

                        fontSize: "14px",
                      }}
                    />
                  </label>

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
                      disabled={scheduleSaving}
                      style={{
                        border:
                          "1px solid #cbd5e1",

                        borderRadius: "9px",

                        padding: "10px",

                        background: "#ffffff",

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
                      onClick={saveSchedule}
                      disabled={scheduleSaving}
                      style={{
                        border: "none",

                        borderRadius: "9px",

                        padding: "10px",

                        background: "#2563eb",

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

                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {scheduleMessage}
                </div>
              )}
            </div>
          )}

          <DetailRow
            label="고객"
            value={
              site.customer_name || "-"
            }
          />

          <DetailRow
            label="전화번호"
            value={
              site.customer_phone || "-"
            }
          />

          <DetailRow
            label="주소"
            value={`${site.address || "-"}${
              site.address_detail
                ? ` ${site.address_detail}`
                : ""
            }`}
          />

          <DetailRow
            label="지역"
            value={site.region || "-"}
          />

          <DetailRow
            label="시공 종류"
            value={site.work_type || "-"}
          />

          <DetailRow
            label="작업 내용"
            value={
              site.work_description || "-"
            }
          />

          <DetailRow
            label="계약금액"
            value={formatWon(
              site.contract_amount,
            )}
          />

          <DetailRow
            label="선금"
            value={formatWon(
              site.deposit_amount,
            )}
          />

          <DetailRow
            label="팀장"
            value={
              leader?.workers?.name ||
              "미배정"
            }
          />

          <DetailRow
            label="담당자"
            value={
              members.length > 0
                ? members
                    .map(
                      (item) =>
                        item.workers?.name,
                    )
                    .filter(Boolean)
                    .join(", ")
                : "미배정"
            }
          />

          <DetailRow
            label="메모"
            value={site.memo || "-"}
          />
        </div>
        {/* =========================
            추가정보 로딩/오류
        ========================= */}

        {detailLoading && (
          <div
            style={{
              marginTop: "16px",
              padding: "12px",
              borderRadius: "10px",
              background: "#f8fafc",
              color: "#64748b",
              fontSize: "13px",
              textAlign: "center",
            }}
          >
            시공자재와 요청사진을
            불러오는 중입니다...
          </div>
        )}

        {detailMessage && (
          <div
            style={{
              marginTop: "16px",
              padding: "11px 12px",
              borderRadius: "10px",
              background: "#fef2f2",
              color: "#b91c1c",
              fontSize: "12px",
              fontWeight: "700",
              wordBreak: "break-word",
            }}
          >
            {detailMessage}
          </div>
        )}

        {/* =========================
            예정 시공 자재
        ========================= */}

        {!detailLoading && (
          <section
            style={{
              marginTop: "18px",
              paddingTop: "14px",
              borderTop:
                "1px solid #e5e7eb",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent:
                  "space-between",
                gap: "10px",
                marginBottom: "10px",
              }}
            >
              <div
                style={{
                  fontSize: "14px",
                  fontWeight: "900",
                  color: "#111827",
                }}
              >
                📦 예정 시공 자재
              </div>

              <div
                style={{
                  fontSize: "11px",
                  fontWeight: "800",
                  color: "#64748b",
                }}
              >
                {materials.length}건
              </div>
            </div>

            {materials.length === 0 ? (
              <EmptyBox text="등록된 예정 시공 자재가 없습니다." />
            ) : (
              <div
                style={{
                  display: "grid",
                  gap: "8px",
                }}
              >
                {materials.map(
                  (material, index) => (
                    <MaterialCard
                      key={material.id}
                      material={material}
                      index={index}
                    />
                  ),
                )}
              </div>
            )}
          </section>
        )}

        {/* =========================
            요청 사진
        ========================= */}

        {!detailLoading && (
          <section
            style={{
              marginTop: "18px",
              paddingTop: "14px",
              borderTop:
                "1px solid #e5e7eb",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent:
                  "space-between",
                gap: "10px",
                marginBottom: "10px",
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: "14px",
                    fontWeight: "900",
                    color: "#111827",
                  }}
                >
                  📷 시공 요청사진
                </div>

                <div
                  style={{
                    marginTop: "3px",
                    fontSize: "11px",
                    fontWeight: "700",
                    color: "#64748b",
                  }}
                >
                  {photos.length}장
                </div>
              </div>

              <>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={
                    handleRequestPhotoFiles
                  }
                  disabled={
                    photoUploading ||
                    Boolean(
                      photoDeletingId,
                    )
                  }
                  style={{
                    display: "none",
                  }}
                />

                <button
                  type="button"
                  onClick={() =>
                    photoInputRef.current?.click()
                  }
                  disabled={
                    photoUploading ||
                    Boolean(
                      photoDeletingId,
                    )
                  }
                  style={{
                    flex: "0 0 auto",
                    border: "none",
                    borderRadius: "9px",
                    padding: "9px 11px",
                    background: "#2563eb",
                    color: "#ffffff",
                    fontSize: "12px",
                    fontWeight: "900",

                    cursor:
                      photoUploading ||
                      photoDeletingId
                        ? "not-allowed"
                        : "pointer",

                    opacity:
                      photoUploading ||
                      photoDeletingId
                        ? 0.6
                        : 1,
                  }}
                >
                  {photoUploading
                    ? "업로드 중..."
                    : "+ 사진 추가"}
                </button>
              </>
            </div>

            {photoMessage && (
              <div
                style={{
                  marginBottom: "10px",
                  padding: "9px 10px",
                  borderRadius: "9px",

                  background:
                    photoMessage.startsWith(
                      "✅",
                    )
                      ? "#f0fdf4"
                      : "#fef2f2",

                  color:
                    photoMessage.startsWith(
                      "✅",
                    )
                      ? "#166534"
                      : "#b91c1c",

                  fontSize: "11px",
                  fontWeight: "800",

                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {photoMessage}
              </div>
            )}

            {photos.length === 0 ? (
              <EmptyBox text="등록된 요청사진이 없습니다." />
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(2, minmax(0, 1fr))",
                  gap: "8px",
                }}
              >
                {photos.map(
                  (photo, index) => (
                    <PhotoCard
                      key={photo.id}
                      photo={photo}
                      index={index}
                      deleting={
                        photoDeletingId ===
                        photo.id
                      }
                      disabled={
                        photoUploading ||
                        Boolean(
                          photoDeletingId,
                        )
                      }
                      onDelete={() =>
                        handleDeleteRequestPhoto(
                          photo,
                        )
                      }
                    />
                  ),
                )}
              </div>
            )}
          </section>
        )}

        {/* =========================
            시공자 완료보고 관리자 검수
        ========================= */}

        <SiteWorkReportReview
          siteId={site.id}
          onReportStateChange={({
            hasReport,
          }) => {
            setHasWorkerReport(
              Boolean(hasReport),
            );
          }}
        />

        {/* =========================
            현장 상태
        ========================= */}

        {!reportOpen && (
          <div
            style={{
              marginTop: "18px",
              paddingTop: "14px",
              borderTop:
                "1px solid #e5e7eb",
            }}
          >
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

            {site.status ===
            "completed" ? (
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
            ) : (
              <>
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
          </div>
        )}

        {/* =========================
            시공 완료 보고 작성

            시공자 완료보고가 없는 현장에서만
            기존 관리자 직접 완료보고를 사용합니다.
        ========================= */}

        {site.status !==
          "completed" &&
          hasWorkerReport === false && (
          <section
            style={{
              marginTop: "18px",
              paddingTop: "14px",
              borderTop:
                "1px solid #e5e7eb",
            }}
          >
            {!reportOpen ? (
              <>
                <div
                  style={{
                    fontSize: "14px",
                    fontWeight: "900",
                    color: "#111827",
                  }}
                >
                  ✅ 시공 완료 보고
                </div>

                <div
                  style={{
                    marginTop: "5px",

                    fontSize: "12px",
                    lineHeight: "1.5",

                    color: "#64748b",
                  }}
                >
                  실제 시공 내용, 사용 자재,
                  현장 경비와 완료사진을
                  등록한 후 현장을
                  완료 처리합니다.
                </div>

                <button
                  type="button"
                  onClick={
                    openWorkReport
                  }
                  style={{
                    width: "100%",

                    marginTop: "10px",

                    padding: "12px",

                    border: "none",

                    borderRadius: "10px",

                    background: "#16a34a",

                    color: "#ffffff",

                    fontSize: "13px",
                    fontWeight: "900",

                    cursor: "pointer",
                  }}
                >
                  ✅ 시공 완료 보고 작성
                </button>
              </>
            ) : (
              <SiteWorkReport
                site={site}
                saving={
                  reportSaving
                }
                message={
                  reportMessage
                }
                onSave={
                  handleWorkReportSave
                }
                onCancel={
                  closeWorkReport
                }
              />
            )}
          </section>
        )}

        {/* =========================
            저장된 시공 완료 보고
        ========================= */}

        {site.status ===
          "completed" && (
          <SiteCompletedReport
            companyId={
              companyId
            }
            site={site}
          />
        )}

        {/* =========================
            팀장 / 시공자 배정
        ========================= */}

        {!reportOpen && (
          <div
            style={{
              marginTop: "18px",
              paddingTop: "14px",
              borderTop:
                "1px solid #e5e7eb",
            }}
          >
            <div
              style={{
                marginBottom: "10px",
                fontSize: "14px",
                fontWeight: "900",
                color: "#111827",
              }}
            >
              👷 담당 시공자 배정
            </div>

            <SiteWorkerAssignment
              site={site}
              workers={
                workers
              }
              workersLoading={
                workersLoading
              }
              loadWorkers={
                loadWorkers
              }
              loadSiteWorkers={
                loadSiteWorkers
              }
              assignSiteWorkers={
                assignSiteWorkers
              }
              onSaved={
                handleAssignmentSaved
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}

/* =========================================================
   예정 자재 카드
========================================================= */

function MaterialCard({
  material,
  index,
}) {
  const title =
    material.product_code ||
    material.product_name ||
    `자재 ${index + 1}`;

  return (
    <div
      style={{
        padding: "12px",

        border:
          "1px solid #e2e8f0",

        borderRadius: "11px",

        background: "#f8fafc",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent:
            "space-between",
          gap: "8px",
        }}
      >
        <div
          style={{
            minWidth: 0,
          }}
        >
          <div
            style={{
              fontSize: "13px",
              fontWeight: "900",
              color: "#111827",
              wordBreak: "break-word",
            }}
          >
            {title}
          </div>

          {(material.brand ||
            material.product_name) && (
            <div
              style={{
                marginTop: "3px",
                fontSize: "11px",
                color: "#64748b",
                wordBreak: "break-word",
              }}
            >
              {[
                material.brand,
                material.product_name,
              ]
                .filter(Boolean)
                .join(" · ")}
            </div>
          )}
        </div>

        <div
          style={{
            flex: "0 0 auto",

            padding: "4px 7px",

            borderRadius: "999px",

            background: "#ffffff",

            border:
              "1px solid #e2e8f0",

            fontSize: "11px",
            fontWeight: "800",
            color: "#334155",
          }}
        >
          {formatQuantity(
            material.quantity,
            material.unit,
          )}
        </div>
      </div>

      {(material.unit_price !== null &&
        material.unit_price !==
          undefined) ||
      (material.total_price !== null &&
        material.total_price !==
          undefined) ? (
        <div
          style={{
            marginTop: "9px",
            display: "grid",
            gap: "4px",
            fontSize: "11px",
            color: "#475569",
          }}
        >
          {material.unit_price !==
            null &&
            material.unit_price !==
              undefined && (
              <div>
                단가{" "}
                <strong>
                  {formatWon(
                    material.unit_price,
                  )}
                </strong>
              </div>
            )}

          {material.total_price !==
            null &&
            material.total_price !==
              undefined && (
              <div>
                합계{" "}
                <strong>
                  {formatWon(
                    material.total_price,
                  )}
                </strong>
              </div>
            )}
        </div>
      ) : null}

      {material.memo && (
        <div
          style={{
            marginTop: "8px",
            paddingTop: "8px",
            borderTop:
              "1px solid #e2e8f0",
            fontSize: "11px",
            color: "#64748b",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {material.memo}
        </div>
      )}
    </div>
  );
}
/* =========================================================
   요청 사진 카드
========================================================= */

function PhotoCard({
  photo,
  index,
  deleting = false,
  disabled = false,
  onDelete,
}) {
  if (!photo.signed_url) {
    return (
      <div
        style={{
          position: "relative",
          aspectRatio: "1 / 1",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "10px",
          border: "1px solid #e2e8f0",
          borderRadius: "11px",
          background: "#f8fafc",
          color: "#94a3b8",
          fontSize: "11px",
          fontWeight: "700",
          textAlign: "center",
        }}
      >
        사진을 불러올 수 없습니다.

        <button
          type="button"
          onClick={onDelete}
          disabled={disabled}
          style={{
            position: "absolute",
            top: "6px",
            right: "6px",
            border: "none",
            borderRadius: "8px",
            padding: "6px 7px",
            background: "rgba(185,28,28,0.90)",
            color: "#ffffff",
            fontSize: "11px",
            fontWeight: "900",
            cursor: disabled
              ? "not-allowed"
              : "pointer",
            opacity: disabled ? 0.6 : 1,
          }}
        >
          {deleting ? "삭제 중" : "삭제"}
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        position: "relative",
        aspectRatio: "1 / 1",
        overflow: "hidden",
        borderRadius: "11px",
        border: "1px solid #e2e8f0",
        background: "#f8fafc",
      }}
    >
      <a
        href={photo.signed_url}
        target="_blank"
        rel="noreferrer"
        style={{
          display: "block",
          width: "100%",
          height: "100%",
        }}
      >
        <img
          src={photo.signed_url}
          alt={`시공 요청사진 ${index + 1}`}
          loading="lazy"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />
      </a>

      <div
        style={{
          position: "absolute",
          left: "6px",
          bottom: "6px",
          padding: "3px 6px",
          borderRadius: "999px",
          background: "rgba(15,23,42,0.72)",
          color: "#ffffff",
          fontSize: "10px",
          fontWeight: "800",
          pointerEvents: "none",
        }}
      >
        요청사진 {index + 1}
      </div>

      <button
        type="button"
        onClick={onDelete}
        disabled={disabled}
        style={{
          position: "absolute",
          top: "6px",
          right: "6px",
          border: "none",
          borderRadius: "8px",
          padding: "6px 7px",
          background: "rgba(185,28,28,0.90)",
          color: "#ffffff",
          fontSize: "11px",
          fontWeight: "900",
          cursor: disabled
            ? "not-allowed"
            : "pointer",
          opacity: disabled ? 0.6 : 1,
        }}
      >
        {deleting
          ? "삭제 중"
          : "🗑 삭제"}
      </button>
    </div>
  );
}

/* =========================================================
   빈 데이터
========================================================= */

function EmptyBox({
  text,
}) {
  return (
    <div
      style={{
        padding: "16px 12px",
        border: "1px dashed #cbd5e1",
        borderRadius: "11px",
        background: "#f8fafc",
        color: "#64748b",
        fontSize: "12px",
        textAlign: "center",
      }}
    >
      {text}
    </div>
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
        gridTemplateColumns: "90px 1fr",
        gap: "10px",
        padding: "10px 0",
        borderBottom: "1px solid #f1f5f9",
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
