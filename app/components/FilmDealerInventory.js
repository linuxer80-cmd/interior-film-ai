"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { reportRequest } from "../utils/reportClient";
import FilmThumbnail from "../worker/cutting/FilmThumbnail";
const money = n => Number(n || 0).toLocaleString("ko-KR", { maximumFractionDigits: 2 });
const number = n => Number(Number(n || 0).toFixed(3));
const valid = (n, max) => String(n).trim() !== "" && Number.isFinite(Number(n)) && Number(n) >= 0 && Number(n) <= max;
const statuses = { available: "보관 중", on_site: "현장 반출", supplier_returned: "대리점 반납", used_up: "전량 사용" };
const actions = { receive: "입고", issue: "현장 반출", return: "현장 반입", supplier_return: "대리점 반납" };
const types = { non_fire: "비방염", fire: "방염", unspecified: "기존 단가 · 구분 미지정" };
const emptyDealer = { name: "", phone: "", brands: "" };
export default function FilmDealerInventory() {
  const [data, setData] = useState(null), [tab, setTab] = useState("stock");
  const [priceType, setPriceType] = useState("non_fire");
  const [dealerId, setDealerId] = useState(""), [dealer, setDealer] = useState(emptyDealer);
  const [selected, setSelected] = useState(null), [query, setQuery] = useState("");
  const [results, setResults] = useState([]), [searched, setSearched] = useState(false);
  const [price, setPrice] = useState("");
  const [editingProduct, setEditingProduct] = useState(false);
  const [editingSource, setEditingSource] = useState(false);
  const lengthInputs = useRef([]), focusIndex = useRef(null);
  const [lengths, setLengths] = useState([""]);
  const [receiptPending, setReceiptPending] = useState(false);
  const receipt = useRef(null);
  const [location, setLocation] = useState("창고"), [memo, setMemo] = useState("");
  const [filter, setFilter] = useState("available"), [stockQuery, setStockQuery] = useState("");
  const [returnId, setReturnId] = useState(""), [credit, setCredit] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const gate = useRef(false), epoch = useRef(0), searchEpoch = useRef(0), mounted = useRef(false), pending = useRef(null);
  const [draftKey, setDraftKey] = useState("");
  const [draftWarning, setDraftWarning] = useState("");
  const userRef = useRef(undefined), keyRef = useRef(""), draftRef = useRef(null);
  useLayoutEffect(() => {
    if (focusIndex.current !== null && tab === "receive" && selected && !editingProduct) {
      const input = lengthInputs.current[focusIndex.current];
      if (input) { input.focus(); focusIndex.current = null; }
    }
  }, [lengths, selected, editingProduct, tab]);
  function persistDraft() {
    if (!keyRef.current || !draftRef.current) return;
    try {
      sessionStorage.setItem(keyRef.current, JSON.stringify({
        ...draftRef.current, receipt: receipt.current, pending: pending.current
      }));
    } catch { setDraftWarning("이 브라우저에서 임시저장이 차단되었습니다. 화면을 이동하기 전에 입고를 저장해주세요."); }
  }
  useLayoutEffect(() => {
    draftRef.current = { tab, priceType, dealerId, dealer, selected, query,
      price, lengths, location, memo, filter, stockQuery, returnId, credit };
    if (draftKey) persistDraft();
  }, [draftKey, tab, priceType, dealerId, dealer, selected, query, price,
      lengths, location, memo, filter, stockQuery, returnId, credit, receiptPending]);
  async function refresh() {
    const version = ++epoch.current;
    try {
      const result = await reportRequest("/api/film-dealers");
      if (mounted.current && epoch.current === version) { setData(result); setError(""); }
    } catch (e) { if (mounted.current && epoch.current === version) setError(e.message); }
  }
  useEffect(() => {
    mounted.current = true;
    async function connect(userId) {
      if (!mounted.current || userRef.current === userId) return;
      persistDraft();
      userRef.current = userId;
      const version = ++epoch.current;
      searchEpoch.current++;
      keyRef.current = ""; setDraftKey("");
      receipt.current = null; pending.current = null;
      setReceiptPending(false); setData(null); setTab("stock");
      setDealerId(""); setDealer(emptyDealer); setSelected(null); setQuery("");
      setResults([]); setSearched(false); setPriceType("non_fire"); setPrice("");
      setLengths([""]); setLocation("창고"); setMemo(""); setReturnId("");
      setCredit(""); setFilter("available"); setStockQuery(""); setMessage("");
      setError(""); setDraftWarning("");
      if (!userId) { setError("다시 로그인해주세요."); return; }
      try {
        const { data: membership, error: membershipError } = await supabase.rpc("get_my_company");
        if (membershipError) throw membershipError;
        const company = Array.isArray(membership) ? membership[0] : membership;
        if (!company?.company_id || company.role !== "owner" || company.is_active === false)
          throw Error("활성 관리자 계정의 회사 정보를 확인해주세요.");
        const result = await reportRequest("/api/film-dealers");
        if (!mounted.current || version !== epoch.current) return;
        const key = `film-inventory-draft:v1:${userId}:${company.company_id}`;
        let draft = null;
        try { draft = JSON.parse(sessionStorage.getItem(key) || "null"); }
        catch { setDraftWarning("이전 임시저장을 읽지 못했습니다."); }
        if (draft && typeof draft === "object") {
          setTab(["stock","receive","dealers"].includes(draft.tab) ? draft.tab : "receive");
          setPriceType(types[draft.priceType] ? draft.priceType : "non_fire");
          const dealerExists = result.dealers.some(d => d.id === draft.dealerId);
          setDealerId(dealerExists ? draft.dealerId : "");
          setDealer(draft.dealer || emptyDealer);
          setSelected(dealerExists ? draft.selected || null : null);
          setQuery(draft.query || ""); setPrice(draft.price || "");
          setLengths(Array.isArray(draft.lengths) && draft.lengths.length > 0 && draft.lengths.length <= 50 ? draft.lengths.map(String) : [""]);
          setLocation(draft.location ?? "창고"); setMemo(draft.memo || "");
          setFilter(draft.filter || "available"); setStockQuery(draft.stockQuery || "");
          setReturnId(draft.returnId || ""); setCredit(draft.credit || "");
          pending.current = draft.pending || null;
          if (draft.receipt && Array.isArray(draft.receipt.jobs) &&
              draft.receipt.jobs.length <= 50 && Number.isInteger(draft.receipt.index) &&
              draft.receipt.index >= 0 && draft.receipt.index <= draft.receipt.jobs.length) {
            receipt.current = draft.receipt; setReceiptPending(true); setTab("receive");
            setMessage("진행 중이던 입고가 있습니다. 아래 버튼으로 결과를 확인하고 이어서 저장해주세요.");
          } else setMessage("이전에 입력하던 내용을 복원했습니다.");
        }
        keyRef.current = key; setDraftKey(key); setData(result);
      } catch (e) {
        if (mounted.current && version === epoch.current) {
          setError(e.message); userRef.current = undefined;
        }
      }
    }
    const { data: auth } = supabase.auth.onAuthStateChange((event, session) => {
      if (["INITIAL_SESSION", "SIGNED_IN", "SIGNED_OUT", "USER_UPDATED"].includes(event)) {
        const id = session?.user?.id || null;
        setTimeout(() => { if (mounted.current) connect(id); }, 0);
      }
    });
    supabase.auth.getSession().then(({ data: authData, error: authError }) => {
      if (!mounted.current) return;
      if (authError) setError(authError.message);
      else connect(authData.session?.user?.id || null);
    });
    const flush = () => persistDraft();
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flush);
    return () => {
      persistDraft(); mounted.current = false; userRef.current = undefined;
      epoch.current++; searchEpoch.current++; auth.subscription.unsubscribe();
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", flush);
    };
  }, []);
  const prices = (data?.prices || []).filter(p => p.dealer_id === dealerId && p.price_type === priceType);
  const savedPrice = prices.find(p => p.product_id === selected?.id);
  const purchases = new Map((data?.purchases || []).map(p => [p.roll_id, p]));
  const allRolls = data?.stock?.rolls || [];
  const stored = allRolls.filter(r => r.status === "available");
  const inventoryValue = stored.reduce((sum, r) => sum + Number(r.remaining) * Number(purchases.get(r.id)?.unit_price || 0), 0);
  const unknown = stored.filter(r => !purchases.has(r.id)).length;
  const q = stockQuery.trim().toUpperCase();
  const rolls = allRolls.filter(r => (filter === "all" || r.status === filter) &&
    `${r.brand} ${r.product_code} ${r.label} ${r.supplier} ${r.location} ${purchases.get(r.id)?.product_name || ""}`.toUpperCase().includes(q));
  const grouped = new Map();
  stored.forEach(r => { const key = `${r.brand} / ${r.product_code}`; const old = grouped.get(key) || { metres: 0, rolls: 0 };
    grouped.set(key, { metres: old.metres + Number(r.remaining), rolls: old.rolls + 1 }); });
  function chooseDealer(value) {
    searchEpoch.current++; setDealerId(value); setSelected(null); setQuery(""); setResults([]); setSearched(false); setPrice("");
  }
  function chooseProduct(p) {
    searchEpoch.current++; setResults([]); setSearched(false); setEditingProduct(false); setEditingSource(false); focusIndex.current = 0;
    setSelected(p); setPrice(String(prices.find(x => x.product_id === p.id)?.unit_price ?? ""));
  }
  async function search() {
    const version = ++searchEpoch.current, authVersion = epoch.current;
    setError(""); setSearched(false);
    try {
      const result = await reportRequest("/api/film-dealers", { action: "search", query });
      if (mounted.current && searchEpoch.current === version && epoch.current === authVersion) { setResults(result.products); setSearched(true); }
    } catch (e) { if (mounted.current && searchEpoch.current === version && epoch.current === authVersion) setError(e.message); }
  }
  async function save(action, fields) {
    if (gate.current) return;
    const body = { action, ...fields }, signature = JSON.stringify(body);
    if (pending.current?.signature !== signature) pending.current = { signature, id: crypto.randomUUID() };
    persistDraft();
    gate.current = true; setBusy(true); setError(""); setMessage("");
    const version = ++epoch.current;
    try {
      const result = await reportRequest("/api/film-dealers", { ...body, requestId: pending.current.id });
      if (!mounted.current || version !== epoch.current) return;
      setData(result); pending.current = null; persistDraft(); setMessage("저장되었습니다.");
      if (action === "dealer") setDealer(emptyDealer);
      if (action === "receive") { setMemo(""); setTab("stock"); }
      if (action === "supplier_return") setReturnId("");
    } catch (e) { if (mounted.current && version === epoch.current) setError(e.message); }
    finally { gate.current = false; if (mounted.current) setBusy(false); }
  }
  const totalLength = lengths.reduce((sum, value) => sum + (Number(value) || 0), 0);
  const lengthsValid = lengths.length > 0 && lengths.length <= 50 && lengths.every(value => valid(value, 1000000) && Number(value) > 0);
  async function receiveRolls() {
    if (gate.current) return;
    if (!receipt.current) {
      if (!savedPrice || !selected || !lengthsValid) return;
      if (!confirm(`${types[priceType]} ${lengths.length}롤, 총 ${number(totalLength)}m를 입고할까요?`)) return;
      receipt.current = { index: 0, jobs: lengths.map(length => ({
        action: "receive", requestId: crypto.randomUUID(), dealerId,
        productId: selected.id, priceType, priceRevision: savedPrice.revision,
        length, count: 1, location, memo
      })) };
    }
    persistDraft();
    const batch = receipt.current;
    gate.current = true; setBusy(true); setReceiptPending(true); setError("");
    const version = ++epoch.current;
    try {
      while (batch.index < batch.jobs.length) {
        if (!mounted.current || version !== epoch.current) return;
        const result = await reportRequest("/api/film-dealers", batch.jobs[batch.index]);
        if (!mounted.current || version !== epoch.current) return;
        batch.index++; persistDraft(); setData(result);
        setMessage(`${batch.jobs.length}롤 중 ${batch.index}롤 입고 확인`);
      }
      receipt.current = null;
      draftRef.current = { ...draftRef.current, lengths: [""], memo: "" }; persistDraft();
      setReceiptPending(false); setLengths([""]); setMemo("");
      setMessage(`${batch.jobs.length}롤 입고가 완료되었습니다. 다음 롤을 입력할 수 있습니다.`);
    } catch (e) {
      if (mounted.current && version === epoch.current) {
        setError(`${batch.index}롤까지 입고 확인했습니다. ${e.message} 아래 버튼으로 나머지 입고를 다시 확인해주세요.`);
      }
    } finally { gate.current = false; if (mounted.current) setBusy(false); }
  }
  const returnRoll = allRolls.find(r => r.id === returnId);
  const returnPurchase = purchases.get(returnId);
  return <section className="inventory">
    <header><h1>필름 재고</h1><button disabled={busy || receiptPending} onClick={refresh}>새로고침</button></header>
    <p>우리 업체의 대리점·공급가·롤 재고를 관리합니다. 공급가는 관리자만 확인합니다.</p>
    <nav>{[["stock", "재고 현황"], ["receive", "입고 등록"], ["dealers", "대리점 관리"]].map(([key, title]) =>
      <button key={key} aria-pressed={tab === key} disabled={busy || receiptPending} onClick={() => { setTab(key); setReturnId(""); }}>{title}</button>)}</nav>
    {error && <p role="alert" className="error">{error}</p>}{message && <p role="status" className="success">{message}</p>}
    {draftKey && <p>입력 내용은 이 브라우저 탭에 자동 임시저장됩니다.</p>}
    {draftWarning && <p role="alert" className="error">{draftWarning}</p>}
    {!data && !error && <p>불러오는 중…</p>}
    {data && <fieldset disabled={busy || receiptPending}>
      {tab === "dealers" && <article>
        <h2>{dealer.dealerId ? "대리점 수정" : "대리점 등록"}</h2>
        {[["name", "대리점 이름"], ["phone", "연락처"], ["brands", "취급 브랜드 (예: 영림, 현대보닥)"]].map(([key, title]) =>
          <label key={key}>{title}<input value={dealer[key]} maxLength={key === "brands" ? 200 : 100} onChange={e => setDealer(d => ({ ...d, [key]: e.target.value }))} /></label>)}
        <button disabled={!dealer.name.trim()} onClick={() => save("dealer", dealer)}>대리점 저장</button>
        {dealer.dealerId && <button onClick={() => setDealer(emptyDealer)}>수정 취소</button>}
        {data.dealers.map(d => <p key={d.id}><strong>{d.name}</strong> · {d.phone || "연락처 미등록"} · {d.brands}
          <button onClick={() => { setDealer({ dealerId: d.id, revision: d.revision, name: d.name, phone: d.phone, brands: d.brands }); chooseDealer(d.id); }}>수정</button></p>)}
      </article>}
      {(tab === "receive" || tab === "dealers") && <article>
        <h2>{tab === "receive" ? "필름 입고" : "대리점 제품별 공급가"}</h2>
        {dealerId && !editingSource ? <div className="source-summary">
          <strong>{data.dealers.find(d => d.id === dealerId)?.name} · {types[priceType]}</strong>
          <button onClick={() => setEditingSource(true)}>변경</button>
        </div> : <div className="source-fields">
          <label>대리점<select value={dealerId} onChange={e => chooseDealer(e.target.value)}>
            <option value="">선택</option>{data.dealers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select></label>
          <label>방염 구분<select value={priceType} onChange={e => {
            searchEpoch.current++; setPriceType(e.target.value); setSelected(null); setPrice(""); setResults([]); setSearched(false);
          }}>{Object.entries(types).map(([key, title]) => <option key={key} value={key}>{title}</option>)}</select></label>
          {editingSource && <button onClick={() => setEditingSource(false)}>확인</button>}
        </div>}
        {!data.dealers.length && <p>대리점 관리에서 대리점을 먼저 등록해주세요.</p>}
        {dealerId && <>
          {(!selected || editingProduct) && <div className="search-box">
            <label>제품번호 또는 제품명<input value={query} maxLength={80} placeholder="예: PS170"
              onChange={e => { searchEpoch.current++; setQuery(e.target.value); setResults([]); setSearched(false); }} /></label>
            {query.trim() && <>
              <div className="products">{(() => {
                const candidates = new Map();
                prices.filter(p => `${p.brand} ${p.product_code} ${p.product_name || ""}`.toUpperCase().includes(query.trim().toUpperCase()))
                  .forEach(p => candidates.set(p.product_id, { ...p, id: p.product_id }));
                if (searched) results.forEach(p => { if (!candidates.has(p.id)) candidates.set(p.id, p); });
                const list = [...candidates.values()];
                return <>{list.slice(0, 20).map(p => <button key={p.id} disabled={p.is_active === false} onClick={() => chooseProduct(p)}>
                  <FilmThumbnail material={{ ...p, film_product_id: p.id }} size={36} />
                  <span><strong>{p.brand} / {p.product_code}</strong><small>{p.product_name}
                    {prices.find(x => x.product_id === p.id) ? ` · ${money(prices.find(x => x.product_id === p.id).unit_price)}원/m` : " · 공급가 미등록"}</small></span>
                </button>)}
                {!list.length && <p>{searched ? "일치하는 제품이 없습니다." : "등록 제품에 없습니다. 전체 검색을 이용해주세요."}</p>}
                {list.length > 20 && <small>20개까지 표시합니다. 제품번호를 더 입력해주세요.</small>}</>;
              })()}</div>
              <button onClick={search}>전체 제품에서 더 찾기</button>
            </>}
            {selected && <button onClick={() => setEditingProduct(false)}>제품 변경 취소</button>}
          </div>}
          {selected && !editingProduct && <>
            <div className="product-summary">
              <FilmThumbnail material={{ ...selected, film_product_id: selected.id }} size={42} />
              <div><strong>{selected.brand} / {selected.product_code}</strong>
                <small>{selected.product_name}</small>
                <small>{savedPrice ? `${money(savedPrice.unit_price)}원/m` : "공급가 미등록"}</small></div>
              <button onClick={() => { setEditingProduct(true); setQuery(""); setResults([]); setSearched(false); }}>제품 변경</button>
            </div>
            {tab === "dealers" ? <>
              <label>1m당 공급가 (원)<input type="number" min="0" step="any" value={price} onChange={e => setPrice(e.target.value)} /></label>
              <button disabled={!valid(price, 10000000)} onClick={() => save("price", { dealerId, productId: selected.id, priceType, unitPrice: price, priceRevision: savedPrice?.revision || 0 })}>제품·공급가 저장</button>
            </> : savedPrice ? <>
              {lengths.map((value, index) => <div className="roll-row" key={index}>
                <label htmlFor={`roll-length-${index}`}>{index + 1}번 롤</label>
                <input id={`roll-length-${index}`} ref={node => { lengthInputs.current[index] = node; }}
                  type="number" inputMode="decimal" min="0.001" step="any" placeholder="길이" value={value}
                  onChange={e => setLengths(rows => rows.map((old, i) => i === index ? e.target.value : old))} />
                <span>m</span><button aria-label={`${index + 1}번 롤 삭제`} disabled={lengths.length === 1}
                  onClick={() => setLengths(rows => rows.filter((_, i) => i !== index))}>삭제</button>
              </div>)}
              <button className="add-roll" disabled={lengths.length >= 50} onClick={() => {
                focusIndex.current = lengths.length; setLengths(rows => [...rows, ""]);
              }}>＋ 롤 추가</button>
              <details className="extra"><summary>추가 정보 · {location || "보관 위치"}{memo ? " · 메모 있음" : ""}</summary>
                <label>보관 위치<input value={location} maxLength={100} onChange={e => setLocation(e.target.value)} /></label>
                <label>메모<input value={memo} maxLength={1000} placeholder="기존 보유분이면 시작 재고" onChange={e => setMemo(e.target.value)} /></label>
              </details>
            </> : <p>공급가를 먼저 등록해주세요. <button onClick={() => setTab("dealers")}>공급가 등록하기</button></p>}
          </>}
        </>}
      </article>}
      {tab === "stock" && <>
        <article><h2>보관 중 {stored.length}롤 · {number(stored.reduce((s, r) => s + Number(r.remaining), 0))}m</h2>
          <p>단가 등록분 재고금액 <strong>{money(inventoryValue)}원</strong></p>
          {!!unknown && <p>기존 재고 {unknown}롤은 입고단가 미등록으로 금액 합계에서 제외됩니다.</p>}
          <p>현장 반출 중 {allRolls.filter(r => r.status === "on_site").length}롤 · 실제 잔량은 반입 시 확정</p>
          {[...grouped].map(([key, g]) => <p key={key}>{key} · {number(g.metres)}m · {g.rolls}롤</p>)}
        </article>
        <label>제품·롤·대리점·보관 위치 검색<input value={stockQuery} onChange={e => setStockQuery(e.target.value)} /></label>
        <select aria-label="재고 상태" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">전체</option>{Object.entries(statuses).map(([key, title]) => <option key={key} value={key}>{title}</option>)}</select>
        {!rolls.length && <p>해당 재고가 없습니다.</p>}
        {rolls.map(r => { const p = purchases.get(r.id); return <article key={r.id}>
          <header><FilmThumbnail material={{ ...r, film_product_id: p?.product_id }} size={60} /><h2>{r.brand} / {r.product_code}</h2><strong>{r.remaining}m</strong></header>
          <p>{p?.product_name} · {statuses[r.status]}</p><small>롤 번호: {r.label}</small>
          <p>입고처 {r.supplier} · {r.status === "on_site" ? r.site_name || "현장" : r.location}</p>
          {p ? <p>{types[p.price_type] || "구분 미지정"} · 입고단가 {money(p.unit_price)}원/m {r.status === "available" && `· 잔량금액 ${money(Number(r.remaining) * Number(p.unit_price))}원`}
            {r.status === "supplier_returned" && `· 반납 정산 ${p.return_credit == null ? "미입력" : `${money(p.return_credit)}원`}`}</p> : <p>기존 재고 · 입고단가 미등록</p>}
          {r.status === "available" && <button onClick={() => { setReturnId(r.id); setCredit(p ? String(Number(r.remaining) * Number(p.unit_price)) : ""); }}>남은 롤 전체를 대리점에 반납</button>}
          {returnId === r.id && returnRoll && <div className="selected"><p>{r.supplier}에 {r.remaining}m 롤 전체 반납</p>
            {returnPurchase && <label>반납 정산금액 (원, 수정 가능·공란이면 미확정)<input type="number" min="0" step="any" value={credit} onChange={e => setCredit(e.target.value)} /></label>}
            <button disabled={credit !== "" && !valid(credit, 1000000000000)} onClick={() => { if (confirm("남은 롤 전체를 반납 처리할까요?")) save("supplier_return", { rollId: r.id, revision: r.revision, credit }); }}>반납 확정</button>
            <button onClick={() => setReturnId("")}>취소</button></div>}
        </article>; })}
        <details><summary>최근 입출고 이력 (최대 100건)</summary>{data.stock.events.map(e => <p key={e.id}>{new Date(e.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} · {e.product_code} · {actions[e.action]} · {e.after_qty}m · {e.memo || ""}</p>)}</details>
      </>}
    </fieldset>}
    {data && tab === "receive" && selected && savedPrice && !editingProduct && !receiptPending && <div className="save-bar">
      <div><strong>총 {lengths.length}롤 · {number(totalLength)}m</strong><small>{money(totalLength * Number(savedPrice.unit_price))}원</small></div>
      <button disabled={busy || !lengthsValid} onClick={receiveRolls}>{busy ? "저장 중…" : "입고 저장"}</button>
    </div>}
    {receiptPending && <p role="status">입고가 진행 중이거나 결과 확인이 필요합니다. 이 화면에서 이어서 처리해주세요.
      <button disabled={busy} onClick={receiveRolls}>{busy ? "입고 처리 중…" : "남은 입고 확인 · 다시 시도"}</button></p>}
    <style jsx>{`
      .inventory{padding-bottom:120px;color:#243648;margin-top:20px;overflow-wrap:anywhere}header,nav{display:flex;align-items:center;gap:10px;justify-content:space-between}nav{justify-content:flex-start;flex-wrap:wrap}h1{font-size:25px}h2{font-size:18px}p{font-size:14px;line-height:1.7}fieldset{border:0;padding:0;min-width:0}article{background:#fffdfa;border:1px solid #dfd4c4;border-radius:18px;padding:18px;margin:16px 0}label{display:block;font-size:14px;margin:12px 0}input,select{display:block;box-sizing:border-box;width:100%;padding:12px;border:1px solid #cbd5e1;border-radius:10px;font-size:16px;background:white;margin-top:6px}button{cursor:pointer;padding:11px;border:1px solid #cbd5e1;border-radius:10px;background:#edf5ff;color:#243648;font-weight:700;margin:4px}button[aria-pressed=true]{background:#243648;color:white}button:disabled{opacity:.5;cursor:default}.products{max-height:320px;overflow:auto}.products button{display:flex;align-items:center;gap:8px;width:calc(100% - 8px);text-align:left}.selected{padding:14px;background:#f3f6f9;border-radius:12px;margin-top:14px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.error{color:#b91c1c}.success{color:#166534}small{font-size:11px}summary{cursor:pointer;font-weight:700}
      .source-summary,.product-summary{display:flex;align-items:center;gap:8px;justify-content:space-between;margin:8px 0 14px}
      .source-summary{padding:8px 10px;background:#f5f1e9;border-radius:10px;font-size:14px}
      .source-fields{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .product-summary{padding:10px 0;border-bottom:1px solid #e5e7eb}
      .product-summary>div{flex:1;min-width:0}.product-summary strong{font-size:14px}
      .product-summary button{white-space:nowrap;font-size:12px;padding:8px}
      .product-summary small,.products small,.save-bar small{display:block;font-size:12px;color:#64748b;margin-top:3px}
      .roll-row{display:grid;grid-template-columns:58px minmax(0,1fr) 18px 52px;align-items:center;gap:6px;margin:10px 0}
      .roll-row input{margin:0}.roll-row label{margin:0}.roll-row button{padding:9px 4px;margin:0}
      .add-roll{width:100%;margin:8px 0}.extra{margin-top:16px;padding-top:12px;border-top:1px solid #e5e7eb}
      .save-bar{position:fixed;bottom:12px;left:12px;right:12px;max-width:660px;margin:auto;z-index:30;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 16px;padding-bottom:calc(12px + env(safe-area-inset-bottom));background:#fffdfa;border:1px solid #dfd4c4;border-radius:16px;box-shadow:0 4px 22px #0002}
      .save-bar button{background:#243648;color:white;min-width:110px}.save-bar strong{font-size:15px}
    `}</style>
  </section>;
}
