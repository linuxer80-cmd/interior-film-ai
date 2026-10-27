"use client";
import CustomerStageAlimtalk from "./CustomerStageAlimtalk";
import CustomerPortalLink from "./CustomerPortalLink";

import { useCallback, useEffect, useRef, useState } from "react";
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
import { createSiteDrafts } from "../../lib/siteDrafts.mjs";
import UnsavedChangesDialog from "./UnsavedChangesDialog";
import TradeClients from "../components/TradeClients";
import SiteNextActions from "./SiteNextActions";
import SiteBasicInfo from "./site-detail/SiteBasicInfo";
import SiteAlimtalk from "./SiteAlimtalk";
import SiteScheduleEditor from "./site-detail/SiteScheduleEditor";
import SiteStatusControl from "./site-detail/SiteStatusControl";
import SiteExpenses from "../components/SiteExpenses";
import ConsultationQuote from "./ConsultationQuote";
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

const MENU_GROUPS = [
  { id: "info", label: "현장정보", items: [{id:"info",label:"기본정보"},{id:"chat",label:"현장 채팅"}] },
  { id: "operations", label: "작업·사진", items: [{id:"operations",label:"작업 현황"},{id:"schedule",label:"일정·시공자"},{id:"materials",label:"자재·반출·반납·재단"},{id:"report",label:"사진·완료보고"},{id:"expenses",label:"경비"},{id:"extra",label:"추가작업"}] },
  { id: "settlement", label: "정산", items: [{id:"settlement",label:"입금·미수금"},{id:"quote",label:"견적서"}] },
];

const SECTION_MENU = {
  work: "info",
  extra: "extra",
  chat: "chat",
  overview: "info",
  info: "info",
  quote: "quote",
  materials: "materials",
  "material-prices": "materials",
  "material-returns": "materials",
  photos: "report",
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
  const [materialFollowup,setMaterialFollowup]=useState(null);
  const materialPriceDetails=useRef(null);
  const tradeLinkDetails=useRef(null);
  const extrasDetails=useRef(null);
  const [extraPanels, setExtraPanels] = useState({});
  const extraPanel = (name, open) => setExtraPanels(previous => ({...previous, [name]: open, [name + "Visited"]: previous[name + "Visited"] || open}));
  const [menu, setMenu] = useState("info");
  const [preparationStep, setPreparationStep] = useState("dates");
  useEffect(()=>{if(menu === "materials" && materialFollowup?.id === "price" && materialPriceDetails.current)materialPriceDetails.current.open=true;},[materialFollowup,menu]);
  const [quoteDirty, setQuoteDirty] = useState(false);
  const [estimateDirty, setEstimateDirty] = useState(false);
  const [requestedQuoteType,setRequestedQuoteType]=useState(null);
  const [visited, setVisited] = useState({ info: true });
  const [reportOpen, setReportOpen] = useState(false);
  const [hasWorkerReport, setHasWorkerReport] = useState(null);
  const [reviewStatus, setReviewStatus] = useState(null);

  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [basicBusy, setBasicBusy] = useState(false);
  const drafts = useRef(createSiteDrafts());
  const [leaveRequest, setLeaveRequest] = useState(null);
  const leaveRef = useRef(null);
  const closeApproved = useRef(false);
  const registerDraft = useCallback((id, read) => drafts.current.register(id, read), []);

  function requestLeave(proceed, ids, closing = false) {
    if (leaveRef.current) return false;
    const entries = drafts.current.snapshot(ids);
    const busy = reportSaving || entries.some(entry => entry.pending);
    const changed = entries.filter(entry => entry.dirty || entry.pending);
    const quoteChanged = closing && (estimateDirty || quoteDirty);
    if (!busy && !changed.length && !quoteChanged) { proceed(); return true; }
    const request = { proceed, entries, busy, labels: [
      ...changed.map(entry => entry.label), ...(quoteChanged ? ["견적서"] : []),
      ...(reportSaving ? ["완료보고 저장"] : []),
    ] };
    leaveRef.current = request;
    setLeaveRequest(request);
    return false;
  }
  async function saveScheduleChanges(payload) {
    const entries = drafts.current.snapshot(["assignments"]);
    if (entries.some(entry => entry.pending)) return {success:false,error:"배정 저장·점검이 끝난 뒤 시공일을 변경해주세요."};
    if (entries.some(entry => entry.dirty) && !window.confirm("저장하지 않은 시공자 배정이 있습니다. 시공일을 바꾸면 이 배정 변경이 취소될 수 있습니다. 시공일을 변경할까요?")) return {success:false,error:"시공일 변경을 취소했습니다. 배정 변경을 먼저 저장하거나 취소해주세요."};
    setScheduleSaving(true);
    try { return await updateSiteSchedule(payload); }
    finally { setScheduleSaving(false); }
  }
  saveScheduleChanges.supportsWorkDates = updateSiteSchedule?.supportsWorkDates === true;

  function continueEditing() { leaveRef.current = null; setLeaveRequest(null); }
  function discardAndLeave() {
    const request = leaveRef.current;
    if (!request || request.busy || !drafts.current.discard(request.entries)) return;
    continueEditing();
    request.proceed();
  }

  const taskSections = useRef({});
  const scrollBody = useRef(null);
  const [basicEditRequest, setBasicEditRequest] = useState({ siteId: null, version: 0 });

  const {
    reportSaving,
    reportMessage,
    submitWorkReport,
    clearReportMessage,
  } = useSiteWorkReport({ companyId, reloadSites });

  useEffect(() => {
    leaveRef.current = null;
    setLeaveRequest(null);
    closeApproved.current = false;
    setReportOpen(false);
    setExtraPanels({});
    setRequestedQuoteType(null);
    setEstimateDirty(false);
    setHasWorkerReport(null);
    setReviewStatus(null);
    clearReportMessage?.();

    const params = new URLSearchParams(window.location.search);

    const nextMenu =
      params.get("site") === String(site?.id)
        ? SECTION_MENU[params.get("section")] || "info"
        : "info";

    setMaterialFollowup(params.get("section") === "material-prices" ? {id:"price"} : params.get("section") === "material-returns" ? {id:"returns"} : null);
    setMenu(nextMenu);
    setPreparationStep(params.get("section") === "assignment" ? "team" : "dates");
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

  function chooseMenu(id, onChosen) {
    if (id === "work") id = "info";
    const navigate = () => {
      setVisited(previous => ({ ...previous, [id]: true }));
      setMenu(id);
      if (scrollBody.current) scrollBody.current.scrollTop = 0;
      if (typeof onChosen === "function") onChosen();
    };
    if (id === menu) { navigate(); return; }
    requestLeave(navigate);
  }

  function choosePreparationStep(step) {
    if (step === "materials") { chooseMenu("materials"); return; }
    if (menu !== "schedule") {
      chooseMenu("schedule", () => setPreparationStep(step));
      return;
    }
    if (step === preparationStep) return;
    requestLeave(() => {
      setPreparationStep(step);
      if (scrollBody.current) scrollBody.current.scrollTop = 0;
    }, [preparationStep === "dates" ? "schedule" : "assignments"]);
  }

  function openTradeLink() {
    chooseMenu("info",()=>{
      if(extrasDetails.current)extrasDetails.current.open=true;
      if(tradeLinkDetails.current)tradeLinkDetails.current.open=true;
      requestAnimationFrame(()=>{
        tradeLinkDetails.current?.scrollIntoView({block:"start",behavior:"smooth"});
        tradeLinkDetails.current?.querySelector("summary")?.focus({preventScroll:true});
      });
    });
  }

  function openNextAction(next,task) {
    chooseMenu(next,()=>{
      setMaterialFollowup(task);
      if(next === "schedule") {
        const hasDates=Array.isArray(site.work_dates)?site.work_dates.length>0:Boolean(site.schedule_start||site.schedule_date);
        setPreparationStep(task?.id === "assignment" && hasDates ? "team" : "dates");
      }
    });
  }

  const historyGuard = useRef(null);
  const closeState = useRef(null);
  closeState.current = { estimateDirty, quoteDirty, reportSaving, onClose, requestLeave };

  useEffect(() => {
    if (!site?.id) return;
    const guard = guardAdminSiteHistory(window, {
      canClose: () => {
        const current = closeState.current;
        if (closeApproved.current) { closeApproved.current = false; return true; }
        const entries = drafts.current.snapshot();
        if (!current.reportSaving && !current.estimateDirty && !current.quoteDirty &&
            !entries.some(entry => entry.dirty || entry.pending)) return true;
        current.requestLeave(() => {
          closeApproved.current = true;
          historyGuard.current?.close();
        }, undefined, true);
        return false;
      },
      onClose: () => closeState.current.onClose?.(),
    });
    historyGuard.current = guard;
    return () => { guard.dispose(); historyGuard.current = null; };
  }, [site?.id]);

  useEffect(() => {
    const warn = event => {
      const current = closeState.current;
      if (current?.reportSaving || current?.estimateDirty || current?.quoteDirty ||
          drafts.current.snapshot().some(entry => entry.dirty || entry.pending)) {
        event.preventDefault(); event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

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

  const activeGroup = MENU_GROUPS.find(group => group.items.some(item => item.id === menu)) || MENU_GROUPS[0];


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
          <nav aria-label="현장 상세 메뉴" style={{marginTop:10}}>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:6}}>
              {MENU_GROUPS.map(group => <button key={group.id} type="button" aria-pressed={activeGroup.id === group.id}
                onClick={() => chooseMenu(group.id)} style={{...actionStyle,padding:"9px 4px",fontSize:13,background:activeGroup.id === group.id ? "#285340" : "#fffefa",color:activeGroup.id === group.id ? "#ffffff" : "#465b4e"}}>
                {group.label}
              </button>)}
            </div>

          </nav>
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
          {menu !== activeGroup.id && <button type="button" style={{...actionStyle, border:0, background:"transparent", margin:"8px 0"}} onClick={() => chooseMenu(activeGroup.id)}>← {activeGroup.label}</button>}
          <section hidden={menu !== "operations"} aria-label="작업 현황" style={{padding:"16px 0"}}>
            <h3 style={{margin:"0 0 12px"}}>작업·사진</h3>
            {MENU_GROUPS[1].items.filter(item=>item.id!=="operations").map(item=><button key={item.id} type="button" onClick={()=>item.id==="schedule" ? choosePreparationStep("dates") : chooseMenu(item.id)} style={{...actionStyle,display:"flex",justifyContent:"space-between",alignItems:"center",width:"100%",border:0,borderBottom:"1px solid #dfe4d7",borderRadius:0,background:"transparent",textAlign:"left",padding:"18px 2px"}}><span>{item.label}</span><span aria-hidden="true">→</span></button>)}
            <a href={`/jobs?site=${encodeURIComponent(site.id)}`} data-ui-link="action" style={{display:"inline-flex",alignItems:"center",minHeight:44,marginTop:14,color:"#315d49"}}>이 현장 시공자 구인 →</a>
          </section>
          <SiteNextActions key={site.id} site={site} companyId={companyId} active={menu === "info"} onNavigate={openNextAction} primaryOnly />
          <section
            id="admin-site-panel-info"
            aria-label="현장 기본정보"
            hidden={menu !== "info"}
          >
            <SiteBasicInfo
              key={site.id}
              onDraftState={registerDraft}
              onRequestDiscard={(id, proceed) => requestLeave(proceed, [id])}
              editRequest={basicEditRequest.siteId === site.id ? basicEditRequest.version : 0}
              site={site}
              onEditingChange={setBasicBusy}
              onEditSchedule={() => choosePreparationStep("dates")}
              updateSiteBasicInfo={updateSiteBasicInfo}
            />

            <details ref={extrasDetails} onToggle={event => { if (event.target === event.currentTarget) extraPanel("extras", event.currentTarget.open); }} key={"site-extras-" + site.id} style={{ margin:"12px 0" }}>
              <summary style={{minHeight:44,padding:"10px 0",cursor:"pointer",fontWeight:800}}>추가 기능</summary>
            <details key={"customer-notices-" + site.id} style={{ margin: "12px 0" }}>
              <summary style={{ minHeight: 44, padding: "10px 0", cursor: "pointer", fontWeight: 800 }}>
                고객 안내·알림톡
              </summary>
            <CustomerStageAlimtalk siteStatus={site.status} key={"completion-"+site.id+site.status} siteId={site.id} active={menu === "info"} blocked={basicBusy} />
            <CustomerPortalLink key={"portal-"+site.id} siteId={site.id} active={menu === "info"} blocked={basicBusy} />
            <SiteAlimtalk key={site.id} siteId={site.id} active={menu === "info"} blocked={basicBusy} />
            </details>

          <section hidden={menu !== "info"} aria-label="현장 거래처 연결">
            <details key={site.id} ref={tradeLinkDetails} onToggle={event => { if (event.target === event.currentTarget) extraPanel("trade", event.currentTarget.open); }} style={{ margin: "12px 0",scrollMarginTop:12 }}>
              <summary style={{ minHeight: 44, padding: "10px 0", cursor: "pointer", fontWeight: 800 }}>고객 구분·거래처 연결</summary>
              <p style={{ fontSize: 13, color: "#53665a" }}>거래처 연결은 ‘거래처 연결 저장’으로 별도 저장합니다.</p>
              {extraPanels.tradeVisited && <TradeClients key={site.id} siteId={site.id} onLinked={reloadSites} onDraftState={registerDraft} />}
            </details>
          </section>





          <details onToggle={event => { if (event.target === event.currentTarget) extraPanel("changes", event.currentTarget.open); }} style={{margin:"12px 0"}}><summary style={{minHeight:44,padding:"10px 0",cursor:"pointer"}}>현장 변경 내역</summary>{extraPanels.changesVisited && <SiteOperations siteId={site.id} active={menu === "info" && !!extraPanels.extras && !!extraPanels.changes} mode="changes" compact />}</details>
            </details>
            <button type="button" style={{...actionStyle,width:"100%",margin:"12px 0"}} onClick={() => chooseMenu("chat")}>현장 채팅 →</button>
          </section>
          <section id="admin-site-panel-chat" hidden={menu !== "chat"} aria-label="현장 팀 채팅"><AdminSiteTeam key={site.id} siteId={site.id} initialDate={initialTeamDate} active={menu === "chat"} /></section>
          <section id="admin-site-panel-extra" hidden={menu !== "extra"} aria-label="추가 작업 승인"><SiteExtraWork key={site.id} siteId={site.id} active={menu === "extra"} onChanged={reloadSites} /></section>
          <section id="admin-site-panel-settlement" aria-label="현장 상태와 수금" hidden={menu !== "settlement"}>
            <button type="button" style={{...actionStyle,width:"100%",display:"flex",justifyContent:"space-between",margin:"14px 0"}} onClick={()=>chooseMenu("quote")}><span>견적서 작성·확인</span><span aria-hidden="true">→</span></button>
            <a href="/admin?tab=profit" data-ui-link="action" style={{...actionStyle,display:"inline-flex",alignItems:"center",textDecoration:"none"}} onClick={event => {
              event.preventDefault();
              requestLeave(() => { window.location.href = "/admin?tab=profit"; }, undefined, true);
            }}>업체 전체 매출·수익 →</a>
            <SiteStatusControl
              key={site.id}
              site={site}
              hasReport={hasWorkerReport}
              reviewStatus={reviewStatus}
              reportOpen={reportOpen}
              onDraftState={registerDraft}
              onNavigate={(next,task)=>chooseMenu(next,()=>setMaterialFollowup(task))}
              onTradeChange={openTradeLink}
              active={menu === "settlement"}
              updateSiteStatus={updateSiteStatus}
            />
          </section>
          <section
            id="admin-site-panel-photos"
            aria-label="현장 요청사진"
            hidden={menu !== "report"}
          >
            <SiteRequestPhotos
              key={site.id}
              site={site}
              addSiteRequestPhotos={addSiteRequestPhotos}
              deleteSiteRequestPhoto={deleteSiteRequestPhoto}
            />
          </section>



          {visited.quote && (
            <section
              id="admin-site-panel-quote"
              hidden={menu !== "quote"}
              aria-label="견적서 작성"
            >
              <SiteExtraWork siteId={site.id} active={menu === "quote"} approvedSummary />
              <ConsultationQuote
                key={site.id}
                siteId={site.id}
                onDirtyChange={setQuoteDirty}
                requestedType={requestedQuoteType}
              />
            </section>
          )}

          {visited.schedule && (
            <section
              id="admin-site-panel-schedule"
              aria-label="일정과 시공자 배정"
              hidden={menu !== "schedule"}
            >
              <div style={{display:"flex",gap:8,margin:"12px 0"}}>{[["dates","시공일"],["team","시공자 배정"]].map(([step,label])=><button type="button" key={step} aria-pressed={preparationStep===step} style={{...actionStyle,flex:1,background:preparationStep===step?"#edf3e8":"#fffefa"}} onClick={()=>choosePreparationStep(step)}>{label}</button>)}</div>
              <p style={{fontSize:13,color:"#53665a",lineHeight:1.7}}>
                {preparationStep === "dates" ? "시공하는 날짜를 먼저 저장하세요. 시공자는 나중에 배정해도 됩니다." : "날짜별 팀장과 팀원을 정하세요. 같은 팀을 여러 날짜에 적용한 뒤 필요한 날짜만 바꿀 수 있습니다."}
              </p>
              <div
                hidden={preparationStep !== "dates"}
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
                  updateSiteSchedule={saveScheduleChanges}
                  onDraftState={registerDraft}
                  onRequestDiscard={(id,proceed) => requestLeave(proceed,[id])}
                  reloadSites={reloadSites}
                />
                <button type="button" style={{...actionStyle,width:"100%",marginTop:12}} onClick={() => choosePreparationStep("team")}>다음 · 시공자 배정 →</button>
                <p style={{fontSize:12,color:"#53665a"}}>시공일 저장 후 닫으면 날짜만 저장됩니다. 배정과 자재는 나중에 이어서 준비할 수 있습니다.</p>
              </div>

              {!reportOpen ? (
                <section
                  hidden={preparationStep !== "team"}
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
                      externalSaving={scheduleSaving}
                      key={site.id}
                      site={site}
                      workers={workers}
                      workersLoading={workersLoading}
                      loadWorkers={loadWorkers}
                      loadSiteWorkers={loadSiteWorkers}
                      assignSiteWorkers={assignSiteWorkers}
                      onDraftState={registerDraft}
                      onSaved={handleAssignmentSaved}
                    />
                    <div style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:14}}>
                      <button type="button" style={actionStyle} onClick={() => choosePreparationStep("dates")}>← 날짜 확인</button>
                      <button type="button" style={{...actionStyle,flex:1,background:"#285340",color:"#fff"}} onClick={() => choosePreparationStep("materials")}>다음 · 자재 준비 →</button>
                    </div>
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
              <p style={{fontSize:13,color:"#53665a",lineHeight:1.7}}>사용할 필름과 반출·반납 내역을 확인하세요. 필름 등록·단가·메모는 아래에서 관리합니다.</p>
              <SiteOperations siteId={site.id} active={menu === "materials"} mode="materials" reportEditable compact completionMode={materialFollowup?.id === "returns"} />
              <details ref={materialPriceDetails} style={{ margin: "14px 0" }}>
                <summary style={{ ...actionStyle, cursor: "pointer" }}>자재 추가·수정 / 단가·메모 관리</summary>
                <SiteMaterials key={site.id} site={site} actualOnly={materialFollowup?.id === "price"} />
              </details>
              <button type="button" style={{...actionStyle,width:"100%",marginBottom:14}} onClick={() => choosePreparationStep("team")}>← 시공자 배정 확인</button>
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
              견적서는 ‘견적서’ 메뉴에서 시공 전·후 언제든 작성할 수 있습니다.
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
                onDraftState={registerDraft}
                onNavigate={chooseMenu}
                key={site.id}
                siteId={site.id}
                onReportStateChange={({
                  hasReport,
                  reviewStatus: nextReviewStatus,
                }) => {
                  setReviewStatus(nextReviewStatus);
                  setHasWorkerReport(Boolean(hasReport));
                }}
              />
            </div>

            <section aria-label="견적서 연결" style={{marginTop:20,padding:16,border:"1px solid #d4dedf",borderRadius:14,background:"#fffdf9"}}>
              <h3 style={{margin:"0 0 8px",fontSize:17}}>인건비·자재비 견적서</h3>
              <p style={{fontSize:13,lineHeight:1.6}}>공수·자재 사용량·경비를 확인해 청구 내역으로 수정합니다. 기존 저장본은 불러오기·저장 전까지 유지됩니다.</p>
              <button type="button" style={{...actionStyle,width:"100%"}} onClick={()=>chooseMenu("quote",()=>setRequestedQuoteType(value=>({type:"cost",version:(value?.version||0)+1})))}>인건비·자재비 견적서 작성 →</button>
            </section>

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
        <UnsavedChangesDialog request={leaveRequest} onContinue={continueEditing} onDiscard={discardAndLeave} />
      </div>
    </div>
  );
                } 




