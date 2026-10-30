"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import GoogleLoginButton from "../components/GoogleLoginButton";
import KakaoLoginButton from "../components/KakaoLoginButton";
import { loginDestination, resolveLoginDestination } from "../utils/unifiedLogin";

export default function UnifiedLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  const [unregistered, setUnregistered] = useState(false);
  const [next, setNext] = useState(null);
  const locked = useRef(false);

  async function enter() {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) throw Error("로그인 정보를 확인하지 못했습니다. 다시 시도해주세요.");
    const query = new URLSearchParams(window.location.search);
    const destination = await resolveLoginDestination({
      next: query.get("next"), preference: query.get("role"), userId: data.user.id,
    });
    if (destination) { window.location.replace(destination); return true; }
    setUnregistered(true);
    setMessage("이 계정에 연결된 업체나 시공자 정보를 찾지 못했어요. 기존에 가입했다면 사용하던 로그인 방법을 확인해주세요.");
    return false;
  }
  useEffect(() => {
    let active = true;
    const query = new URLSearchParams(window.location.search);
    setNext(loginDestination(query.get("next")));
    (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (data?.session && active) await enter();
      } catch { if (active) setMessage("로그인 상태를 확인하지 못했어요. 잠시 후 다시 시도해주세요."); }
      finally { if (active) setBusy(false); }
    })();
    return () => { active = false; };
  }, []);

  async function login(event) {
    event.preventDefault();
    if (locked.current) return;
    locked.current = true; setBusy(true); setMessage(""); setUnregistered(false);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (error) throw error;
      await enter();
    } catch (error) {
      const text = String(error?.message || "").toLowerCase();
      setMessage(text.includes("invalid login credentials") ? "이메일 또는 비밀번호가 올바르지 않습니다." : text.includes("email not confirmed") ? "가입한 이메일의 인증 메일을 확인해주세요." : "로그인 또는 계정 정보를 확인하지 못했어요. 잠시 후 다시 시도해주세요.");
    } finally { locked.current = false; setBusy(false); }
  }
  async function switchAccount() {
    setBusy(true); setMessage("");
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) setMessage("계정을 전환하지 못했어요. 다시 시도해주세요.");
    else { setUnregistered(false); setPassword(""); }
    setBusy(false);
  }
  return <section className="unified">
    <p className="lead">로그인하고 현장 관리를 시작하세요.</p>
    <form onSubmit={login}>
      <label htmlFor="login-email">이메일</label>
      <input id="login-email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="이메일을 입력해주세요" />
      <label htmlFor="login-password">비밀번호</label>
      <input id="login-password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="비밀번호를 입력해주세요" />
      <button className="primary" disabled={busy} type="submit">{busy ? "확인 중…" : "로그인"}</button>
    </form>
    {message && <div role="status" className="message">{message}{unregistered && <button type="button" onClick={switchAccount} disabled={busy}>다른 계정으로 로그인</button>}</div>}
    <div className="divider">또는</div>
    <KakaoLoginButton role="auto" next={next} disabled={busy} />
    <GoogleLoginButton role="auto" next={next} disabled={busy} />
    <details><summary>처음 이용하시나요? 가입하기</summary><div className="links"><Link href="/signup">업체 등록하기</Link><Link href="/worker/account">시공자 가입하기</Link></div></details>
    <details><summary>계정이나 비밀번호를 잊으셨나요?</summary><div className="links"><Link href="/login/recovery">업체 계정 비밀번호 찾기</Link><Link href="/worker/forgot-password">시공자 계정 찾기</Link></div></details>
    <p className="hint">기존에 가입한 방법으로 로그인해주세요. 다른 로그인 계정이 자동으로 합쳐지지는 않습니다.</p>
    <style jsx>{`
      .unified{padding:22px;background:#fff;border:1px solid #dce1d8;border-radius:22px;box-shadow:0 8px 24px rgba(24,38,32,.06)}
      .lead{margin:0 0 22px;color:#526256;font-size:15px;line-height:1.6}
      form{display:grid;gap:9px} label{font-size:14px;font-weight:700} input{box-sizing:border-box;width:100%;padding:14px;border:1px solid #cfd8d1;border-radius:10px;font:inherit;margin-bottom:8px} button{font:inherit;cursor:pointer} .primary{background:#182620;color:white;border:0;border-radius:11px;padding:15px;font-weight:800} button:disabled{opacity:.6;cursor:wait}
      .message{background:#f7f5ef;padding:13px;border-radius:10px;margin-top:14px;line-height:1.6;font-size:14px}.message button{display:block;margin-top:8px;padding:8px;border:1px solid #cfd8d1;border-radius:8px;background:white}
      .divider{text-align:center;color:#778177;font-size:13px;margin-top:20px} details{border-top:1px solid #edf0ed;padding:14px 0;font-size:14px} summary{cursor:pointer;font-weight:700}.links{display:flex;gap:12px;flex-wrap:wrap;margin-top:12px}.links :global(a){color:#235a47}.hint{font-size:12px;color:#69766b;line-height:1.6;margin:8px 0 0}
    `}</style>
  </section>;
}
