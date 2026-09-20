"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";

export default function SignupPage() {
  const [companyName, setCompanyName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [phone, setPhone] = useState("");
  const [slug, setSlug] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  function normalizeSlug(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "")
      .replace(/--+/g, "-")
      .replace(/^-+/, "")
      .replace(/-+$/, "");
  }

  function handleSlugChange(event) {
    setSlug(normalizeSlug(event.target.value));
  }

  async function handleSignup(event) {
    event.preventDefault();

    if (loading) {
      return;
    }

    setMessage("");
    setSuccess(false);

    const cleanCompanyName = companyName.trim();
    const cleanOwnerName = ownerName.trim();
    const cleanPhone = phone.trim();
    const cleanSlug = normalizeSlug(slug);
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanCompanyName) {
      setMessage("업체명을 입력해주세요.");
      return;
    }

    if (!cleanOwnerName) {
      setMessage("대표자명을 입력해주세요.");
      return;
    }

    if (!cleanPhone) {
      setMessage("전화번호를 입력해주세요.");
      return;
    }

    if (!cleanSlug) {
      setMessage("회사 주소를 입력해주세요.");
      return;
    }

    if (!/^[a-z0-9-]+$/.test(cleanSlug)) {
      setMessage(
        "회사 주소는 영문 소문자, 숫자, 하이픈(-)만 사용할 수 있습니다."
      );
      return;
    }

    if (!cleanEmail) {
      setMessage("이메일을 입력해주세요.");
      return;
    }

    if (password.length < 6) {
      setMessage("비밀번호는 6자 이상 입력해주세요.");
      return;
    }

    setLoading(true);

    try {
      /*
       * 1. Supabase Auth 회원가입
       */
      const {
        data: signupData,
        error: signupError,
      } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: {
            company_name: cleanCompanyName,
            owner_name: cleanOwnerName,
            phone: cleanPhone,
            company_slug: cleanSlug,
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

      /*
       * 이메일 인증 설정이 켜져 있으면
       * signUp 직후 session이 없을 수 있습니다.
       */
      let session = signupData.session;

      if (!session) {
        /*
         * 바로 로그인을 한번 시도합니다.
         * Supabase에서 이메일 인증이 필수라면
         * 여기서 로그인되지 않고 인증 안내를 표시합니다.
         */
        const {
          data: loginData,
          error: loginError,
        } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

        if (!loginError) {
          session = loginData?.session || null;
        }
      }

      if (!session) {
        setSuccess(true);
        setMessage(
          "회원가입이 완료되었습니다. 이메일 인증 후 로그인하면 업체 등록이 완료됩니다."
        );

        setLoading(false);
        return;
      }

      /*
       * 2. 로그인된 본인 계정으로 회사 생성
       *
       * DB의 create_my_company() 함수는
       * auth.uid()를 사용하므로 다른 사용자의
       * 회사는 만들 수 없습니다.
       */
      const {
        data: companyId,
        error: companyError,
      } = await supabase.rpc(
        "create_my_company",
        {
          p_company_name: cleanCompanyName,
          p_slug: cleanSlug,
          p_owner_name: cleanOwnerName,
          p_phone: cleanPhone,
        }
      );

      if (companyError) {
        throw companyError;
      }

      if (!companyId) {
        throw new Error(
          "업체 정보를 생성하지 못했습니다."
        );
      }

      setSuccess(true);
      setMessage(
        "업체 가입이 완료되었습니다."
      );
    } catch (error) {
      console.error(
        "업체 회원가입 오류:",
        error
      );

      let errorMessage =
        error?.message ||
        "회원가입 중 오류가 발생했습니다.";

      if (
        errorMessage
          .toLowerCase()
          .includes("already registered")
      ) {
        errorMessage =
          "이미 가입된 이메일입니다.";
      }

      if (
        errorMessage
          .toLowerCase()
          .includes("user already registered")
      ) {
        errorMessage =
          "이미 가입된 이메일입니다.";
      }

      setMessage(errorMessage);
      setSuccess(false);
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
            업체 회원가입
          </h1>

          <p
            style={{
              margin: 0,
              color: "#6b7280",
              fontSize: "14px",
              lineHeight: 1.65,
            }}
          >
            업체 전용 AI 견적 시스템을
            만들어보세요.
            <br />
            가입 후 시공사진과 자체 단가를
            등록할 수 있습니다.
          </p>
        </div>

        {/* 가입 완료 */}

        {success ? (
          <section
            style={{
              padding: "22px",
              border:
                "1px solid #d1fae5",
              borderRadius: "18px",
              background: "#ffffff",
              boxShadow:
                "0 4px 18px rgba(0,0,0,0.05)",
            }}
          >
            <div
              style={{
                width: "52px",
                height: "52px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "50%",
                background: "#ecfdf5",
                fontSize: "25px",
              }}
            >
              ✓
            </div>

            <h2
              style={{
                margin: "16px 0 8px",
                fontSize: "21px",
              }}
            >
              가입 신청 완료
            </h2>

            <p
              style={{
                margin: 0,
                color: "#4b5563",
                fontSize: "14px",
                lineHeight: 1.7,
              }}
            >
              {message}
            </p>

            <div
              style={{
                marginTop: "18px",
                padding: "13px",
                borderRadius: "11px",
                background: "#f8fafc",
                color: "#4b5563",
                fontSize: "13px",
                lineHeight: 1.7,
              }}
            >
              <strong>
                업체명
              </strong>
              <br />
              {companyName}

              <br />
              <br />

              <strong>
                고객페이지 주소
              </strong>
              <br />
              /estimate/{slug}
            </div>

            <Link
              href="/"
              style={{
                display: "block",
                marginTop: "18px",
                padding: "14px",
                borderRadius: "12px",
                background: "#111827",
                color: "#ffffff",
                textAlign: "center",
                textDecoration: "none",
                fontSize: "14px",
                fontWeight: "800",
              }}
            >
              메인으로 이동
            </Link>
          </section>
        ) : (
          /* 회원가입 폼 */

          <form
            onSubmit={handleSignup}
            style={{
              padding: "18px",
              border:
                "1px solid #e5e7eb",
              borderRadius: "18px",
              background: "#ffffff",
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
              value={companyName}
              onChange={(event) =>
                setCompanyName(
                  event.target.value
                )
              }
              placeholder="예: 좋은인테리어"
              autoComplete="organization"
              style={inputStyle}
            />

            {/* 대표자 */}

            <FieldLabel>
              대표자명
            </FieldLabel>

            <input
              type="text"
              value={ownerName}
              onChange={(event) =>
                setOwnerName(
                  event.target.value
                )
              }
              placeholder="대표자 이름"
              autoComplete="name"
              style={inputStyle}
            />

            {/* 전화번호 */}

            <FieldLabel>
              전화번호
            </FieldLabel>

            <input
              type="tel"
              value={phone}
              onChange={(event) =>
                setPhone(
                  event.target.value
                )
              }
              placeholder="010-1234-5678"
              autoComplete="tel"
              style={inputStyle}
            />

            {/* 회사 주소 */}

            <FieldLabel>
              회사 페이지 주소
            </FieldLabel>

            <input
              type="text"
              value={slug}
              onChange={
                handleSlugChange
              }
              placeholder="예: good-interior"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              style={inputStyle}
            />

            <div
              style={{
                margin:
                  "-5px 0 14px",
                color: "#9ca3af",
                fontSize: "11px",
                lineHeight: 1.5,
              }}
            >
              영문 소문자, 숫자,
              하이픈(-)만 사용할 수
              있습니다.
              {slug && (
                <>
                  <br />
                  고객페이지:
                  {" "}
                  /estimate/{slug}
                </>
              )}
            </div>

            {/* 이메일 */}

            <FieldLabel>
              이메일
            </FieldLabel>

            <input
              type="email"
              value={email}
              onChange={(event) =>
                setEmail(
                  event.target.value
                )
              }
              placeholder="example@email.com"
              autoComplete="email"
              autoCapitalize="none"
              style={inputStyle}
            />

            {/* 비밀번호 */}

            <FieldLabel>
              비밀번호
            </FieldLabel>

            <input
              type="password"
              value={password}
              onChange={(event) =>
                setPassword(
                  event.target.value
                )
              }
              placeholder="6자 이상"
              autoComplete="new-password"
              style={inputStyle}
            />

            {/* 오류 */}

            {message && (
              <div
                style={{
                  marginTop: "14px",
                  padding: "12px",
                  borderRadius: "10px",
                  background: "#fef2f2",
                  color: "#b91c1c",
                  fontSize: "12px",
                  lineHeight: 1.6,
                }}
              >
                {message}
              </div>
            )}

            {/* 가입 */}

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
                ? "업체 계정 만드는 중..."
                : "업체 가입하기"}
            </button>

            <div
              style={{
                marginTop: "14px",
                color: "#9ca3af",
                fontSize: "11px",
                lineHeight: 1.6,
                textAlign: "center",
              }}
            >
              가입하면 업체별 시공사진,
              단가 및 견적 데이터를
              독립적으로 관리할 수 있습니다.
            </div>
          </form>
        )}

        {/* 홈 */}

        {!success && (
          <Link
            href="/"
            style={{
              display: "block",
              marginTop: "16px",
              color: "#6b7280",
              textAlign: "center",
              textDecoration: "none",
              fontSize: "13px",
              fontWeight: "700",
            }}
          >
            ← AI 견적으로 돌아가기
          </Link>
        )}
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
        display: "block",
        margin:
          "14px 0 7px",
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
