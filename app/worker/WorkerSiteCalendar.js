"use client";

import { useEffect, useMemo, useState } from "react";
import { isUndated, koreanDay, nextWorkDay, shiftMonth, siteStatus, workerMonth } from "../utils/workerCalendar";
import styles from "./WorkerSiteCalendar.module.css";

const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
const statuses = {
  scheduled: { label: "시공 예정", color: "#2563eb", background: "#eff6ff" },
  in_progress: { label: "시공 중", color: "#047857", background: "#ecfdf5" },
  completed: { label: "완료", color: "#475569", background: "#f1f5f9" },
  cancelled: { label: "취소", color: "#b91c1c", background: "#fef2f2" },
};
const dateLabel = (day) => new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "long",
}).format(new Date(`${day}T00:00:00+09:00`));

function SiteCard({ site, role, onOpen }) {
  const status = statuses[siteStatus(site)] || statuses.scheduled;
  const address = [site.address, site.address_detail].filter(Boolean).join(" ") || site.region;
  return <article className={styles.siteCard}>
    <button type="button" className={styles.siteLink} onClick={() => onOpen(site.site_id)}>
      <span className={styles.siteTop}>
        <span className={styles.siteName}>{site.site_name || site.customer_name || "현장"}</span>
        <span className={styles.status} style={{ color: status.color, background: status.background }}>{status.label}</span>
      </span>
      <span className={styles.role} data-leader={role === "leader"}>{role === "leader" ? "👑 책임 팀장" : "👷 팀원"}</span>
      {address && <span className={styles.address}>{address}</span>}
      {site.work_type && <span className={styles.workType}>{site.work_type}</span>}
      {site.schedule_notice && <span className={styles.notice}>{site.schedule_notice}</span>}
      <span className={styles.openLabel}>현장 상세 보기 <span aria-hidden="true">↗</span></span>
    </button>
    {site.customer_phone && <a className={styles.callLink} href={`tel:${site.customer_phone}`}>고객에게 전화</a>}
  </article>;
}

export default function WorkerSiteCalendar({ sites = [], loading = false, error = "", onRefresh, onOpen }) {
  const [today, setToday] = useState(() => koreanDay());
  const [month, setMonth] = useState(() => koreanDay().slice(0, 7));
  const [selected, setSelected] = useState(() => koreanDay());
  const [includeCancelled, setIncludeCancelled] = useState(false);
  useEffect(() => {
    const updateToday = () => setToday(koreanDay());
    document.addEventListener("visibilitychange", updateToday);
    return () => document.removeEventListener("visibilitychange", updateToday);
  }, []);
  const visible = useMemo(() => sites.filter((site) => includeCancelled || siteStatus(site) !== "cancelled"), [sites, includeCancelled]);
  const calendar = useMemo(() => workerMonth(visible, month), [visible, month]);
  const undated = useMemo(() => visible.filter(isUndated), [visible]);
  const selectedSites = calendar.byDay.get(selected) || [];
  const next = nextWorkDay(visible.filter((site) => !["completed", "cancelled"].includes(siteStatus(site))), today);
  const cancelledCount = sites.filter((site) => siteStatus(site) === "cancelled").length;
  const [year, monthNumber] = month.split("-").map(Number);

  function chooseDay(day) {
    setSelected(day);
    setMonth(day.slice(0, 7));
  }
  function moveMonth(amount) {
    const nextMonth = shiftMonth(month, amount);
    setMonth(nextMonth);
    setSelected(nextMonth === today.slice(0, 7) ? today : `${nextMonth}-01`);
  }

  return <section className={styles.calendar} aria-label="내 현장 캘린더" aria-busy={loading}>
    <div className={styles.sectionHeader}>
      <div><h2 className={styles.sectionTitle}>내 현장</h2><p className={styles.subtitle}>날짜를 눌러 내 작업을 확인하세요.</p></div>
      <button className={styles.refreshButton} type="button" onClick={onRefresh} disabled={loading} aria-label="현장 새로고침">
        <span aria-hidden="true">↻</span> {loading ? "확인 중" : "새로고침"}
      </button>
    </div>
    {error && <div className={styles.error} role="alert">{error}</div>}
    {!error && <>
      <div className={styles.monthBar}>
        <h3 className={styles.monthTitle} aria-live="polite">{year}년 {monthNumber}월</h3>
        <div className={styles.monthActions}>
          <button type="button" className={styles.todayButton} onClick={() => chooseDay(koreanDay())}>오늘</button>
          <button type="button" className={styles.arrowButton} onClick={() => moveMonth(-1)} aria-label="이전 달">‹</button>
          <button type="button" className={styles.arrowButton} onClick={() => moveMonth(1)} aria-label="다음 달">›</button>
        </div>
      </div>
      <div className={styles.monthSummary}><strong>{calendar.workDays}일</strong> 작업 · <strong>{calendar.siteCount}개</strong> 현장</div>
      <div className={styles.weekdays} aria-hidden="true">{weekdays.map((name, index) => <span key={name} className={index === 0 ? styles.sunday : index === 6 ? styles.saturday : ""}>{name}</span>)}</div>
      <div className={styles.days} aria-label={`${year}년 ${monthNumber}월 날짜`}>
        {calendar.cells.map((day, index) => {
          if (!day) return <span key={`blank-${index}`} className={styles.blankDay} aria-hidden="true" />;
          const entries = calendar.byDay.get(day) || [];
          const isToday = day === today;
          return <button type="button" key={day} className={styles.day}
            data-selected={selected === day} data-today={isToday} data-has-work={entries.length > 0}
            data-weekday={index % 7} aria-pressed={selected === day}
            aria-current={isToday ? "date" : undefined}
            aria-label={`${dateLabel(day)}${isToday ? ", 오늘" : ""}, ${entries.length ? `현장 ${entries.length}건` : "배정 없음"}`}
            onClick={() => chooseDay(day)}>
            <span className={styles.dayNumber}>{Number(day.slice(8))}</span>
            <span className={styles.dayCount}>{entries.length ? `${entries.length}건` : isToday ? "오늘" : ""}</span>
          </button>;
        })}
      </div>
      <div className={styles.calendarFooter}>
        <span className={styles.legend}><i aria-hidden="true" /> 내 작업일</span>
        <label className={styles.cancelToggle}><input type="checkbox" checked={includeCancelled} onChange={(event) => setIncludeCancelled(event.target.checked)} /> 취소 포함{cancelledCount ? ` (${cancelledCount})` : ""}</label>
      </div>
      <div className={styles.agenda} aria-label="선택한 날짜의 현장">
        <div className={styles.agendaHeader} aria-live="polite">
          <h3 className={styles.agendaTitle}>{dateLabel(selected)}{selected === today && <span className={styles.todayTag}>오늘</span>}</h3>
          <span className={styles.agendaCount}>{selectedSites.length}건</span>
        </div>
        {loading && <p className={styles.loading} role="status">최신 배정을 확인하고 있습니다.</p>}
        {selectedSites.length ? <div className={styles.siteList}>
          {selectedSites.map(({ site, role }) => <SiteCard key={site.site_id} site={site} role={role} onOpen={onOpen} />)}
        </div> : !loading && <div className={styles.empty}>
          <strong>{sites.length ? "이 날짜에는 배정된 현장이 없습니다." : "아직 배정된 현장이 없습니다."}</strong>
          <p>{sites.length ? "달력에서 표시된 작업일을 눌러주세요." : "관리자가 현장에 배정하면 달력에 표시됩니다."}</p>
          {next && next !== selected && <button type="button" className={styles.nextButton} onClick={() => chooseDay(next)}>가까운 작업일 보기 · {Number(next.slice(5, 7))}/{Number(next.slice(8))} →</button>}
        </div>}
      </div>
      {undated.length > 0 && <details className={styles.undated}>
        <summary>날짜 미정 현장 <strong>{undated.length}건</strong></summary>
        <p>작업 날짜는 관리자에게 확인해주세요.</p>
        <div className={styles.siteList}>{undated.map((site) => <SiteCard key={site.site_id} site={site} role={site.worker_role || site.my_role} onOpen={onOpen} />)}</div>
      </details>}
    </>}
    <p className={styles.privacyNote}>본인에게 배정된 날짜만 표시됩니다.</p>
  </section>;
}
