"use client";
import useOwnerWork from "./useOwnerWork";
import { koreaDay } from "../../../lib/ownerWork.mjs";
import styles from "./OwnerWork.module.css";
const href = (id, section = "info") =>
  `/admin?tab=sites&site=${encodeURIComponent(id)}&section=${section}`;
export default function OwnerWorkHome() {
  const { data, error, loading, refresh } = useOwnerWork();
  if (loading && !data)
    return <p role="status">내 시공을 확인하고 있습니다…</p>;
  if (error)
    return (
      <section className={styles.panel}>
        <p role="alert">{error}</p>
        <button className={styles.action} onClick={refresh}>
          다시 확인
        </button>
        <a href="/admin/owner-work" className={styles.action}>
          직접 시공 설정
        </a>
      </section>
    );
  if (!data) return null;
  if (data.settings.mode === "manage")
    return (
      <section className={`${styles.panel} ${styles.feature}`}>
        <h2>대표님도 직접 시공하시나요?</h2>
        <p className={styles.muted}>
          계정 전환 없이 출근부터 완료보고까지 처리하세요.
        </p>
        <a className={styles.action} href="/admin/owner-work">
          직접 시공 설정 →
        </a>
      </section>
    );
  const mine = data.sites.filter((s) => s.participating),
    today = mine.filter((s) => s.today && s.status !== "completed");
  const pending = mine
    .filter(
      (s) =>
        !["pending", "approved"].includes(s.report?.review_status) &&
        (s.status === "completed" ||
          (s.schedule_start && koreaDay(s.schedule_start) <= data.today)),
    )
    .sort((a, b) =>
      (a.schedule_start || "").localeCompare(b.schedule_start || ""),
    );
  const openRecord = data.records.find(
    (r) => r.work_date === data.today && !r.checked_out_at,
  );
  return (
    <section className={`${styles.panel} ${styles.feature}`}>
      <div className={styles.row}>
        <h2>오늘 내 시공</h2>
        <a href="/admin/owner-work" className={styles.action}>
          운영 설정
        </a>
      </div>
      {openRecord && (
        <p className={styles.notice}>
          출근 기록이 있습니다. 작업이 끝나면{" "}
          <a href={href(openRecord.site_id, "self-work")}>퇴근 기록</a>을
          남겨주세요.
        </p>
      )}
      {!today.length && (
        <p className={styles.muted}>
          오늘 직접 시공할 현장이 없습니다.
          {data.settings.mode === "mixed"
            ? " 현장정보에서 대표 참여를 선택해주세요."
            : ""}
        </p>
      )}
      {today.slice(0, 8).map((site) => (
        <article className={styles.site} key={site.id}>
          <div className={styles.row}>
            <h3>{site.site_name || site.customer_name || "현장"}</h3>
            <span className={styles.badge}>대표 직접 시공</span>
          </div>
          <p className={styles.muted}>{site.work_type || "작업 내용 확인"}</p>
          <div className={styles.links}>
            <a
              className={`${styles.action} ${styles.primary}`}
              href={href(site.id, "self-work")}
            >
              내 현장 열기
            </a>
            <a className={styles.action} href={href(site.id, "materials")}>
              자재·재단
            </a>
          </div>
        </article>
      ))}
      <div className={styles.site}>
        <h3>완료보고 작성 대기 {pending.length}건</h3>
        {pending.slice(0, 3).map((site) => (
          <p key={site.id}>
            <a href={href(site.id, "report-write")}>
              {site.site_name || site.customer_name || "현장"} ·{" "}
              {site.report?.review_status === "rejected"
                ? "보완하기"
                : "보고서 작성"}{" "}
              →
            </a>
          </p>
        ))}
        {pending.length > 3 && (
          <a href="/admin/owner-work">내 시공 전체 보기 →</a>
        )}
      </div>
    </section>
  );
}
