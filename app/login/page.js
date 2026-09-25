"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [forgotMode, setForgotMode] = useState(false);
  const [resetCompanyName, setResetCompanyName] = useState("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("error");

  /* =========================================================
     현재 로그인 사용자의 업체 조회
  ========================================================= */

  async function getMyCompany() {
    const { data, error } = await supabase.rpc(
      "get_my_company"
    );

    if (error) {
      throw error;
    }

    if (!data || data.length === 0) {
      return null;
    }

    return data[0];
  }

  /* =========================================================
     기존 업체 확인 / 신규 업체 생성
     기존 기능 그대로 유지
  ========================================================= */

  async function ensureCompany(user) {
    if (!user?.id) {
      throw new Error(
        "사용자 정보를 확인할 수 없습니다."
      );
    }

    /*
     * 1. 현재 로그인한 사용자의 업체 연결 확인
     */
    const existingCompany = await getMyCompany();

    if (existingCompany?.company_id) {
      if (existingCompany.is_active === false) {
        throw new Error(
          "현재 사용이 중지된 업체 계정입니다."
        );
      }

      return {
        companyId: existingCompany.company_id,
        companyName: existingCompany.company_name,
        companySlug: existingCompany.company_slug,
        created: false,
      };
    }

    /*
     * 2. 아직 업체에 연결되지 않은 신규 가입자라면
     * Auth metadata에서 가입 정보를 읽는다.
     */
    const metadata = user.user_metadata || {};

    const companyName = String(
      metadata.company_name || ""
    ).trim();

    const ownerName = String(
      metadata.owner_name || ""
    ).trim();

    const phone = String(
      metadata.phone || ""
    ).trim();

    const companySlug = String(
      metadata.company_slug || ""
    )
      .trim()
      .toLowerCase();

    /*
     * 회원가입 정보가 없는 일반 계정이라면
     * 자동으로 회사를 만들면 안 된다.
     */
    if (!companyName || !companySlug) {
      throw new Error(
        "업체 가입 정보가 없습니다. 업체 회원가입 페이지에서 가입한 계정인지 확인해주세요."
      );
    }

    /*
     * 3. 신규 업체 생성
     */
    const {
      data: companyId,
      error: companyError,
    } = await supabase.rpc(
      "create_my_company",
      {
        p_company_name: companyName,
        p_slug: companySlug,
        p_owner_name: ownerName || null,
        p_phone: phone || null,
      }
    );

    if (companyError) {
      const retryCompany =
        await getMyCompany();

      if (retryCompany?.company_id) {
        if (
          retryCompany.is_active ===
          false
        ) {
          throw new Error(
            "현재 사용이 중지된 업체 계정입니다."
          );
        }

        return {
          companyId:
            retryCompany.company_id,

          companyName:
            retryCompany.company_name,

          companySlug:
            retryCompany.company_slug,

          created:
            false,
        };
      }

      throw companyError;
    }

    /*
     * 회사 연결 상태 다시 확인
     */
    const createdCompany =
      await getMyCompany();

    if (createdCompany?.company_id) {
      if (
        createdCompany.is_active ===
        false
      ) {
        throw new Error(
          "현재 사용이 중지된 업체 계정입니다."
        );
      }

      return {
        companyId:
          createdCompany.company_id,

        companyName:
          createdCompany.company_name ||
          companyName,

        companySlug:
          createdCompany.company_slug ||
          companySlug,

        created:
          true,
      };
    }

    if (!companyId) {
      throw new Error(
        "업체 정보를 생성하지 못했습니다."
      );
    }

    return {
      companyId,
      companyName,
      companySlug,
      created: true,
    };
  }

  /* =========================================================
     기존 로그인
  ========================================================= */

  async function handleLogin(event) {
    event.preventDefault();

    if (loading) {
      return;
    }

    setMessage("");
    setMessageType("error");

    const cleanEmail = email
      .trim()
      .toLowerCase();

    if (!cleanEmail) {
      setMessage(
        "이메일을 입력해주세요."
      );
      return;
    }

    if (!password) {
      setMessage(
        "비밀번호를 입력해주세요."
      );
      return;
    }

    setLoading(true);

    try {
      /*
       * 1. Supabase Auth 로그인
       */
      const { data, error } =
        await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

      if (error) {
        throw error;
      }

      const user = data?.user;

      if (!user) {
        throw new Error(
          "로그인 사용자 정보를 확인하지 못했습니다."
        );
      }

      /*
       * 2. 기존 업체 연결 확인 또는 신규 업체 생성
       */
      const result =
        await ensureCompany(user);

      if (!result?.companyId) {
        throw new Error(
          "업체 연결 정보를 확인하지 못했습니다."
        );
      }

      /*
       * 3. 로그인 성공
       */
      if (result.created) {
        setMessageType("success");

        setMessage(
          `${
            result.companyName ||
            "업체"
          } 등록이 완료되었습니다.`
        );

        setTimeout(() => {
          router.replace("/admin");
          router.refresh();
        }, 1000);

        return;
      }

      setMessageType("success");

      setMessage(
        `${
          result.companyName ||
          "업체"
        } 계정으로 로그인되었습니다.`
      );

      setTimeout(() => {
        router.replace("/admin");
        router.refresh();
      }, 700);
    } catch (error) {
      console.error(
        "업체 로그인 오류:",
        error
      );

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

      /*
       * 이미 회사에 연결된 계정 오류가 발생한 경우
       * 마지막으로 로그인 상태를 확인
       */
      if (
        lowerMessage.includes(
          "already"
        ) &&
        lowerMessage.includes(
          "company"
        )
      ) {
        try {
          const company =
            await getMyCompany();

          if (company) {
            router.replace(
              "/admin"
            );

            router.refresh();

            return;
          }
        } catch (
          finalCheckError
        ) {
          console.error(
            "최종 회사 확인 실패:",
            finalCheckError
          );
        }
      }

      if (
        errorMessage.includes(
          "이미 회사에 연결"
        )
      ) {
        try {
          const company =
            await getMyCompany();

          if (company) {
            router.replace(
              "/admin"
            );

            router.refresh();

            return;
          }
        } catch (
          finalCheckError
        ) {
          console.error(
            "최종 회사 확인 실패:",
            finalCheckError
          );
        }
      }

      setMessageType("error");
      setMessage(errorMessage);
    } finally {
      setLoading(false);
    }
  }

  /* =========================================================
     업체명 + 이메일 확인 후
     비밀번호 재설정 메일 요청
  ========================================================= */

  async function handlePasswordReset(
    event
  ) {
    event.preventDefault();

    if (loading) {
      return;
    }

    setMessage("");
    setMessageType("error");

    const cleanCompanyName =
      resetCompanyName.trim();

    const cleanEmail =
      email
        .trim()
        .toLowerCase();

    if (!cleanCompanyName) {
      setMessage(
        "가입한 업체명을 입력해주세요."
      );

      return;
    }

    if (!cleanEmail) {
      setMessage(
        "가입할 때 사용한 이메일을 입력해주세요."
      );

      return;
    }

    setLoading(true);

    try {
      /*
       * 서버에서
       * 업체명 + Auth 이메일 + 업체 연결을 확인한다.
       */
      const response =
        await fetch(
          "/api/auth/request-password-reset",
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                companyName:
                  cleanCompanyName,

                email:
                  cleanEmail,
              }),
          }
        );

      const result =
        await response
          .json()
          .catch(
            () => ({})
          );

      if (!response.ok) {
        throw new Error(
          result?.error ||
          "비밀번호 재설정 요청에 실패했습니다."
        );
      }

      setMessageType(
        "success"
      );

      setMessage(
        "업체 정보와 이메일이 확인되었습니다. 비밀번호 재설정 메일을 보냈습니다. 받은편지함과 스팸함을 확인해주세요."
      );
    } catch (error) {
      console.error(
        "비밀번호 찾기 오류:",
        error
      );

      let errorMessage =
        error?.message ||
        "비밀번호 재설정 요청 중 오류가 발생했습니다.";

      const lowerMessage =
        errorMessage
          .toLowerCase();

      if (
        lowerMessage.includes(
          "rate limit"
        ) ||
        lowerMessage.includes(
          "too many"
        )
      ) {
        errorMessage =
          "재설정 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.";
      }

      setMessageType(
        "error"
      );

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
     비밀번호 찾기 열기
  ========================================================= */

  function openForgotPassword() {
    setForgotMode(
      true
    );

    setPassword("");

    setMessage("");
    setMessageType(
      "error"
    );
  }

  /* =========================================================
     로그인으로 돌아가기
  ========================================================= */

  function closeForgotPassword() {
    setForgotMode(
      false
    );

    setResetCompanyName(
      ""
    );

    setPassword("");

    setMessage("");
    setMessageType(
      "error"
    );
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

        color:
          "#111827",

        padding:
          "20px 14px 70px",

        boxSizing:
          "border-box",
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
            {forgotMode
              ? "비밀번호 찾기"
              : "업체 로그인"}
          </h1>

          <p
            style={{
              margin: 0,

              color:
                "#6b7280",

              fontSize:
                "14px",

              lineHeight:
                1.65,
            }}
          >
            {forgotMode
              ? "가입할 때 등록한 업체명과 이메일을 입력해주세요."
              : "업체 계정으로 로그인해주세요."}
          </p>
        </div>

        {/* =====================================================
            기존 로그인 화면
        ===================================================== */}

        {!forgotMode && (
          <form
            onSubmit={
              handleLogin
            }
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
            <FieldLabel>
              이메일
            </FieldLabel>

            <input
              type="email"
              value={email}
              onChange={(
                event
              ) =>
                setEmail(
                  event.target.value
                )
              }
              placeholder="example@email.com"
              autoComplete="email"
              autoCapitalize="none"
              disabled={
                loading
              }
              style={
                inputStyle
              }
            />

            <FieldLabel>
              비밀번호
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
              placeholder="비밀번호"
              autoComplete="current-password"
              disabled={
                loading
              }
              style={
                inputStyle
              }
            />

            <div
              style={{
                display:
                  "flex",

                justifyContent:
                  "flex-end",

                marginTop:
                  "10px",
              }}
            >
              <button
                type="button"
                onClick={
                  openForgotPassword
                }
                disabled={
                  loading
                }
                style={{
                  border:
                    "none",

                  padding:
                    "2px 0",

                  background:
                    "transparent",

                  color:
                    "#2563eb",

                  fontSize:
                    "12px",

                  fontWeight:
                    "800",

                  cursor:
                    loading
                      ? "default"
                      : "pointer",
                }}
              >
                비밀번호를 잊으셨나요?
              </button>
            </div>

            {message && (
              <MessageBox
                type={
                  messageType
                }
              >
                {message}
              </MessageBox>
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
                ? "로그인 중..."
                : "로그인"}
            </button>

            <div
              style={{
                marginTop:
                  "18px",

                paddingTop:
                  "17px",

                borderTop:
                  "1px solid #f3f4f6",

                textAlign:
                  "center",
              }}
            >
              <span
                style={{
                  color:
                    "#6b7280",

                  fontSize:
                    "12px",
                }}
              >
                아직 업체 계정이 없나요?
              </span>

              <Link
                href="/signup"
                style={{
                  marginLeft:
                    "6px",

                  color:
                    "#111827",

                  textDecoration:
                    "none",

                  fontSize:
                    "12px",

                  fontWeight:
                    "800",
                }}
              >
                업체 회원가입
              </Link>
            </div>
          </form>
        )}

        {/* =====================================================
            비밀번호 찾기 화면
        ===================================================== */}

        {forgotMode && (
          <form
            onSubmit={
              handlePasswordReset
            }
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
            <FieldLabel>
              업체명
            </FieldLabel>

            <input
              type="text"
              value={
                resetCompanyName
              }
              onChange={(
                event
              ) =>
                setResetCompanyName(
                  event.target.value
                )
              }
              placeholder="가입할 때 등록한 업체명"
              autoComplete="organization"
              disabled={
                loading
              }
              style={
                inputStyle
              }
            />

            <FieldLabel>
              가입 이메일
            </FieldLabel>

            <input
              type="email"
              value={
                email
              }
              onChange={(
                event
              ) =>
                setEmail(
                  event.target.value
                )
              }
              placeholder="가입할 때 사용한 이메일"
              autoComplete="email"
              autoCapitalize="none"
              disabled={
                loading
              }
              style={
                inputStyle
              }
            />

            <div
              style={{
                marginTop:
                  "12px",

                padding:
                  "11px 12px",

                borderRadius:
                  "10px",

                background:
                  "#f8fafc",

                color:
                  "#64748b",

                fontSize:
                  "11px",

                lineHeight:
                  1.6,
              }}
            >
              업체명과 가입 이메일이 모두 일치하는 경우에만
              비밀번호 재설정 메일이 발송됩니다.
            </div>

            {message && (
              <MessageBox
                type={
                  messageType
                }
              >
                {message}
              </MessageBox>
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
                ? "확인 중..."
                : "비밀번호 재설정 메일 받기"}
            </button>

            <button
              type="button"
              onClick={
                closeForgotPassword
              }
              disabled={
                loading
              }
              style={{
                width:
                  "100%",

                marginTop:
                  "10px",

                padding:
                  "14px",

                border:
                  "1px solid #d1d5db",

                borderRadius:
                  "12px",

                background:
                  "#ffffff",

                color:
                  "#374151",

                fontSize:
                  "14px",

                fontWeight:
                  "800",

                cursor:
                  loading
                    ? "default"
                    : "pointer",
              }}
            >
              로그인으로 돌아가기
            </button>
          </form>
        )}

        <Link
          href="/"
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
          ← AI 견적으로 돌아가기
        </Link>
      </div>
    </main>
  );
}

/* =========================================================
   입력 라벨
========================================================= */

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

/* =========================================================
   메시지
========================================================= */

function MessageBox({
  type,
  children,
}) {
  const success =
    type ===
    "success";

  return (
    <div
      style={{
        marginTop:
          "14px",

        padding:
          "12px",

        borderRadius:
          "10px",

        background:
          success
            ? "#ecfdf5"
            : "#fef2f2",

        color:
          success
            ? "#047857"
            : "#b91c1c",

        fontSize:
          "12px",

        lineHeight:
          1.6,
      }}
    >
      {children}
    </div>
  );
}

/* =========================================================
   입력 스타일
========================================================= */

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
