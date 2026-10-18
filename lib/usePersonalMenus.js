'use client';
import { useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import { menuKey, readMenuUsage, sortMenus } from './menuUsage.mjs';

// Versioned, account/role scoped preferences. Storage failure never blocks navigation.
export default function usePersonalMenus(menus, scope, homeActive = true) {
  const [identity, setIdentity] = useState(null);
  const [snapshot, setSnapshot] = useState({key: null, usage: {}});
  const currentUser = useRef(null);
  useEffect(() => {
    let live = true, revision = 0;
    const apply = user => {
      currentUser.current = user?.id || null;
      setIdentity(user?.id || null);
    };
    const {data: {subscription}} = supabase.auth.onAuthStateChange((_event, session) => {
      revision++;
      if (live) apply(session?.user);
    });
    const started = revision;
    supabase.auth.getSession().then(({data}) => {
      if (live && revision === started) apply(data?.session?.user);
    }).catch(() => {});
    return () => { live = false; currentUser.current = null; subscription.unsubscribe(); };
  }, []);
  const key = identity ? `film-menu-usage:v1:${identity}:${scope}` : null;
  useEffect(() => {
    function refresh() {
      if (!homeActive || !key) return;
      try { setSnapshot({key, usage: readMenuUsage(localStorage, key, menus)}); } catch {}
    }
    refresh();
    window.addEventListener('pageshow', refresh);
    return () => window.removeEventListener('pageshow', refresh);
  }, [key, menus, homeActive]);
  function record(menu, event) {
    if (event?.defaultPrevented || !currentUser.current) return;
    const id = menuKey(menu);
    if (!menus.some(item => menuKey(item) === id)) return;
    try {
      const storageKey = `film-menu-usage:v1:${currentUser.current}:${scope}`;
      const usage = readMenuUsage(localStorage, storageKey, menus);
      usage[id] = Math.min((usage[id] || 0) + 1, 1000000);
      localStorage.setItem(storageKey, JSON.stringify(usage));
      // Keep the current screen steady; refresh on the next home visit.
    } catch {}
  }
  return { orderedMenus: sortMenus(menus, snapshot.key === key ? snapshot.usage : {}), record };
}
