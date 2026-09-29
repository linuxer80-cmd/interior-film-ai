"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";

const SOURCES = [["work", "시공 데이터"], ["site", "현장 사진"], ["estimate", "자동견적 사진"], ["lead", "상담 사진"]];
const TYPE_LABELS = { before: "시공 전", after: "시공 후", request: "고객 요청", history: "기존 시공", estimate: "자동견적", lead: "상담" };
const buttonStyle = { padding: "10px 14px", border: "1px solid #cbd5e1", borderRadius: 10, background: "white", cursor: "pointer", fontWeight: 700 };
const dateLabel = (value) => value && !Number.isNaN(new Date(value).getTime())
  ? new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" }) : "등록일 없음";

function PhotoImage({ photo, large = false }) {
  const [failed, setFailed] = useState(false);
  return photo.url && !failed ? <img src={photo.url} alt={`${photo.title} ${TYPE_LABELS[photo.photo_type] || "사진"}`}
    loading={large ? "eager" : "lazy"} decoding="async" onError={() => setFailed(true)}
    style={{ display: "block", width: "100%", ...(large ? { maxHeight: "72dvh", objectFit: "contain" } : { aspectRatio: "1 / 1", objectFit: "cover" }) }} />
    : <div style={{ minHeight: large ? 200 : 140, padding: 14, display: "grid", placeItems: "center", background: "#f1f5f9", color: "#64748b", textAlign: "center", fontSize: 13 }}>
      {photo.error || "사진 주소가 만료되었거나 파일을 불러올 수 없습니다. 새로고침해주세요."}
    </div>;
}

export default function CompanyPhotoGallery({ companyId, companyName }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState({ source: "work", type: "all", page: 1 });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [selected, setSelected] = useState(null);
  const dialogRef = useRef(null);
  const sectionRef = useRef(null);

  useEffect(() => {
    function reveal() {
      if (window.location.hash === "#photos") {
        setOpen(true);
        sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
    reveal();
    window.addEventListener("hashchange", reveal);
    return () => window.removeEventListener("hashchange", reveal);
  }, [companyId]);

  useEffect(() => {
    if (!open || !companyId) return;
    let current = true;
    const controller = new AbortController();
    setLoading(true); setError(""); setData(null); setSelected(null);
    async function load() {
      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        const token = sessionData.session?.access_token;
        if (!token) throw new Error("로그인이 필요합니다.");
        const params = new URLSearchParams({ company_id: companyId, source: filter.source, photo_type: filter.type, page: String(filter.page) });
        const response = await fetch(`/api/super-admin/company-photos?${params}`, {
          headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: controller.signal,
        });
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.error || "사진 조회 실패");
        if (current) setData(result);
      } catch (err) {
        if (current && err.name !== "AbortError") setError(err.message || "사진을 불러오지 못했습니다.");
      } finally { if (current) setLoading(false); }
    }
    void load();
    return () => { current = false; controller.abort(); };
  }, [open, companyId, filter.source, filter.type, filter.page, refresh]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (selected !== null && dialog && !dialog.open) dialog.showModal();
    if (selected === null && dialog?.open) dialog.close();
  }, [selected]);

  const photos = data?.photos || [];
  const activePhoto = selected === null ? null : photos[selected];
  const records = filter.source === "estimate" || filter.source === "lead";
  const reload = () => { setSelected(null); setRefresh((value) => value + 1); };
  return <section id="photos" ref={sectionRef} style={{ marginTop: 20, padding: 20, border: "1px solid #e2e8f0", borderRadius: 18, background: "white", scrollMarginTop: 20 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <div><h2 style={{ margin: 0, fontSize: 20 }}>업체 등록 사진</h2><p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 13 }}>{companyName}에 등록된 사진을 확인합니다.</p></div>
      <button type="button" aria-expanded={open} aria-controls="company-photo-gallery" style={buttonStyle} onClick={() => { setOpen((value) => !value); setSelected(null); }}>{open ? "사진 접기" : "사진 보기"}</button>
    </div>
    {open && <div id="company-photo-gallery">
      <div role="group" aria-label="사진 출처" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 18 }}>
        {SOURCES.map(([source, label]) => <button key={source} type="button" aria-pressed={filter.source === source}
          onClick={() => setFilter({ source, type: "all", page: 1 })}
          style={{ ...buttonStyle, background: filter.source === source ? "#0f172a" : "white", color: filter.source === source ? "white" : "#334155" }}>{label}</button>)}
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", margin: "14px 0" }}>
        {!records && <label style={{ fontSize: 13 }}>사진 종류 <select aria-label="사진 종류" value={filter.type} onChange={(event) => setFilter((value) => ({ ...value, type: event.target.value, page: 1 }))} style={{ ...buttonStyle, fontWeight: 400 }}>
          <option value="all">전체</option><option value="before">시공 전</option><option value="after">시공 후</option>
          {filter.source === "site" ? <option value="request">고객 요청</option> : <option value="history">기존 시공</option>}
        </select></label>}
        <button type="button" style={buttonStyle} disabled={loading} onClick={reload}>새로고침</button>
        {data && <span style={{ color: "#64748b", fontSize: 13 }}>{records ? `기록 ${data.total_records}건 · 이 페이지 사진 ${photos.length}장` : `등록 사진 ${data.total_records}장`}</span>}
      </div>
      {loading && <p role="status">사진을 불러오고 있습니다…</p>}
      {error && <div role="alert" style={{ color: "#b91c1c", padding: 14, background: "#fef2f2", borderRadius: 10 }}>{error} <button type="button" onClick={reload} style={buttonStyle}>다시 시도</button></div>}
      {!loading && !error && !photos.length && <p style={{ padding: "28px 12px", textAlign: "center", color: "#64748b" }}>이 목록에 등록된 사진이 없습니다.</p>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(140px, 100%), 1fr))", gap: 12 }}>
        {photos.map((photo, index) => <button type="button" key={photo.id} onClick={() => setSelected(index)} aria-label={`${photo.title} ${TYPE_LABELS[photo.photo_type] || "사진"} 확대`}
          style={{ padding: 0, minWidth: 0, textAlign: "left", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden", background: "white", cursor: "pointer" }}>
          <PhotoImage key={`${photo.id}:${photo.url}`} photo={photo} />
          <div style={{ padding: 10 }}><span style={{ color: "#2563eb", fontSize: 12 }}>{TYPE_LABELS[photo.photo_type] || "사진"}</span>
            <div style={{ fontWeight: 700, fontSize: 13, margin: "4px 0", overflowWrap: "anywhere" }}>{photo.title}</div><time style={{ fontSize: 11, color: "#64748b" }}>{dateLabel(photo.created_at)}</time></div>
        </button>)}
      </div>
      {data && (filter.page > 1 || data.has_more) && <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, marginTop: 18 }}>
        <button type="button" style={buttonStyle} disabled={loading || filter.page <= 1} onClick={() => setFilter((value) => ({ ...value, page: value.page - 1 }))}>이전</button>
        <span>{filter.page} / {Math.max(1, Math.ceil(data.total_records / data.page_size))}</span>
        <button type="button" style={buttonStyle} disabled={loading || !data.has_more} onClick={() => setFilter((value) => ({ ...value, page: value.page + 1 }))}>다음</button>
      </div>}
      {records && <p style={{ fontSize: 12, color: "#64748b", marginTop: 14 }}>요청 기록 12건씩 표시합니다. 같은 사진이 자동견적과 상담에 각각 등록되어 있을 수 있습니다.</p>}
    </div>}
    <dialog ref={dialogRef} aria-label="업체 사진 확대" onCancel={() => setSelected(null)} onClose={() => setSelected(null)}
      style={{ width: "min(1000px, 94vw)", maxHeight: "94dvh", boxSizing: "border-box", padding: 16, border: "none", borderRadius: 16, background: "#fff", color: "#0f172a" }}>
      {activePhoto && <>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
          <strong>{activePhoto.title} · {TYPE_LABELS[activePhoto.photo_type] || "사진"}</strong>
          <button type="button" autoFocus style={buttonStyle} onClick={() => setSelected(null)}>닫기</button>
        </div>
        <PhotoImage key={`${activePhoto.id}:${activePhoto.url}`} photo={activePhoto} large />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
          <span style={{ color: "#64748b", fontSize: 13 }}>{dateLabel(activePhoto.created_at)} · {selected + 1}/{photos.length}</span>
          <div style={{ display: "flex", gap: 8 }}><button type="button" style={buttonStyle} disabled={selected <= 0} onClick={() => setSelected((value) => value - 1)}>이전 사진</button><button type="button" style={buttonStyle} disabled={selected >= photos.length - 1} onClick={() => setSelected((value) => value + 1)}>다음 사진</button><button type="button" style={buttonStyle} onClick={reload}>다시 불러오기</button></div>
        </div>
      </>}
    </dialog>
  </section>;
}
