"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { koreanDay } from "../utils/workerCalendar";
import SitePaymentQuick from "./SitePaymentQuick";

const won = (n) =>
  `${Number(n || 0).toLocaleString("ko-KR")}원`;

export async function tradeApi(body) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) throw Error("관리자로 로그인해주세요.");

  const response = await fetch("/api/admin/trade-clients", {
    method: body ? "POST" : "GET",
    cache: "no-store",
    signal: AbortSignal.timeout(25000),
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const result = await response.json();

  if (!response.ok) {
    const error = Error(result.error || "요청 실패");
    error.status = response.status;
    throw error;
  }

  return result;
}

const totals = (rows) =>
  rows
    .filter((site) => site.status !== "cancelled")
    .reduce(
      (acc, site) => ({
        count: acc.count + 1,
        contract: acc.contract + Number(site.contract_amount || 0),
        paid: acc.paid + Number(site.paid || 0),
        due: acc.due + Number(site.outstanding || 0),
        unknown:
          acc.unknown +
          Number(!site.confirmed || site.contract_amount == null),
      }),
      { count: 0, contract: 0, paid: 0, due: 0, unknown: 0 }
    );

function Summary({ title, rows }) {
  const total = totals(rows);

  return (
    <div className="trade-summary">
      <b>{title} · {total.count}현장</b>
      <p>
        계약 {won(total.contract)} · 입금 {won(total.paid)}
        <br />
        확인된 미수금 {won(total.due)} · 금액 확인 필요 {total.unknown}건
      </p>
    </div>
  );
}

export default function TradeClients({ siteId, onScope }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(false);

  const [client, setClient] = useState("all");
  const [contact, setContact] = useState("all");
  const [query, setQuery] = useState("");
  const [personQuery, setPersonQuery] = useState("");

  const [edit, setEdit] = useState(null);
  const [linkSite, setLinkSite] = useState(siteId || "");
  const [linkClient, setLinkClient] = useState("");
  const [linkContact, setLinkContact] = useState("");

  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState(koreanDay);
  const [alloc, setAlloc] = useState(null);
  const [paymentSite, setPaymentSite] = useState("");

  const [manageQuery, setManageQuery] = useState("");
  const [manageId, setManageId] = useState("");

  const [page, setPage] = useState(0);
  const [ready, setReady] = useState(false);

  const pending = useRef(null);
  const lock = useRef(false);
  const alive = useRef(false);
  const callback = useRef(onScope);
  callback.current = onScope;

  async function load() {
    try {
      const result = await tradeApi();

      if (alive.current) {
        setData(result);
        setError("");
      }
    } catch (err) {
      if (alive.current) setError(err.message);
    }
  }

  useEffect(() => {
    alive.current = true;
    load();

    const sync = () => {
      if (!lock.current && !pending.current) load();
    };

    window.addEventListener("trade-clients-changed", sync);

    return () => {
      alive.current = false;
      window.removeEventListener("trade-clients-changed", sync);
    };
  }, []);

  useEffect(() => {
    const site = data?.sites.find((item) => item.id === linkSite);
    setLinkClient(site?.client_id || "");
    setLinkContact(site?.contact_id || "");
  }, [data, linkSite]);

  useEffect(() => {
    setAlloc(null);
    setPage(0);
  }, [client, contact, query, personQuery]);

  async function save(action, values = {}) {
    if (lock.current) return;

    const body = pending.current || {
      action,
      ...values,
      requestId: crypto.randomUUID(),
    };

    pending.current = body;
    lock.current = true;
    setBusy(true);
    setError("");

    try {
      await tradeApi(body);
      pending.current = null;

      window.dispatchEvent(new Event("trade-clients-changed"));

      if (alive.current) {
        setRetry(false);
        setEdit(null);
        setAlloc(null);
        setReady(false);
        await load();
      }
    } catch (err) {
      if (alive.current) {
        setError(err.message);

        if (err.status && err.status < 500) {
          pending.current = null;
          setRetry(false);
          setAlloc(null);
        } else {
          setRetry(true);
        }
      }
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }

  const clients = data?.clients || [];
  const contacts = data?.contacts || [];
  const sites = data?.sites || [];

  const clientRows = sites.filter((site) =>
    client === "all"
      ? true
      : client === "personal"
        ? !site.client_id
        : site.client_id === client
  );

  const visible = clientRows.filter(
    (site) =>
      (contact === "all" ||
        (contact === "none" && !site.contact_id) ||
        site.contact_id === contact) &&
      (!query.trim() ||
        `${site.client_name || ""} ${site.site_name || ""} ${
          site.customer_name || ""
        }`
          .toLowerCase()
          .includes(query.trim().toLowerCase())) &&
      (!personQuery.trim() ||
        (site.contact_name || "")
          .toLowerCase()
          .includes(personQuery.trim().toLowerCase()))
  );

  const realClient = clients.find((item) => item.id === client);

  useEffect(() => {
    if (data) {
      callback.current?.({
        clientId: realClient?.id || "",
        contactId: contacts.some(
          (item) => item.id === contact && item.client_id === client
        )
          ? contact
          : "",
        ids: visible.map((site) => site.id),
        lookup: Object.fromEntries(
          sites.map((site) => [
            site.id,
            {
              trade_client_name: site.client_name,
              trade_contact_name: site.contact_name,
            },
          ])
        ),
      });
    }
  }, [data, client, contact, query, personQuery]);

  const eligible = visible
    .filter(
      (site) =>
        site.status === "completed" &&
        site.confirmed &&
        site.contract_amount != null &&
        Number(site.outstanding) > 0
    )
    .sort(
      (a, b) =>
        String(a.schedule_start || "9999").localeCompare(
          String(b.schedule_start || "9999")
        ) || a.id.localeCompare(b.id)
    );

  const blocked = busy || retry;

  function preview(full) {
    if (!realClient) return;

    if (
      visible.some(
        (site) =>
          site.status === "completed" &&
          (!site.confirmed || site.contract_amount == null)
      )
    ) {
      setError("완료 현장의 기존 입금액과 계약금액을 먼저 확인해주세요.");
      return;
    }

    const sum = eligible.reduce(
      (acc, site) => acc + Number(site.outstanding),
      0
    );
    const input = full ? sum : Number(amount);

    if (!Number.isSafeInteger(input) || input <= 0 || input > sum) {
      setError("입금액은 선택 범위의 미수금 이내로 입력해주세요.");
      return;
    }

    if (eligible.length > 100) {
      setError(
        "한 번에 100현장까지 처리할 수 있습니다. 담당자나 검색으로 좁혀주세요."
      );
      return;
    }

    let left = input;

    const lines = eligible.map((site) => {
      const value = Math.min(left, Number(site.outstanding));
      left -= value;

      return {
        siteId: site.id,
        name: site.site_name,
        revision: site.revision,
        contractAmount: site.contract_amount,
        max: Number(site.outstanding),
        amount: String(value),
      };
    });

    setAmount(String(input));
    setAlloc(lines);
    setReady(false);
    setError("");
  }

  return (
    <section className="trade">
      <header>
        <h3>
          {siteId ? "고객 구분 · 거래처 연결" : "거래처별 현장 · 정산"}
        </h3>
        <button disabled={blocked} onClick={load}>
          새로고침
        </button>
      </header>

      {error && <p role="alert">{error}</p>}

      {retry && (
        <button disabled={busy} onClick={() => save()}>
          같은 요청 다시 확인
        </button>
      )}

      {!data ? (
        <p>거래처를 불러오는 중…</p>
      ) : (
        <>
          {!siteId && (
            <>
              <div className="grid">
                <label>
                  업체명·현장 검색
                  <input
                    disabled={blocked}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="업체명 또는 현장명"
                  />
                </label>

                <label>
                  거래처
                  <select
                    disabled={blocked}
                    value={client}
                    onChange={(event) => {
                      setClient(event.target.value);
                      setContact("all");
                      setPersonQuery("");
                    }}
                  >
                    <option value="all">전체</option>
                    <option value="personal">개인 고객</option>
                    {clients.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid">
                <label>
                  담당자 검색
                  <input
                    disabled={blocked}
                    value={personQuery}
                    onChange={(event) =>
                      setPersonQuery(event.target.value)
                    }
                    placeholder="담당자 이름"
                  />
                </label>

                <label>
                  담당자 선택
                  <select
                    disabled={blocked}
                    value={contact}
                    onChange={(event) => setContact(event.target.value)}
                  >
                    <option value="all">모든 담당자</option>
                    <option value="none">담당자 미지정</option>
                    {contacts
                      .filter(
                        (item) => !realClient || item.client_id === client
                      )
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} · {item.phone || "연락처 없음"}
                        </option>
                      ))}
                  </select>
                </label>
              </div>

              <Summary
                title={
                  realClient
                    ? `${realClient.name} 전체`
                    : client === "personal"
                      ? "개인 고객 전체"
                      : "전체"
                }
                rows={clientRows}
              />

              <Summary title="선택·검색 결과" rows={visible} />

              <small>
                취소 현장은 합계에서 제외합니다. 입금 미확인은 0원 수금으로
                확정하지 않으며, 미수금 합계에서 제외합니다.
              </small>
            </>
          )}

          <details>
            <summary>거래처 · 담당자 등록 및 수정</summary>

            <button
              disabled={blocked}
              onClick={() => {
                setManageId("");
                setManageQuery("");
                setEdit({
                  action: "client",
                  name: "",
                  phone: "",
                  settlementDay: "",
                });
              }}
            >
              ＋업체 등록
            </button>

            {!edit && (
              <label>
                기존 업체 검색
                <input
                  disabled={blocked}
                  value={manageQuery}
                  placeholder="수정할 업체명을 입력하세요"
                  onChange={(event) => {
                    setManageQuery(event.target.value);
                    setManageId("");
                  }}
                />
              </label>
            )}

            {!edit && !manageId && manageQuery.trim() && (
              <div>
                {clients
                  .filter((item) =>
                    item.name
                      .toLowerCase()
                      .includes(manageQuery.trim().toLowerCase())
                  )
                  .slice(0, 5)
                  .map((item) => (
                    <button
                      key={item.id}
                      disabled={blocked}
                      onClick={() => setManageId(item.id)}
                    >
                      {item.name}
                    </button>
                  ))}

                {!clients.some((item) =>
                  item.name
                    .toLowerCase()
                    .includes(manageQuery.trim().toLowerCase())
                ) && <small>검색된 업체가 없습니다.</small>}
              </div>
            )}

            {!edit &&
              clients
                .filter((item) => item.id === manageId)
                .map((item) => (
                  <div key={item.id}>
                    <b>{item.name}</b> · {item.phone}{" "}
                    {item.settlement_day
                      ? `매월 ${item.settlement_day}일 정산`
                      : ""}

                    <button
                      disabled={blocked}
                      onClick={() =>
                        setEdit({
                          action: "client",
                          clientId: item.id,
                          revision: item.revision,
                          name: item.name,
                          phone: item.phone,
                          settlementDay: item.settlement_day || "",
                        })
                      }
                    >
                      업체 수정
                    </button>

                    <button
                      disabled={blocked}
                      onClick={() =>
                        setEdit({
                          action: "contact",
                          clientId: item.id,
                          name: "",
                          phone: "",
                        })
                      }
                    >
                      ＋담당자
                    </button>

                    {contacts
                      .filter((person) => person.client_id === item.id)
                      .map((person) => (
                        <button
                          disabled={blocked}
                          key={person.id}
                          onClick={() =>
                            setEdit({
                              action: "contact",
                              clientId: item.id,
                              contactId: person.id,
                              revision: person.revision,
                              name: person.name,
                              phone: person.phone,
                            })
                          }
                        >
                          {person.name} 수정
                        </button>
                      ))}
                  </div>
                ))}

            {edit && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  save(edit.action, edit);
                }}
              >
                <label>
                  {edit.action === "client"
                    ? "업체명 (필수)"
                    : "담당자명 (필수)"}
                  <input
                    required
                    maxLength={100}
                    disabled={blocked}
                    value={edit.name}
                    onChange={(event) =>
                      setEdit({ ...edit, name: event.target.value })
                    }
                  />
                </label>

                <label>
                  연락처
                  <input
                    maxLength={100}
                    disabled={blocked}
                    value={edit.phone}
                    onChange={(event) =>
                      setEdit({ ...edit, phone: event.target.value })
                    }
                  />
                </label>

                {edit.action === "client" && (
                  <label>
                    정산일 (선택)
                    <input
                      type="number"
                      min="1"
                      max="31"
                      disabled={blocked}
                      value={edit.settlementDay}
                      onChange={(event) =>
                        setEdit({
                          ...edit,
                          settlementDay: event.target.value,
                        })
                      }
                    />
                  </label>
                )}

                <button disabled={blocked}>저장</button>
                <button
                  type="button"
                  disabled={blocked}
                  onClick={() => setEdit(null)}
                >
                  닫기
                </button>
              </form>
            )}
          </details>

          <details open={!!siteId}>
            <summary>현장을 거래처에 연결 / 개인 고객으로 변경</summary>

            {!siteId && (
              <label>
                현장
                <select
                  value={linkSite}
                  disabled={blocked}
                  onChange={(event) => setLinkSite(event.target.value)}
                >
                  <option value="">현장 선택</option>
                  {sites.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.site_name} · {site.client_name || "개인 고객"}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label>
              거래처
              <select
                disabled={blocked}
                value={linkClient}
                onChange={(event) => {
                  setLinkClient(event.target.value);
                  setLinkContact("");
                }}
              >
                <option value="">개인 고객</option>
                {clients.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>

            {linkClient && (
              <label>
                담당자 (선택)
                <select
                  disabled={blocked}
                  value={linkContact}
                  onChange={(event) => setLinkContact(event.target.value)}
                >
                  <option value="">미지정 · 1인 업체</option>
                  {contacts
                    .filter((item) => item.client_id === linkClient)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                </select>
              </label>
            )}

            <button
              disabled={blocked || !linkSite}
              onClick={() =>
                save("link", {
                  siteId: linkSite,
                  clientId: linkClient,
                  contactId: linkContact,
                  revision:
                    sites.find((site) => site.id === linkSite)
                      ?.link_revision || 0,
                })
              }
            >
              고객 구분 저장
            </button>
          </details>

          {!siteId && (
            <>
              {realClient && (
                <details>
                  <summary>선택 범위 일괄 입금 · 전액입금</summary>

                  <p>
                    {realClient.name} · 현재 담당자·검색 조건에 맞는 완료
                    현장에 배분합니다. 오래된 현장부터 제안하며 저장 전
                    수정할 수 있습니다.
                  </p>

                  <label>
                    이번 입금액
                    <input
                      type="number"
                      disabled={blocked}
                      value={amount}
                      onChange={(event) => {
                        setAmount(event.target.value);
                        setAlloc(null);
                      }}
                    />
                  </label>

                  <button
                    disabled={blocked}
                    onClick={() => preview(false)}
                  >
                    배분표 보기
                  </button>

                  <button
                    disabled={blocked}
                    onClick={() => preview(true)}
                  >
                    선택 범위 전액입금
                  </button>

                  {alloc && (
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();

                        const lines = alloc.filter(
                          (item) => Number(item.amount) > 0
                        );

                        if (
                          !ready ||
                          alloc.some(
                            (item) =>
                              !/^\d+$/.test(item.amount) ||
                              Number(item.amount) > item.max
                          ) ||
                          lines.reduce(
                            (sum, item) => sum + Number(item.amount),
                            0
                          ) !== Number(amount)
                        ) {
                          setError(
                            "배분액과 입금액 합계, 입금 확인을 확인해주세요."
                          );
                          return;
                        }

                        save("pay", {
                          clientId: client,
                          contactScope: contact,
                          amount: Number(amount),
                          paidOn,
                          allocations: lines.map((item) => ({
                            siteId: item.siteId,
                            revision: item.revision,
                            contractAmount: item.contractAmount,
                            amount: Number(item.amount),
                          })),
                        });
                      }}
                    >
                      {alloc.map((item, index) => (
                        <label key={item.siteId}>
                          {item.name} · 미수 {won(item.max)}
                          <input
                            type="number"
                            min="0"
                            max={item.max}
                            step="1"
                            required
                            disabled={blocked}
                            value={item.amount}
                            onChange={(event) => {
                              setAlloc((rows) =>
                                rows.map((row, rowIndex) =>
                                  rowIndex === index
                                    ? { ...row, amount: event.target.value }
                                    : row
                                )
                              );
                              setReady(false);
                            }}
                          />
                        </label>
                      ))}

                      <p>
                        배분 합계{" "}
                        {won(
                          alloc.reduce(
                            (sum, item) => sum + Number(item.amount),
                            0
                          )
                        )}{" "}
                        / 입금 {won(amount)}
                      </p>

                      <label>
                        실제 입금일
                        <input
                          required
                          type="date"
                          max={koreanDay()}
                          disabled={blocked}
                          value={paidOn}
                          onChange={(event) => setPaidOn(event.target.value)}
                        />
                      </label>

                      <label>
                        <input
                          type="checkbox"
                          required
                          disabled={blocked}
                          checked={ready}
                          onChange={(event) => setReady(event.target.checked)}
                        />{" "}
                        입금과 배분 내용을 확인했습니다.
                      </label>

                      <button disabled={blocked}>일괄 입금 저장</button>
                    </form>
                  )}
                </details>
              )}

              <details>
                <summary>거래처 일괄 입금 내역 (최근 100건)</summary>

                {data.batches
                  .filter(
                    (batch) => !realClient || batch.client_id === client
                  )
                  .map((batch) => (
                    <p key={batch.id}>
                      {
                        clients.find(
                          (item) => item.id === batch.client_id
                        )?.name
                      }{" "}
                      · {batch.paid_on} · {won(batch.amount)}{" "}
                      {batch.voided_at ? (
                        "취소됨"
                      ) : (
                        <button
                          disabled={blocked}
                          onClick={() => {
                            const reason = prompt(
                              "일괄 입금 기록 취소 사유 (실제 환불은 현장 환불로 처리)"
                            );

                            if (reason?.trim()) {
                              save("void_batch", {
                                batchId: batch.id,
                                reason: reason.trim(),
                              });
                            }
                          }}
                        >
                          배분 전체 취소
                        </button>
                      )}
                    </p>
                  ))}
              </details>

              <div>
                {visible.slice(page * 5, page * 5 + 5).map((site) => (
                  <article key={site.id}>
                    <b>{site.site_name}</b>
                    <small>
                      {site.client_name || "개인 고객"} ·{" "}
                      {site.contact_name || "담당자 미지정"} · {site.status}
                    </small>

                    <p>
                      계약{" "}
                      {site.contract_amount == null
                        ? "미정"
                        : won(site.contract_amount)}{" "}
                      · 입금 {site.confirmed ? won(site.paid) : "미확인"} ·
                      미수금{" "}
                      {site.outstanding == null
                        ? "확인 필요"
                        : won(site.outstanding)}
                    </p>

                    <a href={`/admin?tab=sites&site=${site.id}`}>
                      현장 상세
                    </a>{" "}

                    <button
                      disabled={blocked}
                      onClick={() =>
                        setPaymentSite(
                          paymentSite === site.id ? "" : site.id
                        )
                      }
                    >
                      입금 확인·처리
                    </button>

                    {paymentSite === site.id && (
                      <SitePaymentQuick
                        key={site.id}
                        siteId={site.id}
                        onChanged={load}
                      />
                    )}
                  </article>
                ))}
              </div>

              <nav>
                <button
                  disabled={page === 0}
                  onClick={() => setPage((value) => value - 1)}
                >
                  이전
                </button>
                {page + 1} / {Math.max(1, Math.ceil(visible.length / 5))}
                <button
                  disabled={(page + 1) * 5 >= visible.length}
                  onClick={() => setPage((value) => value + 1)}
                >
                  다음
                </button>
              </nav>
            </>
          )}
        </>
      )}

      <style jsx>{`
        .trade {
          padding: 14px;
          border: 1px solid #dfd4c4;
          border-radius: 14px;
          background: #fffdfa;
          margin: 12px 0;
          color: #243648;
          overflow-wrap: anywhere;
        }
        header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }
        h3 {
          font-size: 18px;
          margin: 0;
        }
        button,
        input,
        select {
          font-size: 14px;
          padding: 10px;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          min-height: 44px;
          background: white;
          color: #243648;
          box-sizing: border-box;
          max-width: 100%;
        }
        button {
          margin: 4px;
          cursor: pointer;
        }
        button:disabled {
          opacity: 0.5;
        }
        label {
          display: block;
          margin: 8px 0;
          font-size: 13px;
        }
        input:not([type="checkbox"]),
        select {
          display: block;
          width: 100%;
          margin: 4px 0;
        }
        input[type="checkbox"] {
          min-height: 0;
        }
        p {
          font-size: 13px;
          line-height: 1.6;
        }
        small {
          display: block;
          color: #64748b;
          font-size: 12px;
        }
        summary {
          padding: 12px 0;
          cursor: pointer;
          font-weight: 700;
          font-size: 14px;
        }
        article {
          border-top: 1px solid #e5e7eb;
          padding: 12px 0;
        }
        nav {
          display: flex;
          gap: 12px;
          align-items: center;
          justify-content: center;
        }
        .grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }
        [role="alert"] {
          color: #b91c1c;
        }
        a {
          color: #315c91;
        }
        :global(.trade-summary) {
          padding: 10px;
          background: #f1f5f9;
          border-radius: 10px;
          margin: 8px 0;
          font-size: 14px;
        }
      `}</style>
    </section>
  );
            }
