"use client";
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import styles from './AnnouncementBar.module.css';

export default function AnnouncementBar() {
  const path = usePathname();
  const visible = (path === '/admin' || path.startsWith('/admin/') || path === '/worker' || path.startsWith('/worker/')) && !path.startsWith('/worker/login') && !path.startsWith('/worker/signup');
  const [message, setMessage] = useState('');
  const [open, setOpen] = useState(false);
  const [distance, setDistance] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [textWidth, setTextWidth] = useState(0);
  const box = useRef(null), text = useRef(null);
  useEffect(() => {
    if (!visible) return;
    let alive = true, busy = false;
    async function refresh() {
      if (busy || document.hidden) return;
      busy = true;
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session) { if (alive) setMessage(''); return; }
        const response = await fetch('/api/announcement', { headers: { Authorization: `Bearer ${data.session.access_token}` }, cache: 'no-store', signal: AbortSignal.timeout(10000) });
        if (response.ok) { const result = await response.json(); if (alive) setMessage(result.announcement?.message || ''); }
        else if (alive) setMessage('');
      } catch { /* Keep the last notice during a temporary connection loss. */ }
      finally { busy = false; }
    }
    refresh();
    const timer = setInterval(refresh, 60000);
    document.addEventListener('visibilitychange', refresh);
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => { setMessage(''); setTimeout(refresh, 0); });
    return () => { alive = false; clearInterval(timer); subscription.unsubscribe(); document.removeEventListener('visibilitychange', refresh); };
  }, [visible]);
  useEffect(() => {
    if (!message || !visible) return;
    const measure = () => {
      const width = text.current?.scrollWidth || 0, viewport = box.current?.clientWidth || 0;
      setDistance(Math.max(0, width - viewport));
      setTextWidth(width); setViewportWidth(viewport);
    };
    const observer = new ResizeObserver(measure);
    if (box.current) observer.observe(box.current);
    if (text.current) observer.observe(text.current);
    measure();
    return () => observer.disconnect();
  }, [message, visible]);
  if (!visible || !message) return null;
  return <aside className={styles.bar} aria-label="공지사항">
    <button type="button" className={styles.line} onClick={() => setOpen(!open)} aria-expanded={open} aria-label={`공지사항: ${message}. 눌러서 전체 보기`}>
      <span className={styles.label}>공지</span>
      <span className={styles.viewport} ref={box} aria-hidden="true"><span ref={text} className={distance > 0 && !open ? styles.moving : styles.text} style={{ '--viewport': `${viewportWidth}px`, '--duration': `${Math.max(12, (textWidth + viewportWidth) / 35)}s` }}>{message}</span></span>
      <span aria-hidden="true">{open ? '−' : '+'}</span>
    </button>
    {open && <p className={styles.full}>{message}</p>}
  </aside>;
}
