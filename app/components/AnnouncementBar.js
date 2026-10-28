"use client";
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import styles from './AnnouncementBar.module.css';

export default function AnnouncementBar() {
  const path = usePathname();
  const visible = (path === '/admin' || path.startsWith('/admin/') || path === '/worker' || path.startsWith('/worker/')) && !path.startsWith('/worker/login') && !path.startsWith('/worker/signup');
  const audience = path === '/worker' || path.startsWith('/worker/') ? 'worker' : 'owner';
  const [message, setMessage] = useState('');
  const [open, setOpen] = useState(false);
  const [distance, setDistance] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [textWidth, setTextWidth] = useState(0);
  const box = useRef(null), text = useRef(null);
  useEffect(() => {
    setMessage(''); setOpen(false);
    if (!visible) return;
    let alive = true, busy = false, pending = false, connected = false;
    let channel = null, userId = null, version = 0, timer;
    async function refresh() {
      if (!alive || document.hidden) return;
      if (busy) { pending = true; return; }
      busy = true;
      const requestedVersion = version;
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session) { if (alive && requestedVersion === version) setMessage(''); return; }
        const response = await fetch(`/api/announcement?audience=${audience}`, { headers: { Authorization: `Bearer ${data.session.access_token}` }, cache: 'no-store', signal: AbortSignal.timeout(10000) });
        if (response.ok) { const result = await response.json(); if (alive && requestedVersion === version) setMessage(result.announcement?.message || ''); }
        else if (alive && requestedVersion === version) setMessage('');
      } catch { /* Keep the last notice during a temporary connection loss. */ }
      finally { busy = false; if (alive && pending) { pending = false; void refresh(); } }
    }
    function schedule() { clearInterval(timer); timer = setInterval(refresh, connected ? 300000 : 60000); }
    function bind(session, currentVersion) {
      if (!alive || currentVersion !== version) return;
      const nextUser = session?.user?.id || null;
      const oldChannel = channel;
      channel = null; userId = nextUser; connected = false;
      if (oldChannel) void supabase.removeChannel(oldChannel);
      schedule(); void refresh();
      if (!nextUser) return;
      (async () => {
        try {
          await supabase.realtime.setAuth();
          if (!alive || currentVersion !== version) return;
          channel = supabase.channel(`announcement:${audience}`, { config: { private: true } })
            .on('broadcast', { event: 'changed' }, () => void refresh())
            .subscribe(status => {
              if (!alive || currentVersion !== version) return;
              const wasConnected = connected;
              connected = status === 'SUBSCRIBED'; schedule();
              if (connected && !wasConnected) void refresh();
            });
        } catch { if (alive && currentVersion === version) { connected = false; schedule(); } }
      })();
    }
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user?.id && session.user.id === userId && channel) return;
      const currentVersion = ++version;
      setMessage('');
      // Supabase auth callbacks must not await another Supabase call.
      setTimeout(() => bind(session, currentVersion), 0);
    });
    void refresh(); schedule();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      alive = false; version++; clearInterval(timer); subscription.unsubscribe();
      if (channel) void supabase.removeChannel(channel);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [visible, audience]);
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
