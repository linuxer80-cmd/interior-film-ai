"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

export default function AdminLayout({ children }) {
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setChecking(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  async function checkSession() {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      setSession(session);
    } catch (error) {
      console.error(error);
    } finally {
      setChecking(false);
    }
  }

  async function handleLogin(e) {
    e.preventDefault();

    if (!email.trim() || !password) {
      setMessage("이메일과 비밀번호를 입력해주세요.");
      return;
    }

    setLoginLoading(true);
    setMessage("");

    try {
      const { data, error } =
        await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

      if (error) throw error;

      if (!data?.session) {
        throw new Error("로그인 세션을 만들지 못했습니다.");
      }

      setSession(data.session);
      setPassword("");
    } catch (error) {
      console.error(error);

      setMessage(
        error?.message === "Invalid login credentials"
          ? "이메일 또는 비밀번호가 맞지 않습니다."
          : `로그인 실패: ${error?.message || "다시 시도해주세요."}`
      );
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleLogout() {
    const ok = window.confirm("관리자에서 로그아웃하시겠습니까?");

    if (!ok) return;

    await supabase.auth.signOut();

    setSession(null);
    setEmail("");
    setPassword("");
    setMessage("");
  }

  if (checking) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f8fafc",
          padding: "20px",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            fontSize: "18px",
            fontWeight: "bold",
          }}
        >
          관리자 확인 중...
        </div>
      </main>
    );
  }

  if (!session) {
    return (
      <main
        style={{
          minHeight: "100vh",
          background: "#f8fafc",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px 18px",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "420px",
            background: "white",
            border: "1px solid #e5e7eb",
            borderRadius: "22px",
            padding: "30px 22px",
            boxSizing: "border-box",
            boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
          }}
        >
          <div
            style={{
              fontSize: "32px",
              textAlign: "center",
              marginBottom: "8px",
            }}
          >
            🔐
          </div>

          <h1
            style={{
              margin: 0,
              textAlign: "center",
              fontSize: "25px",
              color: "#111827",
            }}
          >
            관리자 로그인
          </h1>

          <p
            style={{
              textAlign: "center",
              color: "#6b7280",
              lineHeight: "1.6",
              marginTop: "10px",
              marginBottom: "28px",
            }}
          >
            기분좋은공간 AI 견적 관리
          </p>

          <form onSubmit={handleLogin}>
            <label
              style={{
                display: "block",
                fontWeight: "bold",
                marginBottom: "8px",
              }}
            >
              이메일
            </label>

            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="관리자 이메일"
              style={{
                width: "100%",
                padding: "16px",
                fontSize: "16px",
                border: "1px solid #d1d5db",
                borderRadius: "12px",
                boxSizing: "border-box",
                marginBottom: "18px",
              }}
            />

            <label
              style={{
                display: "block",
                fontWeight: "bold",
                marginBottom: "8px",
              }}
            >
              비밀번호
            </label>

            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호"
              style={{
                width: "100%",
                padding: "16px",
                fontSize: "16px",
                border: "1px solid #d1d5db",
                borderRadius: "12px",
                boxSizing: "border-box",
              }}
            />

            {message && (
              <div
                style={{
                  marginTop: "16px",
                  padding: "12px",
                  background: "#fff7ed",
                  border: "1px solid #fed7aa",
                  borderRadius: "10px",
                  color: "#9a3412",
                  fontSize: "14px",
                  lineHeight: "1.5",
                }}
              >
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={loginLoading}
              style={{
                width: "100%",
                marginTop: "22px",
                padding: "16px",
                border: "none",
                borderRadius: "12px",
                background: "#111827",
                color: "white",
                fontSize: "17px",
                fontWeight: "bold",
                cursor: "pointer",
                opacity: loginLoading ? 0.6 : 1,
              }}
            >
              {loginLoading ? "로그인 중..." : "관리자 로그인"}
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <>
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 999,
          background: "#111827",
          color: "white",
          padding: "10px 14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "10px",
        }}
      >
        <div
          style={{
            fontSize: "13px",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          🔐 관리자 접속
        </div>

        <button
          type="button"
          onClick={handleLogout}
          style={{
            flexShrink: 0,
            border: "1px solid #4b5563",
            borderRadius: "8px",
            background: "white",
            color: "#111827",
            padding: "8px 12px",
            fontWeight: "bold",
          }}
        >
          로그아웃
        </button>
      </div>

      {children}
    </>
  );
                }
