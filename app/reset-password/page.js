"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

const expired =
  "재설정 링크가 만료되었거나 올바르지 않습니다. 재설정 메일을 다시 받아 가장 최근 링크를 열어주세요.";

async function openRecovery() {
  const url = new URL(window.location.href);
  const hash = new URLSearchParams(url.hash.slice(1));

  const access = hash.get("access_token");
  const refresh = hash.get("refresh_token");
  const invalid =
    hash.has("error") ||
    hash.has("error_code") ||
    url.searchParams.has("error");
  const recovery = hash.get("type") === "recovery";

  window.history.replaceState(
    null,
    "",
    window.location.pathname
  );

  if (invalid || !recovery || !access || !refresh) {
    throw Error(expired);
  }

  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storageKey: "filmjang-password-recovery",
      },
    }
  );

  const session = await client.auth.setSession({
    access_token: access,
    refresh_token: refresh,
  });

  if (session.error || !session.data.session) {
    throw Error(expired);
  }

  const user = await client.auth.getUser();

  if (user.error || !user.data.user) {
    throw Error(expired);
  }

  return client;
}

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [checking, setChecking] = useState(true);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [message, setMessage] = useState("");

  const client = useRef(null);
  const initialization = useRef(null);
  const lock = useRef(false);

  useEffect(() => {
    let active = true;

    initialization.current ||= openRecovery();

    initialization.current
      .then(value => {
        if (active) {
          client.current = value;
          setReady(true);
          setChecking(false);
        }
      })
      .catch(error => {
        if (active) {
          setMessage(error.message || expired);
          setChecking(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  async function submit(event) {
    event.preventDefault();

    if (
      lock.current ||
      success ||
      !ready ||
      !client.current
    ) {
      return;
    }

    if (password.length < 8) {
      setMessage("새 비밀번호는 8자 이상 입력해주세요.");
      return;
    }

    if (password !== confirm) {
      setMessage("새 비밀번호가 서로 일치하지 않습니다.");
      return;
    }

    lock.current = true;
    setBusy(true);
    setMessage("");

    try {
      const { error } = await client.current.auth.updateUser({
        password,
      });

      if (error) {
        if (error.code === "same_password") {
          throw Error(
            "기존 비밀번호와 다른 비밀번호를 입력해주세요."
          );
        }

        if (error.code === "weak_password") {
          throw Error(
            "비밀번호 보안 조건을 충족하지 않습니다. 영문 대소문자·숫자·특수문자를 섞어 입력해주세요."
          );
        }

        if (error.status === 401 || error.status === 403) {
          throw Error(expired);
        }

        throw Error(
          "비밀번호를 변경하지 못했습니다. 잠시 후 다시 시도해주세요."
        );
      }

      setSuccess(true);
      setReady(false);
      setPassword("");
      setConfirm("");
      setMessage(
        "비밀번호가 변경되었습니다. 아래에서 새 비밀번호로 로그인해주세요."
      );

      try {
        const result = await client.current.auth.signOut({
          scope: "global",
        });

        if (result.error) {
          setMessage(
            "비밀번호가 변경되었습니다. 다른 기기의 세션 종료는 확인하지 못했습니다. 사용 중인 기기에서 로그아웃 후 다시 로그인해주세요."
          );
        }
      } catch {
        setMessage(
          "비밀번호가 변경되었습니다. 사용 중인 기기에서 로그아웃 후 다시 로그인해주세요."
        );
      }

      client.current = null;
    } catch (error) {
      setMessage(
        error.message || "인터넷 연결을 확인해주세요."
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  const input = {
    width: "100%",
    boxSizing: "border-box",
    padding: 14,
    margin: "8px 0 18px",
    fontSize: 16,
    border: "1px solid #cbd5e1",
    borderRadius: 12,
  };

  const link = {
    display: "block",
    padding: 14,
    marginTop: 12,
    textAlign: "center",
    borderRadius: 12,
    background: "#eff6ff",
    color: "#1d4ed8",
    textDecoration: "none",
    fontWeight: 700,
  };

  return (
    <main
      style={{
        minHeight: "100dvh",
        padding: "36px 18px",
        background: "#f8f7f3",
        color: "#243247",
      }}
    >
      <section
        style={{
          maxWidth: 460,
          padding: 24,
          margin: "0 auto",
          border: "1px solid #e4eaf2",
          borderRadius: 24,
          background: "white",
        }}
      >
        <p>필름장이</p>

        <h1>
          {success
            ? "비밀번호 변경 완료"
            : "새 비밀번호 설정"}
        </h1>

        {checking && (
          <p role="status">
            재설정 링크를 확인하고 있습니다…
          </p>
        )}

        {ready && !success && (
          <form onSubmit={submit}>
            <p>
              8자 이상 입력해주세요. 영문·숫자·특수문자를
              함께 사용하는 것을 권장합니다.
            </p>

            <label htmlFor="new-password">
              새 비밀번호
            </label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              disabled={busy}
              onChange={e => setPassword(e.target.value)}
              style={input}
            />

            <label htmlFor="confirm-password">
              새 비밀번호 확인
            </label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={confirm}
              disabled={busy}
              onChange={e => setConfirm(e.target.value)}
              style={input}
            />

            <button
              disabled={busy}
              style={{
                width: "100%",
                padding: 15,
                border: 0,
                borderRadius: 12,
                color: "white",
                background: busy ? "#94a3b8" : "#3478ed",
                fontSize: 16,
                fontWeight: 800,
              }}
            >
              {busy ? "변경 중…" : "새 비밀번호 저장"}
            </button>
          </form>
        )}

        {message && (
          <p
            role={success ? "status" : "alert"}
            style={{
              lineHeight: 1.8,
              color: success ? "#047857" : "#b91c1c",
            }}
          >
            {message}
          </p>
        )}

        {!checking && !ready && !success && (
          <Link
            href="/worker/forgot-password"
            style={link}
          >
            시공자 재설정 메일 다시 받기
          </Link>
        )}

        {!busy && (
          <>
            <Link href="/worker/login" style={link}>
              시공자 로그인
            </Link>
            <Link href="/login" style={link}>
              회사 관리자 로그인
            </Link>
          </>
        )}
      </section>
    </main>
  );
}
