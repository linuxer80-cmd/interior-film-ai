"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { siteClosure } from "../../lib/siteClosure.mjs";
import { siteNextActions } from "../../lib/siteNextActions.mjs";
import { koreanDay } from "../utils/workerCalendar";

export default function SiteNextActions({ site, companyId, active, onNavigate, primaryOnly = false }) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ loading: true, errors: [], snapshot: {} });

  useEffect(() => {
    if (!active || !site?.id || site.status === "cancelled") return;
    let alive = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    setState({ loading: true, errors: [], snapshot: {} });

    (async () => {
      const errors = [];
      const snapshot = {};
      try {
        const auth = await supabase.auth.getSession();
        const session = auth.data?.session;
        if (auth.error || !session) throw Error("로그인 필요");
        const read = async (path) => {
          const response = await fetch(`${path}?siteId=${encodeURIComponent(site.id)}`, {
            cache: "no-store", signal: controller.signal,
            headers: { Authorization: `Bearer ${session.access_token}` },
          });
          const result = await response.json();
          if (!response.ok || !result || result.success === false) throw Error("lookup");
          if (path === "/api/admin/site-work-report-review" &&
              (typeof result.hasReport !== "boolean" || (result.hasReport && !result.report))) throw Error("report shape");
          if (path === "/api/material-issue-status" &&
              !["unregistered", "none", "partial", "recorded"].includes(result.status)) throw Error("material shape");
          if (path === "/api/admin/receivables" &&
              (!result.site || typeof result.site.confirmed !== "boolean" ||
               (result.site.outstanding != null && !Number.isFinite(Number(result.site.outstanding))))) throw Error("payment shape");
          if (path === "/api/film-stock" && !Array.isArray(result.trips)) throw Error("stock shape");
          return result;
        };
        const assignment = async () => {
          const daily = await read("/api/site-daily-assignments");
          if (!Array.isArray(daily.dates) || !Array.isArray(daily.assignments)) throw Error("shape");
          let rows = daily.assignments;
          if (!daily.hasDailySchedule) {
            const legacy = await supabase.from("site_workers").select("worker_id,role")
              .eq("company_id", companyId).eq("site_id", site.id).limit(1000).abortSignal(controller.signal);
            if (legacy.error) throw legacy.error;
            if (legacy.data?.length === 1000) throw Error("assignment range");
            rows = legacy.data || [];
          }
          const ids = [...new Set(rows.map(row => row.worker_id).filter(Boolean))];
          const workers = [];
          for (let index = 0; index < ids.length; index += 100) {
            const result = await supabase.from("workers").select("id,is_active,user_id")
              .eq("company_id", companyId).in("id", ids.slice(index, index + 100)).abortSignal(controller.signal);
            if (result.error) throw result.error;
            workers.push(...(result.data || []));
          }
          const valid = new Set(workers.filter(worker => worker.is_active !== false).map(worker => worker.id));
          return { ...daily, assignments: rows.filter(row => valid.has(row.worker_id)),
            myWorkerIds: workers.filter(worker => valid.has(worker.id) && worker.user_id === session.user.id).map(worker => worker.id) };
        };
        const results = await Promise.allSettled([
          assignment(), read("/api/material-issue-status"), read("/api/admin/site-work-report-review"),
        ]);
        const names = ["schedule", "material", "report"];
        const labels = ["일정·배정", "자재 반출", "완료보고"];
        results.forEach((result, index) => {
          if (result.status === "fulfilled") snapshot[names[index]] = result.value;
          else errors.push(`${labels[index]} 상태를 확인하지 못했습니다.`);
        });
        if (snapshot.report?.hasReport && (snapshot.report.review?.status || snapshot.report.report?.review_status) === "approved") {
          // Approved sites no longer need preparation or assignment reminders.
          errors.length=0;
          const closing=await Promise.allSettled([read("/api/admin/receivables"),read("/api/film-stock")]);
          if(closing[0].status==="fulfilled")snapshot.payment=closing[0].value;
          else errors.push("입금 내역을 확인하지 못했습니다.");
          if(closing[1].status==="fulfilled")snapshot.stock=closing[1].value;
          else errors.push("롤 반납 내역을 확인하지 못했습니다.");
        }
        snapshot.myWorkerIds = snapshot.schedule?.myWorkerIds || [];
      } catch {
        errors.push("업무 상태를 불러오지 못했습니다. 다시 확인해주세요.");
      } finally {
        clearTimeout(timeout);
        if (alive) setState({ loading: false, errors, snapshot });
      }
    })();
    return () => { alive = false; clearTimeout(timeout); controller.abort(); };
  }, [site, companyId, active, attempt]);

  useEffect(() => {
    if (!active) return;
    const refresh = () => { if (document.visibilityState === "visible") setAttempt(value => value + 1); };
    const materials = event => { if (event.detail?.siteId === site.id) refresh(); };
    const timer = setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("site-assignment-changed", refresh);
    window.addEventListener("site-materials-changed", materials);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("site-assignment-changed", refresh);
      window.removeEventListener("site-materials-changed", materials);
    };
  }, [active, site.id]);

  if (!active || site.status === "cancelled") return null;
  const closure=siteClosure({site,...state.snapshot});
  const actions = closure?.actions || siteNextActions({ site, ...state.snapshot, today: koreanDay() });
  return <section aria-label={closure?"마무리 확인":"다음 할 일"} aria-busy={state.loading} className="next-actions">
    <div className="heading"><h3>{closure?"마무리 확인":"다음 할 일"}</h3><button type="button" disabled={state.loading} onClick={() => setAttempt(value => value + 1)}>새로고침</button></div>
    {state.loading ? <p role="status">실제 업무 상태를 확인하고 있습니다…</p> : <>
      {!primaryOnly && !closure && state.snapshot.material?.status === "recorded" && <p role="status"><strong>등록 자재 {state.snapshot.material.materialCount}종 모두 반출 기록 있음</strong><br/>{state.snapshot.material.materials?.filter(row=>Number(row.issued)>0).map(row=>`${row.brand || ""} ${row.code || ""} · ${row.issued}${row.unit || "m"}`).join(" / ")}</p>}
      {(primaryOnly ? actions.slice(0,1) : actions).map(action => <div className="action" key={action.id}><p>{action.message}</p>{!primaryOnly&&action.detail&&<p style={{whiteSpace:"pre-wrap"}}>{action.detail}</p>}<button type="button" onClick={() => onNavigate(action.menu, action)}>{action.label} →</button></div>)}
      {primaryOnly && actions.length > 1 && <details><summary style={{minHeight:44,padding:"10px 0",cursor:"pointer"}}>다른 할 일 {actions.length - 1}개</summary>{actions.slice(1).map(action=><div className="action" key={action.id}><p>{action.message}</p><button type="button" onClick={()=>onNavigate(action.menu,action)}>{action.label} →</button></div>)}</details>}
      {state.errors.length > 0 && <div role="alert"><p>{state.errors.join(" ")}</p><button type="button" onClick={() => setAttempt(value => value + 1)}>다시 확인</button></div>}
      {closure?.unknown.length>0&&<p role="alert">{closure.unknown.join(" · ")} 확인이 필요합니다. 새로고침하거나 해당 메뉴에서 내역을 확인해주세요.</p>}
      {closure?.complete&&<p role="status"><strong>현장 정리 완료 ✓</strong><br/>현재 기록상 미수금·미반납 롤·자재 단가 미입력이 없습니다.</p>}
      {!closure&&!actions.length&&!state.errors.length&&<p>현재 확인된 추가 업무가 없습니다.</p>}
      {closure&&<p style={{fontSize:12}}>검수 승인과 수금·자재 정리는 별도로 확인합니다.</p>}
    </>}
    <style jsx>{`
      .next-actions { padding: 14px; margin: 12px 0; border-radius: 14px; background: #eaf2e9; color: #285340; }
      .heading { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
      h3 { margin: 0; font-size: 16px; }
      p { margin: 6px 0 10px; line-height: 1.6; font-size: 14px; overflow-wrap: anywhere; }
      .action { padding: 12px 0; border-bottom: 1px solid #d5e1d2; }
      .action:last-child { border-bottom: 0; }
      button { min-height: 44px; padding: 10px 12px; border: 1px solid #cad8c6; border-radius: 10px; background: white; color: #285340; font-weight: 700; cursor: pointer; }
      .action button { background: #285340; color: white; }
      button:disabled { opacity: .6; cursor: wait; }
      button:focus-visible { outline: 2px solid #315c91; outline-offset: 3px; }
    `}</style>
  </section>;
}
