"use client";

import { useEffect, useRef, useState } from "react";
import WorkDatePicker from "../WorkDatePicker";

function validDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;

  const date = new Date(`${value}T00:00:00Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

function normalizeDays(values) {
  return [...new Set((values || []).filter(validDay))].sort();
}

function localDay(value) {
  if (!value) return "";
  if (validDay(value)) return value;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const get = (type) => parts.find((part) => part.type === type)?.value;

  return `${get("year")}-${get("month")}-${get("day")}`;
}

function getWorkDates(site) {
  if (Array.isArray(site?.work_dates)) {
    return normalizeDays(site.work_dates);
  }

  const start = localDay(
    site?.schedule_start || site?.schedule_date
  );

  const end = localDay(site?.schedule_end) || start;

  if (!validDay(start)) return [];
  if (!validDay(end) || end < start) return [start];

  const result = [];
  const cursor = new Date(`${start}T00:00:00Z`);

  while (result.length < 366) {
    const day = cursor.toISOString().slice(0, 10);
    if (day > end) break;

    result.push(day);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return result;
}

function formatDay(value) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "UTC",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(`${value}T00:00:00Z`));
}

const buttonStyle = {
  border: "1px solid #cbd5e1",
  borderRadius: 9,
  padding: "12px",
  background: "#fff",
  color: "#475569",
  fontSize: 14,
  fontWeight: 800,
  cursor: "pointer",
};

export default function SiteScheduleEditor({
  site,
  reportOpen = false,
  updateSiteSchedule,
  reloadSites,
}) {
  const [editing, setEditing] = useState(false);
  const [workDates, setWorkDates] = useState([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const savingRef = useRef(false);
  const currentSiteId = useRef(site?.id);
  currentSiteId.current = site?.id;

  const savedDates = getWorkDates(site);
  const savedDatesKey = savedDates.join(",");

  useEffect(() => {
    setEditing(false);
    setMessage("");
  }, [site?.id]);

  useEffect(() => {
    if (!editing) {
      setWorkDates(
        savedDatesKey ? savedDatesKey.split(",") : []
      );
    }
  }, [site?.id, savedDatesKey, editing]);

  function openEditor() {
    setWorkDates(getWorkDates(site));
    setMessage("");
    setEditing(true);
  }

  function cancelEditor() {
    if (savingRef.current) return;

    setWorkDates(getWorkDates(site));
    setMessage("");
    setEditing(false);
  }

  async function saveSchedule() {
    if (savingRef.current) return;

    if (!site?.id) {
      setMessage("❌ 현장 정보를 확인할 수 없습니다.");
      return;
    }

    if (
      typeof updateSiteSchedule !== "function" ||
      updateSiteSchedule.supportsWorkDates !== true
    ) {
      setMessage(
        "❌ 여러 날짜 저장 기능이 아직 연결되지 않았습니다. useSites.js 수정과 SQL 적용을 먼저 완료해주세요."
      );
      return;
    }

    const dates = normalizeDays(workDates);

    if (!dates.length) {
      setMessage("❌ 실제 시공하는 날짜를 하나 이상 선택해주세요.");
      return;
    }

    if (dates.length > 366) {
      setMessage("❌ 한 현장은 최대 366개의 시공 날짜를 선택할 수 있습니다.");
      return;
    }

    const siteId = site.id;
    savingRef.current = true;
    setSaving(true);
    setMessage("");

    try {
      const result = await updateSiteSchedule({
        siteId,
        workDates: dates,
        scheduleStart: new Date(
          `${dates[0]}T00:00:00+09:00`
        ).toISOString(),
        scheduleEnd: new Date(
          `${dates[dates.length - 1]}T23:59:00+09:00`
        ).toISOString(),
      });

      if (currentSiteId.current !== siteId) return;

      if (!result?.success) {
        setMessage(
          `❌ ${result?.error || "시공 일정을 저장하지 못했습니다."}`
        );
        return;
      }

      setEditing(false);
      setMessage(`✅ 선택한 ${dates.length}일의 시공 일정을 저장했습니다.`);

      if (typeof reloadSites === "function") {
        try {
          await reloadSites();
        } catch {
          if (currentSiteId.current === siteId) {
            setMessage(
              "✅ 일정은 저장되었습니다. 목록을 새로고침해주세요."
            );
          }
        }
      }
    } catch (error) {
      if (currentSiteId.current === siteId) {
        setMessage(
          `❌ ${error?.message || "일정 저장 중 오류가 발생했습니다."}`
        );
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  if (!site) return null;

  const canEdit =
    !reportOpen &&
    site.status !== "completed" &&
    site.status !== "cancelled" &&
    site.status !== "canceled";

  return (
    <>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "90px 1fr",
          gap: 10,
          padding: "10px 0",
          borderBottom: "1px solid #f1f5f9",
          fontSize: 13,
        }}
      >
        <div style={{ color: "#64748b", fontWeight: 700 }}>
          시공일
        </div>

        <div style={{ color: "#111827", fontWeight: 600 }}>
          {savedDates.length ? (
            <>
              <div style={{ marginBottom: 7, color: "#2563eb" }}>
                총 {savedDates.length}일
              </div>

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                }}
              >
                {savedDates.map((date) => (
                  <span
                    key={date}
                    style={{
                      padding: "6px 8px",
                      borderRadius: 7,
                      background: "#eff6ff",
                      lineHeight: 1.5,
                    }}
                  >
                    {formatDay(date)}
                  </span>
                ))}
              </div>
            </>
          ) : (
            "미정"
          )}
        </div>
      </div>

      {site.status === "consulting" && !reportOpen && (
        <div
          style={{
            marginTop: 8,
            padding: 10,
            borderRadius: 9,
            background: "#fff7ed",
            color: "#9a3412",
            fontSize: 12,
            lineHeight: 1.6,
          }}
        >
          시공일을 선택하고 저장하면 시공 예정으로 변경됩니다.
        </div>
      )}

      {canEdit && (
        <div
          style={{
            padding: "12px 0",
            borderBottom: "1px solid #f1f5f9",
          }}
        >
          {!editing ? (
            <button
              type="button"
              disabled={saving}
              onClick={openEditor}
              style={{
                ...buttonStyle,
                width: "100%",
                borderColor: "#bfdbfe",
                background: "#eff6ff",
                color: "#1d4ed8",
                opacity: saving ? 0.6 : 1,
              }}
            >
              📅 {savedDates.length ? "시공일 변경" : "시공일 선택"}
            </button>
          ) : (
            <div
              style={{
                padding: 12,
                border: "1px solid #bfdbfe",
                borderRadius: 11,
                background: "#f8fbff",
              }}
            >
              <div
                style={{
                  marginBottom: 14,
                  color: "#1e3a8a",
                  fontSize: 15,
                  fontWeight: 900,
                }}
              >
                📅 시공하는 날짜 선택
              </div>

              <WorkDatePicker
                value={workDates}
                onChange={setWorkDates}
                disabled={saving}
              />

              <p
                style={{
                  margin: "12px 0 0",
                  color: "#64748b",
                  fontSize: 12,
                  lineHeight: 1.6,
                }}
              >
                예: 10일과 13일만 선택하면 11일과 12일은
                시공 일정에 포함되지 않습니다.
                저장 후 날짜별 팀장과 팀원을 확인해주세요.
              </p>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                  marginTop: 14,
                }}
              >
                <button
                  type="button"
                  disabled={saving}
                  onClick={cancelEditor}
                  style={buttonStyle}
                >
                  취소
                </button>

                <button
                  type="button"
                  disabled={saving}
                  onClick={saveSchedule}
                  style={{
                    ...buttonStyle,
                    borderColor: "#2563eb",
                    background: "#2563eb",
                    color: "#fff",
                    opacity: saving ? 0.6 : 1,
                  }}
                >
                  {saving ? "저장 중..." : "시공일 저장"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {message && (
        <div
          role="status"
          style={{
            marginTop: 8,
            padding: "10px",
            borderRadius: 8,
            background: message.startsWith("✅")
              ? "#f0fdf4"
              : "#fef2f2",
            color: message.startsWith("✅")
              ? "#166534"
              : "#b91c1c",
            fontSize: 12,
            fontWeight: 700,
            lineHeight: 1.6,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {message}
        </div>
      )}
    </>
  );
}
