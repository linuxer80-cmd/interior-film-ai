"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import SavedCommuteSummary from "./SavedCommuteSummary";
import { tomorrowDay } from "../utils/tomorrowSchedule";

export default function TomorrowTasks({ owner = false }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [limit, setLimit] = useState(3);
  const date = useRef("");

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      20000
    );

    setLoading(true);
    setError("");
    setData(null);

    (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          throw Error("다시 로그인해주세요.");
        }

        const response = await fetch(
          `/api/tomorrow-tasks?role=${owner ? "owner" : "worker"}`,
          {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
            cache: "no-store",
            signal: controller.signal,
          }
        );

        const result = await response.json();

        if (!response.ok) {
          throw Error(
            result.error || "일정을 확인하지 못했습니다."
          );
        }

        if (active) {
          setData(result);
          date.current = result.date;
        }
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
      controller.abort();
      clearTimeout(timeout);
    };
  }, [owner, attempt]);

  useEffect(() => {
    const resume = () => {
      if (document.visibilityState === "visible") {
        setAttempt(n => n + 1);
      }
    };

    const timer = setInterval(() => {
      if (
        document.visibilityState === "visible" &&
        date.current &&
        date.current !== tomorrowDay()
      ) {
        resume();
      }
    }, 60000);

    const { data: listener } =
      supabase.auth.onAuthStateChange(event => {
        if (
          ["SIGNED_OUT", "SIGNED_IN", "USER_UPDATED"].includes(
            event
          )
        ) {
          setData(null);
          setAttempt(n => n + 1);
        }
      });

    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", resume);

    return () => {
      clearInterval(timer);
      listener.subscription.unsubscribe();
      window.removeEventListener("focus", resume);
      document.removeEventListener(
        "visibilitychange",
        resume
      );
    };
  }, []);

  return (
    <section
      className="tomorrow"
      aria-label="내일 할 일"
      aria-busy={loading}
    >
      <div className="heading">
        <div>
          <h2>내일 할 일</h2>
          <small>
            {data?.date || "내일 일정 확인"} · 한국 시간 기준
          </small>
        </div>

        <button
          type="button"
          disabled={loading}
          onClick={() => setAttempt(n => n + 1)}
        >
          새로고침
        </button>
      </div>

      {owner && <p>내일 현장의 배정과 사용할 필름을 확인하세요.</p>}

      {loading ? (
        <p role="status">내일 일정을 불러오는 중…</p>
      ) : error ? (
        <p role="alert">{error}</p>
      ) : (
        <>
          {!data?.sites.length && (
            <p>
              내일 예정된 {owner ? "시공" : "내 배정"} 현장이
              없습니다.
            </p>
          )}

          {data?.sites.slice(0, limit).map(site => (
            <article key={site.id} className="task-site-card">
              <div className="task-site-top">
                <div className="task-site-main">
                  <span className="task-company">
                    {owner ? "담당 현장" : `협력 업체 · ${site.companyName || "업체명 확인 필요"}`}
                  </span>
                  <strong className="task-site-name">{site.name}</strong>
                  {!owner && <span className="task-role">{site.role === "leader" ? "책임 팀장" : "팀원"}</span>}
                </div>
                <a className="task-site-open"
                  href={owner ? `/admin?tab=sites&site=${site.id}` : `/worker/site/${site.id}`}>
                  현장 보기 ›
                </a>
              </div>
              <details className="task-extra">
                <summary>준비사항 · 필름 {site.materials.length}종 <span aria-hidden="true">⌄</span></summary>
                <p>주소: {site.address || "주소 등록 필요"}</p>
                <p>작업: {site.work || "작업 내용 확인 필요"}</p>
                <p>시공자: {site.team.length
                  ? site.team.map(w => `${w.name}${w.role === "leader" ? "(팀장)" : ""}`).join(" · ")
                  : "배정 필요"}</p>
                {!site.team.some(w => w.role === "leader") && <p className="notice">책임 팀장을 확인해주세요.</p>}
                {!owner && <SavedCommuteSummary siteId={site.id} workDate={data.date} refreshKey={attempt} />}
                {site.materials.length ? (
                  <ul>{site.materials.map(m => (
                    <li key={m.id}>{[m.brand,m.code,m.name].filter(Boolean).join(" · ") || "제품 확인 필요"}
                      {m.memo && <small> · {m.memo}</small>}
                    </li>
                  ))}</ul>
                ) : <p>사용 필름이 아직 등록되지 않았습니다.</p>}
              </details>
            </article>
          ))}

          {data?.sites.length > limit && (
            <button
              type="button"
              onClick={() => setLimit(n => n + 3)}
            >
              내일 현장 더 보기
            </button>
          )}
        </>
      )}

      <style jsx>{`
        .tomorrow {
          padding: 18px;
          margin: 20px 0;
          border: 1px solid #e0d5c5;
          border-radius: 20px;
          background: #fffdfa;
          color: #243648;
        }

        .heading {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        h2 {
          margin: 0 0 5px;
          font-size: 20px;
        }

        p,
        li {
          font-size: 13px;
          line-height: 1.7;
          overflow-wrap: anywhere;
        }

        small {
          font-size: 11px;
          color: #716c63;
        }

        button,
        a {
          padding: 10px;
          border: 1px solid #dfd4c4;
          border-radius: 10px;
          color: #28445c;
          background: white;
          font-size: 12px;
          text-decoration: none;
          flex-shrink: 0;
        }

        .task-site-card {
          border: 1px solid #e5e1d9;
          background: #fff;
          border-radius: 18px;
          padding: 16px;
          margin: 12px 0;
        }
        .task-site-top { display:flex; align-items:center; justify-content:space-between; gap:12px; }
        .task-site-main { display:flex; flex-direction:column; align-items:flex-start; gap:7px; min-width:0; }
        .task-company { color:#2563eb; font-size:12px; font-weight:800; }
        .task-site-name { font-size:19px; color:#20364c; }
        .task-role { background:#f2ece4; border-radius:20px; padding:5px 9px; font-size:12px; color:#625747; }
        .task-site-open { white-space:nowrap; font-weight:700; }
        .task-extra { margin-top:12px; border-top:1px solid #eee9e1; }
        .task-extra summary { padding:12px 0 0; color:#52677c; }
        .task-extra p { margin:9px 0; }
        .task-extra ul { margin:12px 0 0; }

        .notice {
          color: #a15c13;
        }

        summary {
          cursor: pointer;
          padding: 10px 0;
          font-size: 13px;
          font-weight: 700;
        }

        ul {
          padding-left: 20px;
        }

        button:disabled {
          opacity: 0.55;
        }

        strong {
          overflow-wrap: anywhere;
          min-width: 0;
        }
      `}</style>
    </section>
  );
}
