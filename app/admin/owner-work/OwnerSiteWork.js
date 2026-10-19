"use client";
import useOwnerWork from "./useOwnerWork";
import styles from "./OwnerWork.module.css";
const time = (v) =>
  v
    ? new Date(v).toLocaleTimeString("ko-KR", {
        timeZone: "Asia/Seoul",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "미기록";
export default function OwnerSiteWork({ siteId, onNavigate }) {
  const { data, error, loading, busy, act, refresh } = useOwnerWork(siteId);
  if (loading && !data) return <p>내 시공 참여를 확인하고 있습니다…</p>;
  const site = data?.sites[0],
    record = data?.records.find((r) => r.work_date === data.today),
    mine = record?.site_id === siteId;
  return (
    <section className={`${styles.panel} ${styles.feature}`}>
      <div className={styles.row}>
        <h2>내 시공 · 출퇴근</h2>
        <a href="/admin/owner-work" className={styles.action}>
          운영 설정
        </a>
      </div>
      {site && data.settings.mode === "manage" && !mine ? (
        <p>
          직접 시공하려면 운영 방식을 ‘대표 혼자’ 또는 ‘대표와 직원 함께’로
          설정해주세요.
        </p>
      ) : (
        site && (
          <>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={site.participating}
                disabled={
                  busy || ["consulting", "cancelled"].includes(site.status)
                }
                onChange={(e) =>
                  act({
                    action: "participate",
                    siteId,
                    participating: e.target.checked,
                  })
                }
              />
              이 현장에 대표가 직접 시공합니다
            </label>
            {(site.participating || mine) && (
              <>
                <p className={styles.muted}>
                  대표 본인의 작업 기록입니다. 직원 배정과 급여 지급은 별도로
                  관리합니다.
                </p>
                <div className={styles.row}>
                  <span>
                    출근 {mine ? time(record.checked_in_at) : "미기록"}
                  </span>
                  <span>
                    퇴근 {mine ? time(record.checked_out_at) : "미기록"}
                  </span>
                </div>
                {record && !mine ? (
                  <p className={styles.notice}>
                    오늘은 다른 현장에 출근 기록이 있습니다. 하루 한 현장에
                    기록합니다.
                  </p>
                ) : (
                  <button
                    type="button"
                    className={`${styles.action} ${styles.primary} ${styles.full}`}
                    disabled={
                      busy ||
                      Boolean(record?.checked_out_at) ||
                      (!record && (!site.today || site.status === "completed"))
                    }
                    onClick={() =>
                      act({ action: record ? "out" : "in", siteId })
                    }
                  >
                    {busy
                      ? "저장 중…"
                      : record?.checked_out_at
                        ? "오늘 출퇴근 기록 완료"
                        : record
                          ? "퇴근 기록하기"
                          : site.today
                            ? "출근 기록하기"
                            : "현장 시공일에 출근 가능"}
                  </button>
                )}
                <div className={styles.links}>
                  <button
                    type="button"
                    className={styles.action}
                    onClick={() => onNavigate("materials")}
                  >
                    자재·재단
                  </button>
                  <button
                    type="button"
                    className={styles.action}
                    onClick={() => onNavigate("expenses")}
                  >
                    현장 경비
                  </button>
                  <button
                    type="button"
                    className={styles.action}
                    onClick={() => onNavigate("report")}
                  >
                    완료보고
                  </button>
                </div>
              </>
            )}
          </>
        )
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}{" "}
          <button className={styles.action} onClick={refresh}>
            다시 확인
          </button>
        </p>
      )}
    </section>
  );
}
