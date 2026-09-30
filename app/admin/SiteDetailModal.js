"use client";

import { useEffect, useRef, useState } from "react";

import SiteWorkerAssignment from "./SiteWorkerAssignment";
import SiteWorkReport from "./SiteWorkReport";
import SiteCompletedReport from "./SiteCompletedReport";
import SiteWorkReportReview from "./SiteWorkReportReview";

import useSiteWorkReport from "./hooks/useSiteWorkReport";

import SiteRequestPhotos from "./site-detail/SiteRequestPhotos";
import SiteMaterials from "./site-detail/SiteMaterials";
import SiteBasicInfo from "./site-detail/SiteBasicInfo";
import SiteScheduleEditor from "./site-detail/SiteScheduleEditor";
import SiteStatusControl from "./site-detail/SiteStatusControl";

/* =========================================================
   현장 상태 표시 정보
========================================================= */

const STATUS_INFO = {
  consulting: {
    label: "상담중",
    background: "#fff7ed",
    color: "#c2410c",
  },

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

/* =========================================================
   현장 상세
========================================================= */

export default function SiteDetailModal({
  companyId,

  site,
  onClose,

  updateSiteBasicInfo,
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
  const [reportOpen, setReportOpen] =
    useState(false);
  const taskSections = useRef({});

  /*
   * 시공자 완료보고 존재 여부
   *
   * null  = 확인 중 / 조회 오류
   * false = 시공자 완료보고 없음
   * true  = 시공자 완료보고 있음
   */

  const [
    hasWorkerReport,
    setHasWorkerReport,
  ] = useState(null);
  const [reviewStatus, setReviewStatus] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("site") !== String(site?.id)) return;
    const section = params.get("section");
    const frame = requestAnimationFrame(() => {
      // The report form appears only after its existence has been checked.
      const target = taskSections.current[section] || (section === "report-write" && hasWorkerReport ? taskSections.current.report : null);
      target?.scrollIntoView({ block: "start" });
      target?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [site?.id, hasWorkerReport]);

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
    STATUS_INFO.consulting;

  /* =======================================================
     현장 변경 시 상태 초기화
  ======================================================= */

  useEffect(() => {
    setReportOpen(false);
    setHasWorkerReport(null);
    setReviewStatus(null);

    if (
      typeof clearReportMessage ===
      "function"
    ) {
      clearReportMessage();
    }
  }, [
    site?.id,
    clearReportMessage,
  ]);

  /* =======================================================
     시공자 배정 저장 후
  ======================================================= */

  async function handleAssignmentSaved() {
    if (
      typeof reloadSites ===
      "function"
    ) {
      await reloadSites();
    }
  }

  /* =======================================================
     완료보고 열기
  ======================================================= */

  function openWorkReport() {
    if (
      typeof clearReportMessage ===
      "function"
    ) {
      clearReportMessage();
    }

    setReportOpen(true);
  }

  /* =======================================================
     완료보고 닫기
  ======================================================= */

  function closeWorkReport() {
    if (reportSaving) {
      return;
    }

    setReportOpen(false);

    if (
      typeof clearReportMessage ===
      "function"
    ) {
      clearReportMessage();
    }
  }

  /* =======================================================
     완료보고 저장
  ======================================================= */

  async function handleWorkReportSave(
    payload,
  ) {
    const success =
      await submitWorkReport(
        payload,
      );

    if (!success) {
      return false;
    }

    setReportOpen(false);

    if (
      typeof onClose ===
      "function"
    ) {
      onClose();
    }

    return true;
  }

  /* =======================================================
     현장 없음
  ======================================================= */

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
            {/* =====================
                현장명
            ===================== */}

            <div
              style={{
                fontSize: "19px",
                fontWeight: "900",
                color: "#111827",
              }}
            >
              {site.site_name ||
                site.customer_name ||
                "현장명 미정"}
            </div>

            {/* =====================
                상태 배지
            ===================== */}

            <div
              style={{
                marginTop: "5px",
              }}
            >
              <span
                style={{
                  display:
                    "inline-block",
                  padding:
                    "5px 8px",
                  borderRadius:
                    "999px",
                  background:
                    status.background,
                  color:
                    status.color,
                  fontSize:
                    "11px",
                  fontWeight:
                    "800",
                }}
              >
                {status.label}
              </span>
            </div>
          </div>

          {/* =====================
              닫기
          ===================== */}

          <button
            type="button"
            onClick={onClose}
            disabled={reportSaving}
            style={{
              border: "none",
              background:
                "transparent",
              fontSize: "26px",
              color: "#64748b",
              cursor:
                reportSaving
                  ? "not-allowed"
                  : "pointer",
              opacity:
                reportSaving
                  ? 0.5
                  : 1,
            }}
          >
            ×
          </button>
        </div>

        {/* =========================
            일정 + 기본정보
        ========================= */}

        <div
          style={{
            marginTop: "10px",
          }}
        >
          {/* =====================
              일정 표시 / 변경
          ===================== */}

          <div ref={(element) => { taskSections.current.schedule = element; }} tabIndex={-1} aria-label="시공 일정" style={{ scrollMarginTop: 16 }}>
          <SiteScheduleEditor
            site={site}
            reportOpen={reportOpen}
            updateSiteSchedule={
              updateSiteSchedule
            }
            reloadSites={
              reloadSites
            }
          />

          </div>

          {/* =====================
              현장 기본정보
          ===================== */}

          <SiteBasicInfo
            site={site}
            updateSiteBasicInfo={
              updateSiteBasicInfo
            }
          />
        </div>

        {/* =========================
            예정 시공 자재
        ========================= */}

        <SiteMaterials
          site={site}
        />

        {/* =========================
            요청 사진
        ========================= */}

        <SiteRequestPhotos
          site={site}
          addSiteRequestPhotos={
            addSiteRequestPhotos
          }
          deleteSiteRequestPhoto={
            deleteSiteRequestPhoto
          }
        />

        {/* =========================
            시공자 완료보고 관리자 검수
        ========================= */}

        <div ref={(element) => { taskSections.current.report = element; }} tabIndex={-1} aria-label="완료보고 검수" style={{ scrollMarginTop: 16 }}>
        <SiteWorkReportReview
          siteId={site.id}
          onReportStateChange={({
            hasReport,
            reviewStatus: nextReviewStatus,
          }) => {
            setReviewStatus(nextReviewStatus);
            setHasWorkerReport(
              Boolean(
                hasReport,
              ),
            );
          }}
        />
        </div>

        {/* =========================
            현장 상태
        ========================= */}

        <SiteStatusControl
          key={site.id}
          site={site}
          hasReport={hasWorkerReport}
          reviewStatus={reviewStatus}
          reportOpen={
            reportOpen
          }
          updateSiteStatus={
            updateSiteStatus
          }
        />

        {/* =========================
            시공 완료 보고 작성

            시공자 완료보고가 없는 현장에서만
            기존 관리자 직접 완료보고를 사용합니다.
        ========================= */}

        {site.status !==
          "cancelled" &&
          hasWorkerReport ===
            false && (
            <section
              ref={(element) => { taskSections.current["report-write"] = element; }}
              tabIndex={-1}
              aria-label="완료보고 작성"
              style={{
                scrollMarginTop: 16,
                marginTop:
                  "18px",
                paddingTop:
                  "14px",
                borderTop:
                  "1px solid #e5e7eb",
              }}
            >
              {!reportOpen ? (
                <>
                  {/* =====================
                      제목
                  ===================== */}

                  <div
                    style={{
                      fontSize:
                        "14px",
                      fontWeight:
                        "900",
                      color:
                        "#111827",
                    }}
                  >
                    ✅ 시공 완료 보고
                  </div>

                  {/* =====================
                      설명
                  ===================== */}

                  <div
                    style={{
                      marginTop:
                        "5px",
                      fontSize:
                        "12px",
                      lineHeight:
                        "1.5",
                      color:
                        "#64748b",
                    }}
                  >
                    {site.status === "completed"
                      ? "시공은 완료되었지만 보고서가 아직 없습니다. 실제 시공 내용과 완료사진을 등록해주세요."
                      : "실제 시공 내용, 사용 자재, 현장 경비와 완료사진을 등록합니다. 보고서를 저장하면 현장도 시공 완료로 변경됩니다."}
                  </div>

                  {/* =====================
                      완료보고 작성
                  ===================== */}

                  <button
                    type="button"
                    onClick={
                      openWorkReport
                    }
                    style={{
                      width:
                        "100%",
                      marginTop:
                        "10px",
                      padding:
                        "12px",
                      border:
                        "none",
                      borderRadius:
                        "10px",
                      background:
                        "#16a34a",
                      color:
                        "#ffffff",
                      fontSize:
                        "13px",
                      fontWeight:
                        "900",
                      cursor:
                        "pointer",
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
          "completed" && hasWorkerReport === true && (
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
          <section
            style={{
              marginTop:
                "18px",
              paddingTop:
                "14px",
              borderTop:
                "1px solid #e5e7eb",
            }}
          >
            {/* =====================
                제목
            ===================== */}

            <div
              style={{
                marginBottom:
                  "10px",
                fontSize:
                  "14px",
                fontWeight:
                  "900",
                color:
                  "#111827",
              }}
            >
              👷 담당 시공자 배정
            </div>

            {/* =====================
                시공자 배정
            ===================== */}

            <div ref={(element) => { taskSections.current.assignment = element; }} tabIndex={-1} aria-label="시공자 배정" style={{ scrollMarginTop: 16 }}>
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
          </section>
        )}
      </div>
    </div>
  );
                     }
