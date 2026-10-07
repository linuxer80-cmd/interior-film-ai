"use client";

import { useMemo, useState } from "react";
import { koreanDay, monthDays, shiftMonth } from "../utils/workerCalendar";
import SiteRegisterModal from "./SiteRegisterModal";
import SiteDetailModal from "./SiteDetailModal";

const STATUS_INFO = {
  consulting: { label: "상담중", background: "#fff7ed", color: "#c2410c" },
  scheduled: { label: "시공 예정", background: "#eff6ff", color: "#1d4ed8" },
  in_progress: { label: "시공 중", background: "#fef3c7", color: "#b45309" },
  completed: { label: "시공 완료", background: "#f0fdf4", color: "#15803d" },
  cancelled: { label: "취소", background: "#f8fafc", color: "#64748b" },
};

const FILTERS = [
  ["all", "전체"],
  ["active", "진행 현장"],
  ["consulting", "상담중"],
  ["scheduled", "예정"],
  ["in_progress", "시공 중"],
  ["completed", "완료"],
];

export default function SiteManagementTab(props) {
  const {
    sites = [],
    sitesLoading = false,
    sitesMessage = "",
    openSite,
    selectedSite,
    closeSite,
    createSite,
    ...detailProps
  } = props;

  const [registerOpen, setRegisterOpen] = useState(false);
  const [filter, setFilter] = useState("all");

  const filteredSites = useMemo(
    () => sites.filter((site) =>
      filter === "all" ||
      (filter === "active"
        ? ["consulting", "scheduled", "in_progress"].includes(site.status)
        : site.status === filter)
    ),
    [sites, filter],
  );

  return (
    <>
      <section>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, color: "#111827" }}>현장관리</h2>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b" }}>날짜별 시공 일정과 현장을 확인하세요.</p>
          </div>
          <button type="button" onClick={() => setRegisterOpen(true)} style={{ border: 0, borderRadius: 10, padding: "12px", background: "#111827", color: "#fff", fontWeight: 800, whiteSpace: "nowrap", cursor: "pointer" }}>
            + 현장 추가
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 6, marginBottom: 14 }}>
          {["consulting", "scheduled", "in_progress", "completed"].map((key) => (
            <div key={key} style={{ padding: "10px 2px", border: "1px solid #e2e8f0", borderRadius: 12, background: "#fff", textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "#64748b" }}>{STATUS_INFO[key].label}</div>
              <strong style={{ fontSize: 22, color: "#111827" }}>{sites.filter((site) => site.status === key).length}</strong>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
          {FILTERS.map(([key, label]) => (
            <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)} style={{ border: "1px solid #cbd5e1", borderRadius: 24, padding: "8px 12px", background: filter === key ? "#111827" : "#fff", color: filter === key ? "#fff" : "#475569", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              {label}
            </button>
          ))}
        </div>

        {sitesMessage && (
          <p role="status" style={{ padding: 12, borderRadius: 10, background: sitesMessage.startsWith("✅") ? "#f0fdf4" : "#fef2f2", color: "#334155", whiteSpace: "pre-wrap" }}>
            {sitesMessage}
          </p>
        )}

        <SiteCalendar sites={filteredSites} openSite={openSite} loading={sitesLoading} />
      </section>

      <SiteRegisterModal open={registerOpen} onClose={() => setRegisterOpen(false)} createSite={createSite} loading={sitesLoading} />
      {selectedSite && <SiteDetailModal {...detailProps} site={selectedSite} onClose={closeSite} />}
    </>
  );
}

function SiteCard({ site, onOpen }) {
  const status = STATUS_INFO[site.status] || STATUS_INFO.consulting;
  const assignments = site.site_workers || [];
  const leader = assignments.find((item) => item.role === "leader");
  const members = assignments
    .filter((item) => item.role === "member")
    .map((item) => item.workers?.name)
    .filter(Boolean);

  const schedule = siteDates(site);
  const dates = schedule.dates ? [...schedule.dates].sort() : [];
  const label = schedule.undated
    ? "일정 미정"
    : dates.length
      ? dates.join(" · ")
      : schedule.start === schedule.end
        ? schedule.start
        : `${schedule.start} ~ ${schedule.end}`;

  return (
    <button type="button" onClick={onOpen} style={{ width: "100%", padding: 14, border: "1px solid #e2e8f0", borderRadius: 14, background: "#fff", textAlign: "left", cursor: "pointer" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <strong style={{ fontSize: 15, color: "#111827", overflowWrap: "anywhere" }}>{site.site_name || site.customer_name || "현장명 미정"}</strong>
          <div style={{ marginTop: 3, fontSize: 12, color: "#64748b" }}>고객 {site.customer_name || "미정"}</div>
        </div>
        <span style={{ flexShrink: 0, padding: "5px 8px", borderRadius: 20, fontSize: 11, fontWeight: 800, background: status.background, color: status.color }}>{status.label}</span>
      </div>

      <div style={{ display: "grid", gap: 7, marginTop: 12, fontSize: 13, color: "#334155", overflowWrap: "anywhere" }}>
        <div>📅 {label}</div>
        <div>📍 {site.address || "미정"} {site.address_detail || ""}</div>
        <div>🛠️ {site.work_type || "미정"}</div>
        <div>★ 팀장 <strong>{leader?.workers?.name || "미배정"}</strong></div>
        {members.length > 0 && <div>👷 담당 {members.join(", ")}</div>}
      </div>
    </button>
  );
}

/* 관리자 일정은 현장 전체 시공일 기준입니다. */
function siteDates(site) {
  if (Array.isArray(site.work_dates)) {
    const dates = [...new Set(site.work_dates.map(koreanDay).filter(Boolean))];
    return { dates, start: null, end: null, undated: dates.length === 0 };
  }
  const start = koreanDay(site.schedule_start || site.schedule_date);
  const end = koreanDay(site.schedule_end) || start;
  return { dates: null, start, end, undated: !start || end < start };
}

function SiteCalendar({ sites, openSite, loading }) {
  const today = koreanDay();
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [selectedDay, setSelectedDay] = useState(() => today);
  const [view, setView] = useState("calendar");

  const calendar = useMemo(() => {
    const { days, cells } = monthDays(month);
    const byDay = new Map(days.map((day) => [day, []]));
    const undated = [];
    const monthIds = new Set();

    for (const site of sites) {
      const schedule = siteDates(site);
      if (schedule.undated) {
        undated.push(site);
        continue;
      }
      for (const day of days) {
        const matches = schedule.dates
          ? schedule.dates.includes(day)
          : day >= schedule.start && day <= schedule.end;
        if (matches) {
          byDay.get(day).push(site);
          monthIds.add(site.id);
        }
      }
    }
    return { cells, byDay, undated, count: monthIds.size };
  }, [sites, month]);

  const shown = view === "list"
    ? sites
    : view === "undated"
      ? calendar.undated
      : calendar.byDay.get(selectedDay) || [];

  const button = {
    border: "1px solid #cbd5e1",
    borderRadius: 10,
    background: "#fff",
    color: "#334155",
    padding: "10px 12px",
    cursor: "pointer",
    fontWeight: 700,
  };

  function moveMonth(amount) {
    const next = shiftMonth(month, amount);
    setMonth(next);
    setSelectedDay(next === today.slice(0, 7) ? today : `${next}-01`);
  }

  return (
    <div aria-busy={loading}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        {[
          ["calendar", "캘린더"],
          ["list", "목록"],
          ["undated", `일정 미정 ${calendar.undated.length}`],
        ].map(([key, label]) => (
          <button key={key} type="button" aria-pressed={view === key} onClick={() => setView(key)} style={{ ...button, background: view === key ? "#111827" : "#fff", color: view === key ? "#fff" : "#334155" }}>
            {label}
          </button>
        ))}
      </div>

      {view === "calendar" && (
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: "12px 6px", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4, marginBottom: 12 }}>
            <button type="button" aria-label="이전 달" onClick={() => moveMonth(-1)} style={button}>‹</button>
            <strong style={{ fontSize: 18 }}>{Number(month.slice(0, 4))}년 {Number(month.slice(5))}월</strong>
            <div style={{ display: "flex", gap: 4 }}>
              <button type="button" onClick={() => { setMonth(today.slice(0, 7)); setSelectedDay(today); }} style={button}>오늘</button>
              <button type="button" aria-label="다음 달" onClick={() => moveMonth(1)} style={button}>›</button>
            </div>
          </div>

          <p style={{ fontSize: 12, color: "#64748b", margin: "0 4px 12px" }}>
            선택한 상태 기준 {calendar.count}개 현장 · 날짜를 눌러 상세 목록을 확인하세요.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 3 }}>
            {["일", "월", "화", "수", "목", "금", "토"].map((name, index) => (
              <div key={name} style={{ textAlign: "center", fontSize: 12, padding: "6px 0", color: index === 0 ? "#dc2626" : index === 6 ? "#2563eb" : "#64748b" }}>{name}</div>
            ))}

            {calendar.cells.map((day, index) => {
              if (!day) return <div key={`blank-${index}`} />;
              const entries = calendar.byDay.get(day);
              const selected = selectedDay === day;

              return (
                <button key={day} type="button" aria-pressed={selected} aria-label={`${day}${day === today ? " 오늘" : ""}, 현장 ${entries.length}개`} onClick={() => setSelectedDay(day)} style={{ minWidth: 0, minHeight: 88, padding: "5px 2px", border: selected ? "2px solid #2563eb" : "1px solid #e2e8f0", borderRadius: 8, background: selected ? "#eff6ff" : "#fff", textAlign: "left", cursor: "pointer", overflow: "hidden" }}>
                  <span style={{ display: "block", textAlign: "center", fontSize: 12, fontWeight: 800, color: day === today ? "#fff" : index % 7 === 0 ? "#dc2626" : index % 7 === 6 ? "#2563eb" : "#334155", background: day === today ? "#2563eb" : "transparent", borderRadius: 6 }}>
                    {Number(day.slice(8))}
                  </span>

                  {entries.slice(0, 2).map((site) => {
                    const status = STATUS_INFO[site.status] || STATUS_INFO.consulting;
                    return (
                      <span key={site.id} title={site.site_name || site.customer_name} style={{ display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontSize: 10, marginTop: 4, borderRadius: 3, padding: "2px 1px", background: status.background, color: status.color }}>
                        {site.site_name || site.customer_name || "현장"}
                      </span>
                    );
                  })}

                  {entries.length > 2 && (
                    <span style={{ display: "block", fontSize: 10, color: "#475569", marginTop: 3 }}>+{entries.length - 2}개</span>
                  )}
                </button>
              );
            })}
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            {Object.entries(STATUS_INFO).map(([key, value]) => (
              <span key={key} style={{ fontSize: 11, color: value.color }}>● {value.label}</span>
            ))}
          </div>
        </div>
      )}

      <div aria-live="polite" style={{ margin: "12px 0", fontWeight: 800, color: "#334155" }}>
        {view === "calendar"
          ? `${selectedDay.replaceAll("-", ".")} 현장`
          : view === "undated"
            ? "일정 미정 현장"
            : "선택한 상태의 전체 현장"} · {shown.length}건
      </div>

      {loading && (
        <p role="status" style={{ color: "#64748b" }}>현장 정보를 불러오는 중입니다…</p>
      )}

      {!loading && shown.length === 0 && (
        <p style={{ padding: 20, background: "#fff", borderRadius: 12, color: "#64748b", textAlign: "center" }}>
          {view === "calendar" ? "선택한 날짜와 상태에 해당하는 현장이 없습니다." : "해당하는 현장이 없습니다."}
        </p>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        {shown.map((site) => (
          <SiteCard key={site.id} site={site} onOpen={() => openSite(site)} />
        ))}
      </div>
    </div>
  );
}

// 파일 끝
