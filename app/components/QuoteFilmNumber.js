"use client";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

export function quoteFilmChoices(materials = []) {
  return [...new Map(materials.filter(m => String(m.product_code || "").trim()).map(m => {
    const code = String(m.product_code).trim();
    const brand = String(m.brand || "").trim();
    const value = [brand, code].filter(Boolean).join(" ");
    return [value.toUpperCase(), { value, code, label: [value, m.product_name].filter(Boolean).join(" · ") }];
  })).values()];
}

export function useSiteQuoteFilms(siteId) {
  const [state, setState] = useState({ choices: [], loading: false, error: false });
  useEffect(() => {
    if (!siteId) { setState({ choices: [], loading: false, error: false }); return; }
    let controller;
    let alive = true;
    async function load() {
      controller?.abort();
      const current = new AbortController();
      controller = current;
      setState(previous => ({ ...previous, loading: true, error: false }));
      const timer = setTimeout(() => current.abort(), 12000);
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error || !data?.session) throw Error('로그인이 필요합니다.');
        const response = await fetch(`/api/admin/site-planned-materials?siteId=${encodeURIComponent(siteId)}`, {
          headers: { Authorization: `Bearer ${data.session.access_token}` }, cache: 'no-store', signal: current.signal,
        });
        const result = await response.json();
        if (!response.ok) throw Error('현장 필름 조회 실패');
        if (alive && controller === current) setState({ choices: quoteFilmChoices(result.materials), loading: false, error: false });
      } catch {
        if (alive && controller === current) setState({ choices: [], loading: false, error: true });
      } finally { clearTimeout(timer); }
    }
    setState({ choices: [], loading: true, error: false });
    load();
    const changed = event => { if (event.detail?.siteId === siteId) load(); };
    window.addEventListener('site-materials-changed', changed);
    return () => { alive = false; controller?.abort(); window.removeEventListener('site-materials-changed', changed); };
  }, [siteId]);
  return state;
}

export default function QuoteFilmNumber({ value = "", onChange, choices = [], loading, error }) {
  const [manual, setManual] = useState(null);
  // Keep existing free text and never replace it when site suggestions arrive.
  const matching = choices.find(option => option.value === value || option.code === value);
  const direct = manual === true || !choices.length || (manual !== false && Boolean(value && !matching));
  return <span style={{ display: "grid", gap: 8 }}>
    {direct ? <input type="text" value={value} maxLength={2000} placeholder="예: 영림 PX450 / 미정"
      style={{ padding: 12, border: '1px solid #d5dfcd', borderRadius: 12, background: '#fffefb', fontSize: 16, width: '100%', boxSizing: 'border-box' }}
      onChange={event => onChange(event.target.value)} /> :
      <select aria-label="현장 필름 번호 선택" value={matching?.value || ""}
        onChange={event => { if (event.target.value === '__manual__') setManual(true); else onChange(event.target.value); }}
        style={{ padding: 12, border: '1px solid #d5dfcd', borderRadius: 12, background: '#fffefb', fontSize: 16, width: '100%' }}>
        <option value="">{value && !matching ? `현재 입력: ${value} · 다른 필름 선택` : '현장에 등록된 필름 선택'}</option>
        {choices.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        <option value="__manual__">직접 입력</option>
      </select>}
    {choices.length > 0 && <button type="button" style={{ justifySelf: 'start', padding: '6px 10px', border: '1px solid #d5dfcd', borderRadius: 8, background: '#edf3e8', color: '#355940', fontSize: 12 }}
      onClick={() => { setManual(direct ? false : true); }}>
      {direct ? '현장 필름에서 선택' : '직접 입력하기'}
    </button>}
    {loading && <small>현장 필름 확인 중 · 직접 입력할 수 있습니다.</small>}
    {error && <small>현장 필름을 불러오지 못했습니다. 직접 입력할 수 있습니다.</small>}
  </span>;
}
