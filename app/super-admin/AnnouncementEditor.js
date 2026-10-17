"use client";
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import ui from '../admin/AdminUi.module.css';

export default function AnnouncementEditor() {
  const [message, setMessage] = useState(''), [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false), [loaded, setLoaded] = useState(false), [status, setStatus] = useState('');
  async function request(method, body) {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw Error('다시 로그인해주세요.');
    const response = await fetch('/api/announcement?manage=1', { method, headers: { Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), cache: 'no-store', signal: AbortSignal.timeout(15000) });
    const result = await response.json();
    if (!response.ok) throw Error(result.error || '공지를 저장하지 못했습니다.');
    return result;
  }
  useEffect(() => { let alive = true; request('GET').then(result => { if (alive) { setMessage(result.announcement?.message || ''); setEnabled(result.announcement?.enabled || false); setLoaded(true); } }).catch(error => { if (alive) setStatus(error.message); }); return () => { alive = false; }; }, []);
  async function save(event) {
    event.preventDefault(); setBusy(true); setStatus('');
    try { await request('POST', { message, enabled }); setStatus('저장했습니다. 관리자·시공자 화면에 1분 이내 반영됩니다.'); }
    catch(error) { setStatus(error.message); }
    finally { setBusy(false); }
  }
  return <details style={{ marginBottom:20, padding:20, border:"1px solid #dce1d8", borderRadius:18, background:"#fff" }}>
    <summary style={{ cursor:'pointer', fontWeight:700 }}>관리자·시공자 한 줄 공지 관리</summary>
    <form onSubmit={save} style={{ display:'grid', gap:12, marginTop:16 }}>
      <label htmlFor="app-notice">공지 내용 · 최대 500자</label>
      <textarea id="app-notice" value={message} maxLength={500} rows={3} disabled={!loaded || busy} onChange={event => setMessage(event.target.value)} style={{ width:'100%', boxSizing:'border-box', padding:12, border:'1px solid #dce1d8', borderRadius:12, font:'inherit' }} />
      <small>{message.length}/500 · 긴 글은 오른쪽에서 왼쪽으로 이동합니다. 공지를 누르면 전체 내용을 볼 수 있습니다.</small>
      <label><input type="checkbox" checked={enabled} disabled={!loaded || busy} onChange={event => setEnabled(event.target.checked)} /> 공지 게시</label>
      <button className={ui.secondary} disabled={!loaded || busy} type="submit">{busy ? '저장 중…' : '공지 저장'}</button>
      {status && <p role="status">{status}</p>}
    </form>
  </details>;
}
