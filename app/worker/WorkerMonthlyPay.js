"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import {
  koreanDay,
  shiftMonth,
} from "../utils/workerCalendar";
import styles from "./WorkerMonthlyPay.module.css";

const won = (value) =>
  `${Number(value).toLocaleString("ko-KR")}원`;

export default function WorkerMonthlyPay({
  refreshKey,
}) {
  const currentMonth = koreanDay().slice(0, 7);

  const [month, setMonth] = useState(currentMonth);
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState({
    loading: true,
  });

  useEffect(() => {
    setMonth(currentMonth);
  }, [currentMonth]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    setState({ loading: true });

    (async () => {
      try {
        const { data, error } =
          await supabase.auth.getSession();

        if (
          error ||
          !data?.session?.access_token
        ) {
          throw new Error(
            "로그인을 다시 해주세요."
          );
        }

        const response = await fetch(
          `/api/worker/monthly-pay?month=${encodeURIComponent(month)}`,
          {
            headers: {
              Authorization:
                `Bearer ${data.session.access_token}`,
            },
            cache: "no-store",
            signal: controller.signal,
          }
        );

        const result = await response.json();

        if (!response.ok) {
          throw new Error(
            result.error ||
              "근무 금액을 불러오지 못했습니다."
          );
        }

        if (active) {
          setState({
            loading: false,
            data: result,
          });
        }
      } catch (error) {
        if (active) {
          setState({
            loading: false,
            error:
              error.message ||
              "다시 확인해주세요.",
          });
        }
      }
    })();

    return () => {
      active = false;
      controller.abort();
    };
  }, [month, refreshKey, retry]);

  const data =
    state.data?.month === month
      ? state.data
      : null;

  const label =
    `${Number(month.slice(0, 4))}년 ` +
    `${Number(month.slice(5))}월`;

  return (
    <section
      className={styles.card}
      aria-labelledby="monthly-pay-title"
      aria-busy={state.loading}
    >
      <div className={styles.heading}>
        <h2 id="monthly-pay-title">
          {month === currentMonth
            ? "이번 달 누적금액"
            : "월별 근무 금액"}
        </h2>

        <button
          type="button"
          className={styles.refresh}
          onClick={() =>
            setRetry((value) => value + 1)
          }
          disabled={state.loading}
        >
          새로고침
        </button>
      </div>

      <div className={styles.monthNav}>
        <button
          type="button"
          aria-label="이전 달 근무 금액"
          disabled={month <= "2000-01"}
          onClick={() =>
            setMonth(shiftMonth(month, -1))
          }
        >
          ‹
        </button>

        <strong>{label}</strong>

        <button
          type="button"
          aria-label="다음 달 근무 금액"
          disabled={month >= currentMonth}
          onClick={() =>
            setMonth(shiftMonth(month, 1))
          }
        >
          ›
        </button>
      </div>

      {state.loading && (
        <p className={styles.note} role="status">
          근무 금액을 계산하고 있습니다…
        </p>
      )}

      {state.error && (
        <p className={styles.error} role="alert">
          {state.error} 위 새로고침 버튼으로 다시
          확인해주세요.
        </p>
      )}

      {data && (
        <>
          <p className={styles.total}>
            {won(data.totals.totalAmount)}
          </p>

          <div className={styles.days}>
            <div>
              <span>팀장 근무</span>
              <strong>
                {data.totals.leaderDays}일
              </strong>
            </div>

            <div>
              <span>일반 시공</span>
              <strong>
                {data.totals.memberDays}일
              </strong>
            </div>
          </div>

          <dl className={styles.breakdown}>
            <div>
              <dt>기본 일당 합계</dt>
              <dd>
                {won(data.totals.baseAmount)}
              </dd>
            </div>

            <div>
              <dt>팀장수당 합계</dt>
              <dd>
                + {won(data.totals.allowanceAmount)}
              </dd>
            </div>

            <div>
              <dt>승인된 연장근무</dt>
              <dd>
                +{" "}
                {won(
                  data.totals.overtimeAmount || 0
                )}
              </dd>
            </div>
          </dl>

          {data.totals.pendingDays > 0 && (
            <p
              className={styles.warning}
              role="status"
            >
              {data.totals.pendingDays}일은 단가 또는
              역할 확인이 필요해 금액 합계에서 제외했습니다.
              관리자에게 확인해주세요.
            </p>
          )}

          {!data.totals.leaderDays &&
            !data.totals.memberDays && (
              <p className={styles.note}>
                이 달에 오늘까지 집계할 배정일이
                없습니다.
              </p>
            )}

          {data.companies.map((company) => (
            <div
              className={styles.company}
              key={company.companyId}
            >
              {data.companies.length > 1 && (
                <div
                  className={styles.companyHeading}
                >
                  <strong>
                    {company.companyName}
                  </strong>
                  <strong>
                    {won(company.totalAmount)}
                  </strong>
                </div>
              )}

              {data.companies.length > 1 && (
                <p className={styles.note}>
                  팀장 {company.leaderDays}일 · 일반
                  시공 {company.memberDays}일
                </p>
              )}

              {company.undatedSites > 0 && (
                <p className={styles.warning}>
                  날짜가 없는 배정 현장{" "}
                  {company.undatedSites}건은 집계하지
                  못했습니다. 관리자에게 배정일을
                  확인해주세요.
                </p>
              )}

              {company.overtimeEntries?.length > 0 && (
                <details>
                  <summary>
                    승인된 연장근무 ·{" "}
                    {won(company.overtimeAmount)}
                  </summary>

                  <ul>
                    {company.overtimeEntries.map(
                      (entry) => (
                        <li key={entry.id}>
                          {entry.date} ·{" "}
                          {won(entry.amount)}
                        </li>
                      )
                    )}
                  </ul>
                </details>
              )}

              {company.entries.length > 0 && (
                <details>
                  <summary>
                    날짜별 금액 확인 ·{" "}
                    {company.entries.length}일
                  </summary>

                  <ul className={styles.entries}>
                    {company.entries.map((entry) => (
                      <li key={entry.date}>
                        <div
                          className={styles.entryHeading}
                        >
                          <strong>
                            {Number(
                              entry.date.slice(5, 7)
                            )}
                            /
                            {Number(
                              entry.date.slice(8)
                            )}
                            {" · "}
                            {entry.role === "leader"
                              ? "팀장"
                              : "일반 시공"}
                          </strong>

                          <strong>
                            {entry.pending
                              ? "확인 필요"
                              : won(entry.totalAmount)}
                          </strong>
                        </div>

                        <p>
                          {entry.sites
                            .map((site) => site.name)
                            .join(" · ")}
                        </p>

                        {!entry.pending && (
                          <p>
                            기본{" "}
                            {won(entry.baseAmount)}
                            {entry.role === "leader"
                              ? ` + 팀장수당 ${won(entry.allowanceAmount)}`
                              : ""}
                          </p>
                        )}

                        {entry.inferred && (
                          <p>
                            현장 전체 기간 기준 · 날짜별
                            배정 미등록
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          ))}

          <p className={styles.note}>
            현장 완료 여부와 관계없이 본인 배정일 중
            {" "}{data.asOf}까지 집계합니다.
            미래 일정과 취소 현장은 제외합니다.
            배정일 기준이므로 실제로 일하지 않은 날짜는
            관리자에게 배정 수정을 요청해주세요.
            같은 업체·같은 날은 일당 1회, 팀장 배정이
            있으면 수당 1회를 더합니다. 연장비용은 현장
            완료 여부와 관계없이 실제 근무일이 이 달인
            승인 기록을 합산합니다. 관리자 지급 관리의
            현장 시작월 기준과는 다를 수 있습니다.
            실제 지급 여부와는 별도입니다.
          </p>

          {data.companies.length > 1 && (
            <p className={styles.note}>
              여러 업체의 근무일과 금액을 합산했습니다.
              같은 날 다른 업체에서 일한 내역은 업체별로
              계산합니다.
            </p>
          )}
        </>
      )}
    </section>
  );
            }
