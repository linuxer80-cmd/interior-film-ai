"use client";

import { useEffect, useRef, useState } from "react";
import { revenueSourceLabel } from "../../lib/siteRevenue.mjs";
import { supabase } from "../../lib/supabase";
import useSiteDraft from "../admin/hooks/useSiteDraft";
import { koreanDay } from "../utils/workerCalendar";
import { paymentState } from "../../lib/settlementFlow.mjs";
import SiteSettlementProfit from "./SiteSettlementProfit";

export const paymentWon = n =>
  n == null
    ? "확인 필요"
    : `${Number(n).toLocaleString("ko-KR")}원`;

export async function paymentApi(body, write = false) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) throw Error("관리자로 로그인해주세요.");

  const response = await fetch(
    `/api/admin/receivables${
      write ? "" : `?${new URLSearchParams(body)}`
    }`,
    {
      method: write ? "POST" : "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      ...(write ? { body: JSON.stringify(body) } : {}),
    }
  );

  const result = await response.json();

  if (!response.ok) {
    const error = Error(result.error || "처리하지 못했습니다.");
    error.status = response.status;
    throw error;
  }

  return result;
}

export function fullPaymentRequest(site, paidOn) {
  if (!site || site.status === "cancelled" || !(Number(site.contract_amount) > 0)) return null;
  const remaining = Number(site.outstanding);
  if (site.confirmed && (!Number.isFinite(remaining) || remaining <= 0)) return null;
  if (!site.confirmed) return { action: "initialize", values: {
    amount: String(site.contract_amount), paidOn,
    direction: "payment", phase: "balance", method: "other",
    memo: "전액 입금 · 기존 누적 입금액 확인",
  } };
  // Ongoing work can be paid in full without marking the construction complete.
  // Reuse the existing revision-checked, idempotent payment ledger operation.
  return { action: "add", values: {
    amount: String(remaining), paidOn, direction: "payment", phase: "balance",
    method: "other", memo: "미수금 전액 입금",
  } };
}

export default function SitePaymentQuick({ siteId, onChanged, onDraftState, onNavigate }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState("");
  const [form, setForm] = useState("");
  const [retry, setRetry] = useState(false);
  const [paidOn, setPaidOn] = useState(koreanDay);
  const [phaseLabel, setPhaseLabel] = useState("중도금");
  const [review, setReview] = useState(false);
  const [success, setSuccess] = useState("");
  const [due, setDue] = useState("");
  const [memo,setMemo] = useState("");
  const [voidEntry,setVoidEntry] = useState(null);
  const [voidReason,setVoidReason] = useState("");
  const [dueEditing,setDueEditing] = useState(false);
  const [profitOpen,setProfitOpen] = useState(false);
  const [loadAttempt,setLoadAttempt] = useState(0);

  const paymentForm = useRef(null);
  const pending = useRef(null);
  const lock = useRef(false);
  const alive = useRef(false);
  const site = data?.site;

  useSiteDraft(onDraftState, "payment", {
    label: "입금 기록", dirty: Boolean(form) || Boolean(voidEntry) || due !== (site?.due_date || ""),
    pending: busy || retry,
    discard: () => { setForm(""); setAmount(""); setMemo("");setVoidEntry(null);setVoidReason("");setReview(false);setDueEditing(false);setDue(site?.due_date || ""); },
  });

  useEffect(() => {
    alive.current = true;
    let active = true;

    paymentApi({ siteId })
      .then(result => {
        if (active) {
          setData(result);
          setDue(result.site.due_date || "");
        }
      })
      .catch(error => {
        if (active) setError(error.message);
      });

    return () => {
      active = false;
      alive.current = false;
    };
  }, [siteId,loadAttempt]);

  async function save(action, values = {}) {
    if (lock.current || !site) return;

    const body = pending.current || {
      ...values,
      action,
      siteId,
      revision: site.revision,
      requestId: crypto.randomUUID(),
    };

    pending.current = body;
    lock.current = true;
    setBusy(true);
    setError("");

    try {
      const result = await paymentApi(body, true);
      pending.current = null;

      if (!alive.current) return;

      setData(result);
      setDue(result.site.due_date || "");
      setRetry(false);
      setForm("");
      setAmount("");
      setReview(false);
      setMemo("");setVoidEntry(null);setVoidReason("");setDueEditing(false);
      setSuccess(body.action === "void" ? "입금 기록을 취소했습니다. 남은 금액을 다시 계산했습니다." : body.action === "due" ? "입금 예정일을 저장했습니다." : "저장했습니다. 입금 내역이 반영되었습니다.");
      try { onChanged?.(); } catch {}
    } catch (error) {
      if (!alive.current) return;

      setError(error.message);

      if (error.status && error.status < 500) {
        pending.current = null;
        setRetry(false);

        try {
          const result = await paymentApi({ siteId });
          if (alive.current) setData(result);
        } catch {}
      } else {
        setRetry(true);
      }
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }

  useEffect(() => {
    if (form) paymentForm.current?.scrollIntoView({block:"start",behavior:"smooth"});
  }, [form,review]);

  const disabled = busy || retry;
  const fullPayment = fullPaymentRequest(site, koreanDay());
  const next = paymentState(site,koreanDay());

  return (
    <section className="payment">
      <h3>입금·미수금</h3>
      <p>실제로 받은 금액을 기록해주세요. 시공 완료·검수와 별도로 관리합니다.</p>
      {success && <p role="status">{success}</p>}

      {error && <p role="alert">{error}</p>}

      {!site ? (
        error ? <button type="button" onClick={()=>{setError("");setLoadAttempt(loadAttempt+1);}}>입금 내역 다시 확인</button> : <p role="status">입금 내역 확인 중…</p>
      ) : (
        <>
          <div className="summary-card">
            <div className="heading"><span>남은 수금액</span><span className="state-badge">{next.label}</span></div><strong>{site.confirmed && site.contract_amount != null ? paymentWon(site.outstanding) : "확인 필요"}</strong>
            <div className="totals"><div>{site.amount_source ? revenueSourceLabel(site.amount_source) : "기준금액"}<b>{paymentWon(site.contract_amount)}</b></div><div>받은 금액<b>{paymentWon(site.paid)}</b></div></div>
            <p>입금 예정일 · {site.due_date || "미정"}</p>
            <p className="hint">등록된 기준금액입니다. 부가세 포함·제외 기준을 확인해주세요.</p>
          </div>
          <div className="next-task"><h4>다음 할 일</h4><p>{form === "full" ? "아래 자동 입력된 전액과 거래일을 확인하고 저장해주세요." : next.text}</p>
            <button type="button" disabled={disabled || site.status === "cancelled"} aria-expanded={dueEditing} onClick={()=>setDueEditing(!dueEditing)}>입금 예정일 변경</button>
            {dueEditing && <div><label>입금 예정일<input type="date" value={due} disabled={disabled} onChange={event=>setDue(event.target.value)} /></label><button type="button" disabled={disabled} onClick={()=>save("due",{dueDate:due})}>예정일 저장</button><button type="button" disabled={disabled} onClick={()=>{setDue(site.due_date||"");setDueEditing(false);}}>취소</button></div>}
          </div>

          {!site.confirmed && form !== "full" && (
            <p>
              기존 입금액이 미확인입니다.
              일부 입금을 기록하려면 기존에 받은 총액부터 확인해주세요.
            </p>
          )}

          {!site.confirmed && form !== "full" && fullPayment && <p>전액을 받았다면 ‘전액 입금 등록’으로 기준금액 전체를 한 번에 확인할 수 있습니다.</p>}
          {site.contract_amount == null ? <p>계약금액을 입력하거나 완료보고서 검수를 승인하면 기준금액이 반영됩니다.</p> : Number(site.contract_amount) === 0 ? <p>확정 금액이 0원입니다. 별도 입금은 필요하지 않으며 기존 입금액은 확인해주세요.</p> : null}
          <div className="buttons">
            <button disabled={disabled || site.status === "cancelled" || (site.confirmed && !(Number(site.outstanding)>0))} onClick={() => {
              setForm(site.confirmed ? "payment" : "initial"); setAmount(""); setMemo("");setVoidEntry(null);setPaidOn(koreanDay()); setReview(false); setSuccess("");
            }}>{site.confirmed ? "입금 등록" : "기존 입금액 확인"}</button>
            <button disabled={disabled || !fullPayment} onClick={() => {
              setForm("full"); setAmount(fullPayment.values.amount); setMemo("");
              setVoidEntry(null); setPaidOn(koreanDay()); setPhaseLabel("잔금");
              setReview(true); setSuccess(""); setError("");
            }}>{site.confirmed && Number(site.outstanding) === 0 ? "입금 완료" : site.confirmed ? "남은 금액 전액 등록" : "전액 입금 등록"}</button>
          </div>

          {form && (
            <form ref={paymentForm} style={{scrollMarginTop:12}}
              onSubmit={event => {
                event.preventDefault();

                if (
                  !/^\d+$/.test(amount) ||
                  Number(amount) > 1e12 ||
                  Number(amount) < (form === "initial" ? 0 : 1)
                ) {
                  setError("금액을 원 단위로 확인해주세요.");
                  return;
                }
                if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn) || Number.isNaN(Date.parse(paidOn)) || new Date(`${paidOn}T00:00:00Z`).toISOString().slice(0,10) !== paidOn || paidOn > koreanDay() || (form !== "initial" && site.opening_date && paidOn < site.opening_date)) {setError("실제 거래일을 확인해주세요. 오늘 이후이거나 기존 입금 확인일 이전인 날짜는 등록할 수 없습니다.");return;}
                if (form === "payment" && site.outstanding != null && Number(amount)>Number(site.outstanding)) {setError("남은 수금액보다 큰 금액입니다. 계약금액과 입금 내역을 확인해주세요.");return;}

                if (!review) { setReview(true); return; }
                if (form === "full") {
                  const request = fullPaymentRequest(site, paidOn);
                  if (!request || String(request.values.amount) !== amount) {
                    setError("기준금액이나 미수금이 변경됐습니다. 전액 입금을 다시 선택해주세요.");
                    return;
                  }
                  save(request.action, request.values);
                  return;
                }
                save(form === "initial" ? "initialize" : "add", {
                  amount,
                  paidOn,
                  direction: form === "refund" ? "refund" : "payment",
                  phase: "balance",
                  method: "other",
                  memo: memo.trim() || (form === "refund" ? "환불 기록" : form === "initial" ? "기존 입금액 확인" : `${phaseLabel} 입금`),
                });
              }}
            >
              <h4>{form === "full" ? "전액 입금 확인" : form === "initial" ? "기존 입금액 확인" : form === "refund" ? "환불 기록" : "입금 등록"}</h4>
              <label>
                {form === "full" ? "전액 입금액 (자동 입력)" : form === "initial"
                  ? "지금까지 받은 총액 (없으면 0)"
                  : form === "refund"
                    ? "이번 환불액"
                    : "이번에 받은 금액"}
                <input
                  type="number"
                  min={form === "initial" ? 0 : 1}
                  max="1000000000000"
                  step="1"
                  required
                  disabled={disabled || review}
                  value={amount}
                  onChange={event => setAmount(event.target.value)}
                />
              </label>
              {form === "payment" && !review && site.confirmed && Number(site.outstanding)>0 && <button type="button" disabled={disabled} onClick={()=>{setAmount(String(site.outstanding));setPhaseLabel("잔금");}}>남은 금액 전액 입력</button>}

              <label>
                거래일
                <input
                  type="date"
                  required
                  max={koreanDay()}
                  min={form === "initial" || (form === "full" && !site.confirmed) ? undefined : site.opening_date}
                  disabled={disabled || (review && form !== "full")}
                  value={paidOn}
                  onChange={event => setPaidOn(event.target.value)}
                />
              </label>

              {form === "payment" && <label>입금 구분<select disabled={disabled || review} value={phaseLabel} onChange={e => setPhaseLabel(e.target.value)}><option>계약금</option><option>중도금</option><option>잔금</option></select></label>}
              {form !== "full" && <label>메모 · 선택<input type="text" value={memo} maxLength={500} disabled={disabled || review} onChange={event=>setMemo(event.target.value)} placeholder="예: 고객명·추가 입금 내용" /></label>}
              {review && <div className="confirmation" role="status"><b>{paymentWon(amount)} · {paidOn}</b><p>{form === "refund" ? "실제로 돌려준 금액을 기록합니다." : form === "full" ? (site.confirmed ? "남은 미수금 전액을 추가 입금으로 기록합니다." : "기준금액 전체를 지금까지 받은 누적 입금액으로 확정합니다. 기존 입금액을 다시 입력할 필요가 없습니다.") : form === "initial" ? "기존에 받은 누적 금액으로 기록합니다." : `${phaseLabel}으로 기록합니다.`}</p>{site.contract_amount != null && <p>등록 후 남은 금액 · {paymentWon(Number(site.contract_amount) - (form === "initial" || (form === "full" && !site.confirmed) ? Number(amount) : Number(site.paid) + (form === "refund" ? -Number(amount) : Number(amount))))}</p>}</div>}
              <button disabled={disabled}>{review ? "확인하고 저장" : "입력 내용 확인"}</button>
              {review && form !== "full" && <button type="button" disabled={disabled} onClick={() => setReview(false)}>다시 수정</button>}
              <button
                type="button"
                disabled={disabled}
                onClick={() => { setForm(""); setReview(false); }}
              >
                닫기
              </button>
            </form>
          )}

          {site.confirmed && (
            <div className="history">
              <h4>입금 이력</h4>
              <p>
                기존 입금 {paymentWon(site.opening_paid)}
                {" · "}{site.opening_date}
              </p>

              {!(data.entries || []).length && <p>추가 입금 기록이 없습니다.</p>}
              {(data.entries || []).map(entry => (
                <div key={entry.id}>
                  <p>
                    {entry.paid_on} ·{" "}
                    {entry.direction === "refund" ? "환불" : "입금"}
                    {" "}{paymentWon(entry.amount)}
                    {" "}{entry.voided_at ? "(취소됨)" : ""}
                    <br />
                    {entry.memo}
                  </p>

                  {!entry.voided_at && (
                    <button
                      disabled={disabled}
                      onClick={() => {
                        if(form){setError("작성 중인 입금을 저장하거나 닫은 뒤 기록을 취소해주세요.");return;}
                        setVoidEntry(entry);setVoidReason("");setSuccess("");
                      }}
                    >
                      기록 취소
                    </button>
                  )}
                </div>
              ))}
              {voidEntry && <section className="confirmation" aria-label="입금 기록 취소 확인"><h4>이 기록을 취소할까요?</h4><p>{voidEntry.paid_on} · {paymentWon(voidEntry.amount)}</p><p>기존 기록은 취소 이력으로 남습니다. 실제로 돌려준 돈은 환불로 기록해주세요.</p><label>취소 사유<input type="text" value={voidReason} maxLength={500} disabled={disabled} onChange={event=>setVoidReason(event.target.value)} /></label><button type="button" disabled={disabled} onClick={()=>{if(!voidReason.trim()){setError("취소 사유를 입력해주세요.");return;}save("void",{entryId:voidEntry.id,reason:voidReason.trim()});}}>입금 기록 취소</button><button type="button" disabled={disabled} onClick={()=>{setVoidEntry(null);setVoidReason("");}}>유지하기</button></section>}

              <details><summary>실제 환불 기록</summary>
              <button
                disabled={disabled}
                onClick={() => {
                  setReview(false);
                  setForm("refund");
                  setAmount("");
                  setMemo("");setVoidEntry(null);
                  setPaidOn(koreanDay());
                }}
              >
                환불 기록
              </button>

              </details>
            </div>
          )}
          <div className="profit-link"><h4>이 현장 실제 수익</h4><p>인건비·자재비·경비를 이어받아 확인합니다. 비용이 미입력이면 수익을 확정 표시하지 않습니다.</p><button type="button" disabled={disabled} aria-expanded={profitOpen} onClick={()=>setProfitOpen(!profitOpen)}>{profitOpen?"비용·수익 접기":"비용·수익 확인 →"}</button></div>
          {profitOpen && <SiteSettlementProfit key={siteId} siteId={siteId} onNavigate={onNavigate} />}
        </>
      )}

      {retry && (
        <button disabled={busy} onClick={() => save()}>
          같은 요청 다시 확인
        </button>
      )}

      <style jsx>{`
        .payment {
          padding: 18px;
          margin-top: 0;
          background: #fcfbf7;
          border-radius: 12px;
          color: #243648;
        }
        h3 { font-size: 16px; margin: 0; }
        p { font-size: 13px; line-height: 1.6; }
        button, input, select {
          padding: 10px;
          min-height: 44px;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          font-size: 14px;
          box-sizing: border-box;
        }
        button {
          background: white;
          color: #28533f;
          cursor: pointer;
          margin: 4px;
        }
        button:disabled { opacity: .5; }
        .buttons { display: flex; flex-wrap: wrap; }
        .buttons button:first-child {
          background: #285b43;
          color: white;
        }
        label {
          display: block;
          font-size: 13px;
          margin: 10px 0;
        }
        input, select { display: block; width: 100%; background: white; }
        summary { cursor: pointer; padding: 12px 0; font-size: 13px; }
        .summary-card { background: #eaf2e9; padding: 20px; border-radius: 16px; margin: 16px 0; }
        .summary-card > strong { display: block; font-size: clamp(24px, 6vw, 34px); margin: 8px 0 20px; overflow-wrap: anywhere; }
        .totals { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 13px; }
        .totals b { display: block; margin-top: 8px; font-size: 17px; overflow-wrap: anywhere; }
        .buttons { display: grid; gap: 8px; }
        .buttons button { margin: 0; width: 100%; font-weight: 800; min-height: 50px; }
        form, .confirmation { background: #fff; border: 1px solid #d5e0d7; border-radius: 12px; padding: 14px; margin-top: 14px; }
        .confirmation { background: #eaf2e9; }
        .history { margin-top: 24px; }
        .history > div { border-bottom: 1px solid #dfe5dc; padding: 8px 0; }
        .heading{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}.state-badge{font-size:12px;padding:5px 8px;background:#fffefa;border-radius:20px}.next-task,.profit-link{padding:14px;border:1px solid #dfe4d7;border-radius:14px;margin:12px 0;background:#fffefa}.next-task h4,.profit-link h4{margin:0}.hint{color:#53665a;font-size:12px}input,select{font-size:16px}.history p{overflow-wrap:anywhere}button{max-width:100%}
        [role="alert"] { color: #b91c1c; }
      `}</style>
    </section>
  );
        }
