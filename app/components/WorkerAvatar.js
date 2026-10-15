"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

export default function WorkerAvatar({ className, refreshKey }) {
  const [photo, setPhoto] = useState("");

  useEffect(() => {
    let active = true;
    let epoch = 0;
    async function load() {
      const current = ++epoch;
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          if (active && current === epoch) setPhoto("");
          return;
        }
        const response = await fetch("/api/labor-market?mode=avatar", {
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${data.session.access_token}`,
            "x-labor-view": "worker",
          },
        });
        if (!response.ok) throw new Error("photo unavailable");
        const result = await response.json();
        if (active && current === epoch) setPhoto(result.photo_url || "");
      } catch {
        if (active && current === epoch) setPhoto("");
      }
    }
    load();
    // Refresh before the private photo's five-minute URL expires.
    const timer = setInterval(load, 240000);
    const { data } = supabase.auth.onAuthStateChange(() => {
      setPhoto("");
      load();
    });
    return () => {
      active = false;
      epoch++;
      clearInterval(timer);
      data.subscription.unsubscribe();
    };
  }, [refreshKey]);

  return (
    <span className={className} aria-hidden="true" style={{ overflow: "hidden", flexShrink: 0 }}>
      {photo ? (
        <img src={photo} alt="" onError={() => setPhoto("")}
          style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%", display: "block" }} />
      ) : "👷"}
    </span>
  );
}
