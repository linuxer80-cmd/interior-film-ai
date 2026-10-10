"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

export default function AdminHomeSummary({ companyId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!companyId) return;

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

        const response = await fetch("/api/admin/today-tasks", {
          headers: {
            Authorization: `Bearer ${session.session.access_token}`,
          },
          cache: "no-store",
          signal: controller.signal,
        });

        const result = await response.json();

        if (!response.ok) {
          throw Error(result.error || "업무를 불러오지 못했습니다.");
        }

        if (active) setData(result);
      } catch (cause) {
        if (active) {
          setError(
            cause.name === "AbortError"
              ? "연결이 지연됩니다. 다시 확인해주세요."
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
  }, [companyId, attempt]);

  useEffect(() => {
    const day = () =>
      new Intl.DateTimeFormat("sv-SE", {
        timeZone: "Asia/Seoul",
      }).format(new Date());

    let previousDay = day();

    const resume = () => {
      if (document.visibilityState === "visible") {
        setAttempt((n) => n + 1);
      }
    };

    const timer = setInterval(() => {
      const current = day();

      if (current !== previousDay) {
        previousDay = current;
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

  const tasks = data?.tasks || [];
  const todaySites = data?.todaySites || [];

  const due = tasks.filter(
    (task) => !task.date || task.date <= data?.today
  );

  const preview = due[0];

  return (
    <section
      className="summary"
      aria-label="오늘 할 일 요약"
      aria-busy={loading}
    >
      <header>
        <h2>오늘 할 일</h2>
        <a href="/admin/today">전체 보기 ›</a>
      </header>

      {loading ? (
        <p role="status">오늘 업무를 확인하고 있습니다…</p>
      ) : error ? (
        <div role="alert">
          <p>{error}</p>

          <button
            type="button"
            onClick={() => setAttempt((n) => n + 1)}
          >
            다시 확인
          </button>
        </div>
      ) : (
        <>
          <small>{data?.today} · 한국 시간</small>

          <a
            className="counts"
            href="/admin/today"
            aria-label="오늘 현장과 검수 및 업무 상세 보기"
          >
            <span>
              오늘 시공
              <strong>{todaySites.length}건</strong>
            </span>

            <span>
              검수 대기
              <strong>{data?.counts?.review || 0}건</strong>
            </span>

            <span>
              확인할 업무
              <strong>{due.length}건</strong>
            </span>
          </a>

          <p className="preview">
            {preview
              ? `${preview.name} · ${preview.reason}`
              : todaySites.length
                ? "오늘 시공 현장의 일정과 배정을 확인하세요."
                : "오늘 예정된 시공과 확인할 업무가 없습니다."}
          </p>

          {tasks.length > due.length && (
            <small>
              이후 예정된 확인 업무 {tasks.length - due.length}건
            </small>
          )}
        </>
      )}

      <style jsx>{`
        .summary {
          padding: 16px;
          border: 1px solid #dfd8cc;
          border-radius: 18px;
          background: #fffdfa;
          color: #243648;
          margin-bottom: 14px;
        }

        header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        h2 {
          font-size: 19px;
          margin: 0;
        }

        header a {
          padding: 10px 0;
          min-height: 44px;
          box-sizing: border-box;
          font-size: 13px;
        }

        a {
          color: #315c91;
          text-decoration: none;
        }

        small {
          font-size: 12px;
          color: #716c63;
        }

        .counts {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 6px;
          margin: 12px 0;
        }

        .counts span {
          padding: 12px 4px;
          border-radius: 12px;
          background: #f1f6fb;
          text-align: center;
          font-size: 12px;
          color: #526171;
        }

        strong {
          display: block;
          margin-top: 5px;
          font-size: 22px;
          color: #243648;
        }

        p {
          font-size: 13px;
          line-height: 1.6;
          margin: 8px 0 0;
          overflow-wrap: anywhere;
        }

        .preview {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        button {
          min-height: 44px;
          margin-top: 8px;
          padding: 8px 12px;
          border: 1px solid #ddd5c9;
          border-radius: 10px;
          background: white;
          color: #243648;
          cursor: pointer;
        }

        a:focus-visible,
        button:focus-visible {
          outline: 2px solid #315c91;
          outline-offset: 3px;
        }
      `}</style>
    </section>
  );
}
