"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { koreanDay } from "../utils/workerCalendar";
import ui from "./AdminUi.module.css";
import TomorrowTasks from "../components/TomorrowTasks";

const groups = [
  { id: "assignment", label: "일정·배정 확인", action: "배정 확인", tone: "orange" },
  { id: "review", label: "검수 대기", action: "완료보고 검수", tone: "blue" },
  { id: "missing", label: "완료보고 미작성", action: "완료보고 작성", tone: "red" },
  { id: "revision", label: "보완 요청", action: "보완 내용 확인", tone: "purple" },
];
const siteLink = (id, section = "") => `/admin?${new URLSearchParams({ tab: "sites", site: id, ...(section ? { section } : {}) })}`;
const dateLabel = (date) => date ? `${Number(date.slice(5, 7))}/${Number(date.slice(8))}` : "일정 미정";

export default function AdminTodayTasks({ companyId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [limit, setLimit] = useState(8);
  const [siteLimit, setSiteLimit] = useState(5);
  const activeRequest = useRef(null);
  const loadedDay = useRef("");

  const refresh = useCallback(async () => {
    if (!companyId) return;
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    const timeout = setTimeout(() => controller.abort(), 20000);
    setLoading(true);
    setError("");
    setData(null);
    try {
      const { data: session, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session?.session?.access_token) throw new Error("로그인이 만료되었습니다. 다시 로그인해주세요.");
      const response = await fetch("/api/admin/today-tasks", { headers: { Authorization: `Bearer ${session.session.access_token}` }, cache: "no-store", signal: controller.signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "오늘 할 일을 불러오지 못했습니다.");
      if (activeRequest.current !== controller || controller.signal.aborted) return;
      loadedDay.current = result.today;
      setData(result);
    } catch (err) {
      if (activeRequest.current === controller) setError(err.name === "AbortError" ? "연결이 지연되고 있습니다. 새로고침을 눌러 다시 확인해주세요." : err.message);
    } finally {
      clearTimeout(timeout);
      if (activeRequest.current === controller) { activeRequest.current = null; setLoading(false); }
    }
  }, [companyId]);

  useEffect(() => {
    setFilter("all"); setLimit(8); setSiteLimit(5);
    refresh();
    const resume = () => { if (document.visibilityState === "visible" && !activeRequest.current) refresh(); };
    const midnight = setInterval(() => { if (document.visibilityState === "visible" && loadedDay.current && loadedDay.current !== koreanDay()) resume(); }, 60000);
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("focus", resume);
    return () => {
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("focus", resume);
      clearInterval(midnight);
      const previous = activeRequest.current;
      activeRequest.current = null;
      previous?.abort();
    };
  }, [refresh]);

  const visible = (data?.tasks || []).filter((task) => filter === "all" || task.kind === filter);
  function selectFilter(value) { setFilter(value); setLimit(8); }

  return <section aria-label="관리자 오늘 할 일" aria-busy={loading}>
    <div className={ui.sectionHeading}>
      <div><h2>오늘 할 일</h2><p className={ui.todayDate}>{data?.today ? `${data.today.replaceAll("-", ". ")} · 한국 시간 기준` : "오늘 처리할 업무를 모아봅니다."}</p></div>
      <button type="button" className={ui.secondary} onClick={refresh} disabled={loading}>{loading ? "확인 중…" : "↻ 새로고침"}</button>
    </div>
    <p className={ui.help}>오늘까지 확인할 배정과 검수 대기를 먼저 보여드립니다. 시공 완료 후 빠진 보고서도 여기서 확인할 수 있습니다.</p>
    {loading ? <div className={ui.todayEmpty} role="status">현장 일정과 완료보고를 확인하고 있습니다…</div>
      : error ? <div className={ui.todayError} role="alert">{error}</div> : data && <>
      <div className={ui.todayCounts} aria-label="업무별 할 일">
        {groups.map((group) => <button key={group.id} type="button" data-tone={group.tone} aria-pressed={filter === group.id}
          onClick={() => selectFilter(filter === group.id ? "all" : group.id)}>
          <span>{group.label}</span><strong>{data.counts[group.id]}<small>건</small></strong>
        </button>)}
      </div>
      <div className={ui.todayListHeading}>
        <h3>{filter === "all" ? "확인할 업무" : groups.find((g) => g.id === filter).label} <span>{visible.length}건</span></h3>
        {filter !== "all" && <button type="button" className={ui.todayTextButton} onClick={() => selectFilter("all")}>전체 보기</button>}
      </div>
      {!visible.length ? <div className={ui.todayEmpty}>{filter === "all" ? "현재 확인할 배정·보고서·검수 업무가 없습니다." : "이 항목에 확인할 업무가 없습니다."}</div>
        : <ul className={ui.todayList}>{visible.slice(0, limit).map((task) => {
          const group = groups.find((g) => g.id === task.kind);
          return <li key={task.id}><a href={siteLink(task.siteId, task.section)} className={ui.todayTask}>
            <div className={ui.todayTaskTop}><span className={ui.todayBadge} data-tone={group.tone}>{group.label}</span>
              <span className={ui.todayMeta}>{task.overdue ? "일정 지남 · " : ""}{dateLabel(task.date)}</span></div>
            <strong className={ui.todaySiteName}>{task.name}</strong>
            <p>{task.reason}</p>
            <div className={ui.todayTaskBottom}><span>{[task.region, task.workType].filter(Boolean).join(" · ")}</span><strong>{task.section === "schedule" ? "일정 확인" : group.action} ↗</strong></div>
          </a></li>;
        })}</ul>}
      {visible.length > limit && <button type="button" className={ui.todayMore} onClick={() => setLimit((n) => n + 8)}>업무 더 보기 · {visible.length - limit}건 남음</button>}
      <div className={ui.todayListHeading}><h3>오늘 시공 현장 <span>{data.todaySites.length}곳</span></h3><a className={ui.todayTextButton} href="/admin?tab=sites">현장 관리 ↗</a></div>
      {!data.todaySites.length ? <div className={ui.todayEmpty}>오늘 예정된 시공 현장이 없습니다.</div> : <ul className={ui.todayList}>
        {data.todaySites.slice(0, siteLimit).map((site) => <li key={site.siteId}><a href={siteLink(site.siteId)} className={ui.todaySite}>
          <div><strong>{site.name}</strong><span>{[site.region, site.workType].filter(Boolean).join(" · ") || "현장 상세 확인"}</span></div>
          <span className={ui.todayTeam} data-missing={!site.hasLeader}>{site.workerCount ? `${site.workerCount}명 · ${site.hasLeader ? "팀장 배정" : "팀장 확인"}` : "배정 필요"} ↗</span>
        </a></li>)}
      </ul>}
      {data.todaySites.length > siteLimit && <button type="button" className={ui.todayMore} onClick={() => setSiteLimit((n) => n + 5)}>오늘 현장 더 보기</button>}
      <p className={ui.todayUpdated}>최근 확인 {new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(data.updatedAt))} · 업무를 처리한 뒤 돌아오면 다시 확인합니다.</p>
    </>}
    <TomorrowTasks owner />
  </section>;
          }
