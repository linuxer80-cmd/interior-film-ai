"use client";

import { useEffect, useRef, useState } from "react";
import { guardAdminSiteHistory } from "../../lib/adminSiteHistory.mjs";
import SiteWorkerAssignment from "./SiteWorkerAssignment";
import SiteWorkReport from "./SiteWorkReport";
import SiteCompletedReport from "./SiteCompletedReport";
import SiteWorkReportReview from "./SiteWorkReportReview";
import ReportHistory from "../components/ReportHistory";
import useSiteWorkReport from "./hooks/useSiteWorkReport";
import SiteRequestPhotos from "./site-detail/SiteRequestPhotos";
import SiteOperations from "../components/SiteOperations";
import SiteMaterials from "./site-detail/SiteMaterials";
import SiteBasicInfo from "./site-detail/SiteBasicInfo";
import SiteScheduleEditor from "./site-detail/SiteScheduleEditor";
import SiteStatusControl from "./site-detail/SiteStatusControl";
import SiteExpenses from "../components/SiteExpenses";
import ConsultationQuote from "./ConsultationQuote";
import CompletionEstimate from "./CompletionEstimate";
import AdminAssignedWork from "./AdminAssignedWork";
import AdminSiteTeam from "./AdminSiteTeam";
import SiteExtraWork from "../components/SiteExtraWork";
import fieldUi from "./FieldUi.module.css";

const STATUS_INFO = {
  consulting: {
    label: "상담중",
    background: "#fff7ed",
    color: "#c2410c",
  },
  scheduled: {
    label: "시공 예정",
    background: "#edf3e8",
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
  { id: "work", label: "내 시공", kind: "camera" },
  { id: "quote", label: "상담 견적서", kind: "report" },
  { id: "extra", label: "추가 작업", kind: "report" },
  { id: "chat", label: "현장 채팅", kind: "chat" },
  { id: "schedule", label: "일정배정", kind: "people" },
  { id: "materials", label: "자재", kind: "film" },
  { id: "expenses", label: "경비", kind: "money" },
  { id: "report", label: "완료보고", kind: "report" },
  { id: "settlement", label: "상태·수금" },
];

const SECTION_MENU = {
  work: "work",
  extra: "extra",
  chat: "chat",
  overview: "info",
  info: "info",
  quote: "quote",
  materials: "materials",
  photos: "info",
  settlement: "settlement",
  expenses: "expenses",
  schedule: "schedule",
  assignment: "schedule",
  report: "report",
  "report-write": "report",
};

const actionStyle = {
  minHeight: 44,
  border: "1px solid #dfe4d7",
  borderRadius: 14,
  background: "#ffffff",
  color: "#596c50",
  padding: "10px 14px",
  fontWeight: 800,
  cursor: "pointer",
};

export default function SiteDetailModal({
  companyId,
  initialTeamDate = null,
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
  const [quoteDirty, setQuoteDirty] = useState(false);
  const [estimateDirty, setEstimateDirty] = useState(false);
  const [reportEstimateOpen, setReportEstimateOpen] = useState(false);
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
  } = useSiteWorkReport({ companyId, reloadSites });

  useEffect(() => {
    setReportOpen(false);
    setReportEstimateOpen(false);
    setEstimateDirty(false);
    setHasWorkerReport(null);
    setReviewStatus(null);
    clearReportMessage?.();

    const params = new URLSearchParams(window.location.search);

    const nextMenu =
      params.get("site") === String(site?.id)
        ? SECTION_MENU[params.get("section")] || "info"
        : "info";

    setMenu(nextMenu);
    setVisited({ info: true, [nextMenu]: true });

    if (scrollBody.current) scrollBody.current.scrollTop = 0;
  }, [site?.id, clearReportMessage]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    if (params.get("site") !== String(site?.id)) return;

    const section = params.get("section");
    const targetMenu = SECTION_MENU[section];

    if (!targetMenu || targetMenu !== menu) return;

    const frame = requestAnimationFrame(() => {
      const target =
        taskSections.current[section] ||
        (section === "report-write" && hasWorkerReport
          ? taskSections.current.report
          : null);

      target?.scrollIntoView({ block: "start" });
      target?.focus({ preventScroll: true });
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
    setVisited(previous => ({ ...previous, [id]: true }));
    setMenu(id);

    if (scrollBody.current) scrollBody.current.scrollTop = 0;
  }

  const historyGuard = useRef(null);
  const closeState = useRef(null);
  closeState.current = { estimateDirty, quoteDirty, reportSaving, onClose };

  useEffect(() => {
    if (!site?.id) return;
    const guard = guardAdminSiteHistory(window, {
      canClose: () => {
        const current = closeState.current;
        if (current.reportSaving) return false;
        return !(current.estimateDirty || current.quoteDirty) || window.confirm(
          "견적서에 저장하지 않은 변경이 있거나 처리 중입니다. 닫을까요?",
        );
      },
      onClose: () => closeState.current.onClose?.(),
    });
    historyGuard.current = guard;
    return () => { guard.dispose(); historyGuard.current = null; };
  }, [site?.id]);

  function closeModal() {
    historyGuard.current?.close();
  }

  async function handleAssignmentSaved() {
    window.dispatchEvent(new Event("site-assignment-changed"));
    if (typeof reloadSites === "function") await reloadSites();
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

    if (!success) return false;

    setReportOpen(false);
    onClose?.();
    return true;
  }

  if (!site) return null;

  const status = STATUS_INFO[site.status] || STATUS_INFO.consulting;

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
        padding: "12px",
        boxSizing: "border-box",
        background: "rgba(25, 39, 60, 0.48)",
      }}
    >
      <div
        role="dialog"
        className={fieldUi.dialog}
        aria-modal="true"
        aria-labelledby="admin-site-detail-title"
        onClick={event => event.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 760,
          maxHeight: "calc(100dvh - 24px)",
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          borderRadius: 24,
          overflow: "hidden",
          background: "var(--film-bg, #f8f7f3)",
          boxShadow: "0 20px 60px rgba(25, 39, 60, 0.2)",
        }}
      >
        <header
          style={{
            flexShrink: 0,
            padding: "10px 14px",
            background: "#fffefa",
            borderBottom: "1px solid #e4eaf2",
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
            <div style={{ flex: 1, minWidth: 0 }}>
              <small style={{ color: "#7b8798", fontSize: 12 }}>
                필름장이 · 현장 상세
              </small>

              <h2
                id="admin-site-detail-title"
                style={{
                  margin: "3px 0 6px",
                  fontSize: 21,
                  color: "#29392e",
                  overflowWrap: "anywhere",
                }}
              >
                {site.site_name || site.customer_name || "현장명 미정"}
              </h2>

              <a
                href={`/jobs?site=${encodeURIComponent(site.id)}`}
                style={{
                  display: "inline-block",
                  padding: "6px 10px",
                  marginBottom: 4,
                  borderRadius: 12,
                  background: "#edf3e8",
                  color: "#24549a",
                  fontWeight: 800,
                }}
               data-ui-link="action">
                구인하기
              </a>

              <span
                style={{
                  display: "inline-block",
                  padding: "6px 10px",
                  borderRadius: 20,
                  background: status.background,
                  color: status.color,
                  fontSize: 12,
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
                ...actionStyle,
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
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              overscrollBehaviorX: "contain",
              gap: 5,
              marginTop: 10,
              paddingBottom: 4,
            }}
          >
            {MENUS.map(item => (
              <button
                key={item.id}
                type="button"
                aria-pressed={menu === item.id}
                aria-controls={`admin-site-panel-${item.id}`}
                onClick={event => {
                  chooseMenu(item.id);
                  event.currentTarget.scrollIntoView({block:"nearest", inline:"nearest", behavior:"smooth"});
                }}
                style={{
                  minHeight: 44,
                  flex: "0 0 auto",
                  padding: "7px 4px",
                  borderRadius: 12,
                  border:
                    menu === item.id
                      ? "1px solid #3478ed"
                      : "1px solid #e4eaf2",
                  background:
                    menu === item.id ? "#eaf3ff" : "#ffffff",
                  color:
                    menu === item.id ? "#3268bd" : "#596c50",
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                {item.label}

                {item.id === "report" && reviewLabel && (
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
                ...actionStyle,
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
          <section id="admin-site-panel-chat" hidden={menu !== "chat"} aria-label="현장 팀 채팅"><AdminSiteTeam key={site.id} siteId={site.id} initialDate={initialTeamDate} active={menu === "chat"} /></section>
          <section id="admin-site-panel-extra" hidden={menu !== "extra"} aria-label="추가 작업 승인"><SiteExtraWork key={site.id} siteId={site.id} active={menu === "extra"} onChanged={reloadSites} /></section>
          <AdminAssignedWork key={site.id} initialDate={initialTeamDate} siteId={site.id} companyId={companyId} section={menu} onNavigate={chooseMenu} onSubmitted={reloadSites} />
          <p hidden={menu !== "info"} style={{ margin: "10px 0", padding: "10px 12px", borderRadius: 12, background: "#edf4f1", color: "#244b43", fontSize: 14, lineHeight: 1.6 }}>
            {site.status === "cancelled" ? "취소된 현장입니다" : reviewStatus === "pending" ? "완료보고를 검수해주세요" : reviewStatus === "rejected" ? "보고서 보완 내용을 확인해주세요" : reviewStatus === "approved" ? "내역서와 입금 내역을 확인해주세요" : site.status === "consulting" ? "상담 내용과 견적을 정리해주세요" : site.status === "completed" ? "완료보고 제출 여부를 확인해주세요" : "시공 일정과 준비사항을 확인해주세요"}
          </p>
          <section id="admin-site-panel-settlement" aria-label="현장 상태와 수금" hidden={menu !== "settlement"}>
            <SiteStatusControl
              key={site.id}
              site={site}
              hasReport={hasWorkerReport}
              reviewStatus={reviewStatus}
              reportOpen={reportOpen}
              updateSiteStatus={updateSiteStatus}
            />
          </section>
          <section
            id="admin-site-panel-photos"
            aria-label="현장 요청사진"
            hidden={menu !== "info"}
          >
            <SiteRequestPhotos
              key={site.id}
              site={site}
              addSiteRequestPhotos={addSiteRequestPhotos}
              deleteSiteRequestPhoto={deleteSiteRequestPhoto}
            />
          </section>

          <section
            id="admin-site-panel-info"
            aria-label="현장정보"
            hidden={menu !== "info"}
          >
            <SiteOperations siteId={site.id} active={menu === "info"} mode="changes" compact />
            <button type="button" style={{...actionStyle,width:"100%",marginBottom:12}} onClick={() => chooseMenu("chat")}>현장 팀 채팅 참여{initialTeamDate ? ` · ${initialTeamDate}` : ""} →</button>
            <p style={{fontSize:13,color:"#64748b"}}>시공 배정이 없어도 본인 업체의 날짜별 현장 채팅에 참여할 수 있습니다.</p>
            <SiteScheduleEditor
              key={'info-schedule-'+site.id}
              site={site}
              reportOpen={reportOpen}
              updateSiteSchedule={updateSiteSchedule}
              reloadSites={reloadSites}
            />

            <SiteBasicInfo
              key={site.id}
              site={site}
              updateSiteBasicInfo={updateSiteBasicInfo}
              materialSummary={<SiteOperations key={site.id} siteId={site.id} active={menu === "info"} mode="summary" />}
            />

          </section>

          {visited.quote && (
            <section
              id="admin-site-panel-quote"
              hidden={menu !== "quote"}
              aria-label="상담 견적서"
            >
              <SiteExtraWork siteId={site.id} active={menu === "quote"} approvedSummary />
              <ConsultationQuote
                key={site.id}
                siteId={site.id}
                onDirtyChange={setQuoteDirty}
              />
            </section>
          )}

          {visited.schedule && (
            <section
              id="admin-site-panel-schedule"
              aria-label="일정과 시공자 배정"
              hidden={menu !== "schedule"}
            >
              <div
                ref={element => {
                  taskSections.current.schedule = element;
                }}
                tabIndex={-1}
                aria-label="시공 일정"
                style={{ scrollMarginTop: 12 }}
              >
                <SiteScheduleEditor
                  key={site.id}
                  site={site}
                  reportOpen={reportOpen}
                  updateSiteSchedule={updateSiteSchedule}
                  reloadSites={reloadSites}
                />
              </div>

              {!reportOpen ? (
                <section
                  style={{
                    marginTop: 16,
                    paddingTop: 14,
                    borderTop: "1px solid #e4eaf2",
                  }}
                >


                  <div
                    ref={element => {
                      taskSections.current.assignment = element;
                    }}
                    tabIndex={-1}
                    aria-label="시공자 배정"
                    style={{ scrollMarginTop: 12 }}
                  >
                    <SiteWorkerAssignment
                      key={site.id}
                      site={site}
                      workers={workers}
                      workersLoading={workersLoading}
                      loadWorkers={loadWorkers}
                      loadSiteWorkers={loadSiteWorkers}
                      assignSiteWorkers={assignSiteWorkers}
                      onSaved={handleAssignmentSaved}
                    />
                  </div>
                </section>
              ) : (
                <p
                  style={{
                    fontSize: 13,
                    lineHeight: 1.7,
                    color: "#7b8798",
                  }}
                >
                  완료보고 작성 중입니다. 보고서 작성을 마치거나
                  취소한 뒤 시공자를 배정해주세요.
                </p>
              )}
            </section>
          )}

          {visited.materials && (
            <section
              id="admin-site-panel-materials"
              aria-label="예정 자재"
              hidden={menu !== "materials"}
            >
              <SiteOperations siteId={site.id} active={menu === "materials"} mode="materials" reportEditable compact />
              <details style={{ margin: "14px 0" }}>
                <summary style={{ ...actionStyle, cursor: "pointer" }}>자재 추가·수정 / 단가·메모 관리</summary>
                <SiteMaterials key={site.id} site={site} />
              </details>
            </section>
          )}

          {visited.expenses && (
            <section
              id="admin-site-panel-expenses"
              aria-label="현장 경비"
              hidden={menu !== "expenses"}
            >
              <SiteExpenses
                key={site.id}
                siteId={site.id}
                onSaved={reloadSites}
              />
            </section>
          )}

          <section
            id="admin-site-panel-report"
            aria-label="완료보고와 검수"
            hidden={menu !== "report"}
          >
            <p style={{margin:"0 0 14px",fontSize:14,color:"#596c50",lineHeight:1.6}}>
              시공자가 제출한 완료보고서의 시공내용·사진·자재·경비를 확인하고 검수해주세요.
              검수 승인 후 보고서에 연결된 현장 내역으로 견적서를 작성할 수 있습니다.
            </p>

            <div
              ref={element => {
                taskSections.current.report = element;
              }}
              tabIndex={-1}
              aria-label="완료보고 검수"
              style={{ scrollMarginTop: 12 }}
            >
              <SiteWorkReportReview
                key={site.id}
                siteId={site.id}
                onReportStateChange={({
                  hasReport,
                  reviewStatus: nextReviewStatus,
                }) => {
                  setReviewStatus(nextReviewStatus);
                  if (nextReviewStatus !== "approved") {
                    setReportEstimateOpen(false);
                    setEstimateDirty(false);
                  }
                  setHasWorkerReport(Boolean(hasReport));
                }}
              />
            </div>

            {hasWorkerReport === true && visited.report && (
              <section aria-label="검수 후 견적서 작성" style={{marginTop:20,padding:16,border:"1px solid #d4dedf",borderRadius:14,background:"#fffdf9"}}>
                <h3 style={{margin:"0 0 8px",fontSize:17}}>보고서 기반 견적서</h3>
                <p style={{fontSize:13,lineHeight:1.6,color:"#596c50"}}>
                  {reviewStatus === "approved"
                    ? "검수 승인된 현장의 실제 자재 사용량·인건비·경비를 불러옵니다. 청구 단가와 금액을 확인하고 저장해주세요."
                    : "먼저 위 보고서의 검수 메뉴에서 승인해주세요. 보완이 필요하면 시공자에게 반려할 수 있습니다."}
                </p>
                {reviewStatus === "approved" && <button type="button" style={{...actionStyle,width:"100%",background:"#244b43",color:"#fffefb"}} onClick={()=>{
                  if(reportEstimateOpen && estimateDirty && !window.confirm("저장하지 않은 견적 내용이 있거나 처리 중입니다. 닫을까요?"))return;
                  if(reportEstimateOpen)setEstimateDirty(false);
                  setReportEstimateOpen(value=>!value);
                }}>{reportEstimateOpen?"견적서 닫고 보고서 보기":"검수한 보고서로 견적서 작성"}</button>}
                {reviewStatus === "approved" && reportEstimateOpen && (
                  <CompletionEstimate key={site.id} siteId={site.id} onDirtyChange={setEstimateDirty}/>
                )}
              </section>
            )}

            <ReportHistory siteId={site.id} version={reviewStatus} />

            {site.status !== "cancelled" &&
              (hasWorkerReport === false ||
                reviewStatus === "rejected") && (
                <section
                  ref={element => {
                    taskSections.current["report-write"] = element;
                  }}
                  tabIndex={-1}
                  aria-label="완료보고 작성"
                  style={{
                    scrollMarginTop: 12,
                    marginTop: 16,
                    paddingTop: 14,
                    borderTop: "1px solid #e4eaf2",
                  }}
                >
                  {!reportOpen ? (
                    <>
                      <h3
                        style={{
                          margin: 0,
                          fontSize: 16,
                          color: "#29392e",
                        }}
                      >
                        시공 완료 보고
                      </h3>

                      <p
                        style={{
                          fontSize: 13,
                          lineHeight: 1.7,
                          color: "#7b8798",
                        }}
                      >
                        {site.status === "completed"
                          ? "시공은 완료되었지만 보고서가 아직 없습니다. 실제 시공 내용과 완료사진을 등록해주세요."
                          : "실제 시공 내용, 사용 자재, 현장 경비와 완료사진을 등록합니다. 저장하면 현장도 시공 완료로 변경됩니다."}
                      </p>

                      <button
                        type="button"
                        onClick={openWorkReport}
                        style={{
                          ...actionStyle,
                          width: "100%",
                          border: "none",
                          background: "#16a34a",
                          color: "#ffffff",
                        }}
                      >
                        완료보고 작성 · 보완
                      </button>
                    </>
                  ) : (
                    <SiteWorkReport
                      active={menu === "report"}
                      key={site.id}
                      site={site}
                      saving={reportSaving}
                      message={reportMessage}
                      onSave={handleWorkReportSave}
                      onCancel={closeWorkReport}
                    />
                  )}
                </section>
              )}

            {site.status === "completed" &&
              hasWorkerReport === true && (
                <details
                  style={{
                    marginTop: 16,
                    borderTop: "1px solid #e4eaf2",
                    paddingTop: 14,
                  }}
                >
                  <summary
                    style={{
                      cursor: "pointer",
                      fontSize: 13,
                      fontWeight: 800,
                      color: "#596c50",
                    }}
                  >
                    저장된 시공 완료 자료 보기
                  </summary>

                  <SiteCompletedReport
                    key={site.id}
                    companyId={companyId}
                    site={site}
                  />
                </details>
              )}
          </section>
        </div>
      </div>
    </div>
  );
                } 




