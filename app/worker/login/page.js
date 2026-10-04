"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../../lib/supabase";
import {
  loadMyWorkerSites,
  workerDestination,
} from "../../utils/workerSites";
import ToolIllustration from "../../components/ui/ToolIllustration";

export default function WorkerLoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("error");

  async function getMyWorker() {
    const result = await loadMyWorkerSites({ profileOnly: true });
    return result.worker;
  }

  async function handleLogin(event) {
    event.preventDefault();

    if (loading) return;

    setMessage("");
    setMessageType("error");

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      setMessage("이메일을 입력해주세요.");
      return;
    }

    if (!password) {
      setMessage("비밀번호를 입력해주세요.");
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (error) throw error;

      if (!data?.user) {
        throw new Error("로그인 사용자 정보를 확인하지 못했습니다.");
      }

      const worker = await getMyWorker();

      if (!worker?.worker_id) {
        await supabase.auth.signOut();

        throw new Error(
          "등록된 시공자 계정과 연결되어 있지 않습니다. 회사 관리자에게 계정 연결을 요청해주세요."
        );
      }

      if (worker.worker_is_active === false) {
        await supabase.auth.signOut();

        throw new Error(
          "현재 사용이 중지된 시공자 계정입니다. 회사 관리자에게 문의해주세요."
        );
      }

      setMessageType("success");
      setMessage(`${worker.worker_name || "시공자"}님, 로그인되었습니다.`);

      setTimeout(() => {
        const next = new URLSearchParams(window.location.search).get("next");
        router.replace(workerDestination(next));
        router.refresh();
      }, 500);
    } catch (error) {
      console.error("시공자 로그인 오류:", error);

      let errorMessage =
        error?.message || "로그인 중 오류가 발생했습니다.";

      const lowerMessage = errorMessage.toLowerCase();

      if (lowerMessage.includes("invalid login credentials")) {
        errorMessage = "이메일 또는 비밀번호가 올바르지 않습니다.";
      }

      if (lowerMessage.includes("email not confirmed")) {
        errorMessage =
          "이메일 인증이 필요합니다. 가입한 이메일의 인증 메일을 확인해주세요.";
      }

      setMessageType("error");
      setMessage(errorMessage);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--film-bg, #f8f7f3)",
        color: "#243247",
        padding: "36px 18px 70px",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "460px",
          margin: "0 auto",
        }}
      >
        <header
          style={{
            marginBottom: "24px",
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: "104px",
              height: "104px",
              margin: "0 auto 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#eaf3ff",
              borderRadius: "30px",
            }}
          >
            <ToolIllustration kind="home" />
          </div>

          <span
            style={{
              display: "inline-block",
              padding: "7px 13px",
              borderRadius: "999px",
              background: "#eaf3ff",
              color: "#3268bd",
              fontSize: "12px",
              fontWeight: 800,
            }}
          >
            필름장이 · 시공자 전용
          </span>

          <h1
            style={{
              margin: "14px 0 8px",
              fontSize: "28px",
              lineHeight: 1.3,
              letterSpacing: "-0.8px",
            }}
          >
            오늘의 현장을 만나보세요
          </h1>

          <p
            style={{
              margin: 0,
              color: "#7b8798",
              fontSize: "14px",
              lineHeight: 1.7,
            }}
          >
            일정 확인부터 필름 재단, 완료보고까지
            <br />
            회사에 등록된 계정으로 로그인해주세요.
          </p>
        </header>

        <form
          onSubmit={handleLogin}
          style={{
            padding: "24px",
            border: "1px solid #e4eaf2",
            borderRadius: "24px",
            background: "#ffffff",
            boxShadow: "0 8px 28px rgba(48, 77, 116, 0.05)",
          }}
        >
          <h2
            style={{
              margin: "0 0 20px",
              fontSize: "20px",
              letterSpacing: "-0.5px",
            }}
          >
            시공자 로그인
          </h2>

          <FieldLabel htmlFor="worker-email">이메일</FieldLabel>

          <input
            id="worker-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="example@email.com"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            style={inputStyle}
          />

          <FieldLabel htmlFor="worker-password">비밀번호</FieldLabel>

          <input
            id="worker-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="비밀번호를 입력해주세요"
            autoComplete="current-password"
            style={inputStyle}
          />

          {message && (
            <div
              role={messageType === "error" ? "alert" : "status"}
              style={{
                marginTop: "16px",
                padding: "13px 14px",
                borderRadius: "14px",
                background:
                  messageType === "success" ? "#ecfdf5" : "#fff1f2",
                color:
                  messageType === "success" ? "#047857" : "#b91c1c",
                fontSize: "13px",
                lineHeight: 1.7,
              }}
            >
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              minHeight: "54px",
              marginTop: "22px",
              padding: "15px",
              border: "none",
              borderRadius: "16px",
              background: loading
                ? "#a9bdd8"
                : "var(--film-blue, #3478ed)",
              color: "#ffffff",
              fontSize: "16px",
              fontWeight: 800,
              boxShadow: loading
                ? "none"
                : "0 6px 16px rgba(52, 120, 237, 0.18)",
              cursor: loading ? "default" : "pointer",
            }}
          >
            {loading ? "로그인 중..." : "내 현장으로 가기 →"}
          </button>

          <p
            style={{
              margin: "20px 0 0",
              paddingTop: "18px",
              borderTop: "1px solid #eef2f7",
              color: "#7b8798",
              fontSize: "12px",
              lineHeight: 1.8,
              textAlign: "center",
            }}
          >
            계정 연결이 필요한 경우
            <br />
            소속 회사 관리자에게 문의해주세요.
          </p>
        </form>

        <Link
          href="/login"
          style={{
            display: "block",
            marginTop: "16px",
            padding: "16px",
            border: "1px solid #e4eaf2",
            borderRadius: "16px",
            background: "#ffffff",
            color: "#50617a",
            textAlign: "center",
            textDecoration: "none",
            fontSize: "14px",
            fontWeight: 800,
          }}
        >
          회사 관리자 로그인
        </Link>

        <Link
          href="/"
          style={{
            display: "block",
            marginTop: "18px",
            padding: "10px",
            color: "#7b8798",
            textAlign: "center",
            textDecoration: "none",
            fontSize: "13px",
            fontWeight: 700,
          }}
        >
          ← 처음으로 돌아가기
        </Link>
      </div>
    </main>
  );
}

function FieldLabel({ htmlFor, children }) {
  return (
    <label
      htmlFor={htmlFor}
      style={{
        display: "block",
        margin: "16px 0 8px",
        color: "#50617a",
        fontSize: "13px",
        fontWeight: 800,
      }}
    >
      {children}
    </label>
  );
}

const inputStyle = {
  width: "100%",
  minHeight: "52px",
  boxSizing: "border-box",
  padding: "14px",
  border: "1px solid #dfe6ef",
  borderRadius: "14px",
  background: "#fbfcfe",
  color: "#243247",
  fontSize: "16px",
};
