"use client";

import { useEffect, useRef, useState } from "react";
import useSiteDraft from "./hooks/useSiteDraft";
import { assignmentChanges, applyTeamToDates } from "../../lib/assignmentReview.mjs";
import { assignmentSignature } from "../../lib/siteDrafts.mjs";
import { supabase } from "../../lib/supabase";

function localDay(value) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const get = (type) =>
    parts.find((part) => part.type === type)?.value;

  return `${get("year")}-${get("month")}-${get("day")}`;
}

function dayList(site) {
  if (Array.isArray(site?.work_dates)) {
    return [
      ...new Set(
        site.work_dates.filter(
          (date) =>
            typeof date === "string" &&
            /^\d{4}-\d{2}-\d{2}$/.test(date)
        )
      ),
    ].sort();
  }

  const first = localDay(site?.schedule_start);
  const last = localDay(site?.schedule_end) || first;

  if (!first || last < first) return [];

  const days = [];
  const cursor = new Date(`${first}T00:00:00Z`);

  while (days.length < 366) {
    const date = cursor.toISOString().slice(0, 10);
    if (date > last) break;
    days.push(date);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return days;
}

async function api(method, siteId, payload, preview = false) {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data?.session) {
    throw new Error("관리자로 다시 로그인해주세요.");
  }

  const response = await fetch(
    `/api/site-daily-assignments${
      method === "GET"
        ? `?siteId=${encodeURIComponent(siteId)}`
        : preview ? "/preview" : ""
    }`,
    {
      method,
      cache: "no-store",
      ...(preview ? {signal:AbortSignal.timeout(20000)} : {}),
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
        ...(payload ? { "Content-Type": "application/json" } : {}),
      },
      ...(payload ? { body: JSON.stringify(payload) } : {}),
    }
  );

  const result = await response.json();

  if (!response.ok || result.success === false) {
    const error = new Error(result.error || "날짜별 배정 요청에 실패했습니다.");
    error.details = result;
    throw error;
  }

  return result;
}

export default function SiteWorkerAssignment({
  site,
  workers = [],
  workersLoading = false,
  loadWorkers,
  loadSiteWorkers,
  onSaved,
  onDraftState,
  externalSaving = false,
}) {
  const dates = dayList(site);
  const datesKey = dates.join(",");
  const siteId = site?.id;
  const explicit = Array.isArray(site?.work_dates);
  const formKey = `${siteId}:${explicit}:${datesKey}`;

  const [assignments, setAssignments] = useState({});
  const baseline = useRef({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [readyKey, setReadyKey] = useState("");
  const [retry, setRetry] = useState(0);

  const [openDate, setOpenDate] = useState("");
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState("edit");
  const [targets, setTargets] = useState([]);
  const [checking, setChecking] = useState(false);
  const [preview, setPreview] = useState(null);
  const [confirmConflict, setConfirmConflict] = useState(false);
  const [confirmMissing, setConfirmMissing] = useState(false);
  const checkingRef = useRef(false);
  const reviewPanel = useRef(null);
  useEffect(() => {
    if (stage !== "review") return;
    const frame = requestAnimationFrame(() => reviewPanel.current?.scrollIntoView({block:"start",behavior:"smooth"}));
    return () => cancelAnimationFrame(frame);
  }, [stage]);
  useEffect(() => {
    setOpenDate(datesKey.split(",")[0] || "");
    setTargets(datesKey ? datesKey.split(",") : []);
    setStage("edit"); setPreview(null); setConfirmConflict(false); setConfirmMissing(false);
  }, [formKey]);

  const callbacks = useRef({});
  const savingRef = useRef(false);
  const currentKey = useRef(formKey);

  callbacks.current = { loadWorkers, loadSiteWorkers, onSaved };
  currentKey.current = formKey;

  const activeWorkers = workers.filter(
    (worker) => worker.is_active !== false
  );

  const locked = [
    "completed",
    "cancelled",
    "canceled",
  ].includes(site?.status);

  const disabled =
    saving || checking || externalSaving ||
    loading ||
    workersLoading ||
    readyKey !== formKey ||
    locked;

  const dirty = readyKey === formKey && assignmentSignature(assignments) !== assignmentSignature(baseline.current);
  useSiteDraft(onDraftState, "assignments", {
    label: "시공자 배정", dirty, pending: saving || checking,
    discard: () => { setAssignments(baseline.current); setMessage(""); setStage("edit"); setPreview(null); setConfirmConflict(false); setConfirmMissing(false); },
  });

  useEffect(() => {
    if (!siteId) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setReadyKey("");
      setAssignments({});
      setMessage("");

      try {
        await callbacks.current.loadWorkers?.();

        const [daily, legacy] = await Promise.all([
          api("GET", siteId),
          explicit
            ? []
            : callbacks.current.loadSiteWorkers?.(siteId) || [],
        ]);

        if (cancelled) return;

        const dailyRows = Array.isArray(daily.assignments)
          ? daily.assignments
          : [];

        const initial = {};

        for (const date of datesKey ? datesKey.split(",") : []) {
          const rows =
            explicit || daily.hasDailySchedule
              ? dailyRows.filter((row) => row.work_date === date)
              : Array.isArray(legacy)
                ? legacy
                : [];

          const leaderId =
            rows.find((row) => row.role === "leader")?.worker_id || "";

          initial[date] = {
            leaderId,
            memberIds: [
              ...new Set(
                rows
                  .filter(
                    (row) =>
                      row.role === "member" &&
                      row.worker_id !== leaderId
                  )
                  .map((row) => row.worker_id)
              ),
            ],
          };
        }

        baseline.current = initial;
        setAssignments(initial);
        setReadyKey(formKey);
      } catch (error) {
        if (!cancelled) setMessage(`❌ ${error.message}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [siteId, explicit, datesKey, formKey, retry]);

  function change(date, patch) {
    if (disabled) return;

    setAssignments((current) => ({
      ...current,
      [date]: {
        ...(current[date] || { leaderId: "", memberIds: [] }),
        ...patch,
      },
    }));

    setMessage("");
    setPreview(null); setConfirmConflict(false); setConfirmMissing(false);
  }

  function payloadDays() {
    return dates.map(workDate => ({workDate,leaderId:assignments[workDate]?.leaderId || "",memberIds:[...new Set(assignments[workDate]?.memberIds || [])].filter(id => id !== assignments[workDate]?.leaderId)}));
  }
  async function checkBeforeSave() {
    if (checkingRef.current || savingRef.current || disabled || !dates.length) return;
    const key = formKey;
    checkingRef.current = true; setChecking(true); setMessage(""); setPreview(null); setStage("review");
    setConfirmConflict(false); setConfirmMissing(false);
    try {
      const result = await api("POST",siteId,{siteId,days:payloadDays()},true);
      if (currentKey.current !== key) return;
      if (result.preview !== true || !Array.isArray(result.warnings) || !Array.isArray(result.pendingWages) || !Array.isArray(result.missingLeaders)) throw Error("저장 전 점검 응답을 확인하지 못했습니다. 다시 점검해주세요.");
      setPreview({signature:assignmentSignature(assignments),result});
    } catch(error) {
      if (currentKey.current === key) {setMessage(`❌ ${["AbortError","TimeoutError"].includes(error.name)?"저장 전 확인이 지연됩니다. 다시 점검해주세요.":error.message}`);setStage("edit");}
    } finally {checkingRef.current = false;setChecking(false);}
  }

  async function save() {
    if (savingRef.current || disabled || !dates.length || !dirty || !preview || preview.signature !== assignmentSignature(assignments)) return;
    if (preview.result.warnings?.length && !confirmConflict) return;
    if (preview.result.missingLeaders?.length && !confirmMissing) return;

    const savedKey = formKey;
    savingRef.current = true;
    setSaving(true);
    setMessage("");

    try {
      const days = payloadDays();
      const result = await api("POST",siteId,{siteId,days,confirmScheduleConflicts:confirmConflict});

      if (currentKey.current !== savedKey) return;

      baseline.current = assignments;
      setStage("edit"); setPreview(null); setConfirmConflict(false); setConfirmMissing(false);
      setMessage([
        "✅ 날짜별 담당자가 저장되었습니다.",
        result?.pendingWages?.length ? "일당 미등록: " + [...new Set(result.pendingWages.map(p => p.workerName))].join(", ") + " · 일당 확인이 필요합니다." : "",
        result?.warnings?.length ? "다른 업체와 일정이 겹칩니다. 시공자에게 확인해주세요." : "",
        result?.notificationWarning || "",
      ].filter(Boolean).join(" "));

      try {
        await callbacks.current.onSaved?.();
      } catch {
        if (currentKey.current === savedKey) {
          setMessage(
            "✅ 배정은 저장되었습니다. 현장 목록을 새로고침해주세요."
          );
        }
      }
    } catch (error) {
      if (currentKey.current === savedKey) {
        if (error.details?.conflictConfirmationRequired) {
          setPreview({signature:assignmentSignature(assignments),result:{...preview.result,warnings:error.details.warnings || []}});
          setConfirmConflict(false); setStage("review");
        }
        setMessage(`❌ ${error.message}`);
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  const workerName = id => workers.find(w => w.id === id)?.name || "기존 시공자 (확인 필요)";
  const dateLabel = date => new Intl.DateTimeFormat("ko-KR",{year:"numeric",month:"long",day:"numeric",weekday:"long",timeZone:"UTC"}).format(new Date(`${date}T00:00:00Z`));
  const shortDay = date => new Intl.DateTimeFormat("ko-KR",{weekday:"short",timeZone:"UTC"}).format(new Date(`${date}T00:00:00Z`));
  const changes = assignmentChanges(baseline.current,assignments);
  const currentDay = assignments[openDate] || {leaderId:"",memberIds:[]};
  const memberWorkers = [...activeWorkers, ...currentDay.memberIds.filter(id=>!activeWorkers.some(worker=>worker.id===id)).map(id=>({id,name:workerName(id),is_active:false}))]
    .filter(worker=>worker.id!==currentDay.leaderId && (worker.name || "").replace(/\s/g,"").includes(search.replace(/\s/g,"")));
  const readyDays = dates.filter(date=>assignments[date]?.leaderId).length;
  const missing = preview?.result.missingLeaders || [];
  const warnings = preview?.result.warnings || [];
  const pendingWages = preview?.result.pendingWages || [];
  function copyTeam() {
    if (disabled) return;
    if (!targets.length) {setMessage("적용할 날짜를 선택해주세요.");return;}
    setAssignments(current=>applyTeamToDates(current,openDate,targets));
    setPreview(null);setConfirmConflict(false);setConfirmMissing(false);
    setMessage("선택한 날짜에 같은 팀을 적용했습니다. 아직 저장 전입니다.");
  }
  if (!site) return null;
  return <section className="assignment" aria-label="날짜별 시공자 배정">
    <div className="heading"><h3>날짜별 시공자 배정</h3><span className="hint">시공일 {dates.length}일</span></div>
    <p className="hint">날짜를 선택해 팀장을 정하고 함께할 팀원을 선택하세요.</p>
    {locked && <p className="notice">완료되거나 취소된 현장은 배정을 변경할 수 없습니다.</p>}
    {loading || workersLoading ? <p role="status">담당자를 불러오는 중…</p> : !dates.length ? <p>먼저 위에서 시공 날짜를 선택하고 저장해주세요.</p> : readyKey !== formKey ?
      <button type="button" onClick={()=>setRetry(value=>value+1)}>담당자 다시 불러오기</button> : <>
      <div hidden={stage!=="edit"}>
        <div className="days" aria-label="배정할 시공일 선택">{dates.map(date=><button key={date} type="button" className="date" disabled={saving || checking || externalSaving} aria-pressed={date===openDate} onClick={()=>{setOpenDate(date);setSearch("");}}>
          <span>{date.slice(0,4)}.{Number(date.slice(5,7))} · {shortDay(date)}</span><strong>{Number(date.slice(8))}</strong><small>{assignments[date]?.leaderId ? `팀장 · 팀원 ${assignments[date].memberIds.length}명` : "팀장 미배정"}</small>
        </button>)}</div>
        <section className="team">
          <div className="heading"><h4>{openDate ? dateLabel(openDate) : "시공일 선택"}</h4><span className="badge">{currentDay.leaderId ? "팀장 배정됨" : "팀장 미배정"}</span></div>
          <label className="field">책임 팀장<select aria-label="책임 팀장" disabled={disabled} value={currentDay.leaderId} onChange={event=>change(openDate,{leaderId:event.target.value,memberIds:currentDay.memberIds.filter(id=>id!==event.target.value)})}>
            <option value="">팀장을 선택해주세요</option>
            {currentDay.leaderId && !activeWorkers.some(worker=>worker.id===currentDay.leaderId) && <option value={currentDay.leaderId}>{workerName(currentDay.leaderId)} · 확인 필요</option>}
            {activeWorkers.map(worker=><option key={worker.id} value={worker.id}>{worker.name}</option>)}
          </select></label>
          <div className="field"><div className="heading"><span>함께할 팀원</span><span className="hint">{currentDay.memberIds.length}명 선택</span></div>
            {activeWorkers.length>10 && <input type="search" aria-label="팀원 이름 검색" placeholder="이름으로 검색" value={search} onChange={event=>setSearch(event.target.value)} disabled={disabled} />}
            <div className="members">{memberWorkers.map(worker=><label key={worker.id} className="member"><input type="checkbox" disabled={disabled} checked={currentDay.memberIds.includes(worker.id)} onChange={event=>change(openDate,{memberIds:event.target.checked?[...new Set([...currentDay.memberIds,worker.id])]:currentDay.memberIds.filter(id=>id!==worker.id)})} /><span>{worker.name}</span><small>{worker.is_active===false?"비활성 · 배정 해제 필요":"팀원"}</small></label>)}</div>
            {!memberWorkers.length && <p className="hint">{search ? "검색 결과가 없습니다." : activeWorkers.length ? "추가할 팀원이 없습니다." : "시공자 관리에서 시공자를 등록해주세요."}</p>}
          </div>
          {dates.length>1 && <details><summary>같은 팀을 여러 날짜에 적용</summary><p className="hint">선택한 날짜의 기존 배정을 이 팀으로 바꿉니다. 저장 전 변경 내용을 확인할 수 있습니다.</p><div className="targets">{dates.map(date=><label key={date}><input type="checkbox" disabled={disabled} checked={targets.includes(date)} onChange={event=>setTargets(current=>event.target.checked?[...current,date]:current.filter(value=>value!==date))} />{date.slice(5).replace("-","/")}</label>)}</div><button type="button" className="full" disabled={disabled||!targets.length} onClick={copyTeam}>선택한 날짜에 이 팀 적용</button></details>}
        </section>
      </div>
      <section hidden={stage!=="review"} ref={reviewPanel} aria-label="배정 저장 전 확인">
        <div className="heading"><h4>저장 전 확인</h4><span className="badge">변경 {Object.keys(changes).length}일</span></div>
        {checking && <p role="status">일정 중복과 새 배정의 일당을 확인하고 있습니다…</p>}
        {dates.map(date=><div key={date} className="reviewDay"><div className="heading"><strong>{dateLabel(date)}</strong><small>{changes[date] || "기존 배정 유지"}</small></div><p>팀장 {assignments[date]?.leaderId ? workerName(assignments[date].leaderId) : "미배정"}</p><p className="hint">팀원 {(assignments[date]?.memberIds || []).map(workerName).join(" · ") || "없음"}</p></div>)}
        {preview && <>
          {missing.length>0 && <div className="notice"><p>{missing.map(date=>date.slice(5).replace("-","/")).join(" · ")} 팀장이 미배정 상태입니다.</p><label className="check"><input type="checkbox" checked={confirmMissing} disabled={disabled} onChange={event=>setConfirmMissing(event.target.checked)} />미배정 날짜를 남기고 저장합니다.</label></div>}
          {warnings.length>0 && <div className="notice"><strong>다른 업체와 일정 중복</strong>{warnings.map((item,index)=><p key={index}>{item.workDate} · {item.workerName} · {item.reason}</p>)}<label className="check"><input type="checkbox" disabled={disabled} checked={confirmConflict} onChange={event=>setConfirmConflict(event.target.checked)} />시공자와 중복 일정을 확인했습니다.</label></div>}
          {pendingWages.length>0 && <div className="notice"><strong>새 배정 일당 미확정 {pendingWages.length}건</strong>{pendingWages.map((item,index)=><p key={index}>{item.workDate} · {item.workerName} · {item.reason}</p>)}<p>배정은 저장할 수 있습니다. 일당은 별도로 확인해주세요.</p></div>}
          {!missing.length && !warnings.length && !pendingWages.length && <p className="good">이번 점검에서 확인이 필요한 항목이 없습니다.</p>}
          {!dirty && <p className="hint">변경된 배정이 없습니다.</p>}
        </>}
      </section>
      </>}
    <footer className="saveBar">
      {message && <p role={message.startsWith("❌")?"alert":"status"} className={message.startsWith("✅")?"good":""}>{message}</p>}
      {readyKey===formKey && dates.length>0 && <>
        <div className="heading"><span>{readyDays}일 배정 완료{readyDays<dates.length?` · ${dates.length-readyDays}일 미배정`:""}</span><small>{dirty?"저장하지 않은 변경":"변경 사항 없음"}</small></div>
        {stage==="edit" ? <button type="button" className="primary" disabled={disabled} onClick={checkBeforeSave}>배정 확인하고 저장 →</button> : <div className="actions"><button type="button" disabled={saving||checking||externalSaving} onClick={()=>{setStage("edit");setMessage("");}}>돌아가서 수정</button><button type="button" className="primary" disabled={disabled||!dirty||!preview||Boolean(missing.length&&!confirmMissing)||Boolean(warnings.length&&!confirmConflict)} onClick={save}>{saving?"배정 저장 중…":"배정 저장"}</button></div>}
      </>}
    </footer>
    <style jsx>{`
      .assignment {padding:16px;background:#f8f7f3;border:1px solid #dfe5db;border-radius:18px;color:#263c31;}
      h3 {font-size:19px;margin:0;} h4 {font-size:16px;margin:0;} p {line-height:1.6;font-size:14px;overflow-wrap:anywhere;}
      .heading {display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;}
      .hint,small {font-size:12px;color:#657269;line-height:1.6;}
      button {font:inherit;min-height:44px;padding:10px 12px;border:1px solid #dfe5db;border-radius:11px;background:#fffefa;color:#285340;cursor:pointer;}
      button:disabled,input:disabled,select:disabled {opacity:.55;cursor:default;} button:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible {outline:2px solid #315c91;outline-offset:3px;}
      .days {display:grid;grid-template-columns:repeat(auto-fit,minmax(90px,1fr));gap:8px;margin:14px 0;}
      .date {text-align:center;padding:12px 4px;min-width:0;}.date strong {display:block;font-size:23px;margin:4px 0;}.date small {display:block;font-size:11px;}
      .date[aria-pressed=true] {background:#285340;color:white;border-color:#285340;}.date[aria-pressed=true] small {color:white;}
      .team {padding:16px;background:#fffefa;border:1px solid #dfe5db;border-radius:16px;}.badge {font-size:12px;padding:5px 9px;background:#eaf1e6;color:#285340;border-radius:20px;}
      .field {display:block;margin-top:18px;}select,input[type=search] {width:100%;font:inherit;font-size:16px;min-height:48px;padding:10px;border:1px solid #dfe5db;border-radius:11px;background:#f8f7f3;color:#263c31;box-sizing:border-box;margin-top:8px;}
      .members {max-height:300px;overflow:auto;overscroll-behavior:contain;}.member,.check {display:flex;align-items:center;gap:10px;min-height:48px;cursor:pointer;}.member {border-bottom:1px solid #e5e9e0;}.member span {flex:1;overflow-wrap:anywhere;}.member small {flex-shrink:0;}input[type=checkbox] {width:18px;height:18px;accent-color:#285340;flex-shrink:0;}
      details {margin-top:18px;}summary {min-height:44px;cursor:pointer;font-weight:700;color:#285340;}.targets {display:flex;flex-wrap:wrap;gap:12px;margin:10px 0;}.targets label {display:flex;align-items:center;gap:6px;min-height:44px;}
      .full {width:100%;}.notice {padding:12px;background:#fff4dd;color:#856018;border-radius:11px;margin:12px 0;}.notice p {font-size:13px;}.good {color:#285340;background:#eaf1e6;padding:12px;border-radius:11px;}
      .reviewDay {padding:12px 0;border-bottom:1px solid #dfe5db;}.reviewDay p {margin:7px 0;}
      .saveBar {position:sticky;bottom:0;z-index:2;padding:14px 0 max(10px,env(safe-area-inset-bottom));background:#f8f7f3;border-top:1px solid #dfe5db;margin-top:14px;}.saveBar .heading {font-size:13px;margin-bottom:10px;}.saveBar p {font-size:13px;}
      .primary {background:#285340;color:white;border-color:#285340;font-weight:700;width:100%;}.actions {display:flex;gap:8px;flex-wrap:wrap;}.actions button {flex:1;min-width:100px;}
    `}</style>
  </section>;
}
