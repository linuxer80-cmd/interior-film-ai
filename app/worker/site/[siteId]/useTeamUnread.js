"use client";
import { useEffect, useState } from 'react';
import { supabase } from '../../../../lib/supabase';
export default function useTeamUnread(siteId) {
  const [unread, setUnread] = useState({ count: null, date: null, error: false });
  useEffect(() => {
    let alive = true, running = false, pending = false, connected = false;
    let channel = null, boundUser = null, generation = 0, timer;
    const controller = new AbortController();
    setUnread({ count: null, date: null, error: false });
    async function refresh() {
      if (!alive || document.hidden) return;
      if (running) { pending = true; return; }
      running = true;
      const requestedGeneration = generation;
      try {
        const { data } = await supabase.auth.getSession();
        if (!data?.session) throw Error('로그인이 필요합니다.');
        const response = await fetch('/api/worker/team/unread?siteId=' + encodeURIComponent(siteId), {
          headers: { Authorization: 'Bearer ' + data.session.access_token }, cache: 'no-store', signal: controller.signal,
        });
        const result = await response.json();
        if (!response.ok) throw Error(result.error);
        if (alive && requestedGeneration === generation) setUnread({ ...result, error: false });
      } catch { if (alive && requestedGeneration === generation) setUnread({ count: null, date: null, error: true }); }
      finally { running = false; if (alive && pending) { pending = false; void refresh(); } }
    }
    function schedule() {
      clearInterval(timer);
      timer = setInterval(refresh, connected ? 60000 : 10000);
    }
    function bindSession(session, version) {
      if (!alive || version !== generation) return;
      const userId = session?.user?.id || null;
      if (userId && userId === boundUser && channel) return;
      const oldChannel = channel;
      channel = null; boundUser = userId; connected = false;
      if (oldChannel) void supabase.removeChannel(oldChannel);
      schedule();
      void refresh();
      if (!userId) return;
      (async () => {
        try {
          await supabase.realtime.setAuth();
          if (!alive || version !== generation) return;
          channel = supabase.channel('team-unread:' + userId, { config: { private: true } })
            .on('broadcast', { event: 'changed' }, () => void refresh())
            .subscribe(status => {
              if (!alive || version !== generation) return;
              const wasConnected = connected;
              connected = status === 'SUBSCRIBED';
              schedule();
              if (connected && !wasConnected) void refresh();
            });
        } catch { if (alive && version === generation) { connected = false; schedule(); } }
      })();
    }
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user?.id && session.user.id === boundUser && channel) return;
      const version = ++generation;
      setUnread({ count: null, date: null, error: false });
      // Do not call another Supabase method inside its auth callback.
      setTimeout(() => bindSession(session, version), 0);
    });
    void refresh();
    schedule();
    window.addEventListener('focus', refresh);
    window.addEventListener('team-chat-read', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      alive = false; generation++; controller.abort(); clearInterval(timer);
      subscription.unsubscribe();
      if (channel) void supabase.removeChannel(channel);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('team-chat-read', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [siteId]);
  return unread;
}
