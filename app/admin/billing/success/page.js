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
  ] = useState(
    "processing",
  );

  const [
    message,
    setMessage,
  ] = useState(
    "결제 정보를 확인하고 있습니다.",
  );

  const [
    paymentInfo,
    setPaymentInfo,
  ] = useState(null);


  useEffect(() => {
    if (startedRef.current) {
      return;
    }

    startedRef.current =
      true;

    processBilling();
  }, []);


  /*
   * =========================================================
   * JSON 응답 안전 파싱
   * =========================================================
   */

  async function readJson(
    response,
  ) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }


  /*
   * =========================================================
   * 결제 처리
   *
   * 1. 로그인 확인
   * 2. issue
   *    - prepared → billingKey 발급
   *    - authorized → 기존 billingKey 사용
   *    - paid → 이미 완료
   * 3. charge
   *    - authorized → 최초 결제
   *    - paid → 중복결제 없이 완료 반환
   * =========================================================
   */

  async function processBilling() {
    try {
      setStatus(
        "processing",
      );

      setMessage(
        "결제 정보를 확인하고 있습니다.",
      );


      /*
       * =====================================================
       * 1. Toss Redirect 값
       * =====================================================
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


      /*
       * customerKey와 checkoutSessionId는
       * 반드시 있어야 합니다.
       *
       * authKey는 최초 prepared 상태에서만 필요합니다.
       * authorized/paid 재진입에서는 issue 서버가
       * 기존 상태를 확인할 수 있습니다.
       */

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
       * =====================================================
       * 2. 로그인 세션
       * =====================================================
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
       * =====================================================
       * 3. billingKey 발급 / 기존 발급 확인
       * =====================================================
       */

      setMessage(
        "카드 등록 상태를 확인하고 있습니다.",
      );


      const issueResponse =
        await fetch(
          "/api/billing/issue",
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",

              Authorization:
                `Bearer ${accessToken}`,
            },

            body:
              JSON.stringify({
                authKey:
                  authKey || "",

                customerKey,

                checkoutSessionId,
              }),
          },
        );


      const issueResult =
        await readJson(
          issueResponse,
        );


      if (
        !issueResponse.ok ||
        !issueResult?.ok
      ) {
        throw new Error(
          issueResult?.error ||
            "카드 등록 상태를 확인하지 못했습니다.",
        );
      }


      /*
       * =====================================================
       * 4. issue 단계에서 이미 paid
       *
       * 새로고침 등의 경우입니다.
       * charge를 다시 호출해도 안전하지만
       * 불필요한 요청을 줄이기 위해 여기서 완료합니다.
       * =====================================================
       */

      if (
        issueResult.status ===
        "paid"
      ) {
        setPaymentInfo({
          plan:
            issueResult.plan ||
            null,

          payment:
            null,

          alreadyPaid:
            true,
        });

        setStatus(
          "success",
        );

        setMessage(
          "이미 결제가 완료된 요금제입니다.",
        );

        return;
      }


      /*
       * =====================================================
       * 5. 최초 결제
       * =====================================================
       */

      setMessage(
        "카드 등록이 완료되었습니다. 최초 결제를 진행하고 있습니다.",
      );


      const chargeResponse =
        await fetch(
          "/api/billing/charge",
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",

              Authorization:
                `Bearer ${accessToken}`,
            },

            body:
              JSON.stringify({
                checkoutSessionId,
              }),
          },
        );


      const chargeResult =
        await readJson(
          chargeResponse,
        );


      if (
        !chargeResponse.ok ||
        !chargeResult?.ok
      ) {
        const error =
          new Error(
            chargeResult?.error ||
              "최초 결제를 완료하지 못했습니다.",
          );

        error.retryable =
          chargeResult?.retryable ===
          true;

        throw error;
      }


      /*
       * =====================================================
       * 6. 결제 성공
       * =====================================================
       */

      setPaymentInfo({
        plan:
          chargeResult.plan ||
          issueResult.plan ||
          null,

        payment:
          chargeResult.payment ||
          null,

        subscription:
          chargeResult.subscription ||
          null,

        alreadyPaid:
          chargeResult.alreadyPaid ===
          true,
      });


      setStatus(
        "success",
      );


      if (
        chargeResult.alreadyPaid ===
        true
      ) {
        setMessage(
          "이미 결제가 완료된 요금제입니다.",
        );
      } else {
        setMessage(
          "결제가 정상적으로 완료되었습니다.",
        );
      }

    } catch (error) {
      console.error(
        "빌링 결제 완료 오류:",
        error,
      );


      setStatus(
        "error",
      );


      if (
        error?.retryable ===
        true
      ) {
        setMessage(
          "결제 결과를 확인하지 못했습니다. 중복 결제 방지를 위해 요금제 화면으로 이동한 뒤 다시 확인해주세요.",
        );

        return;
      }


      setMessage(
        error?.message ||
          "결제 처리 중 오류가 발생했습니다.",
      );
    }
  }


  /*
   * =========================================================
   * 이동
   * =========================================================
   */

  function goBilling() {
    window.location.href =
      "/admin/billing";
  }


  function goAdmin() {
    window.location.href =
      "/admin";
  }


  /*
   * =========================================================
   * 금액 표시
   * =========================================================
   */

  function formatMoney(
    value,
  ) {
    const number =
      Number(value);

    if (
      !Number.isFinite(
        number,
      )
    ) {
      return "";
    }

    return `${number.toLocaleString(
      "ko-KR",
    )}원`;
  }


  /*
   * =========================================================
   * 화면
   * =========================================================
   */

  return (
    <main
      style={{
        minHeight:
          "100vh",

        background:
          "#f8fafc",

        padding:
          "30px 16px",

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
        <section
          style={{
            background:
              "#ffffff",

            border:
              "1px solid #e2e8f0",

            borderRadius:
              "18px",

            padding:
              "24px 18px",

            boxShadow:
              "0 1px 4px rgba(15,23,42,0.06)",
          }}
        >

          {/* 처리 중 */}

          {status ===
            "processing" && (
            <>
              <div
                style={{
                  width:
                    "52px",

                  height:
                    "52px",

                  margin:
                    "0 auto 18px",

                  borderRadius:
                    "50%",

                  background:
                    "#eff6ff",

                  display:
                    "flex",

                  alignItems:
                    "center",

                  justifyContent:
                    "center",

                  fontSize:
                    "24px",
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

                  fontSize:
                    "21px",
                }}
              >
                결제 처리 중
              </h1>
            </>
          )}


          {/* 성공 */}

          {status ===
            "success" && (
            <>
              <div
                style={{
                  width:
                    "52px",

                  height:
                    "52px",

                  margin:
                    "0 auto 18px",

                  borderRadius:
                    "50%",

                  background:
                    "#dcfce7",

                  display:
                    "flex",

                  alignItems:
                    "center",

                  justifyContent:
                    "center",

                  fontSize:
                    "25px",
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

                  fontSize:
                    "21px",

                  color:
                    "#166534",
                }}
              >
                결제 완료
              </h1>
            </>
          )}


          {/* 오류 */}

          {status ===
            "error" && (
            <>
              <div
                style={{
                  width:
                    "52px",

                  height:
                    "52px",

                  margin:
                    "0 auto 18px",

                  borderRadius:
                    "50%",

                  background:
                    "#fee2e2",

                  display:
                    "flex",

                  alignItems:
                    "center",

                  justifyContent:
                    "center",

                  fontSize:
                    "24px",
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

                  fontSize:
                    "21px",

                  color:
                    "#b91c1c",
                }}
              >
                결제 처리 실패
              </h1>
            </>
          )}


          {/* 메시지 */}

          <div
            style={{
              textAlign:
                "center",

              color:
                status ===
                "error"
                  ? "#b91c1c"
                  : "#475569",

              fontSize:
                "14px",

              lineHeight:
                "1.7",
            }}
          >
            {message}
          </div>


          {/* 결제 완료 정보 */}

          {status ===
            "success" &&
            paymentInfo && (
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
                  "1px solid #e2e8f0",

                fontSize:
                  "13px",

                lineHeight:
                  "1.8",

                color:
                  "#475569",
              }}
            >
              {paymentInfo
                ?.plan
                ?.plan_name && (
                <div>
                  요금제:{" "}
                  <strong>
                    {
                      paymentInfo
                        .plan
                        .plan_name
                    }
                  </strong>
                </div>
              )}


              {paymentInfo
                ?.payment
                ?.amount_krw !=
                null && (
                <div>
                  결제금액:{" "}
                  <strong>
                    {formatMoney(
                      paymentInfo
                        .payment
                        .amount_krw,
                    )}
                  </strong>
                </div>
              )}


              {paymentInfo
                ?.subscription
                ?.next_billing_at && (
                <div>
                  다음 결제일:{" "}
                  <strong>
                    {new Date(
                      paymentInfo
                        .subscription
                        .next_billing_at,
                    ).toLocaleDateString(
                      "ko-KR",
                    )}
                  </strong>
                </div>
              )}
            </div>
          )}


          {/* 안내 */}

          {status ===
            "success" && (
            <div
              style={{
                marginTop:
                  "14px",

                padding:
                  "12px",

                borderRadius:
                  "10px",

                background:
                  "#ecfdf5",

                color:
                  "#166534",

                fontSize:
                  "12px",

                lineHeight:
                  "1.6",
              }}
            >
              결제가 완료되어 선택한 유료 요금제가
              적용되었습니다. 다음 결제일부터 등록된
              카드로 정기결제가 진행됩니다.
            </div>
          )}


          {/* 버튼 */}

          {status !==
            "processing" && (
            <div
              style={{
                display:
                  "grid",

                gridTemplateColumns:
                  "1fr 1fr",

                gap:
                  "10px",

                marginTop:
                  "20px",
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
                  border:
                    "none",

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
