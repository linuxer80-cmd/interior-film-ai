"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabase";
import { koreanDay } from "../../utils/workerCalendar";

const won = value =>
  value == null
    ? "미확인"
    : `${Number(value).toLocaleString("ko-KR")}원`;

const phases = {
  deposit: "계약금",
  interim: "중도금",
  balance: "잔금",
  other: "기타",
};

const methods = {
  bank: "계좌이체",
  cash: "현금",
  card: "카드",
  other: "기타",
};

const emptyPayment = () => ({
  direction: "payment",
  phase: "balance",
  amount: "",
  paidOn: koreanDay(),
  method: "bank",
  memo: "",
});

async function api(body, write = false) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("관리자 로그인이 필요합니다.");
  }

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
        ...(write ? { "Content-Type": "application/json" } : {}),
      },
      ...(write ? { body: JSON.stringify(body) } : {}),
    },
  );

  const result = await response.json();

  if (!response.ok) {
    const error = new Error(result.error || "요청에 실패했습니다.");
    error.status = response.status;
    throw error;
  }

  return result;
}

export default function ReceivablesPage() {
  const [list, setList] = useState({
    items: [],
    count: 0,
    summary: {},
  });

  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [opening, setOpening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [message, setMessage] = useState("");
  const [listError, setListError] = useState("");

  const [initial, setInitial] = useState({
    amount: "",
    paidOn: koreanDay(),
    dueDate: "",
  });

  const [payment, setPayment] = useState(emptyPayment);
  const [dueDate, setDueDate] = useState("");
  const [voidId, setVoidId] = useState("");
  const [reason, setReason] = useState("");

  const pending = useRef(null);
  const listSequence = useRef(0);
  const detailSequence = useRef(0);
  const writing = useRef(false);
  const detailPanel = useRef(null);

  const site = detail?.site;
  const locked = busy || uncertain;

  useEffect(() => {
    if (!site?.id) return;

    detailPanel.current?.focus({ preventScroll: true });

    detailPanel.current?.scrollIntoView({
      block: "start",
      behavior: window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches ? "auto" : "smooth",
    });
  }, [site?.id]);

  async function loadList() {
    const seq = ++listSequence.current;

    setLoading(true);
    setListError("");

    try {
      const data = await api({
        q: search,
        filter,
        page: String(page),
      });

      if (seq === listSequence.current) {
        setList(data);
      }
    } catch (error) {
      if (seq === listSequence.current) {
        setListError(error.message);
      }
    } finally {
      if (seq === listSequence.current) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    loadList();
  }, [search, filter, page, refresh]);

  useEffect(() => {
    const id = new URLSearchParams(
      window.location.search,
    ).get("siteId");

    if (id) openSite(id);

    return () => {
      ++listSequence.current;
      ++detailSequence.current;
    };
  }, []);

  async function openSite(id) {
    if (writing.current || pending.current) return;

    const seq = ++detailSequence.current;

    setOpening(true);
    setMessage("");
    setDetail(null);

    try {
      const data = await api({ siteId: id });

      if (seq !== detailSequence.current) return;

      setDetail(data);
      setDueDate(data.site.due_date || "");
      setInitial({
        amount: "",
        paidOn: koreanDay(),
        dueDate: "",
      });
      setPayment(emptyPayment());
      setVoidId("");
      setReason("");
    } catch (error) {
      if (seq === detailSequence.current) {
        setMessage(error.message);
      }
    } finally {
      if (seq === detailSequence.current) {
        setOpening(false);
      }
    }
  }

  async function save(action, values) {
    if (!site || writing.current) return;

    const payload = pending.current || {
      ...values,
      action,
      siteId: site.id,
      revision: site.revision,
      requestId: crypto.randomUUID(),
    };

    pending.current = payload;
    writing.current = true;

    setBusy(true);
    setMessage("");

    try {
      const data = await api(payload, true);

      setDetail(data);
      setDueDate(data.site.due_date || "");
      setPayment(emptyPayment());
      setVoidId("");
      setReason("");

      pending.current = null;
      setUncertain(false);
      setMessage("저장했습니다.");
      setRefresh(value => value + 1);
    } catch (error) {
      if (error.status && error.status < 500) {
        pending.current = null;
        setUncertain(false);
        setMessage(error.message);

        if (error.status === 409) {
          try {
            const fresh = await api({ siteId: site.id });
            setDetail(fresh);
            setDueDate(fresh.site.due_date || "");
          } catch {
            setMessage(
              "새 내역을 불러오지 못했습니다. 현장을 다시 열어주세요.",
            );
          }
        }
      } else {
        setUncertain(true);
        setMessage(
          `${error.message} 저장 결과를 확인하지 못했습니다. 아래 ‘같은 요청 다시 확인’을 눌러주세요.`,
        );
      }
    } finally {
      writing.current = false;
      setBusy(false);
    }
  }

  function amountValid(value, allowZero = false) {
    return /^\d+$/.test(String(value))
      && Number(value) <= 1000000000000
      && Number(value) >= (allowZero ? 0 : 1);
  }

  function submitInitial(event) {
    event.preventDefault();

    if (!amountValid(initial.amount, true)) {
      return setMessage(
        "기존 입금액을 원 단위로 입력해주세요. 받은 돈이 없으면 0을 입력하세요.",
      );
    }

    if (!window.confirm(
      `이미 받은 총액 ${won(initial.amount)}으로 입금 관리를 시작할까요? 이 금액에 포함된 입금은 다시 등록하지 마세요.`,
    )) return;

    save("initialize", initial);
  }

  function submitPayment(event) {
    event.preventDefault();

    if (!amountValid(payment.amount)) {
      return setMessage(
        "입금·환불 금액을 1원 이상 정수로 입력해주세요.",
      );
    }

    if (
      payment.direction === "refund"
      && !window.confirm(
        `${won(payment.amount)} 환불 내역을 기록할까요? 실제 송금은 별도로 처리해주세요.`,
      )
    ) return;

    save("add", payment);
  }

  return (
    <main className="receivables">
      <Link href="/admin">‹ 관리자 홈</Link>

      <h1>미수금 · 잔금 관리</h1>

      <p className="muted">
        실제 입금·환불 내역을 기록합니다.
        은행·카드 결제와 자동 연동되지 않습니다.
      </p>

      <div className="totals">
        <div>
          <small>확인된 미수금</small>
          <strong>{won(list.summary.outstanding)}</strong>
        </div>
        <div>
          <small>예정일 지난 미수금</small>
          <strong>{won(list.summary.overdue)}</strong>
        </div>
        <div>
          <small>기존 입금 확인 필요</small>
          <strong>
            {list.summary.unconfirmed ?? "—"}개 현장
          </strong>
        </div>
      </div>

      <p className="muted">
        전체 업체 기준 합계입니다.
        취소 현장·기존 입금 미확인 현장은 제외됩니다.
        계약금액 미정 {list.summary.unknownContract ?? "—"}건은
        미수금 계산에서 제외됩니다.
      </p>

      <form
        className="toolbar"
        onSubmit={event => {
          event.preventDefault();
          setPage(0);
          setSearch(query);
        }}
      >
        <input
          aria-label="현장·고객 검색"
          placeholder="현장명 또는 고객명"
          value={query}
          maxLength={100}
          onChange={event => setQuery(event.target.value)}
        />

        <button>검색</button>

        <select
          aria-label="조회 구분"
          value={filter}
          onChange={event => {
            setFilter(event.target.value);
            setPage(0);
          }}
        >
          <option value="all">전체 현장</option>
          <option value="outstanding">미수금 있음</option>
          <option value="overdue">입금 지연</option>
          <option value="unconfirmed">확인 필요</option>
          <option value="settled">수금 완료</option>
          <option value="cancelled">취소 현장</option>
        </select>

        <button
          type="button"
          onClick={loadList}
          disabled={loading}
        >
          새로고침
        </button>
      </form>

      {listError && (
        <p role="alert" className="notice">{listError}</p>
      )}

      {loading && <p role="status">불러오는 중…</p>}

      {!loading && !listError && !list.items.length && (
        <p>해당 조건의 현장이 없습니다.</p>
      )}

      <div className="site-list" aria-busy={loading}>
        {list.items.map(item => (
          <button
            key={item.id}
            className="site-card"
            type="button"
            disabled={locked || opening || loading}
            aria-pressed={site?.id === item.id}
            onClick={() => openSite(item.id)}
          >
            <strong>{item.site_name || "현장"}</strong>
            <span>{item.customer_name || "고객명 미등록"}</span>

            <span>
              {!item.confirmed
                ? "기존 입금 확인 필요"
                : item.contract_amount == null
                  ? "계약금액 미정"
                  : item.outstanding > 0
                    ? `미수 ${won(item.outstanding)}`
                    : "수금 완료"}
            </span>

            <small>
              {item.due_date
                ? `잔금 예정 ${item.due_date}`
                : "잔금 예정일 미정"}
              {item.overdue ? " · 입금 지연" : ""}
            </small>
          </button>
        ))}
      </div>

      <div className="toolbar">
        <button
          disabled={page === 0 || loading}
          onClick={() => setPage(value => value - 1)}
        >
          이전
        </button>

        <span>
          {page + 1} / {Math.max(1, Math.ceil(list.count / 20))}
        </span>

        <button
          disabled={(page + 1) * 20 >= list.count || loading}
          onClick={() => setPage(value => value + 1)}
        >
          다음
        </button>
      </div>

      {opening && (
        <p role="status">현장 입금 내역을 불러오는 중…</p>
      )}

      {message && (
        <p role="status" className="notice">{message}</p>
      )}

      {uncertain && (
        <button disabled={busy} onClick={() => save()}>
          같은 요청 다시 확인
        </button>
      )}

      {site && (
        <section
          className="detail"
          ref={detailPanel}
          tabIndex={-1}
        >
          <div className="toolbar">
            <h2>{site.site_name || "현장"}</h2>

            <a href={`/admin?site=${site.id}&section=info`}>
              현장 정보 열기
            </a>

            <button
              disabled={locked}
              onClick={() => openSite(site.id)}
            >
              내역 새로고침
            </button>
          </div>

          {site.status === "cancelled" && (
            <p className="notice">
              취소 현장입니다.
              전체 미수금 합계에서는 제외되며 입금·환불 기록은 유지됩니다.
            </p>
          )}

          <div className="totals">
            <div>
              <small>계약금액</small>
              <strong>{won(site.contract_amount)}</strong>
            </div>
            <div>
              <small>순입금액</small>
              <strong>{won(site.paid)}</strong>
            </div>
            <div>
              <small>남은 미수금</small>
              <strong>{won(site.outstanding)}</strong>
            </div>
          </div>

          {site.overpaid > 0 && (
            <p className="notice">
              계약금액보다 {won(site.overpaid)} 더 입금됐습니다.
              계약금액 또는 환불 여부를 확인해주세요.
            </p>
          )}

          {!site.confirmed ? (
            <form onSubmit={submitInitial}>
              <h3>기존 입금액 한 번 확인하기</h3>

              <p>
                현장정보의 계약금/선금 {won(site.deposit_amount)}은
                참고값입니다. 아직 받은 돈으로 계산하지 않았습니다.
              </p>

              <p>
                시작일까지 이미 받은 계약금·중도금·잔금의 합계에서
                환불액을 뺀 금액을 입력하세요.
                이후에는 이 금액에 포함되지 않은 거래만 추가하세요.
              </p>

              <fieldset disabled={locked}>
                <label>
                  기존 순입금 총액(원)
                  <input
                    required
                    type="number"
                    min="0"
                    max="1000000000000"
                    step="1"
                    inputMode="numeric"
                    value={initial.amount}
                    onChange={e => setInitial({
                      ...initial,
                      amount: e.target.value,
                    })}
                  />
                </label>

                <label>
                  관리 시작일
                  <input
                    required
                    type="date"
                    max={koreanDay()}
                    value={initial.paidOn}
                    onChange={e => setInitial({
                      ...initial,
                      paidOn: e.target.value,
                    })}
                  />
                </label>

                <label>
                  잔금 예정일(선택)
                  <input
                    type="date"
                    value={initial.dueDate}
                    onChange={e => setInitial({
                      ...initial,
                      dueDate: e.target.value,
                    })}
                  />
                </label>

                <button className="primary">
                  금액 확인 후 관리 시작
                </button>
              </fieldset>
            </form>
          ) : (
            <>
              <p className="muted">
                기존 순입금 {won(site.opening_paid)}
                {" · "}관리 시작일 {site.opening_date}.
                기존 총액은 고정되며 잘못된 금액은
                ‘기타’ 입금·환불 기록으로 정정하세요.
              </p>

              <form
                className="toolbar"
                onSubmit={event => {
                  event.preventDefault();
                  save("due", { dueDate });
                }}
              >
                <label>
                  잔금 예정일
                  <input
                    type="date"
                    disabled={locked}
                    value={dueDate}
                    onChange={e => setDueDate(e.target.value)}
                  />
                </label>

                <button disabled={locked}>예정일 저장</button>
              </form>

              <form onSubmit={submitPayment}>
                <h3>입금 · 환불 기록</h3>

                <fieldset disabled={locked}>
                  <label>
                    거래 구분
                    <select
                      value={payment.direction}
                      onChange={e => setPayment({
                        ...payment,
                        direction: e.target.value,
                      })}
                    >
                      <option value="payment">입금</option>
                      <option value="refund">환불</option>
                    </select>
                  </label>

                  <label>
                    항목
                    <select
                      value={payment.phase}
                      onChange={e => setPayment({
                        ...payment,
                        phase: e.target.value,
                      })}
                    >
                      {Object.entries(phases).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                  </label>

                  <label>
                    금액(원)
                    <input
                      required
                      type="number"
                      min="1"
                      max="1000000000000"
                      step="1"
                      inputMode="numeric"
                      value={payment.amount}
                      onChange={e => setPayment({
                        ...payment,
                        amount: e.target.value,
                      })}
                    />
                  </label>

                  <label>
                    실제 거래일
                    <input
                      required
                      type="date"
                      min={site.opening_date}
                      max={koreanDay()}
                      value={payment.paidOn}
                      onChange={e => setPayment({
                        ...payment,
                        paidOn: e.target.value,
                      })}
                    />
                  </label>

                  <label>
                    방법
                    <select
                      value={payment.method}
                      onChange={e => setPayment({
                        ...payment,
                        method: e.target.value,
                      })}
                    >
                      {Object.entries(methods).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                  </label>

                  <label>
                    메모
                    <input
                      maxLength={500}
                      value={payment.memo}
                      onChange={e => setPayment({
                        ...payment,
                        memo: e.target.value,
                      })}
                      placeholder="입금자명·정정 사유 등"
                    />
                  </label>

                  <button className="primary">
                    {busy ? "저장 중…" : "거래 내역 저장"}
                  </button>
                </fieldset>
              </form>

              <h3>입금·환불 내역</h3>

              {!detail.entries.length && (
                <p>추가 등록된 내역이 없습니다.</p>
              )}

              {detail.entries.map(entry => (
                <article key={entry.id} className="entry">
                  <strong>
                    {entry.voided_at ? "[기록 취소] " : ""}
                    {entry.direction === "refund"
                      ? "환불"
                      : phases[entry.phase]}
                    {" "}{won(entry.amount)}
                  </strong>

                  <p>
                    {entry.paid_on} · {methods[entry.method]}
                    {entry.memo ? ` · ${entry.memo}` : ""}
                  </p>

                  {entry.voided_at ? (
                    <small>취소 사유: {entry.void_reason}</small>
                  ) : (
                    <button
                      disabled={locked}
                      onClick={() => {
                        setVoidId(entry.id);
                        setReason("");
                      }}
                    >
                      잘못 입력한 기록 취소
                    </button>
                  )}

                  {voidId === entry.id && !entry.voided_at && (
                    <form
                      className="toolbar"
                      onSubmit={event => {
                        event.preventDefault();
                        save("void", {
                          entryId: entry.id,
                          reason,
                        });
                      }}
                    >
                      <input
                        required
                        aria-label="취소 사유"
                        placeholder="취소 사유 (실제 환불은 환불 기록으로 등록)"
                        maxLength={300}
                        value={reason}
                        disabled={locked}
                        onChange={e => setReason(e.target.value)}
                      />

                      <button disabled={locked}>
                        기록 취소 확정
                      </button>

                      <button
                        type="button"
                        disabled={locked}
                        onClick={() => setVoidId("")}
                      >
                        닫기
                      </button>
                    </form>
                  )}
                </article>
              ))}
            </>
          )}
        </section>
      )}

      <style jsx>{`
        .receivables {
          max-width: 980px;
          padding: 24px 16px 70px;
        }
        h1 { font-size: 25px; }
        h2 { margin: 0; font-size: 21px; }
        h3 { margin: 25px 0 12px; }
        p { line-height: 1.65; font-size: 13px; }
        a { color: #28445c; }
        .muted, small { color: #6e685f; font-size: 12px; }

        .totals {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
          margin: 18px 0;
        }
        .totals > div {
          padding: 15px;
          border: 1px solid #e6dfd4;
          border-radius: 15px;
          background: #fffdfa;
          min-width: 0;
        }
        .totals strong {
          display: block;
          margin-top: 8px;
          font-size: clamp(15px, 3vw, 23px);
          overflow-wrap: anywhere;
        }
        .toolbar {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          align-items: center;
          margin: 16px 0;
        }
        .toolbar > input { flex: 1; min-width: 140px; }

        button, input, select {
          min-height: 44px;
          padding: 10px 12px;
          border: 1px solid #d9cfc0;
          border-radius: 10px;
          font-size: 14px;
          background: white;
          color: #243648;
          max-width: 100%;
        }
        button { cursor: pointer; }
        button:disabled { opacity: .55; cursor: default; }
        .primary { background: #28445c; color: white; }
        .notice {
          background: #fff1d7;
          color: #654519;
          border-radius: 12px;
          padding: 14px;
        }
        .site-list {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }
        .site-card {
          display: grid;
          gap: 7px;
          text-align: left;
          padding: 16px;
          overflow-wrap: anywhere;
        }
        .site-card[aria-pressed="true"] {
          border: 2px solid #28445c;
          background: #eee8de;
        }
        .detail {
          scroll-margin-top: 75px;
          margin-top: 30px;
          border: 1px solid #dfd4c4;
          border-radius: 20px;
          background: #fffdfa;
          padding: 20px;
        }
        fieldset {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
          border: 0;
          padding: 0;
          margin: 0;
          min-width: 0;
        }
        label {
          display: grid;
          gap: 7px;
          font-size: 12px;
          min-width: 0;
        }
        label > input, label > select { width: 100%; }
        .entry {
          border-top: 1px solid #e6dfd4;
          padding: 16px 0;
        }
        .entry p { overflow-wrap: anywhere; }

        @media(max-width: 480px) {
          .totals { grid-template-columns: 1fr; gap: 6px; }
          .totals > div {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            padding: 12px;
          }
          .totals strong { margin: 0; }
          .site-list, fieldset { grid-template-columns: 1fr; }
          .detail { padding: 15px; }
        }
      `}</style>
    </main>
  );
}
