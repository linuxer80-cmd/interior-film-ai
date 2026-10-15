"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

export default function AdminLayout({ children }) {
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);

  const router = useRouter();
  useEffect(() => {
    if (!checking && !session) router.replace("/login?role=owner");
  }, [checking, session, router]);

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

  async function handleLogout() {
    const ok = window.confirm("관리자에서 로그아웃하시겠습니까?");

    if (!ok) return;

    await supabase.auth.signOut();

    setSession(null);
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

  if (!session) return <p role="status">로그인 화면으로 이동합니다…</p>;

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

      <p style={{margin:"10px 14px"}}><Link href="/account/kakao">카카오 계정 연결 · 연결 상태 확인</Link></p>
      {children}
    </>
  );
                }
