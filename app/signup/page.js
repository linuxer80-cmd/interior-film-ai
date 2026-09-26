"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

export default function SignupPage() {
  const router = useRouter();

  /* =========================================================
     입력값
  ========================================================= */

  const [companyName, setCompanyName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");

  /* =========================================================
     화면 상태
  ========================================================= */

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  const [createdCompany, setCreatedCompany] = useState(null);
  const [customerEstimateUrl, setCustomerEstimateUrl] =
    useState("");

  const [copyMessage, setCopyMessage] = useState("");

  /* =========================================================
     현재 로그인 사용자의 회사 조회
  ========================================================= */

  async function getMyCompany() {
    const { data, error } = await supabase.rpc(
      "get_my_company"
    );

    if (error) {
      throw error;
    }

    if (!data) {
      return null;
    }

    if (Array.isArray(data)) {
      return data[0] || null;
    }

    return data;
  }

  /* =========================================================
     고객 견적페이지 주소 만들기
  ========================================================= */

  function buildCustomerEstimateUrl(company) {
    if (!company) {
      return "";
    }

    const slug =
      company.company_slug ||
      company.slug ||
      "";

    if (!slug) {
      return "";
    }

    if (
      typeof window !== "undefined" &&
      window.location?.origin
    ) {
      return `${window.location.origin}/estimate/${slug}`;
    }

    return `/estimate/${slug}`;
  }

  /* =========================================================
     전화번호 입력
  ========================================================= */

  function handlePhoneChange(event) {
    const value = event.target.value;

    /*
     * 숫자와 하이픈만 허용
     */
    const cleaned = value.replace(
      /[^0-9-]/g,
      ""
    );

    setPhone(cleaned);
  }

  /* =========================================================
     회원가입
  ========================================================= */

  async function handleSignup(event) {
    event.preventDefault();

    if (loading) {
      return;
    }

    setMessage("");
    setSuccess(false);
    setCopyMessage("");

    const cleanCompanyName =
      companyName.trim();

    const cleanOwnerName =
      ownerName.trim();

    const cleanPhone =
      phone.trim();

    const cleanEmail =
      email
        .trim()
        .toLowerCase();

    /* ---------------------------------------------------------
       입력 확인
    --------------------------------------------------------- */

    if (!cleanCompanyName) {
      setMessage(
        "업체명을 입력해주세요."
      );
      return;
    }

    if (!cleanOwnerName) {
      setMessage(
        "대표자명을 입력해주세요."
      );
      return;
    }

    if (!cleanPhone) {
      setMessage(
        "전화번호를 입력해주세요."
      );
      return;
    }

    if (!cleanEmail) {
      setMessage(
        "이메일을 입력해주세요."
      );
      return;
    }

    if (password.length < 6) {
      setMessage(
        "비밀번호는 6자 이상 입력해주세요."
      );
      return;
    }

    if (
      password !==
      passwordConfirm
    ) {
      setMessage(
        "비밀번호가 서로 일치하지 않습니다."
      );
      return;
    }

    setLoading(true);

    try {
      /* =====================================================
         1. Supabase Auth 회원가입

         회사 slug는 사용자가 입력하지 않습니다.
         DB create_my_company()에서 자동 생성합니다.
      ===================================================== */

      const {
        data: signupData,
        error: signupError,
      } =
        await supabase.auth.signUp({
          email: cleanEmail,
          password,

          options: {
            data: {
              company_name:
                cleanCompanyName,

              owner_name:
                cleanOwnerName,

              phone:
                cleanPhone,

              /*
               * 로그인 페이지와의 기존 호환성을 위해
               * metadata에도 빈 slug를 넣습니다.
               *
               * 실제 slug는 DB에서 자동 생성됩니다.
               */
              company_slug: "",
            },
          },
        });

      if (signupError) {
        throw signupError;
      }

      if (!signupData?.user) {
        throw new Error(
          "사용자 계정을 생성하지 못했습니다."
        );
      }

      /* =====================================================
         2. 세션 확인

         이메일 인증이 켜져 있으면
         회원가입 직후 session이 없을 수 있습니다.
      ===================================================== */

      let session =
        signupData.session;

      if (!session) {
        const {
          data: loginData,
          error: loginError,
        } =
          await supabase.auth.signInWithPassword({
            email: cleanEmail,
            password,
          });

        if (!loginError) {
          session =
            loginData?.session ||
            null;
        }
      }

      /* =====================================================
         3. 이메일 인증이 필요한 경우

         아직 로그인 세션이 없으므로
         회사 생성은 로그인 후 진행됩니다.

         /login 페이지의 ensureCompany()가
         metadata를 읽어서 회사를 생성합니다.
      ===================================================== */

      if (!session) {
        setSuccess(true);

        setCreatedCompany({
          company_name:
            cleanCompanyName,

          pending_email_confirmation:
            true,
        });

        setCustomerEstimateUrl("");

        setMessage(
          "회원가입이 완료되었습니다. 이메일 인증 후 관리자 로그인 페이지에서 로그인해주세요. 첫 로그인 시 고객 전용 견적페이지가 자동 생성됩니다."
        );

        setLoading(false);
        return;
      }

      /* =====================================================
         4. 회사 생성

         p_slug를 빈 문자열로 전달하면
         DB 함수가 company-xxxxxxxx 형태로
         자동 생성합니다.

         신규 회사:
         - Basic 요금제
         - 활성 상태
         - 대표자 owner
         - 기본 회사 설정 생성
      ===================================================== */

      const {
        data: companyId,
        error: companyError,
      } =
        await supabase.rpc(
          "create_my_company",
          {
            p_company_name:
              cleanCompanyName,

            p_slug: "",

            p_owner_name:
              cleanOwnerName,

            p_phone:
              cleanPhone,
          }
        );

      if (companyError) {
        /*
         * 아주 드물게 회사 생성은 완료됐는데
         * 응답 과정에서 오류가 발생한 경우를 대비해
         * 실제 연결 상태를 다시 확인합니다.
         */

        const retryCompany =
          await getMyCompany();

        if (
          !retryCompany?.company_id
        ) {
          throw companyError;
        }
      } else if (!companyId) {
        /*
         * UUID 반환이 없는 경우에도
         * 실제 회사 연결 여부를 확인합니다.
         */

        const retryCompany =
          await getMyCompany();

        if (
          !retryCompany?.company_id
        ) {
          throw new Error(
            "업체 정보를 생성하지 못했습니다."
          );
        }
      }

      /* =====================================================
         5. 생성된 회사 다시 조회

         자동 생성된 slug를 여기서 가져옵니다.
      ===================================================== */

      const company =
        await getMyCompany();

      if (
        !company?.company_id
      ) {
        throw new Error(
          "생성된 업체 정보를 확인하지 못했습니다."
        );
      }

      if (
        company.is_active ===
        false
      ) {
        throw new Error(
          "현재 사용이 중지된 업체 계정입니다."
        );
      }

      /* =====================================================
         6. 고객 전용 견적페이지 주소 생성
      ===================================================== */

      const estimateUrl =
        buildCustomerEstimateUrl(
          company
        );

      setCreatedCompany(
        company
      );

      setCustomerEstimateUrl(
        estimateUrl
      );

      setSuccess(true);

      setMessage(
        "업체 가입이 완료되었습니다. 고객 전용 AI 견적페이지가 생성되었습니다."
      );
    } catch (error) {
      console.error(
        "업체 회원가입 오류:",
        error
      );

      let errorMessage =
        error?.message ||
        "회원가입 중 오류가 발생했습니다.";

      const lowerMessage =
        errorMessage
          .toLowerCase();

      /* -------------------------------------------------------
         이미 가입된 이메일
      ------------------------------------------------------- */

      if (
        lowerMessage.includes(
          "already registered"
        ) ||
        lowerMessage.includes(
          "user already registered"
        ) ||
        lowerMessage.includes(
          "already been registered"
        )
      ) {
        errorMessage =
          "이미 가입된 이메일입니다.";
      }

      /* -------------------------------------------------------
         이메일 형식
      ------------------------------------------------------- */

      if (
        lowerMessage.includes(
          "invalid email"
        )
      ) {
        errorMessage =
          "올바른 이메일 주소를 입력해주세요.";
      }

      /* -------------------------------------------------------
         비밀번호
      ------------------------------------------------------- */

      if (
        lowerMessage.includes(
          "password"
        ) &&
        lowerMessage.includes(
          "least"
        )
      ) {
        errorMessage =
          "비밀번호는 6자 이상 입력해주세요.";
      }

      /* -------------------------------------------------------
         이미 회사에 연결된 경우

         회원가입 재시도 등으로 Auth 계정은 존재하고
         회사까지 이미 생성된 상황일 수 있습니다.
      ------------------------------------------------------- */

      if (
        lowerMessage.includes(
          "이미 회사에 연결"
        )
      ) {
        try {
          const existingCompany =
            await getMyCompany();

          if (
            existingCompany?.company_id
          ) {
            const estimateUrl =
              buildCustomerEstimateUrl(
                existingCompany
              );

            setCreatedCompany(
              existingCompany
            );

            setCustomerEstimateUrl(
              estimateUrl
            );

            setSuccess(true);

            setMessage(
              "이미 업체 등록이 완료된 계정입니다."
            );

            return;
          }
        } catch (
          checkError
        ) {
          console.error(
            "기존 업체 확인 오류:",
            checkError
          );
        }
      }

      setMessage(
        errorMessage
      );

      setSuccess(false);
    } finally {
      setLoading(false);
    }
  }

  /* =========================================================
     주소 복사
  ========================================================= */

  async function copyCustomerEstimateUrl() {
    if (
      !customerEstimateUrl
    ) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        customerEstimateUrl
      );

      setCopyMessage(
        "✓ 고객 견적페이지 주소를 복사했습니다."
      );

      setTimeout(() => {
        setCopyMessage("");
      }, 2500);
    } catch (error) {
      console.error(
        "주소 복사 오류:",
        error
      );

      /*
       * 일부 모바일 브라우저에서
       * Clipboard API가 막혀 있을 경우
       */
      try {
        const textarea =
          document.createElement(
            "textarea"
          );

        textarea.value =
          customerEstimateUrl;

        textarea.style.position =
          "fixed";

        textarea.style.opacity =
          "0";

        document.body.appendChild(
          textarea
        );

        textarea.focus();
        textarea.select();

        document.execCommand(
          "copy"
        );

        document.body.removeChild(
          textarea
        );

        setCopyMessage(
          "✓ 고객 견적페이지 주소를 복사했습니다."
        );

        setTimeout(() => {
          setCopyMessage("");
        }, 2500);
      } catch (
        fallbackError
      ) {
        console.error(
          "주소 복사 대체 처리 오류:",
          fallbackError
        );

        setCopyMessage(
          "주소를 길게 눌러 복사해주세요."
        );
      }
    }
  }

  /* =========================================================
     고객페이지 열기
  ========================================================= */

  function openCustomerEstimatePage() {
    if (
      !customerEstimateUrl
    ) {
      return;
    }

    window.open(
      customerEstimateUrl,
      "_blank",
      "noopener,noreferrer"
    );
  }

  /* =========================================================
     관리자 로그인 이동
  ========================================================= */

  async function goToLogin() {
    /*
     * 가입 직후 세션이 살아있을 수 있으므로
     * 로그인 페이지에서 새로 로그인하도록 로그아웃합니다.
     */

    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error(
        "가입 후 로그아웃:",
        error
      );
    }

    router.replace(
      "/login"
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
        {/* =====================================================
            상단
        ===================================================== */}

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
            업체 회원가입
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
            업체 계정을 만들면 고객에게
            공유할 수 있는 전용 AI 견적페이지가
            자동으로 생성됩니다.
            <br />
            별도의 홈페이지가 없어도
            사용할 수 있습니다.
          </p>
        </div>

        {/* =====================================================
            가입 완료
        ===================================================== */}

        {success ? (
          <section
            style={{
              padding:
                "22px",

              border:
                "1px solid #d1fae5",

              borderRadius:
                "18px",

              background:
                "#ffffff",

              boxShadow:
                "0 4px 18px rgba(0,0,0,0.05)",
            }}
          >
            <div
              style={{
                width:
                  "52px",

                height:
                  "52px",

                display:
                  "flex",

                alignItems:
                  "center",

                justifyContent:
                  "center",

                borderRadius:
                  "50%",

                background:
                  "#ecfdf5",

                color:
                  "#047857",

                fontSize:
                  "25px",

                fontWeight:
                  "900",
              }}
            >
              ✓
            </div>

            <h2
              style={{
                margin:
                  "16px 0 8px",

                fontSize:
                  "21px",
              }}
            >
              가입 완료
            </h2>

            <p
              style={{
                margin: 0,

                color:
                  "#4b5563",

                fontSize:
                  "14px",

                lineHeight:
                  1.7,
              }}
            >
              {message}
            </p>

            {/* 업체 정보 */}

            <div
              style={{
                marginTop:
                  "18px",

                padding:
                  "14px",

                borderRadius:
                  "12px",

                background:
                  "#f8fafc",

                border:
                  "1px solid #e5e7eb",
              }}
            >
              <div
                style={{
                  color:
                    "#6b7280",

                  fontSize:
                    "11px",

                  fontWeight:
                    "700",

                  marginBottom:
                    "5px",
                }}
              >
                업체명
              </div>

              <div
                style={{
                  fontSize:
                    "16px",

                  fontWeight:
                    "800",
                }}
              >
                {createdCompany?.company_name ||
                  companyName}
              </div>
            </div>

            {/* 고객 견적 URL */}

            {customerEstimateUrl ? (
              <div
                style={{
                  marginTop:
                    "14px",

                  padding:
                    "16px",

                  borderRadius:
                    "14px",

                  background:
                    "#f0fdf4",

                  border:
                    "1px solid #bbf7d0",
                }}
              >
                <div
                  style={{
                    color:
                      "#166534",

                    fontSize:
                      "13px",

                    fontWeight:
                      "800",

                    marginBottom:
                      "8px",
                  }}
                >
                  고객 전용 AI 견적페이지
                </div>

                <div
                  style={{
                    padding:
                      "11px",

                    borderRadius:
                      "9px",

                    background:
                      "#ffffff",

                    border:
                      "1px solid #dcfce7",

                    fontSize:
                      "12px",

                    lineHeight:
                      1.6,

                    wordBreak:
                      "break-all",

                    userSelect:
                      "all",
                  }}
                >
                  {customerEstimateUrl}
                </div>

                <div
                  style={{
                    display:
                      "grid",

                    gridTemplateColumns:
                      "1fr 1fr",

                    gap:
                      "8px",

                    marginTop:
                      "10px",
                  }}
                >
                  <button
                    type="button"
                    onClick={
                      openCustomerEstimatePage
                    }
                    style={{
                      width:
                        "100%",

                      border:
                        "none",

                      borderRadius:
                        "9px",

                      padding:
                        "11px 8px",

                      background:
                        "#166534",

                      color:
                        "#ffffff",

                      fontWeight:
                        "800",

                      fontSize:
                        "13px",

                      cursor:
                        "pointer",
                    }}
                  >
                    고객페이지 열기
                  </button>

                  <button
                    type="button"
                    onClick={
                      copyCustomerEstimateUrl
                    }
                    style={{
                      width:
                        "100%",

                      border:
                        "1px solid #86efac",

                      borderRadius:
                        "9px",

                      padding:
                        "11px 8px",

                      background:
                        "#ffffff",

                      color:
                        "#166534",

                      fontWeight:
                        "800",

                      fontSize:
                        "13px",

                      cursor:
                        "pointer",
                    }}
                  >
                    주소 복사
                  </button>
                </div>

                {copyMessage && (
                  <div
                    style={{
                      marginTop:
                        "9px",

                      color:
                        "#166534",

                      fontSize:
                        "12px",

                      fontWeight:
                        "700",
                    }}
                  >
                    {copyMessage}
                  </div>
                )}

                <div
                  style={{
                    marginTop:
                      "10px",

                    color:
                      "#4b5563",

                    fontSize:
                      "11px",

                    lineHeight:
                      1.6,
                  }}
                >
                  이 주소를 블로그, 카카오톡,
                  문자 등에 공유하면 고객이 바로
                  AI 견적페이지를 이용할 수 있습니다.
                </div>
              </div>
            ) : (
              <div
                style={{
                  marginTop:
                    "14px",

                  padding:
                    "14px",

                  borderRadius:
                    "12px",

                  background:
                    "#fffbeb",

                  border:
                    "1px solid #fde68a",

                  color:
                    "#92400e",

                  fontSize:
                    "12px",

                  lineHeight:
                    1.7,
                }}
              >
                이메일 인증 후 관리자 계정으로
                로그인하면 고객 전용 견적페이지가
                자동으로 생성됩니다.
              </div>
            )}

            {/* 관리자 로그인 */}

            <button
              type="button"
              onClick={
                goToLogin
              }
              style={{
                width:
                  "100%",

                marginTop:
                  "18px",

                padding:
                  "14px",

                border:
                  "none",

                borderRadius:
                  "12px",

                background:
                  "#111827",

                color:
                  "#ffffff",

                textAlign:
                  "center",

                fontSize:
                  "14px",

                fontWeight:
                  "800",

                cursor:
                  "pointer",
              }}
            >
              관리자 로그인하기
            </button>
          </section>
        ) : (
          /* ===================================================
             회원가입 폼
          =================================================== */

          <form
            onSubmit={
              handleSignup
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
            {/* 업체명 */}

            <FieldLabel>
              업체명
            </FieldLabel>

            <input
              type="text"
              value={
                companyName
              }
              onChange={(
                event
              ) =>
                setCompanyName(
                  event.target
                    .value
                )
              }
              placeholder="예: 좋은인테리어"
              autoComplete="organization"
              disabled={
                loading
              }
              style={
                inputStyle
              }
            />

            {/* 대표자 */}

            <FieldLabel>
              대표자명
            </FieldLabel>

            <input
              type="text"
              value={
                ownerName
              }
              onChange={(
                event
              ) =>
                setOwnerName(
                  event.target
                    .value
                )
              }
              placeholder="대표자 이름"
              autoComplete="name"
              disabled={
                loading
              }
              style={
                inputStyle
              }
            />

            {/* 전화번호 */}

            <FieldLabel>
              전화번호
            </FieldLabel>

            <input
              type="tel"
              value={
                phone
              }
              onChange={
                handlePhoneChange
              }
              placeholder="010-1234-5678"
              autoComplete="tel"
              disabled={
                loading
              }
              style={
                inputStyle
              }
            />

            {/* 자동 고객페이지 안내 */}

            <div
              style={{
                margin:
                  "16px 0 4px",

                padding:
                  "13px",

                borderRadius:
                  "11px",

                background:
                  "#f8fafc",

                border:
                  "1px solid #e5e7eb",

                color:
                  "#4b5563",

                fontSize:
                  "12px",

                lineHeight:
                  1.7,
              }}
            >
              <strong
                style={{
                  color:
                    "#111827",
                }}
              >
                고객 전용 견적페이지
              </strong>

              <br />

              가입하면 업체 전용 AI
              견적페이지 주소가 자동으로
              발급됩니다.

              <br />

              별도의 홈페이지 주소를
              입력할 필요가 없습니다.
            </div>

            {/* 이메일 */}

            <FieldLabel>
              이메일
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
                  event.target
                    .value
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

            {/* 비밀번호 */}

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
                  event.target
                    .value
                )
              }
              placeholder="6자 이상"
              autoComplete="new-password"
              disabled={
                loading
              }
              style={
                inputStyle
              }
            />

            {/* 비밀번호 확인 */}

            <FieldLabel>
              비밀번호 확인
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
                  event.target
                    .value
                )
              }
              placeholder="비밀번호를 다시 입력해주세요"
              autoComplete="new-password"
              disabled={
                loading
              }
              style={
                inputStyle
              }
            />

            {/* 비밀번호 일치 안내 */}

            {passwordConfirm &&
              password ===
                passwordConfirm && (
                <div
                  style={{
                    marginTop:
                      "7px",

                    color:
                      "#047857",

                    fontSize:
                      "11px",

                    fontWeight:
                      "700",
                  }}
                >
                  ✓ 비밀번호가 일치합니다.
                </div>
              )}

            {passwordConfirm &&
              password !==
                passwordConfirm && (
                <div
                  style={{
                    marginTop:
                      "7px",

                    color:
                      "#b91c1c",

                    fontSize:
                      "11px",

                    fontWeight:
                      "700",
                  }}
                >
                  비밀번호가 일치하지 않습니다.
                </div>
              )}

            {/* 오류 */}

            {message && (
              <div
                style={{
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
                }}
              >
                {message}
              </div>
            )}

            {/* 가입 버튼 */}

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
                ? "업체 계정 만드는 중..."
                : "업체 가입하기"}
            </button>

            <div
              style={{
                marginTop:
                  "14px",

                color:
                  "#9ca3af",

                fontSize:
                  "11px",

                lineHeight:
                  1.6,

                textAlign:
                  "center",
              }}
            >
              가입하면 업체별 시공사진,
              단가, 견적 및 고객 데이터를
              독립적으로 관리할 수 있습니다.
            </div>

            {/* 로그인 */}

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
                이미 업체 계정이 있나요?
              </span>

              <Link
                href="/login"
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
                관리자 로그인
              </Link>
            </div>
          </form>
        )}

        {/* =====================================================
            홈
        ===================================================== */}

        {!success && (
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
        )}
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
