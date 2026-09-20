"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("error");

  async function getMyCompany() {
    const { data, error } = await supabase.rpc("get_my_company");

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

  async function ensureCompany(user) {
    if (!user?.id) {
      throw new Error("사용자 정보를 확인할 수 없습니다.");
    }

    /*
     * ============================================================
     * 1. 가장 먼저 서버 RPC로 현재 사용자의 회사 확인
     * ============================================================
     *
     * 이미 회사에 연결된 계정이면
     * 절대로 create_my_company를 다시 호출하지 않는다.
     */

    try {
      const existingCompany = await getMyCompany();

      if (existingCompany) {
        const isActive =
          existingCompany.is_active ??
          existingCompany.profile_is_active ??
          existingCompany.company_is_active ??
          true;

        if (isActive === false) {
          throw new Error("현재 사용이 중지된 업체 계정입니다.");
        }

        const companyId =
          existingCompany.company_id ||
          existingCompany.id ||
          null;

        if (companyId) {
          return {
            companyId,
            companyName:
              existingCompany.company_name ||
              existingCompany.name ||
              "",
            slug:
              existingCompany.slug ||
              existingCompany.company_slug ||
              "",
            created: false,
          };
        }
      }
    } catch (rpcError) {
      console.warn(
        "get_my_company 확인 실패, profiles 조회로 재확인:",
        rpcError
      );
    }

    /*
     * ============================================================
     * 2. profiles 테이블에서도 다시 확인
     * ============================================================
     */

    const {
      data: existingProfile,
      error: profileError,
    } = await supabase
      .from("profiles")
      .select(
        "id, company_id, name, role, is_active"
      )
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      throw profileError;
    }

    if (existingProfile?.company_id) {
      if (existingProfile.is_active === false) {
        throw new Error(
          "현재 사용이 중지된 업체 계정입니다."
        );
      }

      return {
        companyId: existingProfile.company_id,
        companyName: "",
        slug: "",
        created: false,
      };
    }

    /*
     * ============================================================
     * 3. 회사가 없는 신규 가입자만 회사 생성
     * ============================================================
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
     * ============================================================
     * 4. 신규 회사 생성
     * ============================================================
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

    /*
     * create_my_company 실행 중
     * 이미 회사에 연결됐다는 오류가 발생할 수 있다.
     *
     * 이 경우 실패 처리하지 않고
     * 다시 회사 연결 상태를 확인한다.
     */

    if (companyError) {
      console.warn(
        "create_my_company 오류, 회사 연결 상태 재확인:",
        companyError
      );

      /*
       * RPC 재확인
       */

      try {
        const retryCompany = await getMyCompany();

        if (retryCompany) {
          const retryCompanyId =
            retryCompany.company_id ||
            retryCompany.id ||
            null;

          const retryActive =
            retryCompany.is_active ??
            retryCompany.profile_is_active ??
            retryCompany.company_is_active ??
            true;

          if (retryActive === false) {
            throw new Error(
              "현재 사용이 중지된 업체 계정입니다."
            );
          }

          if (retryCompanyId) {
            return {
              companyId: retryCompanyId,
              companyName:
                retryCompany.company_name ||
                retryCompany.name ||
                "",
              slug:
                retryCompany.slug ||
                retryCompany.company_slug ||
                "",
              created: false,
            };
          }
        }
      } catch (retryRpcError) {
        console.warn(
          "get_my_company 재확인 실패:",
          retryRpcError
        );
      }

      /*
       * profiles에서도 마지막으로 확인
       */

      const {
        data: retryProfile,
        error: retryProfileError,
      } = await supabase
        .from("profiles")
        .select(
          "company_id, is_active"
        )
        .eq("id", user.id)
        .maybeSingle();

      if (
        !retryProfileError &&
        retryProfile?.company_id
      ) {
        if (retryProfile.is_active === false) {
          throw new Error(
            "현재 사용이 중지된 업체 계정입니다."
          );
        }

        return {
          companyId: retryProfile.company_id,
          companyName: "",
          slug: "",
          created: false,
        };
      }

      throw companyError;
    }

    if (!companyId) {
      throw new Error(
        "업체 정보를 생성하지 못했습니다."
      );
    }

    return {
      companyId,
      companyName,
      slug: companySlug,
      created: true,
    };
  }

  async function handleLogin(event) {
    event.preventDefault();

    if (loading) return;

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
       * ============================================================
       * 1. Supabase 로그인
       * ============================================================
       */

      const {
        data,
        error,
      } = await supabase.auth.signInWithPassword({
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
       * ============================================================
       * 2. 회사 연결 확인
       * ============================================================
       */

      const result =
        await ensureCompany(user);

      if (!result?.companyId) {
        throw new Error(
          "업체 연결 정보를 확인하지 못했습니다."
        );
      }

      /*
       * ============================================================
       * 3. 신규 회사 생성된 경우
       * ============================================================
       */

      if (result.created) {
        setMessageType("success");

        setMessage(
          `${
            result.companyName || "업체"
          } 등록이 완료되었습니다. 관리자 페이지로 이동합니다.`
        );

        setTimeout(() => {
          router.replace("/admin");
          router.refresh();
        }, 1000);

        return;
      }

      /*
       * ============================================================
       * 4. 기존 업체 계정
       * ============================================================
       *
       * 바로 관리자 페이지 이동
       */

      router.replace("/admin");
      router.refresh();
    } catch (error) {
      console.error(
        "업체 로그인 오류:",
        error
      );

      let errorMessage =
        error?.message ||
        "로그인 중 오류가 발생했습니다.";

      const lowerMessage =
        String(errorMessage)
          .toLowerCase();

      /*
       * Supabase 로그인 오류 한글 처리
       */

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
       * 마지막으로 로그인 상태를 확인해서 관리자 이동 시도
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
            router.replace("/admin");
            router.refresh();
            return;
          }
        } catch (finalCheckError) {
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
            router.replace("/admin");
            router.refresh();
            return;
          }
        } catch (finalCheckError) {
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
            업체 로그인
          </h1>

          <p
            style={{
              margin: 0,
              color: "#6b7280",
              fontSize: "14px",
              lineHeight: 1.65,
            }}
          >
            업체 계정으로 로그인해주세요.
          </p>
        </div>

        <form
          onSubmit={handleLogin}
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
            disabled={loading}
            style={inputStyle}
          />

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
            placeholder="비밀번호"
            autoComplete="current-password"
            disabled={loading}
            style={inputStyle}
          />

          {message && (
            <div
              style={{
                marginTop: "14px",
                padding: "12px",
                borderRadius: "10px",
                background:
                  messageType ===
                  "success"
                    ? "#ecfdf5"
                    : "#fef2f2",
                color:
                  messageType ===
                  "success"
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
              : "로그인"}
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
            <span
              style={{
                color: "#6b7280",
                fontSize: "12px",
              }}
            >
              아직 업체 계정이 없나요?
            </span>

            <Link
              href="/signup"
              style={{
                marginLeft: "6px",
                color: "#111827",
                textDecoration: "none",
                fontSize: "12px",
                fontWeight: "800",
              }}
            >
              업체 회원가입
            </Link>
          </div>
        </form>

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
  border:
    "1px solid #d1d5db",
  borderRadius: "11px",
  outline: "none",
  background: "#ffffff",
  color: "#111827",
  fontSize: "14px",
};
