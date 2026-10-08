"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";

const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

const won = value =>
  `${Number(value || 0).toLocaleString("ko-KR")}원`;

const field = {
  minHeight: 44,
  padding: 10,
  border: "1px solid #cbd5e1",
  borderRadius: 12,
  width: "100%",
  boxSizing: "border-box",
  fontSize: 14,
};

const button = {
  ...field,
  width: "auto",
  background: "#eff6ff",
  color: "#1d4ed8",
  fontWeight: 700,
};

async function request(method, body, month, mode = "month") {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) throw Error("관리자로 다시 로그인해주세요.");

  const response = await fetch(
    `/api/admin/labor-payments${
      month ? `?month=${month}&mode=${mode}` : ""
    }`,
    {
      method,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
    }
  );

  const result = await response.json().catch(() => ({
    error: "서버 응답을 확인할 수 없습니다.",
  }));

  if (!response.ok) {
    throw Error(result.error || "요청에 실패했습니다.");
  }
  return result;
}

export default function LaborPayments() {
  const [month, setMonth] = useState(() => today().slice(0, 7));
  const [mode, setMode] = useState("month");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(null);

  const lock = useRef(false);
  const generation = useRef(0);
  const formRef = useRef(null);

  useEffect(() => {
    if (form?.workerId) {
      formRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [form?.workerId]);

  async function load() {
    const version = ++generation.current;
    setLoading(true);
    setError("");

    try {
      const result = await request("GET", null, month, mode);
      if (version === generation.current) setData(result);
    } catch (cause) {
      if (version === generation.current) {
        setError(cause.message);
        setData(null);
      }
    } finally {
      if (version === generation.current) setLoading(false);
    }
  }

  useEffect(() => {
    setData(null);
    setForm(null);
    setMessage("");
    load();

    return () => {
      generation.current++;
    };
  }, [month, mode]);

  const people = new Map(
    (data?.workers || []).map(worker => [
      worker.id,
      { ...worker, amount: 0, paid: 0, rows: [], payments: [] },
    ])
  );

  let unassigned = 0;

  for (const row of data?.labor || []) {
    const person = people.get(row.workerId);
    if (person) {
      person.amount += Number(row.amount);
      person.rows.push(row);
    } else {
      unassigned += Number(row.amount);
    }
  }

  for (const payment of data?.payments || []) {
    const person = people.get(payment.worker_id);
    if (person) {
      person.payments.push(payment);
      if (!payment.cancelled_at) {
        person.paid += Number(payment.amount);
      }
    }
  }

  const list = [...people.values()]
    .filter(person => person.rows.length || person.payments.length)
    .sort((a, b) => b.amount - a.amount);

  const totals = list.reduce(
    (sum, person) => ({
      amount: sum.amount + person.amount,
      paid: sum.paid + person.paid,
      unpaid: sum.unpaid + Math.max(0, person.amount - person.paid),
      excess: sum.excess + Math.max(0, person.paid - person.amount),
    }),
    { amount: unassigned, paid: 0, unpaid: unassigned, excess: 0 }
  );

  function change(key, value) {
    setForm(previous => ({
      ...previous,
      [key]: value,
      id: crypto.randomUUID(),
    }));
  }

  async function save(event) {
    event.preventDefault();
    if (lock.current) return;

    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");

    try {
      await request("POST", {
        ...form,
        month,
        amount: Number(form.amount),
      });
      setForm(null);
      setMessage("지급 기록을 저장했습니다.");
      await load();
    } catch (cause) {
      setError(cause.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function cancel(id) {
    if (
      lock.current ||
      !window.confirm(
        "이 지급 기록을 취소하시겠습니까? 실제 이체는 취소되지 않습니다."
      )
    ) return;

    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");

    try {
      await request("PATCH", { id });
      setMessage("지급 기록을 취소했습니다.");
      await load();
    } catch (cause) {
      setError(cause.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <section style={{
      background: "white",
      border: "1px solid #e2e8f0",
      borderRadius: 22,
      padding: 16,
      marginBottom: 16,
    }}>
      <h3>인건비 지급 관리</h3>

      <label>
        인건비 귀속 월
        <input
          type="month"
          value={month}
          disabled={busy}
          onChange={event => {
            if (event.target.value) setMonth(event.target.value);
          }}
          style={field}
        />
      </label>

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        {[
          ["month", "월 전체"],
          ["today", "오늘까지 보기"],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            disabled={busy}
            aria-pressed={mode === id}
            style={{
              ...button,
              background: mode === id ? "#243648" : "#eff6ff",
              color: mode === id ? "white" : "#1d4ed8",
            }}
            onClick={() => setMode(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <button
        type="button"
        style={{ ...button, marginTop: 8 }}
        disabled={busy || loading}
        onClick={load}
      >
        새로 조회
      </button>

      <p style={{ fontSize: 12, color: "#64748b", lineHeight: 1.6 }}>
        {mode === "today"
          ? `선택 귀속 월의 현장 중 한국 시간 ${
              data?.cutoff || today()
            }까지 배정된 작업일을 계산합니다. 진행 중 현장은 수동 총액 대신 일당·팀장수당 기준이며, 실제 출근 확정액은 아닙니다. 이전 달 시작 현장은 해당 귀속 월을 선택해주세요.`
          : "현장 시작일이 선택한 월에 속한 인건비입니다. 예정 현장도 포함합니다."}
        {" "}지급액은 이 귀속 월에 기록한 전체 금액이며,
        선지급액도 포함됩니다. 실제 이체 후 지급을 기록해주세요.
        {!!data?.pendingDays &&
          ` 단가 미등록 ${data.pendingDays}일은 금액에서 제외되었습니다. 단가를 확인해주세요.`}
      </p>

      {loading && <p role="status">조회 중…</p>}

      {data && !loading && (
        <>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(3,minmax(0,1fr))",
            gap: 8,
          }}>
            {[
              [
                mode === "today"
                  ? "오늘까지 인건비"
                  : month === today().slice(0, 7)
                    ? "이달 인건비"
                    : "선택 월 인건비",
                totals.amount,
              ],
              ["지급 인건비", totals.paid],
              ["미지급 인건비", totals.unpaid],
            ].map(([label, value]) => (
              <div key={label} style={{
                padding: 8,
                background: "#f1f5f9",
                borderRadius: 12,
              }}>
                <div style={{ fontSize: 12 }}>{label}</div>
                <strong style={{ overflowWrap: "anywhere" }}>
                  {won(value)}
                </strong>
              </div>
            ))}
          </div>

          {totals.excess > 0 && (
            <p>
              선지급·초과 지급 기록: {won(totals.excess)}
              {" "}— 발생 인건비 또는 지급 기록을 확인해주세요.
            </p>
          )}

          {unassigned > 0 && (
            <p>
              시공자 미분류 {won(unassigned)}은 미지급액에 포함합니다.
              현장 인건비의 시공자를 먼저 지정해주세요.
            </p>
          )}

          {!list.length && <p>이 월의 시공자별 인건비가 없습니다.</p>}

          {list.map(person => (
            <div key={person.id} style={{
              borderTop: "1px solid #e2e8f0",
              padding: "16px 0",
            }}>
              <strong>{person.name}</strong>
              <p style={{ fontSize: 13 }}>
                인건비 {won(person.amount)} · 지급 {won(person.paid)}
                <br />
                미지급 {won(Math.max(0, person.amount - person.paid))}
                {person.paid > person.amount &&
                  ` · 초과 지급 ${won(person.paid - person.amount)}`}
              </p>

              <button
                type="button"
                style={button}
                disabled={busy || !!form}
                onClick={() => {
                  setError("");
                  setMessage("");
                  setForm({
                    id: crypto.randomUUID(),
                    workerId: person.id,
                    name: person.name,
                    amount: String(
                      Math.max(0, person.amount - person.paid)
                    ),
                    paidOn: today(),
                    memo: "",
                    confirmed: false,
                  });
                }}
              >
                인건비 지급
              </button>

              <details style={{ marginTop: 10 }}>
                <summary>현장별 인건비 · 지급 내역</summary>
                {person.rows.map((row, index) => (
                  <p key={index} style={{ fontSize: 13 }}>
                    {row.siteName} · {won(row.amount)}
                    <br />
                    <small>{row.description}</small>
                  </p>
                ))}

                {!person.payments.length && <p>지급 내역이 없습니다.</p>}

                {person.payments.map(payment => (
                  <div key={payment.id}
                    style={{ padding: "8px 0", fontSize: 13 }}>
                    {payment.paid_on} · {won(payment.amount)}
                    {" "}{payment.memo}{" "}
                    {payment.cancelled_at ? (
                      <strong>(취소됨)</strong>
                    ) : (
                      <button
                        type="button"
                        disabled={busy || !!form}
                        onClick={() => cancel(payment.id)}
                        style={{ ...button, marginLeft: 8 }}
                      >
                        지급 취소
                      </button>
                    )}
                  </div>
                ))}
              </details>
            </div>
          ))}
        </>
      )}

      {form && (
        <form
          ref={formRef}
          onSubmit={save}
          style={{
            display: "grid",
            gap: 10,
            padding: 14,
            background: "#eff6ff",
            borderRadius: 14,
          }}
        >
          <strong>{form.name} · {month} 인건비 지급</strong>

          <label>
            지급 금액 (원)
            <input
              required
              type="number"
              min="1"
              max="1000000000"
              step="1"
              inputMode="numeric"
              value={form.amount}
              disabled={busy}
              onChange={event => change("amount", event.target.value)}
              style={field}
            />
          </label>

          <label>
            실제 지급일
            <input
              required
              type="date"
              max={today()}
              value={form.paidOn}
              disabled={busy}
              onChange={event => change("paidOn", event.target.value)}
              style={field}
            />
          </label>

          <label>
            메모
            <input
              maxLength={200}
              value={form.memo}
              disabled={busy}
              onChange={event => change("memo", event.target.value)}
              style={field}
            />
          </label>

          <label style={{ padding: "10px 0" }}>
            <input
              required
              type="checkbox"
              checked={form.confirmed}
              disabled={busy}
              onChange={event =>
                change("confirmed", event.target.checked)
              }
            />{" "}
            위 금액을 실제 지급했습니다.
          </label>

          <button type="submit" disabled={busy} style={button}>
            {busy ? "저장 중…" : "지급 기록 저장"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setForm(null)}
            style={button}
          >
            닫기
          </button>
        </form>
      )}

      {error && (
        <p role="alert" style={{ color: "#b91c1c" }}>{error}</p>
      )}
      {message && (
        <p role="status" style={{ color: "#166534" }}>{message}</p>
      )}
    </section>
  );
            }
