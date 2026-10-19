"use client";
import { useState } from "react";
import OwnerWorkSettings from "./OwnerWorkSettings";
import useOwnerWork from "./useOwnerWork";
import styles from "./OwnerWork.module.css";
export default function OwnerWorkPage() {
  const work = useOwnerWork();
  const { data } = work;
  const [limit, setLimit] = useState(8);
  return (
    <main
      style={{ maxWidth: 760, margin: "0 auto", padding: "20px 16px 80px" }}
    >
      <a href="/admin" className={styles.action}>
        ‹ 관리자 홈
      </a>
      <OwnerWorkSettings work={work} />
      <section className={styles.panel}>
        <h2>내 시공 현장</h2>
        {data?.sites
          .filter((s) => s.participating)
          .slice(0, limit)
          .map((s) => (
            <p key={s.id}>
              <a href={`/admin?tab=sites&site=${s.id}&section=self-work`}>
                {s.site_name || s.customer_name || "현장"} ·{" "}
                {s.status === "completed" ? "시공 완료" : "현장 열기"} →
              </a>
            </p>
          ))}
        {data?.sites.filter((s) => s.participating).length > limit && (
          <button
            className={styles.action}
            onClick={() => setLimit((n) => n + 8)}
          >
            현장 더 보기
          </button>
        )}
      </section>
      <section className={styles.panel}>
        <h2>이번 달 내 작업 기록</h2>
        {data && !data.records.length && (
          <p className={styles.muted}>이번 달 출퇴근 기록이 없습니다.</p>
        )}
        {data?.records.map((r) => (
          <div key={r.work_date} className={styles.history}>
            <a href={`/admin?tab=sites&site=${r.site_id}&section=self-work`}>
              {r.work_date} ·{" "}
              {data.sites.find((s) => s.id === r.site_id)?.site_name || "현장"}
            </a>
            <p>
              출근{" "}
              {new Date(r.checked_in_at).toLocaleTimeString("ko-KR", {
                timeZone: "Asia/Seoul",
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              · {r.checked_out_at ? "퇴근 완료" : "퇴근 미기록"} · 대표 인건비{" "}
              {r.labor_amount.toLocaleString("ko-KR")}원
            </p>
          </div>
        ))}
      </section>
    </main>
  );
}
