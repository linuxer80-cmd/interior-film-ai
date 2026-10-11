"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { koreanDay } from "../utils/workerCalendar";

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

export default function SitePaymentQuick({ siteId, onChanged }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState("");
  const [form, setForm] = useState("");
  const [retry, setRetry] = useState(false);
  const [paidOn, setPaidOn] = useState(koreanDay);
  const [due, setDue] = useState("");

  const pending = useRef(null);
  const lock = useRef(false);
  const alive = useRef(false);
  const site = data?.site;

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
  }, [siteId]);

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
      onChanged?.();
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

  const disabled = busy || retry;

  return (
    <section className="payment">
      <h3>입금 관리</h3>

      {error && <p role="alert">{error}</p>}

      {!site ? (
        <p>입금 내역 확인 중…</p>
      ) : (
        <>
          <p>
            계약 <b>{paymentWon(site.contract_amount)}</b>
            <br />
            받은 금액 <b>{paymentWon(site.paid)}</b>
            {" · "}미수금 <b>{paymentWon(site.outstanding)}</b>
          </p>

          {!site.confirmed && (
            <p>
              기존 입금액이 미확인입니다.
              일부 입금을 기록하려면 기존에 받은 총액부터 확인해주세요.
            </p>
          )}

          <div className="buttons">
            <button
              disabled={
                disabled ||
                site.status !== "completed" ||
                !Number(site.contract_amount) ||
                (site.confirmed && Number(site.outstanding) === 0)
              }
              onClick={() => {
                const text = site.confirmed
                  ? `남은 ${paymentWon(site.outstanding)}를 받아 전액입금 완료했나요?`
                  : `계약금액 ${paymentWon(site.contract_amount)} 전액을 받았나요? 누적 입금액을 계약금액으로 기록합니다.`;

                if (confirm(text)) {
                  save("settle", {
                    contractAmount: site.contract_amount,
                  });
                }
              }}
            >
              {site.confirmed && site.outstanding === 0
                ? "입금완료"
                : "전액입금"}
            </button>

            <button
              disabled={disabled}
              onClick={() => {
                setForm(site.confirmed ? "payment" : "initial");
                setAmount("");
                setPaidOn(koreanDay());
              }}
            >
              {site.confirmed
                ? "입금 금액 입력"
                : "기존 입금액 확인"}
            </button>
          </div>

          {form && (
            <form
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

                save(form === "initial" ? "initialize" : "add", {
                  amount,
                  paidOn,
                  direction: form === "refund" ? "refund" : "payment",
                  phase: "balance",
                  method: "other",
                  memo: form === "refund" ? "환불 기록" : "입금 기록",
                });
              }}
            >
              <label>
                {form === "initial"
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
                  disabled={disabled}
                  value={amount}
                  onChange={event => setAmount(event.target.value)}
                />
              </label>

              <label>
                거래일
                <input
                  type="date"
                  required
                  max={koreanDay()}
                  min={form === "initial" ? undefined : site.opening_date}
                  disabled={disabled}
                  value={paidOn}
                  onChange={event => setPaidOn(event.target.value)}
                />
              </label>

              <button disabled={disabled}>저장</button>
              <button
                type="button"
                disabled={disabled}
                onClick={() => setForm("")}
              >
                닫기
              </button>
            </form>
          )}

          {site.confirmed && (
            <details>
              <summary>입금 이력 · 취소 · 환불</summary>
              <p>
                기존 입금 {paymentWon(site.opening_paid)}
                {" · "}{site.opening_date}
              </p>

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
                        const reason = prompt(
                          "잘못 입력한 기록의 취소 사유를 입력해주세요. 실제 환불은 환불로 기록하세요."
                        );

                        if (reason?.trim()) {
                          save("void", {
                            entryId: entry.id,
                            reason: reason.trim(),
                          });
                        }
                      }}
                    >
                      기록 취소
                    </button>
                  )}
                </div>
              ))}

              <button
                disabled={disabled}
                onClick={() => {
                  setForm("refund");
                  setAmount("");
                  setPaidOn(koreanDay());
                }}
              >
                환불 기록
              </button>

              <label>
                입금 예정일
                <input
                  type="date"
                  value={due}
                  disabled={disabled}
                  onChange={event => setDue(event.target.value)}
                />
              </label>
              <button
                disabled={disabled}
                onClick={() => save("due", { dueDate: due })}
              >
                예정일 저장
              </button>
            </details>
          )}
        </>
      )}

      {retry && (
        <button disabled={busy} onClick={() => save()}>
          같은 요청 다시 확인
        </button>
      )}

      <style jsx>{`
        .payment {
          padding: 12px;
          margin-top: 12px;
          background: #f8fafc;
          border-radius: 12px;
          color: #243648;
        }
        h3 { font-size: 16px; margin: 0; }
        p { font-size: 13px; line-height: 1.6; }
        button, input {
          padding: 10px;
          min-height: 44px;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          font-size: 14px;
          box-sizing: border-box;
        }
        button {
          background: white;
          color: #24445e;
          cursor: pointer;
          margin: 4px;
        }
        button:disabled { opacity: .5; }
        .buttons { display: flex; flex-wrap: wrap; }
        .buttons button:first-child {
          background: #15803d;
          color: white;
        }
        label {
          display: block;
          font-size: 13px;
          margin: 10px 0;
        }
        input { display: block; width: 100%; background: white; }
        summary { cursor: pointer; padding: 12px 0; font-size: 13px; }
        [role="alert"] { color: #b91c1c; }
      `}</style>
    </section>
  );
        }
