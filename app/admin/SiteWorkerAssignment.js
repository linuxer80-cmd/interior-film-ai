"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

const localDay = (value) => value ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value)) : "";
const dayList = (site) => {
  const first = localDay(site?.schedule_start);
  const last = localDay(site?.schedule_end) || first;
  if (!first || last < first) return [];
  const days = [];
  let current = new Date(`${first}T00:00:00Z`);
  while (current.toISOString().slice(0, 10) <= last && days.length < 366) {
    days.push(current.toISOString().slice(0, 10));
    current = new Date(current.getTime() + 86400000);
  }
  return days;
};

export default function SiteWorkerAssignment({ site, workers = [], workersLoading = false, loadWorkers, loadSiteWorkers, onSaved }) {
  const dates = useMemo(() => dayList(site), [site?.schedule_start, site?.schedule_end]);
  const [assignments, setAssignments] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const activeWorkers = workers.filter((worker) => worker.is_active !== false);

  async function api(method, payload) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("관리자로 다시 로그인해주세요.");
    const response = await fetch(`/api/site-daily-assignments${method === "GET" ? `?siteId=${encodeURIComponent(site.id)}` : ""}`, {
      method,
      headers: { Authorization: `Bearer ${session.access_token}`, ...(payload ? { "Content-Type": "application/json" } : {}) },
      ...(payload ? { body: JSON.stringify(payload) } : {}), cache: "no-store",
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "날짜별 배정 요청에 실패했습니다.");
    return result;
  }

  useEffect(() => {
    if (!site?.id) return;
    let cancelled = false;
    (async () => {
      setLoading(true); setMessage("");
      try {
        if (!workers.length) await loadWorkers?.();
        const [daily, legacy] = await Promise.all([api("GET"), loadSiteWorkers?.(site.id) || []]);
        if (cancelled) return;
        const initial = {};
        for (const date of dates) {
          const rows = daily.hasDailySchedule ? daily.assignments.filter((row) => row.work_date === date) : legacy;
          initial[date] = {
            leaderId: rows.find((row) => row.role === "leader")?.worker_id || "",
            memberIds: rows.filter((row) => row.role === "member").map((row) => row.worker_id),
          };
        }
        setAssignments(initial);
      } catch (error) { if (!cancelled) setMessage(`❌ ${error.message}`); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [site?.id, site?.schedule_start, site?.schedule_end]);

  function change(date, patch) {
    setAssignments((current) => ({ ...current, [date]: { ...(current[date] || { leaderId: "", memberIds: [] }), ...patch } }));
    setMessage("");
  }
  async function save() {
    setSaving(true); setMessage("");
    try {
      await api("POST", { siteId: site.id, days: dates.map((workDate) => ({ workDate, ...(assignments[workDate] || { leaderId: "", memberIds: [] }) })) });
      setMessage("✅ 날짜별 팀장과 팀원 배정이 저장되었습니다.");
      await onSaved?.();
    } catch (error) { setMessage(`❌ ${error.message}`); }
    finally { setSaving(false); }
  }

  return <section style={{ padding: 16, background: "#fff", borderRadius: 12 }}>
    <h3>👷 날짜별 담당 시공자</h3>
    <p style={{ color: "#64748b", fontSize: 13 }}>현장 시작일과 종료일 사이에서 각 날짜의 팀장과 팀원을 선택하세요. 시공자에게는 본인이 선택된 날짜만 표시됩니다.</p>
    {workersLoading || loading ? <p>담당자를 불러오는 중...</p> : !dates.length ? <p>먼저 현장 시작 날짜와 종료 날짜를 저장해주세요.</p> : dates.map((date) => {
      const day = assignments[date] || { leaderId: "", memberIds: [] };
      return <div key={date} style={{ padding: 14, border: "1px solid #e2e8f0", borderRadius: 10, marginBottom: 10 }}>
        <strong>{date}</strong>
        <label style={{ display: "block", marginTop: 10 }}>팀장
          <select aria-label={`${date} 팀장`} value={day.leaderId} onChange={(event) => change(date, { leaderId: event.target.value, memberIds: day.memberIds.filter((id) => id !== event.target.value) })} style={{ display: "block", width: "100%", padding: 10, marginTop: 4 }}>
            <option value="">팀장 선택</option>
            {activeWorkers.map((worker) => <option key={worker.id} value={worker.id}>{worker.name}</option>)}
          </select>
        </label>
        <div style={{ marginTop: 10 }}>팀원</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8 }}>
          {activeWorkers.filter((worker) => worker.id !== day.leaderId).map((worker) => <label key={worker.id} style={{ display: "flex", gap: 6, alignItems: "center", padding: 8, border: "1px solid #e2e8f0", borderRadius: 8 }}>
            <input type="checkbox" checked={day.memberIds.includes(worker.id)} onChange={(event) => change(date, { memberIds: event.target.checked ? [...day.memberIds, worker.id] : day.memberIds.filter((id) => id !== worker.id) })} />{worker.name}
          </label>)}
        </div>
      </div>;
    })}
    {message && <p role="status">{message}</p>}
    <button type="button" onClick={save} disabled={saving || loading || !dates.length} style={{ width: "100%", padding: 14, borderRadius: 10, background: "#111827", color: "white" }}>{saving ? "저장 중..." : "날짜별 담당자 저장"}</button>
  </section>;
}
