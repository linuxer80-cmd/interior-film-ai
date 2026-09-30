"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { koreanDay } from "../../utils/workerCalendar";
import { payAmount, payDate } from "../../utils/workerPay";

const inputStyle = { width: "100%", minHeight: 46, boxSizing: "border-box", padding: "10px 12px", border: "1px solid #cbd5e1", borderRadius: 10, fontSize: 16, color: "#111827", background: "#fff" };
const buttonStyle = { minHeight: 46, padding: "10px 18px", border: 0, borderRadius: 10, background: "#111827", color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer" };

async function requestSetting(options = {}) {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data?.session?.access_token) throw new Error("로그인을 다시 해주세요.");
  const response = await fetch("/api/admin/leader-allowance", {
    ...options, cache: "no-store", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
  });
  const result = await response.json();
  if (!response.ok) { const failure = new Error(result.error || "설정을 확인해주세요."); failure.status = response.status; throw failure; }
  return result.setting;
}

export default function CompanyLeaderAllowance() {
  const [setting, setSetting] = useState(null);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(koreanDay());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [retry, setRetry] = useState(0);
  const [dateOpen, setDateOpen] = useState(false);
  const amountInput = useRef(null), dateInput = useRef(null), savingRef = useRef(false);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoading(true); setSetting(null); setMessage("");
    requestSetting({ signal: controller.signal }).then((value) => {
      if (!active) return;
      setSetting(value); setAmount(String(value.amount)); setDate(koreanDay());
    }).catch((error) => { if (active) setMessage(`❌ ${error.message}`); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [retry]);

  async function save(event) {
    event.preventDefault();
    if (!setting || loading || savingRef.current) return;
    const parsed = payAmount(amount);
    if (parsed === null) { setMessage("❌ 팀장비용을 0~100,000,000원 사이의 정수로 입력해주세요."); amountInput.current?.focus(); return; }
    if (!payDate(date) || date > koreanDay() || date < "2000-01-01" || (setting.effective_from && date < setting.effective_from)) {
      setMessage("❌ 적용일을 확인해주세요."); setDateOpen(true); return;
    }
    savingRef.current = true; setSaving(true); setMessage("");
    try {
      const value = await requestSetting({ method: "POST", body: JSON.stringify({ amount: parsed, effective_from: date, version: setting.version }) });
      setSetting(value); setAmount(String(value.amount));
      setMessage(`✅ ${date}부터 모든 팀장에게 하루 ${Number(value.amount).toLocaleString("ko-KR")}원이 적용됩니다.`);
    } catch (error) { setMessage(`❌ ${error.message}`); }
    finally { savingRef.current = false; setSaving(false); }
  }

  useEffect(() => { if (dateOpen) dateInput.current?.focus(); }, [dateOpen]);
  return <section aria-labelledby="leader-cost-title" style={{ padding: 16, margin: "0 0 16px", border: "1px solid #bfdbfe", borderRadius: 14, background: "#f8fbff" }}>
    <h3 id="leader-cost-title" style={{ margin: 0, fontSize: 17, color: "#111827" }}>팀장비용 설정</h3>
    <p style={{ margin: "7px 0 14px", fontSize: 12, lineHeight: 1.6, color: "#475569" }}>우리 업체 현장에서 팀장으로 일하는 모든 시공자에게 같은 금액을 추가합니다. 새로 등록한 시공자에게도 자동 적용됩니다.</p>
    {loading ? <p role="status" style={{ fontSize: 13 }}>설정을 불러오고 있습니다…</p> : setting && <form onSubmit={save}>
      <label htmlFor="company-leader-cost" style={{ display: "block", marginBottom: 7, fontSize: 13, fontWeight: 800 }}>팀장비용 (1인·하루)</label>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
          <input ref={amountInput} id="company-leader-cost" inputMode="numeric" type="text" value={amount === "" ? "" : Number(amount).toLocaleString("ko-KR")}
            onChange={(event) => { setAmount(event.target.value.replace(/[^\d]/g, "")); setMessage(""); }} disabled={saving}
            style={{ ...inputStyle, paddingRight: 36, textAlign: "right", fontWeight: 800 }} placeholder="예: 30,000" />
          <span style={{ position: "absolute", right: 12, top: 14, fontSize: 13 }}>원</span>
        </div>
        <button type="submit" disabled={saving} style={{ ...buttonStyle, opacity: saving ? 0.6 : 1 }}>{saving ? "저장 중…" : "저장"}</button>
      </div>
      <details open={dateOpen} onToggle={(event) => setDateOpen(event.currentTarget.open)} style={{ marginTop: 8 }}>
        <summary style={{ padding: "10px 0", fontSize: 12, color: "#475569", cursor: "pointer", minHeight: 24 }}>적용일 {date} · 변경</summary>
        <input ref={dateInput} aria-label="팀장비용 적용일" type="date" value={date} disabled={saving} min={setting.effective_from > "2000-01-01" ? setting.effective_from : "2000-01-01"} max={koreanDay()}
          onChange={(event) => { setDate(event.target.value); setMessage(""); }} style={inputStyle} />
        <p style={{ fontSize: 12, lineHeight: 1.5, color: "#64748b" }}>이번 달 전체에 적용하려면 월초 날짜를 선택하세요. 이전 적용일의 금액은 보관하며, 같은 적용일은 수정됩니다.</p>
      </details>
    </form>}
    {message && <p role={message.startsWith("❌") ? "alert" : "status"} style={{ margin: "10px 0 0", fontSize: 12, lineHeight: 1.6, color: message.startsWith("❌") ? "#b91c1c" : "#15803d" }}>{message}</p>}
    {!loading && message.startsWith("❌") && <button type="button" onClick={() => setRetry((value) => value + 1)} disabled={saving} style={{ ...buttonStyle, marginTop: 10 }}>설정 다시 불러오기</button>}
  </section>;
}
