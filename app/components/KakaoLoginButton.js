"use client";
import { useRef, useState } from "react";
import { supabase } from "../../lib/supabase";

export default function KakaoLoginButton({ role = "owner", disabled = false }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const locked = useRef(false);
  async function login() {
    if (disabled || locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      const callback = new URL("/auth/kakao", window.location.origin);
      callback.searchParams.set("role", role === "worker" ? "worker" : "owner");
      const { data, error: failure } = await supabase.auth.signInWithOAuth({
        provider: "kakao",
        options: { redirectTo: callback.toString() },
      });
      if (failure || !data?.url) throw failure || Error("redirect unavailable");
    } catch {
      setError("카카오 로그인을 시작하지 못했습니다. 잠시 후 다시 시도하거나 이메일로 로그인해주세요.");
      locked.current = false;
      setBusy(false);
    }
  }
  return (
    <div style={{ margin: "16px 0" }}>
      <button type="button" onClick={login} disabled={disabled || busy}
        style={{ width: "100%", padding: 15, border: 0, borderRadius: 12, background: "#FEE500", color: "#191919", fontSize: 16, fontWeight: 700, cursor: "pointer", opacity: disabled || busy ? 0.6 : 1 }}>
        {busy ? "카카오 로그인 연결 중…" : "카카오로 로그인"}
      </button>
      {error && <p role="alert" style={{ color: "#b91c1c", fontSize: 13 }}>{error}</p>}
    </div>
  );
}
