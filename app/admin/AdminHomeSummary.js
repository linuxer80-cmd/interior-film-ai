"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import MaterialIssueStatus from "../components/MaterialIssueStatus";

export default function AdminHomeSummary({ companyId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [tomorrow, setTomorrow] = useState(null);
  const [prepareError, setPrepareError] = useState("");
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
    setTomorrow(null);
    setPrepareError("");

    (async () => {
      try {
        const { data: session, error: authError } =
          await supabase.auth.getSession();

        if (authError || !session?.session?.access_token) {
          throw Error("다시 로그인해주세요.");
        }

        const read = async (url) => {
          const response = await fetch(url, {
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

          return result;
        };

        const results = await Promise.allSettled([
          read("/api/admin/today-tasks"),
          read("/api/tomorrow-tasks?role=owner"),
        ]);

        if (!active) return;

        const message = (cause) =>
          cause.name === "AbortError"
            ? "연결이 지연됩니다. 다시 확인해주세요."
            : cause.message;

        if (results[0].status === "fulfilled") {
          setData(results[0].value);
        } else {
          setError(message(results[0].reason));
        }

        if (results[1].status === "fulfilled") {
          setTomorrow(results[1].value);
        } else {
          setPrepareError(message(results[1].reason));
        }
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
        <a href="/admin/today" data-ui-link="action">전체 보기 ›</a>
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

          {todaySites.length > 0 && (
            <ul className="today-sites" aria-label="오늘 시공 현장">
              {todaySites.map((site) => (
                <li key={site.siteId}>
                  <a href={`/admin?${new URLSearchParams({
                    tab: "sites",
                    site: site.siteId,
                  })}`}>
                    <div className="site-info">
                      <strong>{site.name}</strong>
                      {[site.region, site.workType].filter(Boolean).length > 0 && (
                        <p>{[site.region, site.workType].filter(Boolean).join(" · ")}</p>
                      )}
                      <p className="site-team">
                        {site.workerCount > 0
                          ? `시공자 ${site.workerCount}명 · ${site.hasLeader ? "팀장 배정 완료" : "팀장 미배정"}`
                          : "시공자 배정 필요"}
                      </p>
                    </div>
                    <span className="site-open">현장 보기 ›</span>
                  </a>
                </li>
              ))}
            </ul>
          )}

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

      {!loading && (
        <div className="prepare">
          {prepareError ? (
            <div role="alert">
              <p>내일 자재 준비: {prepareError}</p>
              <button
                type="button"
                onClick={() => setAttempt((n) => n + 1)}
              >
                다시 확인
              </button>
            </div>
          ) : tomorrow ? (
            <details>
              <summary>
                <span>내일 자재 준비하기</span>
                <b>{tomorrow.sites?.length || 0}개 현장 ›</b>
              </summary>

              <small>
                {tomorrow.date} 시공 예정 · 등록된 사용 필름 기준
              </small>

              {tomorrow.sites?.length ? (
                <ul>
                  {tomorrow.sites.map((site) => (
                    <li key={site.id}>
                      <a
                        href={`/admin?${new URLSearchParams({
                          tab: "sites",
                          site: site.id,
                          section: "materials",
                        })}`}
                      >
                        <strong>{site.name}</strong>
                        <span>자재 확인 ›</span>
                      </a>

                      <MaterialIssueStatus
                        siteId={site.id}
                        refreshKey={attempt}
                      />

                      {site.materials?.length ? (
                        site.materials.map((material) => (
                          <p key={material.id}>
                            {[
                              material.brand,
                              material.code,
                              material.name,
                              material.memo,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        ))
                      ) : (
                        <p>
                          사용 필름 미등록 · 현장에서 사용할 자재를
                          확인해주세요.
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>내일 예정된 시공 현장이 없습니다.</p>
              )}

              <p className="note">
                필름 종류와 필요한 수량, 반출 여부를 확인해주세요.
              </p>
            </details>
          ) : null}
        </div>
      )}

      <style jsx>{`
        .summary {
          padding: 16px;
          border: 1px solid #dfe4d7;
          border-radius: 20px;
          background: #fffefb;
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
          background: #f0f4e9;
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
          border: 1px solid #dfe4d7;
          border-radius: 10px;
          background: white;
          color: #243648;
          cursor: pointer;
        }
        .prepare {
          margin-top: 12px;
          border-top: 1px solid #e8e2d9;
          padding-top: 10px;
        }
        summary {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          min-height: 44px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 700;
        }
        summary b {
          font-size: 12px;
          color: #315c91;
          white-space: nowrap;
        }
        ul {
          list-style: none;
          margin: 8px 0;
          padding: 0;
        }
        li {
          padding: 10px 0;
          border-bottom: 1px solid #e8e2d9;
        }
        li a {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          min-height: 44px;
        }
        li strong {
          display: inline;
          margin: 0;
          font-size: 14px;
        }
        li a span {
          font-size: 12px;
          white-space: nowrap;
        }
        .note {
          font-size: 12px;
          color: #716c63;
        }
        .today-sites {
          margin: 14px 0;
        }
        .today-sites li {
          padding: 0;
          border: 1px solid #dfe4d7;
          border-radius: 12px;
          margin-top: 8px;
          background: #f8faf5;
        }
        .today-sites a {
          padding: 14px 12px;
        }
        .site-info {
          min-width: 0;
          overflow-wrap: anywhere;
        }
        .today-sites strong {
          display: block;
          font-size: 16px;
        }
        .today-sites p {
          margin-top: 4px;
          color: #526171;
        }
        .today-sites .site-team {
          color: #315d49;
          font-size: 12px;
        }
        .site-open {
          flex-shrink: 0;
        }
        summary:focus-visible,
        a:focus-visible,
        button:focus-visible {
          outline: 2px solid #315c91;
          outline-offset: 3px;
        }
      `}</style>
    </section>
  );
}
