"use client";

import {
  Suspense,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  useSearchParams,
} from "next/navigation";

import {
  supabase,
} from "../../../../lib/supabase";


function BillingSuccessContent() {
  const searchParams =
    useSearchParams();

  const startedRef =
    useRef(false);

  const [
    status,
    setStatus,
  ] = useState("processing");

  const [
    message,
    setMessage,
  ] = useState(
    "카드 등록 정보를 확인하고 있습니다.",
  );


  useEffect(() => {
    if (startedRef.current) {
      return;
    }

    startedRef.current = true;

    processBillingAuth();
  }, []);


  async function processBillingAuth() {
    try {
      setStatus("processing");
      setMessage(
        "카드 등록 정보를 확인하고 있습니다.",
      );

      /*
       * =========================================
       * 1. Toss 성공 Redirect 값 확인
       *
       * Toss가 추가:
       * - authKey
       * - customerKey
       *
       * 우리가 successUrl에 넣은 값:
       * - checkoutSessionId
       * =========================================
       */

      const authKey =
        searchParams.get(
          "authKey",
        );

      const customerKey =
        searchParams.get(
          "customerKey",
        );

      const checkoutSessionId =
        searchParams.get(
          "checkoutSessionId",
        );


      if (!authKey) {
        throw new Error(
          "Toss 인증키(authKey)가 없습니다.",
        );
      }

      if (!customerKey) {
        throw new Error(
          "결제 고객키(customerKey)가 없습니다.",
        );
      }

      if (!checkoutSessionId) {
        throw new Error(
          "결제 세션 정보가 없습니다.",
        );
      }


      /*
       * =========================================
       * 2. 현재 로그인 세션 확인
       * =========================================
       */

      const {
        data: sessionData,
        error: sessionError,
      } =
        await supabase.auth.getSession();


      if (sessionError) {
        throw sessionError;
      }


      const accessToken =
        sessionData?.session
          ?.access_token;


      if (!accessToken) {
        throw new Error(
          "로그인이 만료되었습니다. 다시 로그인해주세요.",
        );
      }


      /*
       * =========================================
       * 3. 서버에 빌링키 발급 요청
       *
       * 브라우저에서는:
       * - authKey
       * - customerKey
       * - checkoutSessionId
       *
       * 만 전달합니다.
       *
       * 서버에서 다시:
       * - 로그인 사용자
       * - 소속 회사
       * - checkout session
       * - customerKey
       * - 만료 여부
       * - 세션 상태
       *
       * 를 검증합니다.
       * =========================================
       */

      setMessage(
        "카드 등록을 완료하고 있습니다.",
      );


      const response =
        await fetch(
          "/api/billing/issue",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",

              Authorization:
                `Bearer ${accessToken}`,
            },

            body:
              JSON.stringify({
                authKey,
                customerKey,
                checkoutSessionId,
              }),
          },
        );


      let result = null;

      try {
        result =
          await response.json();
      } catch {
        result = null;
      }


      if (
        !response.ok ||
        !result?.ok
      ) {
        throw new Error(
          result?.error ||
            "카드 등록을 완료하지 못했습니다.",
        );
      }


      /*
       * =========================================
       * 4. 성공
       *
       * 주의:
       * 이 시점은 빌링키 발급 성공입니다.
       *
       * 아직 최초 월 결제를 실행하지 않았다면
       * 요금제를 변경하면 안 됩니다.
       * =========================================
       */

      setStatus("success");

      setMessage(
        "카드 등록이 완료되었습니다.",
      );

    } catch (error) {
      console.error(
        "빌링 카드 등록 완료 오류:",
        error,
      );

      setStatus("error");

      setMessage(
        error?.message ||
          "카드 등록 처리 중 오류가 발생했습니다.",
      );
    }
  }


  function goBilling() {
    window.location.href =
      "/admin/billing";
  }


  function goAdmin() {
    window.location.href =
      "/admin";
  }


  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f8fafc",
        padding: "30px 16px",
        color: "#111827",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "520px",
          margin: "0 auto",
        }}
      >
        <section
          style={{
            background: "#ffffff",
            border:
              "1px solid #e2e8f0",
            borderRadius: "18px",
            padding: "24px 18px",
            boxShadow:
              "0 1px 4px rgba(15,23,42,0.06)",
          }}
        >
          {status ===
            "processing" && (
            <>
              <div
                style={{
                  width: "52px",
                  height: "52px",
                  margin:
                    "0 auto 18px",
                  borderRadius:
                    "50%",
                  background:
                    "#eff6ff",
                  display: "flex",
                  alignItems:
                    "center",
                  justifyContent:
                    "center",
                  fontSize: "24px",
                }}
              >
                ⏳
              </div>

              <h1
                style={{
                  margin:
                    "0 0 10px",
                  textAlign:
                    "center",
                  fontSize: "21px",
                }}
              >
                카드 등록 처리 중
              </h1>
            </>
          )}


          {status ===
            "success" && (
            <>
              <div
                style={{
                  width: "52px",
                  height: "52px",
                  margin:
                    "0 auto 18px",
                  borderRadius:
                    "50%",
                  background:
                    "#dcfce7",
                  display: "flex",
                  alignItems:
                    "center",
                  justifyContent:
                    "center",
                  fontSize: "25px",
                }}
              >
                ✓
              </div>

              <h1
                style={{
                  margin:
                    "0 0 10px",
                  textAlign:
                    "center",
                  fontSize: "21px",
                  color:
                    "#166534",
                }}
              >
                카드 등록 완료
              </h1>
            </>
          )}


          {status ===
            "error" && (
            <>
              <div
                style={{
                  width: "52px",
                  height: "52px",
                  margin:
                    "0 auto 18px",
                  borderRadius:
                    "50%",
                  background:
                    "#fee2e2",
                  display: "flex",
                  alignItems:
                    "center",
                  justifyContent:
                    "center",
                  fontSize: "24px",
                }}
              >
                !
              </div>

              <h1
                style={{
                  margin:
                    "0 0 10px",
                  textAlign:
                    "center",
                  fontSize: "21px",
                  color:
                    "#b91c1c",
                }}
              >
                카드 등록 실패
              </h1>
            </>
          )}


          <div
            style={{
              textAlign: "center",
              color:
                status === "error"
                  ? "#b91c1c"
                  : "#475569",
              fontSize: "14px",
              lineHeight: "1.7",
            }}
          >
            {message}
          </div>


          {status ===
            "success" && (
            <div
              style={{
                marginTop: "16px",
                padding: "12px",
                borderRadius:
                  "10px",
                background:
                  "#f8fafc",
                color:
                  "#64748b",
                fontSize: "12px",
                lineHeight: "1.6",
              }}
            >
              카드 등록만으로 요금제가 변경되지는 않습니다.
              최초 결제가 정상적으로 완료된 후 선택한
              유료 요금제가 적용됩니다.
            </div>
          )}


          {status !==
            "processing" && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "1fr 1fr",
                gap: "10px",
                marginTop: "20px",
              }}
            >
              <button
                type="button"
                onClick={
                  goAdmin
                }
                style={{
                  border:
                    "1px solid #cbd5e1",
                  borderRadius:
                    "10px",
                  padding:
                    "11px 10px",
                  background:
                    "#ffffff",
                  color:
                    "#334155",
                  fontWeight:
                    "800",
                  cursor:
                    "pointer",
                }}
              >
                관리자 홈
              </button>

              <button
                type="button"
                onClick={
                  goBilling
                }
                style={{
                  border: "none",
                  borderRadius:
                    "10px",
                  padding:
                    "11px 10px",
                  background:
                    "#111827",
                  color:
                    "#ffffff",
                  fontWeight:
                    "800",
                  cursor:
                    "pointer",
                }}
              >
                요금제 화면
              </button>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}


export default function BillingSuccessPage() {
  return (
    <Suspense
      fallback={
        <main
          style={{
            minHeight:
              "100vh",
            background:
              "#f8fafc",
            padding:
              "40px 16px",
            color:
              "#111827",
          }}
        >
          결제 정보를 확인하는 중...
        </main>
      }
    >
      <BillingSuccessContent />
    </Suspense>
  );
      }
