"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../../lib/supabase";

export default function WorkerInviteSignup({
  inviteCode,
}) {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [
    passwordConfirm,
    setPasswordConfirm,
  ] = useState("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  /*
   * 이메일 인증 후 페이지로 돌아왔을 때
   * accept_worker_invite가 중복 실행되는 것을 방지
   */
  const autoConnectStarted =
    useRef(false);

  /* =========================================================
     초대 연결
  ========================================================= */

  async function acceptInvite() {
    if (!inviteCode) {
      throw new Error(
        "초대코드를 확인할 수 없습니다."
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
      }
    );

    if (error) {
      throw error;
    }

    if (!data) {
      throw new Error(
        "시공자 계정 연결에 실패했습니다."
      );
    }

    return data;
  }

  /* =========================================================
     이메일 인증 후 자동 연결

     이메일 인증 링크를 누른 뒤
     /worker/invite/{code} 로 돌아왔을 때:

     1. Supabase 세션 확인
     2. 로그인된 사용자가 있으면
     3. 초대 자동 수락
     4. /worker 이동
  ========================================================= */

  useEffect(() => {
    if (!inviteCode) {
      return;
    }

    let mounted = true;

    async function checkAuthenticatedReturn() {
      try {
        /*
         * Supabase가 이메일 인증 URL의
         * 토큰을 처리할 시간을 조금 확보
         */
        await new Promise((resolve) => {
          setTimeout(resolve, 300);
        });

        if (!mounted) {
          return;
        }

        const {
          data: sessionData,
          error: sessionError,
        } =
          await supabase.auth.getSession();

        if (sessionError) {
          console.error(
            "인증 세션 확인:",
            sessionError
          );

          return;
        }

        const session =
          sessionData?.session;

        /*
         * 인증 완료 세션이 없으면
         * 일반 초대 페이지이므로 아무것도 하지 않음
         */
        if (!session?.user) {
          return;
        }

        if (
          autoConnectStarted.current
        ) {
          return;
        }

        autoConnectStarted.current = true;

        setLoading(true);
        setSuccess(true);

        setMessage(
          "✅ 이메일 확인이 완료되었습니다.\n시공자 계정을 연결하고 있습니다..."
        );

        await acceptInvite();

        if (!mounted) {
          return;
        }

        setMessage(
          "✅ 이메일 확인 및 시공자 계정 등록이 완료되었습니다.\n시공자 페이지로 이동합니다."
        );

        setTimeout(() => {
          router.replace("/worker");
          router.refresh();
        }, 800);
      } catch (error) {
        console.error(
          "이메일 인증 후 자동 연결:",
          error
        );

        if (!mounted) {
          return;
        }

        /*
         * 이미 연결된 초대를 다시 열었을 가능성도 있으므로
         * 현재 로그인 계정이 실제 worker인지 확인
         */
        try {
          const {
            data: workerData,
            error: workerError,
          } = await supabase.rpc(
            "get_my_worker"
          );

          if (!workerError) {
            const worker =
              Array.isArray(workerData)
                ? workerData[0]
                : workerData;

            if (worker?.worker_id) {
              setSuccess(true);

              setMessage(
                "✅ 이미 시공자 계정 연결이 완료되어 있습니다.\n시공자 페이지로 이동합니다."
              );

              setTimeout(() => {
                router.replace(
                  "/worker"
                );

                router.refresh();
              }, 800);

              return;
            }
          }
        } catch (
          workerCheckError
        ) {
          console.error(
            "시공자 연결 상태 확인:",
            workerCheckError
          );
        }

        autoConnectStarted.current =
          false;

        setSuccess(false);

        setMessage(
          `❌ ${
            error?.message ||
            "이메일 확인 후 계정 연결에 실패했습니다."
          }\n\n아래에서 가입한 이메일과 비밀번호를 입력한 뒤 '기존 계정으로 연결'을 눌러주세요.`
        );

        setLoading(false);
      }
    }

    checkAuthenticatedReturn();

    /*
     * 이메일 인증 과정에서 Auth 상태가
     * 변경되는 경우도 감지
     */

    const {
      data: authListener,
    } =
      supabase.auth.onAuthStateChange(
        async (event, session) => {
          if (!mounted) {
            return;
          }

          if (!session?.user) {
            return;
          }

          if (
            autoConnectStarted.current
          ) {
            return;
          }

          if (
            event !== "SIGNED_IN" &&
            event !==
              "TOKEN_REFRESHED" &&
            event !==
              "INITIAL_SESSION"
          ) {
            return;
          }

          autoConnectStarted.current =
            true;

          try {
            setLoading(true);
            setSuccess(true);

            setMessage(
              "✅ 이메일 확인이 완료되었습니다.\n시공자 계정을 연결하고 있습니다..."
            );

            await acceptInvite();

            if (!mounted) {
              return;
            }

            setMessage(
              "✅ 시공자 계정 등록이 완료되었습니다.\n시공자 페이지로 이동합니다."
            );

            setTimeout(() => {
              router.replace(
                "/worker"
              );

              router.refresh();
            }, 800);
          } catch (error) {
            console.error(
              "인증 상태 변경 후 초대 연결:",
              error
            );

            autoConnectStarted.current =
              false;

            if (mounted) {
              setSuccess(false);

              setMessage(
                `❌ ${
                  error?.message ||
                  "시공자 계정 연결에 실패했습니다."
                }`
              );

              setLoading(false);
            }
          }
        }
      );

    return () => {
      mounted = false;

      authListener?.subscription?.unsubscribe();
    };
  }, [inviteCode, router]);

  /* =========================================================
     신규 계정 생성
  ========================================================= */

  async function handleSignup(
    event
  ) {
    event.preventDefault();

    if (loading) {
      return;
    }

    setMessage("");
    setSuccess(false);

    const cleanEmail =
      email.trim().toLowerCase();

    if (!cleanEmail) {
      setMessage(
        "❌ 이메일을 입력해주세요."
      );

      return;
    }

    if (!password) {
      setMessage(
        "❌ 비밀번호를 입력해주세요."
      );

      return;
    }

    if (password.length < 6) {
      setMessage(
        "❌ 비밀번호는 6자 이상 입력해주세요."
      );

      return;
    }

    if (
      password !==
      passwordConfirm
    ) {
      setMessage(
        "❌ 비밀번호가 서로 다릅니다."
      );

      return;
    }

    if (!inviteCode) {
      setMessage(
        "❌ 올바른 초대 링크가 아닙니다."
      );

      return;
    }

    setLoading(true);

    try {
      /* =====================================================
         관리자 등 기존 로그인 세션 제거
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
         이메일 인증 후 돌아올 주소

         반드시 현재 초대코드를 보존한다.
      ===================================================== */

      const redirectUrl =
        typeof window !==
        "undefined"
          ? `${window.location.origin}/worker/invite/${encodeURIComponent(
              inviteCode
            )}`
          : undefined;

      /* =====================================================
         Supabase Auth 계정 생성
      ===================================================== */

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
          "계정을 생성하지 못했습니다."
        );
      }

      /* =====================================================
         이메일 인증이 꺼져 있는 경우

         즉시 세션이 생기므로 바로 연결
      ===================================================== */

      if (session) {
        autoConnectStarted.current =
          true;

        await acceptInvite();

        setSuccess(true);

        setMessage(
          "✅ 시공자 계정 등록이 완료되었습니다.\n시공자 페이지로 이동합니다."
        );

        setTimeout(() => {
          router.replace("/worker");
          router.refresh();
        }, 800);

        return;
      }

      /* =====================================================
         이메일 인증 필요

         여기서는 worker 연결하지 않는다.

         사용자가 이메일의 인증 링크를 누르고
         실제 이메일 소유 확인이 완료된 뒤 연결한다.
      ===================================================== */

      setSuccess(true);

      setMessage(
        "📧 인증 이메일을 보냈습니다.\n\n가입한 이메일에서 인증 링크를 눌러 본인 이메일이 맞는지 확인해주세요.\n\n이메일 확인이 완료되면 이 초대 페이지로 돌아와 시공자 계정이 자동으로 연결됩니다."
      );
    } catch (error) {
      console.error(
        "시공자 계정 등록:",
        error
      );

      let errorMessage =
        error?.message ||
        "시공자 계정 등록에 실패했습니다.";

      const lowerMessage =
        errorMessage.toLowerCase();

      if (
        lowerMessage.includes(
          "already registered"
        ) ||
        lowerMessage.includes(
          "user already registered"
        )
      ) {
        errorMessage =
          "이미 가입된 이메일입니다. 아래 '기존 계정으로 연결'을 이용해주세요.";
      }

      setSuccess(false);

      setMessage(
        `❌ ${errorMessage}`
      );
    } finally {
      setLoading(false);
    }
  }

  /* =========================================================
     기존 계정으로 연결

     이미 가입 + 이메일 인증까지 완료된 계정은
     이 버튼으로 로그인 후 초대와 연결
  ========================================================= */

  async function handleExistingAccount() {
    if (loading) {
      return;
    }

    const cleanEmail =
      email.trim().toLowerCase();

    if (!cleanEmail) {
      setMessage(
        "❌ 이메일을 입력해주세요."
      );

      return;
    }

    if (!password) {
      setMessage(
        "❌ 비밀번호를 입력해주세요."
      );

      return;
    }

    if (!inviteCode) {
      setMessage(
        "❌ 올바른 초대 링크가 아닙니다."
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
          "로그인에 실패했습니다."
        );
      }

      /*
       * onAuthStateChange와 중복 실행 방지
       */
      autoConnectStarted.current =
        true;

      await acceptInvite();

      setSuccess(true);

      setMessage(
        "✅ 이메일 확인 및 시공자 계정 연결이 완료되었습니다.\n시공자 페이지로 이동합니다."
      );

      setTimeout(() => {
        router.replace("/worker");
        router.refresh();
      }, 800);
    } catch (error) {
      console.error(
        "기존 계정 연결:",
        error
      );

      autoConnectStarted.current =
        false;

      let errorMessage =
        error?.message ||
        "계정 연결에 실패했습니다.";

      const lowerMessage =
        errorMessage.toLowerCase();

      if (
        lowerMessage.includes(
          "email not confirmed"
        )
      ) {
        errorMessage =
          "아직 이메일 확인이 완료되지 않았습니다. 가입한 이메일에서 인증 링크를 먼저 눌러주세요.";
      }

      if (
        lowerMessage.includes(
          "invalid login credentials"
        )
      ) {
        errorMessage =
          "이메일 또는 비밀번호가 올바르지 않습니다.";
      }

      setSuccess(false);

      setMessage(
        `❌ ${errorMessage}`
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
              lineHeight: 1.6,
            }}
          >
            회사 관리자가 보낸 초대 링크입니다.
            <br />
            본인 이메일 확인 후 시공자 계정이
            연결됩니다.
          </div>
        </div>

        {/* ===================================================
            카드
        =================================================== */}

        <div
          style={{
            padding: "18px",
            border: "1px solid #e2e8f0",
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
              autoCapitalize="none"
              value={email}
              disabled={loading}
              onChange={(event) =>
                setEmail(
                  event.target.value
                )
              }
              placeholder="example@email.com"
              style={inputStyle}
            />

            <div
              style={{
                height: "14px",
              }}
            />

            {/* 비밀번호 */}

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
                  event.target.value
                )
              }
              placeholder="6자 이상 입력"
              style={inputStyle}
            />

            <div
              style={{
                height: "14px",
              }}
            />

            {/* 비밀번호 확인 */}

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
                  event.target.value
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
                  padding: "12px",
                  borderRadius: "10px",

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
                  lineHeight: 1.7,
                  whiteSpace: "pre-wrap",
                }}
              >
                {message}
              </div>
            )}

            {/* 신규 가입 */}

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
                background: "#e2e8f0",
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
                background: "#e2e8f0",
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
              border: "1px solid #cbd5e1",
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
              padding: "11px",
              borderRadius: "9px",
              background: "#f8fafc",
              color: "#64748b",
              fontSize: "11px",
              lineHeight: 1.7,
            }}
          >
            이미 이메일 인증까지 완료한 계정이
            있다면 위에 이메일과 비밀번호를
            입력한 뒤{" "}
            <strong>
              기존 계정으로 연결
            </strong>
            을 눌러주세요.
          </div>
        </div>

        {/* ===================================================
            로그인
        =================================================== */}

        <div
          style={{
            marginTop: "16px",
            textAlign: "center",
          }}
        >
          <button
            type="button"
            disabled={loading}
            onClick={() =>
              router.push(
                "/worker/login"
              )
            }
            style={{
              border: "none",
              background: "transparent",
              color: "#475569",
              fontSize: "12px",
              fontWeight: "700",
              cursor:
                loading
                  ? "default"
                  : "pointer",
            }}
          >
            이미 등록을 완료했나요? 시공자 로그인 →
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
  border: "1px solid #cbd5e1",
  borderRadius: "9px",
  background: "#ffffff",
  color: "#111827",
  fontSize: "14px",
  outline: "none",
};
