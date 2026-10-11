"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { reportRequest } from "../../utils/reportClient";

const metres = n => Number(Number(n || 0).toFixed(3));

const normalize = s =>
  String(s || "").replace(/\s/g, "").toUpperCase();

const brandName = s =>
  ["영림", "영림인테리어필름"].includes(normalize(s))
    ? "영림"
    : ["현대", "현대보닥"].includes(normalize(s))
      ? "현대보닥"
      : s || "브랜드 미등록";

export default function WorkerInventoryPage() {
  const [data, setData] = useState(null);
  const [company, setCompany] = useState("");
  const [brand, setBrand] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const version = useRef(0);

  useEffect(() => {
    const current = ++version.current;

    setBusy(true);
    setError("");
    setData(null);

    reportRequest(
      `/api/worker-stock${
        company
          ? `?companyId=${encodeURIComponent(company)}`
          : ""
      }`
    )
      .then(result => {
        if (version.current === current) setData(result);
      })
      .catch(e => {
        if (version.current === current) setError(e.message);
      })
      .finally(() => {
        if (version.current === current) setBusy(false);
      });

    return () => {
      version.current++;
    };
  }, [company, reload]);

  const rolls = data?.rolls || [];

  const brands = [
    ...new Set(rolls.map(r => brandName(r.brand))),
  ].sort((a, b) => a.localeCompare(b, "ko"));

  const filtered = rolls.filter(r =>
    (!brand || brandName(r.brand) === brand) &&
    normalize(
      `${r.brand} ${brandName(r.brand)} ${r.product_code} ${r.location || ""}`
    ).includes(normalize(query))
  );

  const grouped = new Map();

  filtered.forEach(r => {
    const key = JSON.stringify([r.brand, r.product_code]);

    if (!grouped.has(key)) {
      grouped.set(key, {
        key,
        brand: r.brand,
        code: r.product_code,
        rolls: [],
        length: 0,
      });
    }

    const group = grouped.get(key);
    group.rolls.push(r);
    group.length += Number(r.remaining);
  });

  const groups = [...grouped.values()].sort((a, b) =>
    brandName(a.brand).localeCompare(brandName(b.brand), "ko") ||
    String(a.code).localeCompare(String(b.code), "ko", {
      numeric: true,
    })
  );

  const pages = Math.max(1, Math.ceil(groups.length / 5));
  const currentPage = Math.min(page, pages);

  return (
    <main>
      <header>
        <Link href="/worker">← 시공자 홈</Link>
        <button
          disabled={busy}
          onClick={() => setReload(n => n + 1)}
        >
          새로고침
        </button>
      </header>

      <h1>재고 확인</h1>
      <p>
        창고에서 가져갈 수 있는 롤을 확인하세요.
        반출·반납은 내 현장에서 처리합니다.
      </p>

      {busy && <p role="status">재고 확인 중…</p>}
      {error && <p role="alert" className="error">{error}</p>}

      {data && (
        <>
          <label>
            소속 업체
            <select
              value={data.companyId}
              onChange={e => {
                setCompany(e.target.value);
                setBrand("");
                setQuery("");
                setPage(1);
              }}
            >
              {data.companies.map(c => (
                <option key={c.id} value={c.id}>
                  {c.company_name || "소속 업체"}
                </option>
              ))}
            </select>
          </label>

          <section className="stats">
            <span>전체 창고 재고</span>
            <strong>
              {metres(
                rolls.reduce((sum, r) => sum + Number(r.remaining), 0)
              )}m
            </strong>
            <span>{rolls.length}롤</span>
          </section>

          <label>
            제품번호 · 보관 위치 검색
            <input
              type="search"
              value={query}
              placeholder="예: S140, 창고"
              onChange={e => {
                setQuery(e.target.value);
                setPage(1);
              }}
            />
          </label>

          <nav aria-label="브랜드 선택">
            {["", ...brands].map(b => (
              <button
                key={b}
                aria-pressed={brand === b}
                onClick={() => {
                  setBrand(b);
                  setPage(1);
                }}
              >
                {b || "전체"}
              </button>
            ))}
          </nav>

          <p role="status">
            검색 결과 {groups.length}품목 · {filtered.length}롤 ·{" "}
            {metres(
              filtered.reduce((sum, r) => sum + Number(r.remaining), 0)
            )}m
          </p>

          {!groups.length && (
            <p>조건에 맞는 창고 재고가 없습니다.</p>
          )}

          {groups
            .slice((currentPage - 1) * 5, currentPage * 5)
            .map(group => (
              <details key={`${data.companyId}:${group.key}`}>
                <summary>
                  <div>
                    <small>{brandName(group.brand)}</small>
                    <strong>{group.code}</strong>
                    <small>
                      {group.rolls.length}롤 · 상세 보기 ▾
                    </small>
                  </div>
                  <b>{metres(group.length)}m</b>
                </summary>

                {group.rolls.map((roll, index) => (
                  <div className="roll" key={roll.id}>
                    <span>
                      {index + 1}번 롤 ·{" "}
                      {roll.location || "위치 미등록"}
                    </span>
                    <strong>{metres(roll.remaining)}m</strong>
                  </div>
                ))}
              </details>
            ))}

          {groups.length > 0 && (
            <footer>
              <button
                disabled={currentPage <= 1}
                onClick={() => setPage(currentPage - 1)}
              >
                이전
              </button>
              <span>{currentPage} / {pages}</span>
              <button
                disabled={currentPage >= pages}
                onClick={() => setPage(currentPage + 1)}
              >
                다음
              </button>
            </footer>
          )}

          <Link className="sites" href="/worker/menu/sites">
            내 현장에서 반출·반납하기 →
          </Link>
        </>
      )}

      <style jsx>{`
        main {
          max-width: 720px;
          margin: auto;
          padding: 24px 18px 100px;
          color: #243648;
          overflow-wrap: anywhere;
        }
        header, footer, .roll {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
        }
        h1 { font-size: 28px; }
        p { font-size: 14px; line-height: 1.7; }
        label {
          display: block;
          font-size: 14px;
          margin: 16px 0;
        }
        input, select {
          width: 100%;
          box-sizing: border-box;
          padding: 14px;
          border: 1px solid #cbd5e1;
          border-radius: 12px;
          background: white;
          font-size: 16px;
          margin-top: 8px;
        }
        button {
          padding: 12px;
          border: 1px solid #cbd5e1;
          border-radius: 12px;
          background: #fff;
          color: #243648;
          cursor: pointer;
          font-weight: 700;
        }
        button[aria-pressed=true] {
          background: #243648;
          color: white;
        }
        button:disabled { opacity: .45; cursor: default; }
        nav { display: flex; flex-wrap: wrap; gap: 8px; }
        .stats {
          background: #edf5ff;
          padding: 20px;
          border-radius: 18px;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 16px;
        }
        .stats strong { font-size: 28px; }
        details {
          margin: 12px 0;
          border: 1px solid #dfd4c4;
          border-radius: 16px;
          background: #fffdfa;
          overflow: hidden;
        }
        summary {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          padding: 18px;
          cursor: pointer;
          list-style: none;
        }
        summary::-webkit-details-marker { display: none; }
        summary strong {
          display: block;
          font-size: 22px;
          margin: 5px 0;
        }
        summary b { font-size: 24px; color: #166534; }
        small {
          display: block;
          color: #64748b;
          font-size: 12px;
        }
        details[open] summary { background: #edf5ff; }
        .roll {
          padding: 14px 18px;
          border-top: 1px solid #e2e8f0;
          font-size: 14px;
        }
        footer { justify-content: center; margin: 20px 0; }
        .error { color: #b91c1c; }
        main :global(.sites) {
          display: block;
          margin-top: 24px;
          padding: 16px;
          background: #243648;
          color: white;
          border-radius: 12px;
          text-align: center;
          text-decoration: none;
        }
      `}</style>
    </main>
  );
      }
