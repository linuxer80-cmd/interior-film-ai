"use client";
import { useEffect, useState } from 'react';
import { supabase } from '../../../../lib/supabase';
export default function useTeamUnread(siteId) {
  const [unread, setUnread] = useState({ count: null, date: null, error: false });
  useEffect(() => {
    let alive = true, running = false;
    const controller = new AbortController();
    setUnread({ count: null, date: null, error: false });
    async function refresh() {
      if (running || document.hidden) return;
      running = true;
      try {
        const { data } = await supabase.auth.getSession();
        if (!data?.session) throw Error('로그인이 필요합니다.');
        const response = await fetch('/api/worker/team/unread?siteId=' + encodeURIComponent(siteId), {
          headers: { Authorization: 'Bearer ' + data.session.access_token }, cache: 'no-store', signal: controller.signal,
        });
        const result = await response.json();
        if (!response.ok) throw Error(result.error);
        if (alive) setUnread({ ...result, error: false });
      } catch { if (alive) setUnread({ count: null, date: null, error: true }); }
      finally { running = false; }
    }
    void refresh();
    const timer = setInterval(refresh, 10000);
    window.addEventListener('focus', refresh);
    window.addEventListener('team-chat-read', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      alive = false; controller.abort(); clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('team-chat-read', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [siteId]);
  return unread;
}
