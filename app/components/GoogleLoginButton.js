"use client";
import { useRef, useState } from "react";
import { supabase } from "../../lib/supabase";

export default function GoogleLoginButton({ role = "owner", disabled = false }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const locked = useRef(false);
  async function login() {
    if (disabled || locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      const callback = new URL("/auth/google", window.location.origin);
      callback.searchParams.set("role", ["worker", "dealer"].includes(role) ? role : "owner");
      const { data, error: failure } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: callback.toString(), queryParams: { prompt: "select_account" } },
      });
      if (failure || !data?.url) throw failure || Error("redirect unavailable");
    } catch (cause) {
      setError(/provider.*(disabled|not.*enabled|unsupported)/i.test(String(cause?.message || ""))
        ? "구글 로그인 설정을 준비 중입니다. 이메일로 로그인해주세요."
        : "구글 로그인을 시작하지 못했습니다. 잠시 후 다시 시도하거나 이메일로 로그인해주세요.");
      locked.current = false;
      setBusy(false);
    }
  }
  return (
    <div style={{ margin: "16px 0" }}>
      <button type="button" onClick={login} disabled={disabled || busy}
        style={{ width: "100%", padding: 15, border: "1px solid #d1d5db", borderRadius: 12, background: "#fff", color: "#1f2937", fontSize: 16, fontWeight: 700, cursor: "pointer", opacity: disabled || busy ? 0.6 : 1 }}>
        {busy ? "구글 로그인 연결 중…" : "구글로 로그인"}
      </button>
      {error && <p role="alert" style={{ color: "#b91c1c", fontSize: 13 }}>{error}</p>}
    </div>
  );
}
