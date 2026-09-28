"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

const won = (value) => `${Number(value || 0).toLocaleString("ko-KR")}원`;
const today = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; };
const monthStart = () => `${today().slice(0, 7)}-01`;
const kinds = { labor: "시공자 인건비", material: "추가 자재비", expense: "기타 경비" };
const costLabels = kinds;

export default function ProfitTab() {
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState("");
  const [kind, setKind] = useState("labor");
  const [worker, setWorker] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  async function request(method, payload, query = "") {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("관리자로 다시 로그인해주세요.");
    const response = await fetch(`/api/admin/profit${query}`, { method,
      headers: { Authorization: `Bearer ${session.access_token}`, ...(payload ? { "Content-Type": "application/json" } : {}) },
      ...(payload ? { body: JSON.stringify(payload) } : {}), cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "요청에 실패했습니다.");
    return result;
  }

  async function load() {
    if (!from || !to || from > to) { setError("조회 기간을 확인해주세요."); return; }
    setLoading(true); setError("");
    try { setData(await request("GET", null, `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)); }
    catch (cause) { setError(cause.message); setData(null); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const current = data?.sites.find((site) => site.id === selected);
  const assigned = (current?.site_workers || []).map((row) => row.workers).filter(Boolean);
  function chooseWorker(id) {
    setWorker(id);
    const person = assigned.find((item) => item.id === id);
    if (person) { setDescription(`${person.name} 인건비`); setAmount(person.daily_wage ? String(person.daily_wage) : ""); }
  }
  async function save(event) {
    event.preventDefault();
    if (!current) return;
    setSaving(true); setError("");
    try { await request("POST", { siteId: current.id, type: kind, amount: Number(String(amount).replaceAll(",", "")), description });
      setAmount(""); setDescription(""); setWorker(""); await load(); }
    catch (cause) { setError(cause.message); }
    finally { setSaving(false); }
  }
  async function remove(id) {
    if (!window.confirm("이 비용 내역을 삭제하시겠습니까?")) return;
    setSaving(true); setError("");
    try { await request("DELETE", { id }); await load(); }
    catch (cause) { setError(cause.message); }
    finally { setSaving(false); }
  }

  const card = { background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 14 };
  const field = { width: "100%", padding: 10, border: "1px solid #cbd5e1", borderRadius: 8, boxSizing: "border-box", fontSize: 14 };
  return <section style={{ display: "grid", gap: 14 }}>
    <div style={card}>
      <h2 style={{ margin: "0 0 8px" }}>📊 현장 수익</h2>
      <p style={{ color: "#475569", fontSize: 13, lineHeight: 1.5 }}>시공 시작일 기준 계약금액 − 인건비 − 실제 사용 자재비 − 경비입니다. 계약금액 기준 예상 수익이며 입금·세금·본사 공통비는 반영하지 않습니다.</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "end" }}>
        <label>시작일<input aria-label="수익 조회 시작일" type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={field} /></label>
        <label>종료일<input aria-label="수익 조회 종료일" type="date" value={to} onChange={(e) => setTo(e.target.value)} style={field} /></label>
        <button type="button" onClick={load} disabled={loading} style={{ ...field, width: "auto", background: "#111827", color: "white" }}>{loading ? "조회 중..." : "조회"}</button>
      </div>
      {error && <p role="alert" style={{ color: "#b91c1c" }}>❌ {error}</p>}
    </div>
    {data && <>
      <div style={{ ...card, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
        {[["계약 매출", data.totals.revenue], ["인건비", data.totals.labor], ["자재비", data.totals.material], ["기타 경비", data.totals.expense], ["예상 수익", data.totals.profit]].map(([label, value]) =>
          <div key={label}><div style={{ color: "#64748b", fontSize: 12 }}>{label}</div><strong style={{ color: label === "예상 수익" ? "#166534" : "#111827" }}>{won(value)}</strong></div>)}
      </div>
      {data.sites.length === 0 && <div style={card}>이 기간에 시공 시작일이 등록된 현장이 없습니다.</div>}
      {data.sites.map((site) => <div key={site.id} style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}><strong>{site.site_name || site.customer_name || "이름 없는 현장"}</strong><span>{String(site.schedule_start).slice(0, 10)}</span></div>
        <div style={{ fontSize: 13, lineHeight: 1.7, marginTop: 8 }}>계약 {won(site.revenue)} · 인건비 {won(site.labor)} · 자재 {won(site.material)} · 경비 {won(site.expense)}</div>
        <strong style={{ color: site.profit < 0 ? "#b91c1c" : "#166534" }}>예상 수익 {won(site.profit)}</strong>
        {site.missingContract && <p style={{ color: "#b45309", fontSize: 12 }}>⚠️ 계약금액 미입력: 매출 0원으로 집계됩니다.</p>}
        <div><button type="button" onClick={() => { setSelected(selected === site.id ? "" : site.id); setWorker(""); }} style={{ marginTop: 10, ...field, width: "auto" }}>{selected === site.id ? "비용 입력 닫기" : "인건비·추가 비용 입력"}</button></div>
        {selected === site.id && <div style={{ borderTop: "1px solid #e2e8f0", marginTop: 12, paddingTop: 12 }}>
          <p style={{ fontSize: 12, color: "#64748b" }}>시공자 일당은 입력 편의를 위한 기본값입니다. 실제 투입 일수에 맞는 총액으로 고쳐 저장하세요. 완료보고의 실제 자재와 경비는 자동 합산됩니다.</p>
          <form onSubmit={save} style={{ display: "grid", gap: 8 }}>
            <select aria-label="비용 구분" value={kind} onChange={(e) => { setKind(e.target.value); setWorker(""); setAmount(""); setDescription(""); }} style={field}>{Object.entries(kinds).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
            {kind === "labor" && <select aria-label="담당 시공자" value={worker} onChange={(e) => chooseWorker(e.target.value)} style={field}><option value="">시공자 선택 (또는 직접 입력)</option>{assigned.map((person) => <option key={person.id} value={person.id}>{person.name} · 일당 {won(person.daily_wage)}</option>)}</select>}
            <input aria-label="비용 내용" placeholder="내용 (예: 정근호 2일 인건비)" value={description} maxLength={120} onChange={(e) => setDescription(e.target.value)} style={field} required />
            <input aria-label="비용 금액" inputMode="numeric" placeholder="금액 (원)" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))} style={field} required />
            <button type="submit" disabled={saving} style={{ ...field, background: "#111827", color: "white" }}>{saving ? "저장 중..." : "비용 저장"}</button>
          </form>
          {site.entries.map((entry) => <div key={entry.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", borderBottom: "1px solid #f1f5f9", padding: "8px 0", fontSize: 13 }}><span>{costLabels[entry.category] || "비용"} · {entry.description} · {won(entry.amount)}</span><button type="button" disabled={saving} onClick={() => remove(entry.id)}>삭제</button></div>)}
        </div>}
      </div>)}
    </>}
  </section>;
}
