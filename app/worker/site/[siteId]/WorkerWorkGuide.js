"use client";
import { useEffect, useState } from "react";
import { reportRequest } from "../../../utils/reportClient";
import { koreanDay } from "../../../utils/workerCalendar";
import { workerWorkActions } from "../../../../lib/workerWorkFlow.mjs";

export default function WorkerWorkGuide({ site, siteId, active, reportStatus, reportLoading, reportError, onRetry, onNavigate }) {
  const [operations, setOperations] = useState(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!active) return;
    let alive = true;
    let sequence = 0;
    let controller;
    const load = async () => {
      const current = ++sequence;
      controller?.abort();
      controller = new AbortController();
      const currentController = controller;
      const timeout = setTimeout(() => currentController.abort(), 20000);
      try {
        const data = await reportRequest(`/api/site-operations?siteId=${encodeURIComponent(siteId)}`, undefined, { signal: currentController.signal });
        if (!Array.isArray(data.materials)) throw Error("자재 상태를 확인하지 못했습니다.");
        if (alive && sequence === current) { setOperations(data); setError(""); }
      } catch { if (alive && sequence === current) { setOperations(null); setError("자재 상태를 확인하지 못했습니다."); } }
      finally { clearTimeout(timeout); }
    };
    const changed = event => { if (event.detail?.siteId === siteId) void load(); };
    const focus = () => { if (!document.hidden) void load(); };
    void load();
    window.addEventListener("site-materials-changed", changed);
    window.addEventListener("focus", focus);
    return () => { alive = false; controller?.abort(); window.removeEventListener("site-materials-changed", changed); window.removeEventListener("focus", focus); };
  }, [siteId, active, attempt]);
  if (!active || site.status === "cancelled") return null;
  const actions = !reportError && reportStatus ? workerWorkActions({ site, operations, report:reportStatus.report, canSubmit:reportStatus.canSubmit, today:koreanDay() }) : [];
  return <section aria-label="내 작업 안내" style={{padding:16,marginTop:12,borderRadius:16,background:"#eaf2e9",color:"#285340"}}>
    <h3 style={{margin:"0 0 10px",fontSize:17}}>내 작업 안내</h3>
    {!operations && !error && !reportStatus?.hasReport && <p role="status">자재 상태를 확인하고 있습니다…</p>}
    {reportLoading && !reportStatus && <p role="status">작업 상태를 확인하고 있습니다…</p>}
    {actions.map(action => <div key={action.id} style={{marginTop:12}}><p style={{lineHeight:1.6,whiteSpace:"pre-wrap"}}>{action.text}</p><button type="button" style={{minHeight:44,padding:"10px 14px",border:0,borderRadius:10,background:"#285340",color:"white",fontWeight:800}} onClick={() => onNavigate(action.tab)}>{action.label} →</button></div>)}
    {(error || reportError) && <div role="alert"><p>{error} {reportError}</p><button type="button" onClick={() => {setAttempt(value=>value+1);onRetry();}} style={{minHeight:44}}>다시 확인</button></div>}
  </section>;
}
