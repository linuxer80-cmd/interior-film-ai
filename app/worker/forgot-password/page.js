"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabase";

export default function WorkerForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const lock = useRef(false);

  useEffect(() => {
    if (!wait) return;

    const timer = setTimeout(
      () => setWait(n => Math.max(0, n - 1)),
      1000
    );

    return () => clearTimeout(timer);
  }, [wait]);

  async function submit(event) {
    event.preventDefault();
    if (lock.current || wait) return;

    const address = email.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setSent(false);
      setMessage("가입한 이메일 주소를 정확히 입력해주세요.");
      return;
    }

    lock.current = true;
    setBusy(true);
    setSent(false);
    setMessage("");

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(
        address,
        {
          redirectTo: `${window.location.origin}/reset-password`,
        }
      );

      if (error) {
        if (error.status === 429) {
          setWait(60);
          throw Error("요청이 많습니다. 잠시 후 다시 시도해주세요.");
        }

        throw Error(
          "메일 요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요."
        );
      }

      setSent(true);
      setWait(60);
      setMessage(
        "등록된 이메일이면 재설정 메일이 발송됩니다. 받은편지함과 스팸함을 확인해주세요."
      );
    } catch (error) {
      setMessage(
        error.message ||
          "인터넷 연결을 확인하고 다시 시도해주세요."
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100dvh",
        background: "#f8f7f3",
        padding: "36px 18px",
        color: "#243247",
      }}
    >
      <section
        style={{
          maxWidth: 460,
          margin: "0 auto",
          background: "white",
          borderRadius: 24,
          padding: 24,
          border: "1px solid #e4eaf2",
        }}
      >
        <p>필름장이 · 시공자</p>
        <h1>비밀번호 재설정</h1>

        <p style={{ lineHeight: 1.8 }}>
          로그인에 사용하는 이메일을 입력해주세요.
          메일의 링크에서 새 비밀번호를 설정할 수 있습니다.
        </p>

        <form onSubmit={submit}>
          <label htmlFor="reset-email">가입 이메일</label>

          <input
            id="reset-email"
            type="email"
            required
            maxLength={254}
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            value={email}
            disabled={busy}
            onChange={e => setEmail(e.target.value)}
            placeholder="example@email.com"
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: 14,
              margin: "10px 0",
              border: "1px solid #cbd5e1",
              borderRadius: 12,
              fontSize: 16,
            }}
          />

          <button
            disabled={busy || wait > 0}
            style={{
              width: "100%",
              padding: 15,
              border: 0,
              borderRadius: 12,
              color: "white",
              background: busy || wait ? "#94a3b8" : "#3478ed",
              fontSize: 16,
              fontWeight: 800,
            }}
          >
            {busy
              ? "요청 중…"
              : wait
                ? `${wait}초 후 다시 요청 가능`
                : "재설정 메일 받기"}
          </button>
        </form>

        {message && (
          <p
            role={sent ? "status" : "alert"}
            style={{
              padding: 14,
              lineHeight: 1.8,
              borderRadius: 12,
              background: sent ? "#ecfdf5" : "#fff1f2",
              color: sent ? "#047857" : "#b91c1c",
            }}
          >
            {message}
          </p>
        )}

        <p
          style={{
            color: "#64748b",
            fontSize: 14,
            lineHeight: 1.8,
          }}
        >
          이메일을 모르거나 메일을 받을 수 없다면 소속 회사
          관리자에게 계정 정보를 확인해주세요. 재설정 메일을
          여러 번 받았다면 가장 최근 링크를 사용해주세요.
        </p>

        <Link
          href="/worker/login"
          style={{
            display: "block",
            padding: 14,
            textAlign: "center",
            color: "#3268bd",
          }}
        >
          ← 시공자 로그인
        </Link>
      </section>
    </main>
  );
}
