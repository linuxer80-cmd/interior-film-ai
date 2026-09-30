"use client";

import { useRef, useState } from "react";

const choices = [
  ["consulting", "상담중"], ["scheduled", "시공 예정"],
  ["in_progress", "시공 중"], ["cancelled", "취소"],
  ["completed", "✓ 시공 완료"],
];
const reportLabels = { pending: "검수 대기", approved: "승인 완료", rejected: "보완 요청" };

export default function SiteStatusControl({ site, reportOpen = false, updateSiteStatus, hasReport = null, reviewStatus = null }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  if (!site || reportOpen) return null;

  async function changeStatus(nextStatus) {
    if (busy.current || nextStatus === site.status || typeof updateSiteStatus !== "function") return;
    busy.current = true;
    setSaving(true);
    setError("");
    try {
      const result = await updateSiteStatus(site.id, nextStatus, site.status);
      if (!result?.success) throw new Error(result?.error || "현장 상태를 변경하지 못했습니다.");
    } catch (err) {
      setError(err.message || "현장 상태를 변경하지 못했습니다.");
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  return <section aria-label="현장 상태" aria-busy={saving} style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid #e5e7eb" }}>
    <h3 style={{ margin: "0 0 10px", fontSize: 14, color: "#334155" }}>현장 상태</h3>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
      {choices.map(([value, label]) => <button type="button" key={value} disabled={saving} aria-pressed={site.status === value}
        onClick={() => changeStatus(value)} style={{ gridColumn: value === "completed" ? "1 / -1" : undefined,
          minHeight: 44, border: `1px solid ${site.status === value ? "#111827" : "#cbd5e1"}`, borderRadius: 9, padding: "10px 8px",
          background: site.status === value ? (value === "completed" ? "#15803d" : "#111827") : "#fff",
          color: site.status === value ? "#fff" : "#334155", fontSize: 13, fontWeight: 800, cursor: saving ? "wait" : "pointer", opacity: saving ? .65 : 1 }}>
        {label}
      </button>)}
    </div>
    {saving && <p role="status" style={{ fontSize: 12 }}>현장 상태를 저장하고 있습니다…</p>}
    {error && <p role="alert" style={{ color: "#b91c1c", fontSize: 13, lineHeight: 1.6 }}>{error}</p>}
    <div style={{ marginTop: 10, padding: 12, borderRadius: 9, background: "#f8fafc", color: "#475569", fontSize: 12, lineHeight: 1.7 }}>
      <strong>완료보고 · {hasReport === null ? "확인 중" : hasReport ? (reportLabels[reviewStatus] || "검수 대기") : "미작성"}</strong>
      <div>{site.status === "completed" ? "현장은 시공 완료 상태입니다. 보고서 작성과 검수는 이후에도 진행할 수 있습니다." : "관리자가 보고서 없이 시공 완료로 변경할 수 있습니다. 보고서 작성·검수 상태는 별도로 관리합니다."}</div>
      {site.status === "completed" && <div>잘못 완료했다면 위에서 ‘시공 중’ 등으로 되돌릴 수 있습니다.</div>}
      {site.status === "consulting" && <div>시작 날짜와 종료 날짜를 저장하면 시공 예정으로 변경됩니다.</div>}
    </div>
  </section>;
}
