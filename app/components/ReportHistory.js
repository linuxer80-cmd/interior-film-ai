"use client";

import { useEffect, useState } from "react";
import { reportRequest } from "../utils/reportClient";

const labels = {
  baseline: "기준 기록", submit: "최초 제출", approve: "승인",
  reject: "보완 요청", resubmit: "수정 후 재제출", edit: "내용 변경",
};
const money = value => value == null
  ? "기록 없음" : `${Number(value).toLocaleString("ko-KR")}원`;

export default function ReportHistory({ siteId, version }) {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    reportRequest(`/api/report-support?siteId=${encodeURIComponent(siteId)}`)
      .then(data => {
        if (active) {
          setRows(data.history || []);
          setError("");
        }
      })
      .catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [siteId, version]);

  return (
    <details style={{
      padding: 16, border: "1px solid #dbe3ee", borderRadius: 14,
      margin: "12px 0", background: "white",
    }}>
      <summary>완료보고 변경 이력 · {rows.length}건</summary>
      <p>
        기능 적용 이후 제출·검수 시점의 자재비와 완료보고 경비입니다.
        인건비 직접 입력은 완료보고 경비 합계에 포함됩니다.
      </p>
      {error && <p role="alert">{error}</p>}
      {rows.map(r => (
        <article key={r.id} style={{ borderTop: "1px solid #e2e8f0", padding: "12px 0" }}>
          <b>{labels[r.event] || r.event} · {r.actor_name}</b>
          <p>{new Date(r.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</p>
          <p>
            자재비: {money(r.before_cost?.material)} → {money(r.after_cost?.material)}
            <br />
            완료보고 경비: {money(r.before_cost?.expense)} → {money(r.after_cost?.expense)}
          </p>
          <p style={{ whiteSpace: "pre-wrap" }}>{r.reason}</p>
        </article>
      ))}
      {!rows.length && !error && <p>아직 기록된 완료보고가 없습니다.</p>}
    </details>
  );
      }
