"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

export default function LaborNotifications({ refreshKey = 0 }) {
  const [notices, setNotices] = useState([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let active = true;
    let epoch = 0;

    async function load() {
      const current = ++epoch;

      try {
        const { data } = await supabase.auth.getSession();

        if (!data.session) {
          if (active && current === epoch) setNotices([]);
          return;
        }

        const response = await fetch(
          "/api/labor-market?mode=notifications",
          {
            cache: "no-store",
            headers: {
              Authorization: `Bearer ${data.session.access_token}`,
            },
          },
        );

        if (response.ok) {
          const result = await response.json();
          if (active && current === epoch) {
            setNotices(result.notifications || []);
          }
        }
      } catch {
        // 이 기능의 오류가 다른 메뉴를 막지 않습니다.
      }
    }

    load();
    const timer = setInterval(load, 60000);

    const { data } = supabase.auth.onAuthStateChange(() => {
      setNotices([]);
      load();
    });

    return () => {
      active = false;
      epoch++;
      clearInterval(timer);
      data.subscription.unsubscribe();
    };
  }, [refreshKey]);

  async function read(id) {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;

    await fetch("/api/labor-market", {
      method: "POST",
      keepalive: true,
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "read_notification", id }),
    });
  }

  return (
    <section
      aria-label="구인·구직 알림"
      style={{ margin: "12px 0" }}
    >
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        style={{
          padding: 12,
          border: "1px solid #cbd5e1",
          borderRadius: 12,
          background: "#fff",
        }}
      >
        구인·구직 알림 {notices.filter(notice => !notice.read_at).length}건
      </button>

      {open && (
        <div>
          {!notices.length && <p>새 알림이 없습니다.</p>}

          {notices.map(notice => (
            <a
              key={notice.id}
              href={notice.link}
              onClick={() => {
                read(notice.id).catch(() => {});
              }}
              style={{
                display: "block",
                padding: 14,
                margin: "8px 0",
                borderRadius: 12,
                background: notice.read_at ? "#fff" : "#eef5ff",
                color: "#243648",
                textDecoration: "none",
              }}
            >
              <strong>{notice.title}</strong>
              <p>{notice.message}</p>
              <small>
                {new Date(notice.created_at).toLocaleString("ko-KR", {
                  timeZone: "Asia/Seoul",
                })}
              </small>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}
