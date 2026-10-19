"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabase";
import { signInSuperAdmin, verifySuperAdmin } from "../../../lib/superAdminLogin";

export default function SuperAdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const submitting = useRef(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await verifySuperAdmin(supabase);
        if (active) window.location.replace("/super-admin");
      } catch {
        // A missing or ordinary account session stays on the dedicated form.
      } finally {
        if (active) setChecking(false);
      }
    })();
    return () => { active = false; };
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting.current || checking) return;
    submitting.current = true;
    setLoading(true);
    setMessage("");
    try {
      await signInSuperAdmin(supabase, email, password);
      window.location.replace("/super-admin");
    } catch (error) {
      setMessage(error.message || "로그인 중 오류가 발생했습니다.");
    } finally {
      setPassword("");
      submitting.current = false;
      setLoading(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", maxWidth: 480, padding: "60px 20px" }}>
      <div style={{ padding: 26, background: "#fffdf9", border: "1px solid #e6dfd4", borderRadius: 24 }}>
        <p style={{ color: "#625e56", fontSize: 13 }}>필름장이 · 서비스 운영</p>
        <h1 style={{ fontSize: 28, margin: "12px 0" }}>슈퍼관리자 로그인</h1>
        <p style={{ color: "#625e56", fontSize: 14, lineHeight: 1.7 }}>
          슈퍼관리자로 등록된 계정으로 로그인해주세요.
        </p>
        {checking ? <p role="status">로그인 상태를 확인하고 있습니다…</p> : (
          <form onSubmit={handleSubmit} aria-busy={loading}>
            <label htmlFor="super-email" style={labelStyle}>이메일</label>
            <input id="super-email" name="email" type="email" autoComplete="username"
              autoCapitalize="none" required disabled={loading} value={email}
              onChange={event => setEmail(event.target.value)} style={inputStyle} />
            <label htmlFor="super-password" style={labelStyle}>비밀번호</label>
            <input id="super-password" name="password" type="password" autoComplete="current-password"
              required disabled={loading} value={password}
              onChange={event => setPassword(event.target.value)} style={inputStyle} />
            {message && <p role="alert" style={{ padding: 12, background: "#fff1f2", color: "#991b1b", borderRadius: 12, lineHeight: 1.6 }}>{message}</p>}
            <button type="submit" disabled={loading} style={{ width: "100%", minHeight: 50, marginTop: 24,
              border: 0, borderRadius: 12, background: "#28445c", color: "#fff", fontSize: 16, fontWeight: 800 }}>
              {loading ? "권한 확인 중…" : "슈퍼관리자로 로그인"}
            </button>
          </form>
        )}
        <div style={{ marginTop: 24 }}>
          <Link href="/login?role=owner" data-ui-link="action">업체 관리자 로그인</Link>
          <Link href="/" data-ui-link="action">홈으로</Link>
        </div>
      </div>
    </main>
  );
}
const labelStyle = { display: "block", margin: "20px 0 8px", fontSize: 14, fontWeight: 700 };
const inputStyle = { width: "100%", minHeight: 50, padding: "12px 14px", border: "1px solid #c6cdd0",
  borderRadius: 12, background: "#fff", fontSize: 16, color: "#243648" };
