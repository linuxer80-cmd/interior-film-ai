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

      await api("POST", siteId, { siteId, days });

      if (currentKey.current !== savedKey) return;

      setMessage("✅ 날짜별 담당자가 저장되었습니다.");

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

  if (!site) return null;

  return (
    <section
      style={{ padding: 16, background: "#fff", borderRadius: 12 }}
    >
      <h3>👷 날짜별 담당 시공자</h3>

      <p style={{ color: "#64748b", fontSize: 13, lineHeight: 1.6 }}>
        선택한 시공일마다 팀장과 팀원을 지정하세요.
        시공자에게는 본인이 배정된 날짜만 표시됩니다.
      </p>

      {locked && (
        <p>완료되거나 취소된 현장은 배정을 변경할 수 없습니다.</p>
      )}

      {loading || workersLoading ? (
        <p>담당자를 불러오는 중...</p>
      ) : !dates.length ? (
        <p>먼저 시공 날짜를 선택하고 저장해주세요.</p>
      ) : readyKey !== formKey ? (
        <button
          type="button"
          onClick={() => setRetry((value) => value + 1)}
        >
          담당자 다시 불러오기
        </button>
      ) : (
        dates.map((date) => {
          const day = assignments[date] || {
            leaderId: "",
            memberIds: [],
          };

          const missingLeader =
            day.leaderId &&
            !activeWorkers.some(
              (worker) => worker.id === day.leaderId
            );

          return (
            <div
              key={date}
              style={{
                padding: 14,
                border: "1px solid #e2e8f0",
                borderRadius: 10,
                marginBottom: 12,
              }}
            >
              <strong style={{ color: "#1d4ed8" }}>{date}</strong>

              <label style={{ display: "block", marginTop: 12 }}>
                👑 팀장
                <select
                  aria-label={`${date} 팀장`}
                  disabled={disabled}
                  value={day.leaderId}
                  onChange={(event) =>
                    change(date, {
                      leaderId: event.target.value,
                      memberIds: day.memberIds.filter(
                        (id) => id !== event.target.value
                      ),
                    })
                  }
                  style={{
                    display: "block",
                    width: "100%",
                    padding: 12,
                    marginTop: 6,
                    borderRadius: 8,
                  }}
                >
                  <option value="">팀장 미배정</option>

                  {missingLeader && (
                    <option value={day.leaderId} disabled>
                      기존 팀장 확인 필요 — 다시 선택해주세요
                    </option>
                  )}

                  {activeWorkers.map((worker) => (
                    <option key={worker.id} value={worker.id}>
                      {worker.name}
                    </option>
                  ))}
                </select>
              </label>

              <div style={{ margin: "14px 0 8px" }}>👷 팀원</div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(130px, 1fr))",
                  gap: 8,
                }}
              >
                {activeWorkers
                  .filter((worker) => worker.id !== day.leaderId)
                  .map((worker) => (
                    <label
                      key={worker.id}
                      style={{
                        display: "flex",
                        gap: 8,
                        alignItems: "center",
                        padding: 10,
                        border: "1px solid #e2e8f0",
                        borderRadius: 8,
                      }}
                    >
                      <input
                        type="checkbox"
                        disabled={disabled}
                        checked={day.memberIds.includes(worker.id)}
                        onChange={(event) =>
                          change(date, {
                            memberIds: event.target.checked
                              ? [
                                  ...new Set([
                                    ...day.memberIds,
                                    worker.id,
                                  ]),
                                ]
                              : day.memberIds.filter(
                                  (id) => id !== worker.id
                                ),
                          })
                        }
                      />
                      {worker.name}
                    </label>
                  ))}
              </div>

              {!activeWorkers.length && (
                <p>시공자 관리에서 시공자를 등록해주세요.</p>
              )}
            </div>
          );
        })
      )}

      {message && (
        <p
          role="status"
          style={{
            color: message.startsWith("✅")
              ? "#166534"
              : "#b91c1c",
            fontSize: 13,
          }}
        >
          {message}
        </p>
      )}

      <button
        type="button"
        onClick={save}
        disabled={disabled || !dates.length}
        style={{
          width: "100%",
          padding: 14,
          border: "none",
          borderRadius: 10,
          background: "#111827",
          color: "#fff",
          fontWeight: 800,
          opacity: disabled || !dates.length ? 0.5 : 1,
        }}
      >
        {saving ? "저장 중..." : "날짜별 담당자 저장"}
      </button>
    </section>
  );
      }
