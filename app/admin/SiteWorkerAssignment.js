"use client";

import { useEffect, useRef, useState } from "react";
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

async function api(method, siteId, payload) {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data?.session) {
    throw new Error("관리자로 다시 로그인해주세요.");
  }

  const response = await fetch(
    `/api/site-daily-assignments${
      method === "GET"
        ? `?siteId=${encodeURIComponent(siteId)}`
        : ""
    }`,
    {
      method,
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
        ...(payload ? { "Content-Type": "application/json" } : {}),
      },
      ...(payload ? { body: JSON.stringify(payload) } : {}),
    }
  );

  const result = await response.json();

  if (!response.ok || result.success === false) {
    throw new Error(
      result.error || "날짜별 배정 요청에 실패했습니다."
    );
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
}) {
  const dates = dayList(site);
  const datesKey = dates.join(",");
  const siteId = site?.id;
  const explicit = Array.isArray(site?.work_dates);
  const formKey = `${siteId}:${explicit}:${datesKey}`;

  const [assignments, setAssignments] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [readyKey, setReadyKey] = useState("");
  const [retry, setRetry] = useState(0);

  const [openDate, setOpenDate] = useState("");
  const [picker, setPicker] = useState(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState([]);
  const dialogRef = useRef(null);

  useEffect(() => {
    setOpenDate(datesKey.split(",")[0] || "");
    setPicker(null);
  }, [formKey]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (picker && dialog && !dialog.open) dialog.showModal();
    if (!picker && dialog?.open) dialog.close();
  }, [picker]);

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
    saving ||
    loading ||
    workersLoading ||
    readyKey !== formKey ||
    locked;

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
  }

  async function save() {
    if (savingRef.current || disabled || !dates.length) return;

    const savedKey = formKey;
    savingRef.current = true;
    setSaving(true);
    setMessage("");

    try {
      const days = dates.map((workDate) => {
        const day = assignments[workDate] || {
          leaderId: "",
          memberIds: [],
        };

        return {
          workDate,
          leaderId: day.leaderId,
          memberIds: [...new Set(day.memberIds)].filter(
            (id) => id !== day.leaderId
          ),
        };
      });

      let result;
      try {
        result = await api("POST", siteId, { siteId, days });
      } catch (error) {
        // The server requires explicit confirmation for cross-company overlaps.
        // Do not retry silently or overwrite another company's assignment.
        if (error.message.includes("다른 업체 일정과 중복")) {
          const confirmed = window.confirm(
            "다른 업체에도 같은 날짜의 현장이 있습니다. 시공자에게 일정 중복을 확인했나요? 확인을 누르면 현재 업체 배정을 계속 저장합니다."
          );
          if (!confirmed) throw new Error("중복 일정 확인 전 저장을 취소했습니다.");
          result = await api("POST", siteId, { siteId, days, confirmScheduleConflicts:true });
        } else {
          throw error;
        }
      }

      if (currentKey.current !== savedKey) return;

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
        setMessage(`❌ ${error.message}`);
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  const workerName = id => workers.find(w => w.id === id)?.name || "기존 시공자 (확인 필요)";
  const dateLabel = date => new Intl.DateTimeFormat("ko-KR", {month:"long",day:"numeric",weekday:"short",timeZone:"UTC"}).format(new Date(`${date}T00:00:00Z`));
  function openPicker(date, mode) {
    if (disabled) return;
    const day = assignments[date];
    setSelected(mode === "leader" ? (day.leaderId ? [day.leaderId] : []) : [...day.memberIds]);
    setSearch("");
    setPicker({date, mode, key: formKey});
  }
  function applyPicker() {
    if (!picker || disabled || picker.key !== formKey) return;
    const day = assignments[picker.date];
    if (picker.mode === "leader") {
      const leaderId = selected[0] || "";
      change(picker.date, {leaderId, memberIds:day.memberIds.filter(id => id !== leaderId)});
    } else change(picker.date, {memberIds:[...new Set(selected)].filter(id => id !== day.leaderId)});
    setPicker(null);
  }
  function copyDay(date) {
    if (disabled || !window.confirm("다른 모든 시공일의 기존 배정을 이 날짜의 팀장과 팀원으로 바꿀까요?")) return;
    const day = assignments[date];
    setAssignments(Object.fromEntries(dates.map(d => [d, {leaderId:day.leaderId, memberIds:[...day.memberIds]}])));
    setMessage("다른 날짜에도 배정했습니다. 배정 저장을 눌러주세요.");
  }
  if (!site) return null;
  const pickerWorkers = activeWorkers.filter(w =>
    (picker?.mode === "leader" || w.id !== assignments[picker?.date]?.leaderId) &&
    (w.name || "").replace(/\s/g, "").includes(search.replace(/\s/g, ""))
  );
  return <section className="assignment">
    <h3>일정 배정</h3>
    <p className="hint">날짜별로 함께할 시공자를 선택하세요.</p>
    {locked && <p>완료되거나 취소된 현장은 배정을 변경할 수 없습니다.</p>}
    {loading || workersLoading ? <p>담당자를 불러오는 중...</p> : !dates.length ? <p>먼저 시공 날짜를 선택하고 저장해주세요.</p> : readyKey !== formKey ?
      <button type="button" onClick={() => setRetry(v => v+1)}>담당자 다시 불러오기</button> :
      dates.map(date => {
        const day = assignments[date] || {leaderId:"", memberIds:[]};
        const expanded = date === openDate;
        return <article className="day" key={date}>
          <button type="button" className="dayHeading" aria-expanded={expanded} aria-controls={`assignment-${date}`} onClick={() => setOpenDate(expanded ? "" : date)}>
            <span><strong>{dateLabel(date)}</strong><small>{day.leaderId ? `팀장 ${workerName(day.leaderId)}` : "팀장 미배정"} · 팀원 {day.memberIds.length}명</small></span>
            <span aria-hidden="true">{expanded ? "⌃" : "⌄"}</span>
          </button>
          <div id={`assignment-${date}`} hidden={!expanded} className="dayBody">
            <b>팀장</b>
            <button type="button" className="leader" disabled={disabled} onClick={() => openPicker(date,"leader")}>
              <span>{day.leaderId ? workerName(day.leaderId) : "팀장을 선택해주세요"}</span><span>변경 ›</span>
            </button>
            <b>팀원 {day.memberIds.length}명</b>
            <div className="chips">{day.memberIds.map(id => <button type="button" key={id} disabled={disabled} aria-label={`${workerName(id)} 배정에서 제외`} onClick={() => change(date,{memberIds:day.memberIds.filter(x => x!==id)})}>{workerName(id)} <span aria-hidden="true">×</span></button>)}</div>
            {!day.memberIds.length && <p className="hint">배정된 팀원이 없습니다.</p>}
            <button type="button" className="add" disabled={disabled} onClick={() => openPicker(date,"member")}>＋ 시공자 추가</button>
            {dates.length>1 && <button type="button" className="copy" disabled={disabled} onClick={() => copyDay(date)}>다른 날짜에도 동일하게 배정</button>}
          </div>
        </article>;
      })}
    <footer className="saveBar">
      {message && <p role="status">{message}</p>}
      <button type="button" className="primary" disabled={disabled || !dates.length} onClick={save}>{saving ? "저장 중..." : "배정 저장"}</button>
    </footer>
    <dialog ref={dialogRef} aria-labelledby="assignment-picker-title" onCancel={() => setPicker(null)} onClose={() => setPicker(null)} onClick={e => {if(e.target===e.currentTarget)setPicker(null);}}>
      <div className="pickerContent">
        <header className="pickerHeading"><h3 id="assignment-picker-title">{picker?.mode === "leader" ? "팀장 선택" : "시공자 추가"}</h3><button type="button" aria-label="시공자 선택 닫기" onClick={() => setPicker(null)}>×</button></header>
        <p className="hint">{picker ? dateLabel(picker.date) : ""} · {picker?.mode === "leader" ? "한 명 선택" : "팀원 선택"}</p>
        <input autoFocus type="search" aria-label="시공자 이름 검색" placeholder="이름으로 검색" value={search} onChange={e => setSearch(e.target.value)} />
        <div className="chips selected">{selected.map(id => <button type="button" key={id} aria-label={`${workerName(id)} 선택 해제`} onClick={() => setSelected(ids => ids.filter(x=>x!==id))}>{workerName(id)} ×</button>)}</div>
        <div className="workerList">
          {picker?.mode === "leader" && <button type="button" className="clearLeader" onClick={() => setSelected([])}>팀장 미배정으로 변경</button>}
          {!pickerWorkers.length && <p>{activeWorkers.length ? "검색 결과가 없습니다." : "시공자 관리에서 시공자를 등록해주세요."}</p>}
          {pickerWorkers.map(w => <label className={selected.includes(w.id) ? "worker checked" : "worker"} key={w.id}>
            <span>{w.name}</span><input type={picker?.mode === "leader" ? "radio" : "checkbox"} name="assignment-worker" checked={selected.includes(w.id)} onChange={e => setSelected(ids => picker?.mode === "leader" ? [w.id] : e.target.checked ? [...new Set([...ids,w.id])] : ids.filter(id => id!==w.id))} />
          </label>)}
        </div>
        <button type="button" className="primary" disabled={disabled} onClick={applyPicker}>{picker?.mode === "leader" ? "팀장 선택 적용" : `선택한 ${selected.length}명 적용`}</button>
      </div>
    </dialog>
    <style jsx>{`
      .assignment { padding:16px; background:#fffefa; border-radius:16px; color:#243247; }
      h3 { margin:0; font-size:19px; } .hint { color:#718096; font-size:13px; line-height:1.6; }
      button { cursor:pointer; font:inherit; min-height:44px; border:1px solid #dfe3e8; background:white; color:inherit; border-radius:12px; padding:10px 12px; }
      button:disabled { opacity:.5; cursor:default; } button:focus-visible,input:focus-visible { outline:2px solid #3478ed; outline-offset:2px; }
      .day { border:1px solid #e3e1db; border-radius:16px; margin:12px 0; overflow:hidden; background:white; }
      .dayHeading { display:flex; align-items:center; justify-content:space-between; text-align:left; width:100%; border:0; border-radius:0; padding:16px; gap:12px; }
      small { display:block; font-size:12px; color:#718096; margin-top:6px; } .dayBody { padding:0 16px 16px; border-top:1px solid #f0eee9; } .dayBody b { display:block; margin-top:16px; font-size:14px; }
      .leader { display:flex; justify-content:space-between; gap:12px; width:100%; margin:8px 0 16px; text-align:left; }
      .chips { display:flex; flex-wrap:wrap; gap:8px; margin:10px 0; } .chips button { background:#edf4ff; border-color:#d4e2f7; font-size:14px; }
      .add { width:100%; color:#28599b; border-color:#7296c6; font-weight:700; } .copy { margin-top:10px; border:0; font-size:13px; background:transparent; }
      .saveBar { position:sticky; bottom:0; padding:12px 0 max(8px,env(safe-area-inset-bottom)); background:#fffefa; border-top:1px solid #eee; z-index:2; }
      .saveBar p { font-size:13px; } .primary { width:100%; background:#243c57; color:white; border:0; font-weight:800; padding:15px; }
      dialog { padding:0; border:1px solid #e3e1db; border-radius:24px; width:calc(100% - 24px); max-width:520px; max-height:85dvh; margin:auto auto 12px; color:#243247; background:#fffefa; }
      dialog::backdrop { background:rgba(20,30,40,.45); } .pickerContent { display:flex; flex-direction:column; padding:20px; max-height:85dvh; box-sizing:border-box; }
      .pickerHeading { display:flex; justify-content:space-between; align-items:center; gap:12px; } .pickerHeading button { font-size:24px; border:0; }
      input[type=search] { padding:14px; border:1px solid #dfe3e8; border-radius:12px; width:100%; box-sizing:border-box; font:inherit; background:white; }
      .selected { max-height:110px; overflow:auto; flex-shrink:0; } .workerList { overflow-y:auto; min-height:0; flex:1; overscroll-behavior:contain; margin-bottom:16px; }
      .worker { display:flex; align-items:center; justify-content:space-between; padding:14px 10px; gap:12px; min-height:26px; border-bottom:1px solid #eee; border-radius:8px; cursor:pointer; }
      .worker.checked { background:#edf4ff; } .worker input { width:22px; height:22px; accent-color:#243c57; flex-shrink:0; }
      .clearLeader { width:100%; margin-bottom:8px; } .pickerContent > .primary { flex-shrink:0; }
    `}</style>
  </section>;
}
