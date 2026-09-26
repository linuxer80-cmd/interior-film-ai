"use client";

import {
  useEffect,
  useState,
} from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

export default function ResetPasswordPage() {
  const router =
    useRouter();

  const [
    password,
    setPassword,
  ] = useState("");

  const [
    passwordConfirm,
    setPasswordConfirm,
  ] = useState("");

  const [
    checking,
    setChecking,
  ] = useState(true);

  const [
    recoveryReady,
    setRecoveryReady,
  ] = useState(false);

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    success,
    setSuccess,
  ] = useState(false);

  const [
    message,
    setMessage,
  ] = useState("");

  /* =========================================================
     비밀번호 복구 세션 확인
  ========================================================= */

  useEffect(() => {
    let mounted =
      true;

    let timeoutId =
      null;

    async function checkRecoverySession() {
      try {
        const {
          data,
          error,
        } =
          await supabase.auth.getSession();

        if (error) {
          throw error;
        }

        if (
          data?.session
        ) {
          if (
            mounted
          ) {
            setRecoveryReady(
              true
            );

            setChecking(
              false
            );
          }

          return;
        }

        /*
         * URL의 복구 토큰 처리를 기다림
         */
        timeoutId =
          setTimeout(
            () => {
              if (
                mounted
              ) {
                setChecking(
                  false
                );

                setMessage(
                  "비밀번호 재설정 링크가 만료되었거나 올바르지 않습니다. 로그인 화면에서 재설정 메일을 다시 받아주세요."
                );
              }
            },
            5000
          );
      } catch (error) {
        console.error(
          "비밀번호 복구 세션 확인:",
          error
        );

        if (
          mounted
        ) {
          setChecking(
            false
          );

          setMessage(
            "비밀번호 재설정 정보를 확인하지 못했습니다."
          );
        }
      }
    }

    /*
     * PASSWORD_RECOVERY 이벤트
     */
    const {
      data: authListener,
    } =
      supabase.auth.onAuthStateChange(
        (
          event,
          session
        ) => {
          if (
            !mounted
          ) {
            return;
          }

          if (
            event ===
              "PASSWORD_RECOVERY" ||
            (
              session &&
              (
                event ===
                  "SIGNED_IN" ||
                event ===
                  "INITIAL_SESSION"
              )
            )
          ) {
            if (
              timeoutId
            ) {
              clearTimeout(
                timeoutId
              );
            }

            setRecoveryReady(
              true
            );

            setChecking(
              false
            );

            setMessage(
              ""
            );
          }
        }
      );

    checkRecoverySession();

    return () => {
      mounted =
        false;

      if (
        timeoutId
      ) {
        clearTimeout(
          timeoutId
        );
      }

      authListener
        ?.subscription
        ?.unsubscribe();
    };
  }, []);

  /* =========================================================
     새 비밀번호 저장
  ========================================================= */

  async function handleSubmit(
    event
  ) {
    event.preventDefault();

    if (
      loading ||
      success
    ) {
      return;
    }

    setMessage("");

    if (
      password.length <
      6
    ) {
      setMessage(
        "새 비밀번호는 6자 이상 입력해주세요."
      );

      return;
    }

    if (
      password !==
      passwordConfirm
    ) {
      setMessage(
        "새 비밀번호가 서로 일치하지 않습니다."
      );

      return;
    }

    setLoading(
      true
    );

    try {
      const {
        error,
      } =
        await supabase.auth.updateUser(
          {
            password,
          }
        );

      if (error) {
        throw error;
      }

      setSuccess(
        true
      );

      setMessage(
        "비밀번호가 변경되었습니다. 새 비밀번호로 다시 로그인해주세요."
      );

      /*
       * 복구용 로그인 세션 종료
       */
      try {
        await supabase.auth.signOut();
      } catch (signOutError) {
        console.error(
          "비밀번호 변경 후 로그아웃:",
          signOutError
        );
      }

      setTimeout(
        () => {
          router.replace(
            "/login"
          );

          router.refresh();
        },
        1800
      );
    } catch (error) {
      console.error(
        "비밀번호 변경 오류:",
        error
      );

      let errorMessage =
        error?.message ||
        "비밀번호를 변경하지 못했습니다.";

      const lowerMessage =
        errorMessage.toLowerCase();

      if (
        lowerMessage.includes(
          "same password"
        )
      ) {
        errorMessage =
          "기존 비밀번호와 다른 비밀번호를 입력해주세요.";
      }

      if (
        lowerMessage.includes(
          "session"
        ) ||
        lowerMessage.includes(
          "jwt"
        )
      ) {
        errorMessage =
          "비밀번호 재설정 링크가 만료되었습니다. 재설정 메일을 다시 받아주세요.";
      }

      setMessage(
        errorMessage
      );
    } finally {
      setLoading(
        false
      );
    }
  }

  /* =========================================================
     화면
  ========================================================= */

  return (
    <main
      style={{
        minHeight:
          "100vh",

        background:
          "#f8fafc",

        padding:
          "20px 14px 70px",

        boxSizing:
          "border-box",

        color:
          "#111827",
      }}
    >
      <div
        style={{
          width:
            "100%",

          maxWidth:
            "520px",

          margin:
            "0 auto",
        }}
      >
        <div
          style={{
            marginBottom:
              "22px",
          }}
        >
          <div
            style={{
              display:
                "inline-block",

              padding:
                "6px 11px",

              borderRadius:
                "999px",

              background:
                "#111827",

              color:
                "#ffffff",

              fontSize:
                "11px",

              fontWeight:
                "800",
            }}
          >
            인테리어필름 AI
          </div>

          <h1
            style={{
              margin:
                "14px 0 6px",

              fontSize:
                "28px",

              lineHeight:
                1.3,

              letterSpacing:
                "-0.8px",
            }}
          >
            새 비밀번호 설정
          </h1>

          <p
            style={{
              margin:
                0,

              color:
                "#6b7280",

              fontSize:
                "14px",

              lineHeight:
                1.65,
            }}
          >
            앞으로 사용할 새 비밀번호를 설정해주세요.
          </p>
        </div>

        <section
          style={{
            padding:
              "18px",

            border:
              "1px solid #e5e7eb",

            borderRadius:
              "18px",

            background:
              "#ffffff",

            boxShadow:
              "0 4px 18px rgba(0,0,0,0.04)",
          }}
        >
          {checking && (
            <div
              style={{
                padding:
                  "22px 12px",

                textAlign:
                  "center",

                color:
                  "#64748b",

                fontSize:
                  "13px",

                fontWeight:
                  "700",
              }}
            >
              비밀번호 재설정 정보를 확인하고 있습니다...
            </div>
          )}

          {!checking &&
            recoveryReady &&
            !success && (
              <form
                onSubmit={
                  handleSubmit
                }
              >
                <FieldLabel>
                  새 비밀번호
                </FieldLabel>

                <input
                  type="password"
                  value={
                    password
                  }
                  onChange={(
                    event
                  ) =>
                    setPassword(
                      event.target.value
                    )
                  }
                  autoComplete="new-password"
                  placeholder="6자 이상 입력"
                  disabled={
                    loading
                  }
                  style={
                    inputStyle
                  }
                />

                <FieldLabel>
                  새 비밀번호 확인
                </FieldLabel>

                <input
                  type="password"
                  value={
                    passwordConfirm
                  }
                  onChange={(
                    event
                  ) =>
                    setPasswordConfirm(
                      event.target.value
                    )
                  }
                  autoComplete="new-password"
                  placeholder="새 비밀번호 다시 입력"
                  disabled={
                    loading
                  }
                  style={
                    inputStyle
                  }
                />

                {message && (
                  <div
                    style={
                      errorMessageStyle
                    }
                  >
                    {message}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={
                    loading
                  }
                  style={{
                    width:
                      "100%",

                    marginTop:
                      "18px",

                    padding:
                      "15px",

                    border:
                      "none",

                    borderRadius:
                      "12px",

                    background:
                      loading
                        ? "#9ca3af"
                        : "#111827",

                    color:
                      "#ffffff",

                    fontSize:
                      "15px",

                    fontWeight:
                      "800",

                    cursor:
                      loading
                        ? "default"
                        : "pointer",
                  }}
                >
                  {loading
                    ? "변경 중..."
                    : "새 비밀번호 저장"}
                </button>
              </form>
            )}

          {!checking &&
            success && (
              <div
                style={{
                  textAlign:
                    "center",

                  padding:
                    "18px 8px",
                }}
              >
                <div
                  style={{
                    fontSize:
                      "42px",
                  }}
                >
                  ✓
                </div>

                <div
                  style={{
                    marginTop:
                      "10px",

                    color:
                      "#047857",

                    fontSize:
                      "16px",

                    fontWeight:
                      "900",
                  }}
                >
                  비밀번호 변경 완료
                </div>

                <div
                  style={{
                    marginTop:
                      "8px",

                    color:
                      "#475569",

                    fontSize:
                      "13px",

                    lineHeight:
                      1.6,
                  }}
                >
                  {message}
                </div>
              </div>
            )}

          {!checking &&
            !recoveryReady &&
            !success && (
              <div>
                <div
                  style={{
                    padding:
                      "14px",

                    borderRadius:
                      "10px",

                    background:
                      "#fef2f2",

                    color:
                      "#b91c1c",

                    fontSize:
                      "13px",

                    lineHeight:
                      1.6,
                  }}
                >
                  {message ||
                    "비밀번호 재설정 링크를 확인할 수 없습니다."}
                </div>

                <Link
                  href="/login"
                  style={{
                    display:
                      "block",

                    marginTop:
                      "14px",

                    padding:
                      "14px",

                    borderRadius:
                      "11px",

                    background:
                      "#111827",

                    color:
                      "#ffffff",

                    textDecoration:
                      "none",

                    textAlign:
                      "center",

                    fontSize:
                      "14px",

                    fontWeight:
                      "800",
                  }}
                >
                  로그인에서 다시 요청하기
                </Link>
              </div>
            )}
        </section>

        <Link
          href="/login"
          style={{
            display:
              "block",

            marginTop:
              "16px",

            color:
              "#6b7280",

            textAlign:
              "center",

            textDecoration:
              "none",

            fontSize:
              "13px",

            fontWeight:
              "700",
          }}
        >
          ← 업체 로그인
        </Link>
      </div>
    </main>
  );
}

function FieldLabel({
  children,
}) {
  return (
    <label
      style={{
        display:
          "block",

        margin:
          "14px 0 7px",

        color:
          "#374151",

        fontSize:
          "12px",

        fontWeight:
          "800",
      }}
    >
      {children}
    </label>
  );
}

const inputStyle = {
  width:
    "100%",

  boxSizing:
    "border-box",

  padding:
    "13px 12px",

  border:
    "1px solid #d1d5db",

  borderRadius:
    "11px",

  outline:
    "none",

  background:
    "#ffffff",

  color:
    "#111827",

  fontSize:
    "14px",
};

const errorMessageStyle = {
  marginTop:
    "14px",

  padding:
    "12px",

  borderRadius:
    "10px",

  background:
    "#fef2f2",

  color:
    "#b91c1c",

  fontSize:
    "12px",

  lineHeight:
    1.6,
};
