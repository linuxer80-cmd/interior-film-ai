"use client";

import { useEffect, useId, useState } from "react";
import FilmSampleImage from "./FilmSampleImage";

// The parent owns product fields; quantity, price and memo are never replaced.
export default function MaterialFilmPicker({ value, onChange, disabled = false }) {
  const inputId = useId();
  const [results, setResults] = useState({ query: "", products: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [chosen, setChosen] = useState(null);
  const [open, setOpen] = useState(false);
  const query = String(value.product_code || "").trim();

  useEffect(() => {
    setError("");
    setLoading(false);
    if (!open || disabled || query.length < 2) return;
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/film-catalog-search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal, cache: "no-store",
        });
        const data = await response.json();
        if (!response.ok) throw Error(data.error || "샘플 검색에 실패했습니다.");
        if (!controller.signal.aborted) setResults({ query, products: Array.isArray(data.products) ? data.products : [] });
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause.message || "샘플 검색에 실패했습니다.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, open, disabled, retry]);

  const products = results.query === query ? results.products : [];
  const selected = chosen && value.film_product_id === chosen.id ? chosen : null;
  const control = { width: "100%", boxSizing: "border-box", padding: 12, border: "1px solid #cbd5e1", borderRadius: 10, background: "#fff", color: "#111827", fontSize: 16 };

  return <div style={{ minWidth: 0 }}>
    <label htmlFor={inputId} style={{ display: "block", fontWeight: 700, marginBottom: 7 }}>제품번호 · 샘플 검색</label>
    <input id={inputId} style={control} disabled={disabled} value={value.product_code || ""}
      placeholder="예: S115, 115, PX449" maxLength={60} autoComplete="off"
      onFocus={() => setOpen(true)}
      onChange={event => {
        setChosen(null); setOpen(true); setResults({ query: "", products: [] });
        onChange({ product_code: event.target.value, film_product_id: null, brand: "", product_name: "" });
      }} />
    <small style={{ display: "block", marginTop: 6, color: "#64748b" }}>두 글자 이상 입력하고 샘플을 선택하세요. 브랜드·제품명이 자동 입력됩니다.</small>
    {open && query.length >= 2 && <div style={{ marginTop: 10 }}>
      {loading && <p role="status">샘플 검색 중…</p>}
      {error && <div role="alert">{error} <button type="button" disabled={disabled} onClick={() => setRetry(n => n + 1)}>다시 검색</button></div>}
      {!loading && !error && results.query === query && products.length === 0 && <p role="status">일치하는 제품이 없습니다. 제품번호를 확인해주세요.</p>}
      {!loading && !error && products.length > 0 && <div aria-label="필름 샘플 검색 결과" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10, maxHeight: 380, overflowY: "auto", padding: 2 }}>
        {products.map(product => <button key={product.id} type="button" disabled={disabled}
          aria-label={`${product.brand} ${product.product_code} ${product.product_name || ""} 선택`}
          onClick={() => {
            const prefix = /^[GF][A-Z]/i.test(query) ? query[0].toUpperCase() : "";
            onChange({ film_product_id: product.id, brand: product.brand, product_code: prefix + product.product_code, product_name: product.product_name || "" });
            setChosen(product); setOpen(false);
          }}
          style={{ border: "1px solid #cbd5e1", borderRadius: 12, padding: 10, background: "#fff", color: "#172b3a", textAlign: "left", minWidth: 0, cursor: "pointer" }}>
          <FilmSampleImage product={product} size="100%" />
          <small style={{ display: "block", marginTop: 7 }}>{product.brand}</small>
          <strong style={{ display: "block", fontSize: 16, overflowWrap: "anywhere" }}>{product.product_code}</strong>
          <span style={{ display: "block", fontSize: 12, overflowWrap: "anywhere" }}>{product.product_name}</span>
        </button>)}
      </div>}
    </div>}
    {value.brand && <div role="status" style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, padding: 10, borderRadius: 10, background: "#eaf3ff" }}>
      {selected && <span style={{ width: 64, flexShrink: 0 }}><FilmSampleImage product={selected} /></span>}
      <span style={{ overflowWrap: "anywhere" }}>선택 제품: <strong>{value.brand} · {value.product_code}</strong><br />{value.product_name}</span>
    </div>}
  </div>;
}
