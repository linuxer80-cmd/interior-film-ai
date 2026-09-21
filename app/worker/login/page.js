"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../../lib/supabase";

export default function WorkerLoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("error");

  async function getMyWorker() {
    const { data, error } = await supabase.rpc("get_my_worker");

    if (error) {
      throw error;
    }

    if (!data || data.length === 0) {
      return null;
    }

    return data[0];
  }

  async function handleLogin(event) {
    event.preventDefault();

    if (loading) {
      return;
    }

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
      // 1. Supabase Auth 로그인
      const { data, error } =
        await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

      if (error) {
        throw error;
      }

      if (!data?.user) {
        throw new Error(
          "로그인 사용자 정보를 확인하지 못했습니다."
        );
      }

      // 2. 로그인 계정과 연결된 시공자 확인
      const worker = await getMyWorker();

      if (!worker?.worker_id) {
        await supabase.auth.signOut();

        throw new Error(
          "등록된 시공자 계정과 연결되어 있지 않습니다. 회사 관리자에게 계정 연결을 요청해주세요."
        );
      }

      // 3. 비활성 시공자 차단
      if (worker.worker_is_active === false) {
        await supabase.auth.signOut();

        throw new Error(
          "현재 사용이 중지된 시공자 계정입니다. 회사 관리자에게 문의해주세요."
        );
      }

      // 4. 로그인 성공
      setMessageType("success");
      setMessage(
        `${worker.worker_name || "시공자"}님, 로그인되었습니다.`
      );

      setTimeout(() => {
        router.replace("/worker");
        router.refresh();
      }, 500);
    } catch (error) {
      console.error("시공자 로그인 오류:", error);

      let errorMessage =
        error?.message ||
        "로그인 중 오류가 발생했습니다.";

      const lowerMessage =
        errorMessage.toLowerCase();

      if (
        lowerMessage.includes(
          "invalid login credentials"
        )
      ) {
        errorMessage =
          "이메일 또는 비밀번호가 올바르지 않습니다.";
      }

      if (
        lowerMessage.includes(
          "email not confirmed"
        )
      ) {
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
        background: "#f8fafc",
        color: "#111827",
        padding: "20px 14px 70px",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "520px",
          margin: "0 auto",
        }}
      >
        {/* 상단 */}
        <div
          style={{
            marginBottom: "22px",
          }}
        >
          <div
            style={{
              display: "inline-block",
              padding: "6px 11px",
              borderRadius: "999px",
              background: "#111827",
              color: "#ffffff",
              fontSize: "11px",
              fontWeight: "800",
            }}
          >
            인테리어필름 AI
          </div>

          <h1
            style={{
              margin: "14px 0 6px",
              fontSize: "28px",
              lineHeight: 1.3,
              letterSpacing: "-0.8px",
            }}
          >
            시공자 로그인
          </h1>

          <p
            style={{
              margin: 0,
              color: "#6b7280",
              fontSize: "14px",
              lineHeight: 1.65,
            }}
          >
            회사에 등록된 시공자 계정으로
            로그인해주세요.
          </p>
        </div>

        {/* 로그인 카드 */}
        <form
          onSubmit={handleLogin}
          style={{
            padding: "18px",
            border: "1px solid #e5e7eb",
            borderRadius: "18px",
            background: "#ffffff",
            boxShadow:
              "0 4px 18px rgba(0,0,0,0.04)",
          }}
        >
          <FieldLabel>
            이메일
          </FieldLabel>

          <input
            type="email"
            value={email}
            onChange={(event) =>
              setEmail(event.target.value)
            }
            placeholder="example@email.com"
            autoComplete="email"
            autoCapitalize="none"
            style={inputStyle}
          />

          <FieldLabel>
            비밀번호
          </FieldLabel>

          <input
            type="password"
            value={password}
            onChange={(event) =>
              setPassword(event.target.value)
            }
            placeholder="비밀번호"
            autoComplete="current-password"
            style={inputStyle}
          />

          {message && (
            <div
              style={{
                marginTop: "14px",
                padding: "12px",
                borderRadius: "10px",
                background:
                  messageType === "success"
                    ? "#ecfdf5"
                    : "#fef2f2",
                color:
                  messageType === "success"
                    ? "#047857"
                    : "#b91c1c",
                fontSize: "12px",
                lineHeight: 1.6,
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
              marginTop: "18px",
              padding: "15px",
              border: "none",
              borderRadius: "12px",
              background: loading
                ? "#9ca3af"
                : "#111827",
              color: "#ffffff",
              fontSize: "15px",
              fontWeight: "800",
              cursor: loading
                ? "default"
                : "pointer",
            }}
          >
            {loading
              ? "로그인 중..."
              : "시공자 로그인"}
          </button>

          <div
            style={{
              marginTop: "18px",
              paddingTop: "17px",
              borderTop:
                "1px solid #f3f4f6",
              textAlign: "center",
            }}
          >
            <p
              style={{
                margin: 0,
                color: "#6b7280",
                fontSize: "12px",
                lineHeight: 1.7,
              }}
            >
              시공자 계정은 소속 회사 관리자가
              등록한 시공자 정보와 연결되어야 합니다.
            </p>
          </div>
        </form>

        {/* 관리자 로그인 */}
        <Link
          href="/login"
          style={{
            display: "block",
            marginTop: "16px",
            padding: "13px",
            border:
              "1px solid #e5e7eb",
            borderRadius: "12px",
            background: "#ffffff",
            color: "#374151",
            textAlign: "center",
            textDecoration: "none",
            fontSize: "13px",
            fontWeight: "800",
          }}
        >
          회사 관리자 로그인
        </Link>

        <Link
          href="/"
          style={{
            display: "block",
            marginTop: "12px",
            color: "#6b7280",
            textAlign: "center",
            textDecoration: "none",
            fontSize: "13px",
            fontWeight: "700",
          }}
        >
          ← 처음으로 돌아가기
        </Link>
      </div>
    </main>
  );
}

function FieldLabel({ children }) {
  return (
    <label
      style={{
        display: "block",
        margin: "14px 0 7px",
        color: "#374151",
        fontSize: "12px",
        fontWeight: "800",
      }}
    >
      {children}
    </label>
  );
}

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "13px 12px",
  border: "1px solid #d1d5db",
  borderRadius: "11px",
  outline: "none",
  background: "#ffffff",
  color: "#111827",
  fontSize: "14px",
};
