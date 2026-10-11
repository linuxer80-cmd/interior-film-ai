"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { tradeApi } from "../../components/TradeClients";

const won = (value) =>
  `${Number(value || 0).toLocaleString("ko-KR")}원`;

function day(value) {
  if (!value) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  return ["year", "month", "day"]
    .map(
      (key) => parts.find((part) => part.type === key)?.value
    )
    .join("-");
}

function sum(rows) {
  return rows.reduce(
    (total, site) => {
      if (site.contract_amount == null) {
        total.unknownContract++;
      } else if (site.status === "completed") {
        total.sales += Number(site.contract_amount);
      } else {
        total.planned += Number(site.contract_amount);
      }

      if (
        site.confirmed &&
        site.contract_amount != null
      ) {
        total.paid += Number(site.paid || 0);
        total.due += Math.max(
          0,
          Number(site.contract_amount) -
            Number(site.paid || 0)
        );
      } else {
        total.unknown++;
      }

      total.count++;
      return total;
    },
    {
      count: 0,
      sales: 0,
      planned: 0,
      paid: 0,
      due: 0,
      unknown: 0,
      unknownContract: 0,
    }
  );
}

function Summary({ title, rows }) {
  const total = sum(rows);

  return (
    <section>
      <h2>
        {title} · {total.count}건
      </h2>
      <p>
        완료 현장 매출 <strong>{won(total.sales)}</strong>
      </p>
      <p>
        진행·예정 계약 {won(total.planned)} · 확인된 입금{" "}
        {won(total.paid)}
      </p>
      <p>
        확인된 잔액 {won(total.due)} · 입금 확인 필요{" "}
        {total.unknown}건 · 계약금액 미입력{" "}
        {total.unknownContract}건
      </p>
    </section>
  );
}

export default function ClientSalesPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [client, setClient] = useState("");
  const [contact, setContact] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);

  useEffect(() => {
    let live = true;
    setError("");
    setData(null);

    tradeApi()
      .then((result) => {
        if (live) setData(result);
      })
      .catch((err) => {
        if (live) setError(err.message);
      });

    return () => {
      live = false;
    };
  }, [version]);

  useEffect(() => {
    setPage(0);
  }, [client, contact, from, to, query, version]);

  const invalid = from && to && from > to;

  const sites = (data?.sites || []).filter(
    (site) =>
      site.client_id &&
      site.status !== "cancelled" &&
      !invalid &&
      (!from || day(site.schedule_start) >= from) &&
      (!to ||
        (!!day(site.schedule_start) &&
          day(site.schedule_start) <= to))
  );

  const companyRows = sites.filter(
    (site) => !client || site.client_id === client
  );

  const visible = companyRows.filter(
    (site) =>
      !contact ||
      (contact === "none"
        ? !site.contact_id
        : site.contact_id === contact)
  );

  const groups = (data?.clients || [])
    .filter((item) =>
      item.name
        .toLowerCase()
        .includes(query.trim().toLowerCase())
    )
    .map((item) => ({
      ...item,
      total: sum(
        sites.filter((site) => site.client_id === item.id)
      ),
    }));

  return (
    <main>
      <Link href="/admin?tab=profit">← 매출·수익</Link>
      <h1>업체별 매출</h1>

      <p>
        시공 시작일 기준으로 조회합니다. 완료 현장의 계약금액을
        매출로 표시하며 취소 현장은 제외합니다.
        입금·잔액은 선택한 현장의 현재 누적 금액입니다.
        입금일 기준 매출은 아닙니다.
      </p>

      <button onClick={() => setVersion((v) => v + 1)}>
        새로고침
      </button>

      {error && <p role="alert">{error}</p>}
      {!data && !error && <p>불러오는 중…</p>}

      {data && (
        <>
          <div className="grid">
            <label>
              시작일
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>

            <label>
              종료일
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
          </div>

          {invalid && (
            <p role="alert">
              조회 시작일과 종료일을 확인해주세요.
            </p>
          )}

          <label>
            업체
            <select
              value={client}
              onChange={(e) => {
                setClient(e.target.value);
                setContact("");
              }}
            >
              <option value="">전체 업체</option>
              {(data.clients || []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>

          <Summary
            title={
              client
                ? `${
                    data.clients.find(
                      (item) => item.id === client
                    )?.name || "선택 업체"
                  } 전체`
                : "전체 업체"
            }
            rows={companyRows}
          />

          {client ? (
            <>
              <label>
                담당자
                <select
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                >
                  <option value="">담당자 전체</option>
                  <option value="none">담당자 미지정</option>

                  {(data.contacts || [])
                    .filter(
                      (item) => item.client_id === client
                    )
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                </select>
              </label>

              {contact && (
                <Summary
                  title="선택 담당자"
                  rows={visible}
                />
              )}

              {visible
                .slice(page * 5, page * 5 + 5)
                .map((site) => (
                  <section key={site.id}>
                    <strong>
                      {site.site_name ||
                        site.customer_name ||
                        "현장"}
                    </strong>

                    <p>
                      {day(site.schedule_start) ||
                        "일정 미정"}{" "}
                      · {site.contact_name || "담당자 미지정"} ·{" "}
                      {site.status === "completed"
                        ? "완료"
                        : "진행·예정"}
                    </p>

                    <p>
                      계약{" "}
                      {site.contract_amount == null
                        ? "미입력"
                        : won(site.contract_amount)}{" "}
                      · 입금{" "}
                      {site.confirmed
                        ? won(site.paid)
                        : "확인 필요"}
                    </p>

                    <Link
                      href={`/admin?tab=sites&site=${encodeURIComponent(
                        site.id
                      )}`}
                    >
                      현장 보기 →
                    </Link>
                  </section>
                ))}

              {!visible.length && (
                <p>해당 현장이 없습니다.</p>
              )}
            </>
          ) : (
            <>
              <label>
                업체명 검색
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>

              {groups
                .slice(page * 5, page * 5 + 5)
                .map((item) => (
                  <section key={item.id}>
                    <h2>{item.name}</h2>

                    <p>
                      현장 {item.total.count}건 · 완료 매출{" "}
                      {won(item.total.sales)}
                    </p>

                    <p>
                      진행·예정 계약{" "}
                      {won(item.total.planned)} · 확인된 잔액{" "}
                      {won(item.total.due)}
                    </p>

                    <button
                      onClick={() => {
                        setClient(item.id);
                        setContact("");
                      }}
                    >
                      업체 현장·담당자 보기
                    </button>
                  </section>
                ))}

              {!groups.length && (
                <p>등록된 업체가 없습니다.</p>
              )}
            </>
          )}

          <div className="grid">
            <button
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              이전
            </button>

            <button
              disabled={
                (page + 1) * 5 >=
                (client ? visible.length : groups.length)
              }
              onClick={() => setPage((p) => p + 1)}
            >
              다음
            </button>
          </div>

          <p>
            <Link href="/admin/clients">
              업체 관리 · 입금 처리 →
            </Link>
          </p>
        </>
      )}

      <style jsx>{`
        main {
          max-width: 900px;
          margin: auto;
          padding: 20px 16px 50px;
        }
        p {
          line-height: 1.7;
        }
        h2 {
          font-size: 19px;
        }
        section {
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          padding: 16px;
          margin: 16px 0;
          background: white;
        }
        label {
          display: block;
          margin: 12px 0;
        }
        input,
        select {
          display: block;
          width: 100%;
          box-sizing: border-box;
          padding: 12px;
          font-size: 16px;
          border: 1px solid #cbd5e1;
          border-radius: 9px;
          margin-top: 6px;
        }
        button {
          padding: 12px;
          border: 1px solid #cbd5e1;
          border-radius: 10px;
          background: white;
        }
        button:disabled {
          opacity: 0.4;
        }
        .grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }
      `}</style>
    </main>
  );
        }
