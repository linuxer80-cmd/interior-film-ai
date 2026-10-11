"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { loadMyWorkerSites } from "../../utils/workerSites";
import { koreanDay } from "../../utils/workerCalendar";
import {
  companySites,
  companyConflicts,
} from "../../utils/workerCompanies";
import WorkerSiteCalendar from "../WorkerSiteCalendar";
import WorkerMonthlyPay from "../WorkerMonthlyPay";

export default function WorkerCompaniesPage() {
  const router = useRouter();

  const [companies, setCompanies] = useState([]);
  const [sites, setSites] = useState([]);
  const [selected, setSelected] = useState("");
  const [tab, setTab] = useState("sites");
  const [month, setMonth] = useState(
    () => koreanDay().slice(0, 7)
  );
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    setLoading(true);
    setError("");
    setCompanies([]);
    setSites([]);

    (async () => {
      try {
        const { data, error: sessionError } =
          await supabase.auth.getSession();

        if (sessionError) throw sessionError;

        if (!data?.session?.access_token) {
          router.replace(
            "/worker/login?next=%2Fworker"
          );
          return;
        }

        const [response, siteData] =
          await Promise.all([
            fetch("/api/worker/companies", {
              headers: {
                Authorization:
                  `Bearer ${data.session.access_token}`,
              },
              cache: "no-store",
              signal: controller.signal,
            }),
            loadMyWorkerSites(),
          ]);

        const memberships = await response.json();

        if (!response.ok) {
          throw new Error(
            memberships.error || "업체 조회 실패"
          );
        }

        if (!active) return;

        setCompanies(memberships.companies || []);
        setSites(siteData.sites || []);

        setSelected(current =>
          memberships.companies.some(
            company => company.company_id === current
          )
            ? current
            : ""
        );
      } catch (failure) {
        if (active) {
          setError(
            failure.message || "다시 확인해주세요."
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
      controller.abort();
    };
  }, [router, retry]);

  const visible = companySites(
    sites,
    companies,
    selected
  );

  const conflicts = companyConflicts(sites, month);

  const name = id =>
    companies.find(
      company => company.company_id === id
    )?.company_name || "업체";

  return (
    <main className="page">
      <div className="content">
        <Link href="/worker">‹ 시공자 홈으로</Link>

        <h1>내 소속 업체 · 통합 일정</h1>
        <p>
          같은 로그인 계정에 연결된 업체의 배정
          현장을 확인하세요.
        </p>

        <div className="tabs">
          <button
            type="button"
            onClick={() => setTab("sites")}
            aria-pressed={tab === "sites"}
          >
            현장 · 일정
          </button>

          <button
            type="button"
            onClick={() => setTab("pay")}
            aria-pressed={tab === "pay"}
          >
            업체별 근무금액
          </button>
        </div>

        {loading && (
          <p role="status">
            소속 업체를 확인하고 있습니다…
          </p>
        )}

        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}

        <button
          type="button"
          disabled={loading}
          onClick={() =>
            setRetry(value => value + 1)
          }
        >
          새로고침
        </button>

        {!loading && !error && (
          <>
            <section className="box">
              <h2>
                연결된 업체 {companies.length}곳
              </h2>

              <ul>
                {companies.map(company => (
                  <li key={company.company_id}>
                    {company.company_name}
                  </li>
                ))}
              </ul>

              <p>
                다른 업체의 초대는 기존 이메일
                계정으로 연결하세요. 업체마다
                새 계정을 만들 필요가 없습니다.
              </p>
            </section>

            {tab === "sites" ? (
              <>
                <label className="filter">
                  현장 표시 업체
                  <select
                    value={selected}
                    onChange={event =>
                      setSelected(event.target.value)
                    }
                  >
                    <option value="">전체 업체</option>

                    {companies.map(company => (
                      <option
                        key={company.company_id}
                        value={company.company_id}
                      >
                        {company.company_name}
                      </option>
                    ))}
                  </select>
                </label>

                <section className="box">
                  <h2>업체 간 배정일 확인</h2>

                  <label>
                    확인할 월
                    <input
                      type="month"
                      value={month}
                      onChange={event => {
                        if (
                          /^\d{4}-\d{2}$/.test(
                            event.target.value
                          )
                        ) {
                          setMonth(event.target.value);
                        }
                      }}
                    />
                  </label>

                  {conflicts.length ? (
                    <>
                      <p>
                        같은 날 서로 다른 업체에
                        배정되어 있습니다.
                        작업 시간을 확인해주세요.
                      </p>

                      <ul>
                        {conflicts.map(day => (
                          <li key={day.date}>
                            {day.date} ·{" "}
                            {day.companyIds
                              .map(name)
                              .join(" / ")}
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p>
                      이 달에는 서로 다른 업체의
                      배정일 중복이 없습니다.
                    </p>
                  )}

                  <small>
                    전체 업체 기준이며 완료·취소
                    현장은 제외합니다. 날짜 중복이므로
                    시간 충돌이 확정된 것은 아닙니다.
                  </small>
                </section>

                <WorkerSiteCalendar
                  sites={visible}
                  loading={loading}
                  onRefresh={() =>
                    setRetry(value => value + 1)
                  }
                  onOpen={id =>
                    router.push(`/worker/site/${id}`)
                  }
                />
              </>
            ) : (
              <>
                <p>
                  전체 업체 합계와 업체별 금액을
                  표시합니다. 현장 필터와 별개이며
                  실제 지급 내역은 아닙니다.
                </p>

                <WorkerMonthlyPay refreshKey={retry} />
              </>
            )}
          </>
        )}
      </div>

      <style jsx>{`
        .page {
          min-height: 100svh;
          background: #f7f5ef;
          padding: 28px 18px 80px;
          color: #182620;
        }

        .content {
          max-width: 900px;
          margin: auto;
        }

        h1 {
          font-size: 25px;
          margin: 24px 0 12px;
        }

        h2 {
          font-size: 17px;
        }

        p,
        li {
          font-size: 14px;
          line-height: 1.8;
        }

        button,
        select,
        input {
          font: inherit;
          padding: 12px;
          border: 1px solid #dce1d8;
          border-radius: 12px;
          background: white;
          color: #182620;
        }

        button {
          cursor: pointer;
        }

        button:disabled {
          opacity: 0.6;
          cursor: wait;
        }

        .tabs {
          display: flex;
          gap: 10px;
          margin: 20px 0;
        }

        .tabs button[aria-pressed="true"] {
          background: #182620;
          color: white;
        }

        .box {
          padding: 18px;
          margin: 18px 0;
          background: white;
          border: 1px solid #dce1d8;
          border-radius: 18px;
        }

        .filter {
          display: block;
          margin: 20px 0;
        }

        select {
          display: block;
          width: 100%;
          margin-top: 8px;
        }

        input {
          display: block;
          margin-top: 8px;
        }

        small {
          line-height: 1.7;
          color: #687267;
        }

        .error {
          color: #b91c1c;
        }
      `}</style>
    </main>
  );
    }
