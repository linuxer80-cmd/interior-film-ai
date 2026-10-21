"use client";
import { useEffect, useMemo, useState } from "react";
import { koreanDay, shiftMonth } from "../utils/workerCalendar";
import { homeSchedule } from "../../lib/homeSchedule.mjs";
import styles from "./HomeSchedule.module.css";

export default function HomeSchedule({ sites = [], worker = false, loading = false, error = "", onOpen }) {
  const [today, setToday] = useState(() => koreanDay());
  const [month, setMonth] = useState(() => koreanDay().slice(0, 7));
  const [selected, setSelected] = useState(() => koreanDay());
  useEffect(() => {
    const refresh = () => setToday(koreanDay());
    const timer = setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    return () => { clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, []);
  const { cells, byDay } = useMemo(() => homeSchedule(sites, month, worker), [sites, worker, month]);
  const entries = byDay.get(selected) || [];
  function move(amount) { const next = shiftMonth(month, amount); setMonth(next); setSelected(`${next}-01`); }
  return <section className={styles.calendar} aria-label={worker ? "내 배정 월간 일정" : "업체 월간 일정"} aria-busy={loading}>
    <header className={styles.header}><div><small>{worker ? "내 배정 일정" : "우리 업체 일정"}</small><h2>{month.slice(0,4)}년 {Number(month.slice(5))}월</h2></div><div className={styles.controls}><button type="button" aria-label="이전 달" onClick={() => move(-1)}>‹</button><button type="button" onClick={() => { setMonth(today.slice(0,7)); setSelected(today); }}>오늘</button><button type="button" aria-label="다음 달" onClick={() => move(1)}>›</button></div></header>
    <div className={styles.week} aria-hidden="true">{["일","월","화","수","목","금","토"].map(d => <span key={d}>{d}</span>)}</div>
    <div className={styles.grid}>{cells.map((day, i) => day ? <button type="button" key={day} className={styles.day} aria-pressed={selected === day} aria-current={day === today ? "date" : undefined} aria-label={`${day}, ${byDay.get(day)?.length || 0}개 현장`} onClick={() => setSelected(day)}><span>{Number(day.slice(8))}</span><small>{!loading && !error && byDay.get(day)?.length ? `${byDay.get(day).length}건` : "\u00a0"}</small></button> : <span key={`empty-${i}`} />)}</div>
    <div className={styles.agenda} aria-live="polite"><h3>{Number(selected.slice(5,7))}월 {Number(selected.slice(8))}일{selected === today ? " · 오늘" : ""}</h3>{loading ? <p role="status">일정을 불러오고 있습니다…</p> : error ? <p role="alert">{error}</p> : entries.length ? entries.map(({ site, role }) => <button type="button" className={styles.site} key={site.site_id || site.id} onClick={() => onOpen(site.site_id || site.id)}><span><strong>{site.site_name || site.customer_name || "현장"}</strong><small>{[site.company_name, site.work_type, worker ? role === "leader" ? "책임 팀장" : "팀원" : null].filter(Boolean).join(" · ") || "현장 정보 확인"}</small></span><span aria-hidden="true">›</span></button>) : <p>이 날짜에 등록된 {worker ? "배정 " : ""}현장이 없습니다.</p>}</div>
  </section>;
}
