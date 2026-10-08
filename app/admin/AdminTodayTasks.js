"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { koreanDay } from "../utils/workerCalendar";

const groups = [
  ["assignment", "일정·배정", "배정 확인"],
  ["review", "검수 대기", "보고서 검수"],
  ["missing", "보고서 미작성", "보고서 작성"],
  ["revision", "보완 요청", "보완 확인"],
];

const defaults = {
  tab: "tasks",
  kind: "all",
  period: "all",
  query: "",
  page: 1,
};

const link = (id, section = "") =>
  `/admin?${new URLSearchParams({
    tab: "sites",
    site: id,
    ...(section ? { section } : {}),
  })}`;

const dateLabel = (date) =>
  date
    ? `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`
    : "일정 미정";

export default function AdminTodayTasks({ companyId }) {
  return companyId ? (
    <TaskPanel key={companyId} companyId={companyId} />
  ) : null;
}

function TaskPanel({ companyId }) {
  const [view, setView] = useState(defaults);
  const [ready, setReady] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  const storageKey = `admin-task-view:v2:${companyId}`;

  useEffect(() => {
    try {
      const saved = JSON.parse(
        sessionStorage.getItem(storageKey) || "null"
      );

      if (saved) {
        setView({
          tab: ["tasks", "today", "tomorrow"].includes(saved.tab)
            ? saved.tab
            : "tasks",
          kind: ["all", ...groups.map((g) => g[0])].includes(saved.kind)
            ? saved.kind
            : "all",
          period: ["all", "due"].includes(saved.period)
            ? saved.period
            : "all",
          query:
            typeof saved.query === "string"
              ? saved.query.slice(0, 100)
              : "",
          page:
            Number.isInteger(saved.page) && saved.page > 0
              ? saved.page
              : 1,
        });
      }
    } catch {}

    setReady(true);
  }, [storageKey]);

  function change(patch) {
    const next = { ...view, page: 1, ...patch };
    setView(next);

    try {
      sessionStorage.setItem(storageKey, JSON.stringify(next));
    } catch {}
  }

  useEffect(() => {
    if (!ready) return;

    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    setLoading(true);
    setError("");
    setData(null);

    (async () => {
      try {
        const {
          data: session,
          error: authError,
        } = await supabase.auth.getSession();

        if (authError || !session?.session?.access_token) {
          throw Error("다시 로그인해주세요.");
        }

        if (!active) return;

        const response = await fetch(
          view.tab === "tomorrow"
            ? "/api/tomorrow-tasks?role=owner"
            : "/api/admin/today-tasks",
          {
            headers: {
              Authorization: `Bearer ${session.session.access_token}`,
            },
            cache: "no-store",
            signal: controller.signal,
          }
        );

        const result = await response.json();

        if (!response.ok) {
          throw Error(result.error || "업무를 불러오지 못했습니다.");
        }

        if (active) setData(result);
      } catch (cause) {
        if (active) {
          setError(
            cause.name === "AbortError"
              ? "연결이 지연됩니다. 새로고침해주세요."
              : cause.message
          );
        }
      } finally {
        clearTimeout(timeout);
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [ready, view.tab, attempt]);

  useEffect(() => {
    let day = koreanDay();

    const resume = () => {
      if (document.visibilityState === "visible") {
        setAttempt((n) => n + 1);
      }
    };

    const timer = setInterval(() => {
      const current = koreanDay();

      if (day !== current) {
        day = current;
        resume();
      }
    }, 60000);

    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", resume);

    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, []);

  const today = data?.today || koreanDay();
  const query = view.query.trim().toLocaleLowerCase();

  let rows =
    view.tab === "tasks"
      ? [...(data?.tasks || [])]
      : view.tab === "today"
        ? [...(data?.todaySites || [])]
        : [...(data?.sites || [])];

  if (view.tab === "tasks") {
    rows = rows.filter(
      (r) =>
        (view.kind === "all" || r.kind === view.kind) &&
        (view.period === "all" || !r.date || r.date <= today)
    );

    rows.sort(
      (a, b) =>
        Number(Boolean(b.overdue)) - Number(Boolean(a.overdue)) ||
        String(a.date || "9999").localeCompare(
          String(b.date || "9999")
        )
    );
  }

  rows = rows.filter((r) =>
    [r.name, r.region, r.workType, r.address, r.work]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase()
      .includes(query)
  );

  const pages = Math.max(1, Math.ceil(rows.length / 5));
  const page = Math.min(view.page, pages);
  const shown = rows.slice((page - 1) * 5, page * 5);

  return (
    <section
      className="tasks"
      aria-label="보고서와 오늘 할 일"
      aria-busy={loading}
    >
      <header>
        <div>
          <h2>보고서 · 오늘 할 일</h2>
          <small>
            {view.tab === "tomorrow" ? data?.date : today} · 한국 시간
          </small>
        </div>

        <button
          disabled={loading}
          onClick={() => setAttempt((n) => n + 1)}
        >
          새로고침
        </button>
      </header>

      <nav aria-label="업무 화면">
        {[
          ["tasks", "확인할 업무"],
          ["today", "오늘 현장"],
          ["tomorrow", "내일 준비"],
        ].map(([id, label]) => (
          <button
            key={id}
            aria-pressed={view.tab === id}
            onClick={() => change({ tab: id })}
          >
            {label}
          </button>
        ))}
      </nav>

      {view.tab === "tasks" && (
        <>
          <div className="kinds" aria-label="업무 종류">
            <button
              aria-pressed={view.kind === "all"}
              onClick={() => change({ kind: "all" })}
            >
              전체 {data?.tasks?.length ?? ""}
            </button>

            {groups.map(([id, label]) => (
              <button
                key={id}
                aria-pressed={view.kind === id}
                onClick={() => change({ kind: id })}
              >
                {label} <b>{data?.counts?.[id] ?? ""}</b>
              </button>
            ))}
          </div>

          <div className="period" aria-label="업무 기간">
            <button
              aria-pressed={view.period === "all"}
              onClick={() => change({ period: "all" })}
            >
              전체 예정
            </button>
            <button
              aria-pressed={view.period === "due"}
              onClick={() => change({ period: "due" })}
            >
              오늘까지 · 미정
            </button>
          </div>
        </>
      )}

      <input
        aria-label="현장 검색"
        placeholder="현장명·지역 검색"
        maxLength={100}
        value={view.query}
        onChange={(e) => change({ query: e.target.value })}
      />

      {loading ? (
        <p role="status">업무를 확인하고 있습니다…</p>
      ) : error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : (
        <>
          <div className="count">
            {rows.length}건 · {page}/{pages}페이지
          </div>

          {!shown.length && (
            <p>해당 조건의 업무나 현장이 없습니다.</p>
          )}

          <ul>
            {shown.map((row) => {
              const group = groups.find((g) => g[0] === row.kind);
              const id = row.siteId || row.id;

              return (
                <li key={row.id || row.siteId}>
                  <a
                    className="row"
                    href={link(id, row.section)}
                  >
                    <div className="name">
                      <strong>{row.name}</strong>
                      <small>
                        {view.tab === "tasks"
                          ? `${group?.[1] || "확인 필요"} · ${
                              row.overdue ? "기한 지남 · " : ""
                            }${dateLabel(row.date)}`
                          : view.tab === "today"
                            ? `${row.workerCount || 0}명 · ${
                                row.hasLeader
                                  ? "팀장 배정"
                                  : "배정 확인"
                              }`
                            : `${row.team?.length || 0}명 · 필름 ${
                                row.materials?.length || 0
                              }종`}
                        {row.region ? ` · ${row.region}` : ""}
                      </small>
                    </div>

                    <span className="action">
                      {view.tab !== "tasks"
                        ? "현장 보기"
                        : row.section === "schedule"
                          ? "일정 확인"
                          : group?.[2] || "확인"}{" "}
                      ›
                    </span>
                  </a>

                  <details>
                    <summary>상세 내용</summary>

                    {view.tab === "tasks" ? (
                      <p>{row.reason}</p>
                    ) : null}

                    <p>
                      {[
                        row.address,
                        row.region,
                        row.workType,
                        row.work,
                      ]
                        .filter(Boolean)
                        .join(" · ") ||
                        "현장에서 상세 내용을 확인해주세요."}
                    </p>

                    {view.tab === "tomorrow" && (
                      <>
                        <p>
                          시공자:{" "}
                          {row.team
                            ?.map(
                              (w) =>
                                `${w.name}${
                                  w.role === "leader" ? "(팀장)" : ""
                                }`
                            )
                            .join(" · ") || "배정 필요"}
                        </p>

                        {!row.team?.some(
                          (w) => w.role === "leader"
                        ) && <p>책임 팀장을 확인해주세요.</p>}

                        {row.materials?.length ? (
                          row.materials.map((m) => (
                            <p key={m.id}>
                              {[m.brand, m.code, m.name, m.memo]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          ))
                        ) : (
                          <p>
                            사용 필름이 아직 등록되지 않았습니다.
                          </p>
                        )}
                      </>
                    )}
                  </details>
                </li>
              );
            })}
          </ul>

          <div className="pager">
            <button
              disabled={page <= 1}
              onClick={() => change({ page: page - 1 })}
            >
              이전
            </button>

            <span>
              {page} / {pages}
            </span>

            <button
              disabled={page >= pages}
              onClick={() => change({ page: page + 1 })}
            >
              다음
            </button>
          </div>
        </>
      )}

      <style jsx>{`
        .tasks {
          color: #243648;
          padding: 8px 0 24px;
          overflow-wrap: anywhere;
        }
        header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }
        h2 {
          font-size: 20px;
          margin: 0 0 4px;
        }
        small {
          display: block;
          font-size: 12px;
          color: #6b7280;
          line-height: 1.5;
        }
        button {
          border: 1px solid #ddd5c9;
          background: #fffdfa;
          color: #243648;
          border-radius: 10px;
          padding: 10px 12px;
          min-height: 44px;
          font-size: 13px;
          cursor: pointer;
        }
        button[aria-pressed="true"] {
          background: #243648;
          color: white;
          border-color: #243648;
        }
        button:disabled {
          opacity: 0.45;
          cursor: default;
        }
        nav {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 6px;
          margin: 16px 0 10px;
        }
        nav button {
          padding: 10px 4px;
          font-weight: 700;
        }
        .kinds {
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
        }
        .kinds button {
          font-size: 12px;
          padding: 8px;
        }
        .period {
          display: flex;
          gap: 6px;
          margin: 10px 0;
        }
        .period button {
          font-size: 12px;
          padding: 7px 10px;
        }
        input {
          box-sizing: border-box;
          width: 100%;
          padding: 12px;
          border: 1px solid #d6d3cc;
          border-radius: 10px;
          background: white;
          font-size: 16px;
          margin: 10px 0;
        }
        .count {
          font-size: 12px;
          color: #6b7280;
          margin: 4px 0 8px;
        }
        ul {
          list-style: none;
          padding: 0;
          margin: 0;
          border: 1px solid #e1dacf;
          border-radius: 14px;
          background: #fffdfa;
          overflow: hidden;
        }
        li + li {
          border-top: 1px solid #e8e2d9;
        }
        .row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 13px 12px 8px;
          text-decoration: none;
          color: inherit;
        }
        .name {
          min-width: 0;
        }
        .name strong {
          font-size: 15px;
        }
        .name small {
          margin-top: 5px;
        }
        .action {
          font-size: 12px;
          color: #315c91;
          flex-shrink: 0;
          font-weight: 700;
        }
        details {
          padding: 0 12px 10px;
        }
        summary {
          font-size: 11px;
          color: #78716c;
          cursor: pointer;
          padding: 5px 0;
        }
        details p {
          font-size: 13px;
          line-height: 1.6;
          margin: 8px 0;
        }
        .pager {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 20px;
          margin: 14px 0;
        }
        .pager span {
          font-size: 13px;
        }
        .error {
          color: #b91c1c;
        }
        p {
          font-size: 14px;
          line-height: 1.6;
        }
      `}</style>
    </section>
  );
}
