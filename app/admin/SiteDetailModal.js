"use client";

import ToolIllustration from "../components/ui/ToolIllustration";
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

const MENUS = [
  { id: "info", label: "현장정보", kind: "home" },
  { id: "schedule", label: "일정배정", kind: "people" },
  { id: "materials", label: "자재", kind: "film" },
  { id: "photos", label: "요청사진", kind: "camera" },
  { id: "report", label: "완료보고", kind: "report" },
];

const SECTION_MENU = {
  schedule: "schedule",
  assignment: "schedule",
  report: "report",
  "report-write": "report",
};

const action = {
  minHeight: 44,
  border: "1px solid #cbd5e1",
  borderRadius: 12,
  background: "#fff",
  color: "#334155",
  padding: "10px 14px",
  fontWeight: 800,
  cursor: "pointer",
};

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
  const [menu, setMenu] = useState("info");
  const [visited, setVisited] = useState({ info: true });
  const [reportOpen, setReportOpen] = useState(false);
  const [hasWorkerReport, setHasWorkerReport] = useState(null);
  const [reviewStatus, setReviewStatus] = useState(null);

  const taskSections = useRef({});
  const scrollBody = useRef(null);

  const {
    reportSaving,
    reportMessage,
    submitWorkReport,
    clearReportMessage,
  } = useSiteWorkReport({
    companyId,
    reloadSites,
  });

  useEffect(() => {
    setReportOpen(false);
    setHasWorkerReport(null);
    setReviewStatus(null);
    clearReportMessage?.();

    const params = new URLSearchParams(
      window.location.search
    );

    const nextMenu =
      params.get("site") === String(site?.id)
        ? SECTION_MENU[params.get("section")] || "info"
        : "info";

    setMenu(nextMenu);

    setVisited({
      info: true,
      [nextMenu]: true,
    });

    if (scrollBody.current) {
      scrollBody.current.scrollTop = 0;
    }
  }, [site?.id, clearReportMessage]);

  useEffect(() => {
    const params = new URLSearchParams(
      window.location.search
    );

    if (params.get("site") !== String(site?.id)) {
      return;
    }

    const section = params.get("section");
    const targetMenu = SECTION_MENU[section];

    if (!targetMenu || targetMenu !== menu) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      const target =
        taskSections.current[section] ||
        (section === "report-write" && hasWorkerReport
          ? taskSections.current.report
          : null);

      target?.scrollIntoView({
        block: "start",
      });

      target?.focus({
        preventScroll: true,
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [site?.id, menu, hasWorkerReport]);

  const hasSite = Boolean(site);

  useEffect(() => {
    if (!hasSite) return;

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previous;
    };
  }, [hasSite]);

  function chooseMenu(id) {
    setVisited((previous) => ({
      ...previous,
      [id]: true,
    }));

    setMenu(id);

    if (scrollBody.current) {
      scrollBody.current.scrollTop = 0;
    }
  }

  function closeModal() {
    if (!reportSaving) {
      onClose?.();
    }
  }

  async function handleAssignmentSaved() {
    if (typeof reloadSites === "function") {
      await reloadSites();
    }
  }

  function openWorkReport() {
    clearReportMessage?.();
    setReportOpen(true);
  }

  function closeWorkReport() {
    if (reportSaving) return;

    setReportOpen(false);
    clearReportMessage?.();
  }

  async function handleWorkReportSave(payload) {
    const success = await submitWorkReport(payload);

    if (!success) {
      return false;
    }

    setReportOpen(false);
    onClose?.();

    return true;
  }

  if (!site) {
    return null;
  }

  const status =
    STATUS_INFO[site.status] ||
    STATUS_INFO.consulting;

  const reviewLabel =
    reviewStatus === "pending"
      ? "검수 대기"
      : reviewStatus === "approved"
        ? "승인 완료"
        : reviewStatus === "rejected"
          ? "보완 요청"
          : "";

  return (
    <div
      onClick={closeModal}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1001,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: 12,
        boxSizing: "border-box",
        background: "rgba(15,23,42,0.55)",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-site-detail-title"
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 760,
          maxHeight: "calc(100dvh - 24px)",
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          borderRadius: 24,
          overflow: "hidden",
          background: "var(--film-bg, #faf8f4)",
          boxShadow:
            "0 20px 50px rgba(0,0,0,0.20)",
        }}
      >
        <header
          style={{
            flexShrink: 0,
            padding: "14px 12px 12px",
            background: "#fffcf8",
            borderBottom: "1px solid #e2e8f0",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 10,
            }}
          >
            <div
              style={{
                flex: 1,
                minWidth: 0,
              }}
            >
              <small
                style={{
                  color: "#64748b",
                  fontSize: 11,
                }}
              >
                관리자 · 현장 상세
              </small>

              <h2
                id="admin-site-detail-title"
                style={{
                  margin: "4px 0 8px",
                  fontSize: 19,
                  color: "#182c47",
                  overflowWrap: "anywhere",
                }}
              >
                {site.site_name ||
                  site.customer_name ||
                  "현장명 미정"}
              </h2>

              <span
                style={{
                  display: "inline-block",
                  padding: "5px 8px",
                  borderRadius: 20,
                  background: status.background,
                  color: status.color,
                  fontSize: 11,
                  fontWeight: 800,
                }}
              >
                {status.label}
              </span>
            </div>

            <button
              type="button"
              aria-label="현장 상세 닫기"
              onClick={closeModal}
              disabled={reportSaving}
              style={{
                ...action,
                padding: "4px 12px",
                fontSize: 24,
                opacity: reportSaving ? 0.5 : 1,
              }}
            >
              ×
            </button>
          </div>

          <nav
            aria-label="현장 상세 메뉴"
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(5, minmax(0, 1fr))",
              gap: 4,
              marginTop: 12,
            }}
          >
            {MENUS.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={menu === item.id}
                aria-controls={`admin-site-panel-${item.id}`}
                onClick={() => chooseMenu(item.id)}
                style={{
                  minHeight: 76,
                  padding: "9px 1px",
                  borderRadius: 15,
                  border:
                    menu === item.id
                      ? "1px solid #81b4f7"
                      : "1px solid #e2e8f0",
                  background:
                    menu === item.id
                      ? "#edf5ff"
                      : "#fff",
                  color:
                    menu === item.id
                      ? "#1d4ed8"
                      : "#475569",
                  fontSize: 11,
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                <span
                  style={{
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  <ToolIllustration
                    kind={item.kind}
                    size={34}
                  />
                </span>

                {item.label}

                {item.id === "report" &&
                  reviewLabel && (
                    <small
                      style={{
                        display: "block",
                        marginTop: 3,
                        fontSize: 9,
                      }}
                    >
                      {reviewLabel}
                    </small>
                  )}
              </button>
            ))}
          </nav>

          {reportOpen && menu !== "report" && (
            <button
              type="button"
              onClick={() => chooseMenu("report")}
              style={{
                ...action,
                width: "100%",
                marginTop: 10,
                color: "#15803d",
              }}
            >
              작성 중인 완료보고로 돌아가기 →
            </button>
          )}
        </header>

        <div
          ref={scrollBody}
          style={{
            overflowY: "auto",
            overscrollBehavior: "contain",
            minHeight: 0,
            padding:
              "4px 14px calc(18px + env(safe-area-inset-bottom))",
          }}
        >
          <section
            id="admin-site-panel-info"
            aria-label="현장정보"
            hidden={menu !== "info"}
          >
            <SiteBasicInfo
              key={site.id}
              site={site}
              updateSiteBasicInfo={updateSiteBasicInfo}
            />

            <SiteStatusControl
              key={site.id}
              site={site}
              hasReport={hasWorkerReport}
              reviewStatus={reviewStatus}
              reportOpen={reportOpen}
              updateSiteStatus={updateSiteStatus}
            />
          </section>

          {visited.schedule && (
            <section
              id="admin-site-panel-schedule"
              aria-label="일정과 시공자 배정"
              hidden={menu !== "schedule"}
            >
              <div
                ref={(element) => {
                  taskSections.current.schedule =
                    element;
                }}
                tabIndex={-1}
                aria-label="시공 일정"
                style={{ scrollMarginTop: 12 }}
              >
                <SiteScheduleEditor
                  key={site.id}
                  site={site}
                  reportOpen={reportOpen}
                  updateSite
