"use client";

import { useEffect, useState } from "react";
import SitePaymentQuick, {
  paymentApi,
  paymentWon,
} from "../../components/SitePaymentQuick";

export default function ReceivablesPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("unpaid");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [selected, setSelected] = useState("");

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("siteId");
    if (id) setSelected(id);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    paymentApi({
      completed: "1",
      filter,
      q: search,
      page: String(page),
    })
      .then(result => {
        if (active) {
          setData(result);
          if (page > 0 && !result.items.length) setPage(0);
        }
      })
      .catch(error => {
        if (active) setError(error.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [filter, search, page, refresh]);

  return (
    <main>
      <a href="/admin?tab=profit">‹ 매출·수익</a>
      <h1>미수금 관리</h1>
      <p>
        시공 완료 현장의 입금을 관리합니다.
        전액입금한 현장은 입금완료 내역으로 이동합니다.
      </p>
      <p>
        확인된 미수금{" "}
        <b>{paymentWon(data?.summary?.outstanding)}</b>
        {" · "}기존 입금 확인 필요{" "}
        {data?.summary?.unconfirmed ?? "—"}건
      </p>

      <form onSubmit={event => {
        event.preventDefault();
        setSearch(query);
        setPage(0);
      }}>
        <input
          aria-label="현장 검색"
          placeholder="현장명·고객명"
          value={query}
          onChange={event => setQuery(event.target.value)}
          maxLength={100}
        />
        <button>검색</button>
      </form>

      <nav>
        {[
          ["unpaid", "미수금·확인 필요"],
          ["settled", "입금완료"],
          ["all", "전체 완료 현장"],
        ].map(([id, label]) => (
          <button
            key={id}
            aria-pressed={filter === id}
            onClick={() => {
              setFilter(id);
              setPage(0);
            }}
          >
            {label}
          </button>
        ))}
        <button
          disabled={loading}
          onClick={() => setRefresh(n => n + 1)}
        >
          새로고침
        </button>
      </nav>

      {error && <p role="alert">{error}</p>}

      {loading ? (
        <p>불러오는 중…</p>
      ) : (
        <>
          {!data?.items?.length && <p>해당 현장이 없습니다.</p>}

          {data?.items?.map(site => (
            <article key={site.id}>
              <strong>{site.site_name || "현장"}</strong>
              <p>
                계약 {paymentWon(site.contract_amount)}
                {" · "}입금 {paymentWon(site.paid)}
                <br />
                미수금 <b>{paymentWon(site.outstanding)}</b>
              </p>
              <button onClick={() => setSelected(site.id)}>
                입금 금액 입력 · 전액입금
              </button>
              <a href={`/admin?tab=sites&site=${site.id}`}>
                {" "}현장 보기 ›
              </a>
            </article>
          ))}

          <nav>
            <button
              disabled={page === 0}
              onClick={() => setPage(n => n - 1)}
            >
              이전
            </button>
            <span>
              {page + 1} /{" "}
              {Math.max(1, Math.ceil((data?.count || 0) / 10))}
            </span>
            <button
              disabled={(page + 1) * 10 >= (data?.count || 0)}
              onClick={() => setPage(n => n + 1)}
            >
              다음
            </button>
          </nav>
        </>
      )}

      {selected && (
        <div className="overlay">
          <section
            role="dialog"
            aria-modal="true"
            aria-label="현장 입금 처리"
          >
            <button onClick={() => {
              if (confirm(
                "입금 처리 중이면 완료 후 닫아주세요. 닫을까요?"
              )) setSelected("");
            }}>
              닫기
            </button>
            <SitePaymentQuick
              key={selected}
              siteId={selected}
              onChanged={() => setRefresh(n => n + 1)}
            />
          </section>
        </div>
      )}

      <style jsx>{`
        main {
          max-width: 900px;
          padding: 20px 16px 80px;
          color: #243648;
        }
        h1 { font-size: 24px; }
        p { font-size: 13px; line-height: 1.6; }
        button, input {
          padding: 11px;
          border: 1px solid #cbd5e1;
          border-radius: 9px;
          min-height: 44px;
          background: white;
          color: #243648;
          margin: 4px;
          max-width: 100%;
          box-sizing: border-box;
        }
        button { cursor: pointer; }
        button[aria-pressed="true"] {
          background: #243648;
          color: white;
        }
        button:disabled { opacity: .5; }
        nav {
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
          align-items: center;
          margin: 12px 0;
        }
        article {
          padding: 14px;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          background: #fffdfa;
          margin: 10px 0;
        }
        a { color: #315c91; font-size: 13px; }
        .overlay {
          position: fixed;
          inset: 0;
          background: #0006;
          z-index: 200;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 12px;
        }
        .overlay > section {
          background: white;
          border-radius: 16px;
          max-height: 85dvh;
          overflow: auto;
          width: 100%;
          max-width: 580px;
          padding: 12px;
          box-sizing: border-box;
        }
      `}</style>
    </main>
  );
}
