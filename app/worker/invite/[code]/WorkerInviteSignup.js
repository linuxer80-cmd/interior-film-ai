"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../../lib/supabase";

export default function WorkerInviteSignup({
  inviteCode,
}) {
  const router = useRouter();

  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [
    passwordConfirm,
    setPasswordConfirm,
  ] = useState("");

  const [loading, setLoading] =
    useState(false);

  const [message, setMessage] =
    useState("");

  const [success, setSuccess] =
    useState(false);

  /* =========================================================
     초대 연결
  ========================================================= */

  async function acceptInvite() {
    if (!inviteCode) {
      throw new Error(
        "초대코드를 확인할 수 없습니다.",
      );
    }

    const {
      data,
      error,
    } = await supabase.rpc(
      "accept_worker_invite",
      {
        target_invite_code:
          inviteCode,
      },
    );

    if (error) {
      throw error;
    }

    if (!data) {
      throw new Error(
        "시공자 계정 연결에 실패했습니다.",
      );
    }

    return data;
  }

  /* =========================================================
     가입
  ========================================================= */

  async function handleSignup(
    event,
  ) {
    event.preventDefault();

    if (loading) {
      return;
    }

    setMessage("");
    setSuccess(false);

    const cleanEmail =
      email.trim();

    if (!cleanEmail) {
      setMessage(
        "❌ 이메일을 입력해주세요.",
      );

      return;
    }

    if (!password) {
      setMessage(
        "❌ 비밀번호를 입력해주세요.",
      );

      return;
    }

    if (password.length < 6) {
      setMessage(
        "❌ 비밀번호는 6자 이상 입력해주세요.",
      );

      return;
    }

    if (
      password !==
      passwordConfirm
    ) {
      setMessage(
        "❌ 비밀번호가 서로 다릅니다.",
      );

      return;
    }

    if (!inviteCode) {
      setMessage(
        "❌ 올바른 초대 링크가 아닙니다.",
      );

      return;
    }

    setLoading(true);

    try {
      /* =====================================================
         혹시 기존 로그인 상태가 있으면 로그아웃

         회사 관리자 계정 등이 로그인된 상태에서
         초대 링크를 열었을 때 잘못 연결되는 것을 방지
      ===================================================== */

      const {
        data: sessionData,
      } =
        await supabase.auth.getSession();

      if (
        sessionData?.session
      ) {
        await supabase.auth.signOut();
      }

      /* =====================================================
         시공자 Auth 계정 생성
      ===================================================== */

      const redirectUrl =
        typeof window !==
        "undefined"
          ? `${window.location.origin}/worker/invite/${inviteCode}`
          : undefined;

      const {
        data: signupData,
        error: signupError,
      } =
        await supabase.auth.signUp({
          email: cleanEmail,
          password,

          options: {
            emailRedirectTo:
              redirectUrl,
          },
        });

      if (signupError) {
        throw signupError;
      }

      const user =
        signupData?.user;

      const session =
        signupData?.session;

      if (!user) {
        throw new Error(
          "계정을 생성하지 못했습니다.",
        );
      }

      /* =====================================================
         이메일 확인이 꺼져 있으면
         signUp 즉시 session이 생김

         → 바로 worker 연결 가능
      ===================================================== */

      if (session) {
        await acceptInvite();

        setSuccess(true);

        setMessage(
          "✅ 시공자 계정 등록이 완료되었습니다.",
        );

        setTimeout(() => {
          router.replace(
            "/worker",
          );
        }, 1000);

        return;
      }

      /* =====================================================
         이메일 확인이 켜져 있으면 session이 없음

         → 이메일 인증 후 같은 초대 URL로 돌아오게 함
      ===================================================== */

      setSuccess(true);

      setMessage(
        "✅ 계정이 생성되었습니다.\n\n이메일로 전송된 인증 메일을 확인해주세요.\n인증 후 이 초대 페이지로 다시 돌아오면 계정 연결을 완료할 수 있습니다.",
      );
    } catch (error) {
      console.error(
        "시공자 계정 등록:",
        error,
      );

      const errorMessage =
        error?.message ||
        "시공자 계정 등록에 실패했습니다.";

      setMessage(
        `❌ ${errorMessage}`,
      );
    } finally {
      setLoading(false);
    }
  }

  /* =========================================================
     기존 계정 로그인 후 초대 연결

     같은 이메일로 이미 Supabase Auth 계정이 있는 경우 사용
  ========================================================= */

  async function handleExistingAccount() {
    if (loading) {
      return;
    }

    const cleanEmail =
      email.trim();

    if (!cleanEmail) {
      setMessage(
        "❌ 이메일을 입력해주세요.",
      );

      return;
    }

    if (!password) {
      setMessage(
        "❌ 비밀번호를 입력해주세요.",
      );

      return;
    }

    if (!inviteCode) {
      setMessage(
        "❌ 올바른 초대 링크가 아닙니다.",
      );

      return;
    }

    setLoading(true);
    setMessage("");
    setSuccess(false);

    try {
      await supabase.auth.signOut();

      const {
        data,
        error,
      } =
        await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

      if (error) {
        throw error;
      }

      if (!data?.user) {
        throw new Error(
          "로그인에 실패했습니다.",
        );
      }

      await acceptInvite();

      setSuccess(true);

      setMessage(
        "✅ 기존 계정과 시공자 정보가 연결되었습니다.",
      );

      setTimeout(() => {
        router.replace(
          "/worker",
        );
      }, 1000);
    } catch (error) {
      console.error(
        "기존 계정 연결:",
        error,
      );

      setMessage(
        `❌ ${
          error?.message ||
          "계정 연결에 실패했습니다."
        }`,
      );
    } finally {
      setLoading(false);
    }
  }

  /* =========================================================
     화면
  ========================================================= */

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f8fafc",
        padding: "24px 14px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "460px",
          margin: "0 auto",
        }}
      >
        {/* ===================================================
            제목
        =================================================== */}

        <div
          style={{
            marginBottom: "18px",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: "32px",
              marginBottom: "8px",
            }}
          >
            👷
          </div>

          <h1
            style={{
              margin: 0,
              color: "#111827",
              fontSize: "22px",
              fontWeight: "900",
            }}
          >
            시공자 계정 등록
          </h1>

          <div
            style={{
              marginTop: "7px",
              color: "#64748b",
              fontSize: "13px",
              lineHeight: "1.6",
            }}
          >
            회사 관리자가 보낸
            초대 링크입니다.
            <br />
            로그인에 사용할 계정을
            등록해주세요.
          </div>
        </div>

        {/* ===================================================
            카드
        =================================================== */}

        <div
          style={{
            padding: "18px",
            border:
              "1px solid #e2e8f0",
            borderRadius: "16px",
            background: "#ffffff",
            boxShadow:
              "0 8px 24px rgba(15,23,42,0.06)",
          }}
        >
          <form
            onSubmit={
              handleSignup
            }
          >
            {/* 이메일 */}

            <FieldLabel>
              이메일
            </FieldLabel>

            <input
              type="email"
              autoComplete="email"
              value={email}
              disabled={loading}
              onChange={(event) =>
                setEmail(
                  event.target.value,
                )
              }
              placeholder="example@email.com"
              style={inputStyle}
            />

            {/* 비밀번호 */}

            <div
              style={{
                height: "14px",
              }}
            />

            <FieldLabel>
              비밀번호
            </FieldLabel>

            <input
              type="password"
              autoComplete="new-password"
              value={password}
              disabled={loading}
              onChange={(event) =>
                setPassword(
                  event.target.value,
                )
              }
              placeholder="6자 이상 입력"
              style={inputStyle}
            />

            {/* 비밀번호 확인 */}

            <div
              style={{
                height: "14px",
              }}
            />

            <FieldLabel>
              비밀번호 확인
            </FieldLabel>

            <input
              type="password"
              autoComplete="new-password"
              value={
                passwordConfirm
              }
              disabled={loading}
              onChange={(event) =>
                setPasswordConfirm(
                  event.target.value,
                )
              }
              placeholder="비밀번호 다시 입력"
              style={inputStyle}
            />

            {/* 메시지 */}

            {message && (
              <div
                style={{
                  marginTop: "15px",
                  padding: "11px 12px",
                  borderRadius: "9px",

                  background:
                    success
                      ? "#f0fdf4"
                      : "#fef2f2",

                  color:
                    success
                      ? "#166534"
                      : "#b91c1c",

                  fontSize: "12px",
                  fontWeight: "700",
                  lineHeight: "1.6",
                  whiteSpace:
                    "pre-wrap",
                }}
              >
                {message}
              </div>
            )}

            {/* 신규 계정 생성 */}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                marginTop: "18px",
                padding: "13px",
                border: "none",
                borderRadius: "10px",

                background:
                  loading
                    ? "#94a3b8"
                    : "#111827",

                color: "#ffffff",

                fontSize: "14px",
                fontWeight: "900",

                cursor:
                  loading
                    ? "default"
                    : "pointer",
              }}
            >
              {loading
                ? "처리 중..."
                : "시공자 계정 만들기"}
            </button>
          </form>

          {/* =================================================
              기존 계정
          ================================================= */}

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              margin: "18px 0",
            }}
          >
            <div
              style={{
                flex: 1,
                height: "1px",
                background:
                  "#e2e8f0",
              }}
            />

            <span
              style={{
                color: "#94a3b8",
                fontSize: "11px",
              }}
            >
              또는
            </span>

            <div
              style={{
                flex: 1,
                height: "1px",
                background:
                  "#e2e8f0",
              }}
            />
          </div>

          <button
            type="button"
            disabled={loading}
            onClick={
              handleExistingAccount
            }
            style={{
              width: "100%",
              padding: "12px",
              border:
                "1px solid #cbd5e1",
              borderRadius: "10px",
              background: "#ffffff",
              color: "#334155",
              fontSize: "13px",
              fontWeight: "800",

              cursor:
                loading
                  ? "default"
                  : "pointer",
            }}
          >
            기존 계정으로 연결
          </button>

          <div
            style={{
              marginTop: "14px",
              padding: "10px",
              borderRadius: "9px",
              background: "#f8fafc",
              color: "#64748b",
              fontSize: "11px",
              lineHeight: "1.6",
            }}
          >
            이미 계정이 있다면 위에
            해당 이메일과 비밀번호를
            입력한 뒤
            <strong>
              {" "}
              기존 계정으로 연결
            </strong>
            을 눌러주세요.
          </div>
        </div>

        {/* ===================================================
            시공자 로그인
        =================================================== */}

        <div
          style={{
            marginTop: "16px",
            textAlign: "center",
          }}
        >
          <button
            type="button"
            onClick={() =>
              router.push(
                "/worker/login",
              )
            }
            style={{
              border: "none",
              background:
                "transparent",
              color: "#475569",
              fontSize: "12px",
              fontWeight: "700",
              cursor: "pointer",
            }}
          >
            이미 등록을 완료했나요?
            시공자 로그인 →
          </button>
        </div>
      </div>
    </main>
  );
}

/* =========================================================
   라벨
========================================================= */

function FieldLabel({
  children,
}) {
  return (
    <label
      style={{
        display: "block",
        marginBottom: "6px",
        color: "#334155",
        fontSize: "12px",
        fontWeight: "800",
      }}
    >
      {children}
    </label>
  );
}

/* =========================================================
   입력 스타일
========================================================= */

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "12px",
  border:
    "1px solid #cbd5e1",
  borderRadius: "9px",
  background: "#ffffff",
  color: "#111827",
  fontSize: "14px",
  outline: "none",
};
