"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  supabase,
} from "../../../lib/supabase";

import {
  loadTossPayments,
} from "@tosspayments/tosspayments-sdk";


function formatPrice(value) {
  const price =
    Number(value || 0);

  if (price <= 0) {
    return "무료";
  }

  return `${new Intl.NumberFormat(
    "ko-KR",
  ).format(price)}원`;
}


function formatLimit(
  value,
  unit = "회",
) {
  const number =
    Number(value || 0);

  if (number <= 0) {
    return "무제한";
  }

  return `${new Intl.NumberFormat(
    "ko-KR",
  ).format(number)}${unit}`;
}


function normalizePlanCode(
  value,
) {
  return String(
    value || "",
  )
    .trim()
    .toLowerCase();
}


function getPlanLabel(
  planCode,
  planName,
) {
  const code =
    normalizePlanCode(
      planCode,
    );

  if (code === "trial") {
    return "TRIAL";
  }

  if (code === "basic") {
    return "BASIC";
  }

  if (code === "pro") {
    return "PRO";
  }

  if (
    code === "business"
  ) {
    return "BUSINESS";
  }

  return String(
    planName ||
      planCode ||
      "PLAN",
  ).toUpperCase();
}


function PlanFeature({
  label,
  value,
  unit = "회",
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems:
          "center",
        justifyContent:
          "space-between",
        gap: "12px",
        padding: "9px 0",
        borderBottom:
          "1px solid #f1f5f9",
      }}
    >
      <span
        style={{
          color:
            "#64748b",
          fontSize:
            "13px",
        }}
      >
        {label}
      </span>

      <strong
        style={{
          color:
            "#111827",
          fontSize:
            "13px",
          whiteSpace:
            "nowrap",
        }}
      >
        {formatLimit(
          value,
          unit,
        )}
      </strong>
    </div>
  );
}


export default function BillingPage() {
  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState("");

  const [
    plans,
    setPlans,
  ] = useState([]);

  const [
    currentPlan,
    setCurrentPlan,
  ] = useState(null);

  const [
    selectedPlan,
    setSelectedPlan,
  ] = useState(null);

  const [
    preparingPlan,
    setPreparingPlan,
  ] = useState("");

  const [
    preparedBilling,
    setPreparedBilling,
  ] = useState(null);


  useEffect(() => {
    loadBillingPage();
  }, []);


  async function loadBillingPage() {
    try {
      setLoading(true);
      setError("");

      const {
        data:
          sessionData,
        error:
          sessionError,
      } =
        await supabase
          .auth
          .getSession();


      if (sessionError) {
        throw sessionError;
      }


      if (
        !sessionData
          ?.session
      ) {
        window.location.href =
          "/admin";

        return;
      }


      const [
        currentResult,
        plansResult,
      ] =
        await Promise.all([
          supabase.rpc(
            "get_my_plan_usage",
          ),

          supabase
            .from(
              "subscription_plans",
            )
            .select(
              `
                plan_code,
                plan_name,
                monthly_price_krw,
                ai_photo_analysis_limit,
                auto_estimate_limit,
                similar_image_search_limit,
                virtual_remodel_limit,
                image_upload_limit,
                storage_mb_limit,
                customer_lead_limit,
                is_active,
                sort_order
              `,
            )
            .eq(
              "is_active",
              true,
            )
            .order(
              "sort_order",
              {
                ascending:
                  true,
              },
            ),
        ]);


      if (
        currentResult.error
      ) {
        throw currentResult.error;
      }


      if (
        plansResult.error
      ) {
        throw plansResult.error;
      }


      const current =
        Array.isArray(
          currentResult.data,
        )
          ? currentResult
              .data[0]
          : currentResult
              .data;


      setCurrentPlan(
        current || null,
      );

      setPlans(
        plansResult.data ||
          [],
      );


      if (
        current
          ?.plan_code
      ) {
        setSelectedPlan(
          current
            .plan_code,
        );
      }

    } catch (
      loadError
    ) {
      console.error(
        "요금제 페이지 로딩 오류:",
        loadError,
      );

      setError(
        loadError
          ?.message ||
          "요금제 정보를 불러오지 못했습니다.",
      );

    } finally {
      setLoading(
        false,
      );
    }
  }


  function goBack() {
    window.location.href =
      "/admin";
  }


  /*
   * =========================================================
   * 기존 등록 카드로 즉시 결제
   * =========================================================
   */

  async function chargeExistingCard({
    accessToken,
    checkoutSessionId,
  }) {
    const response =
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
      const error =
        new Error(
          result?.error ||
            "결제에 실패했습니다.",
        );

      error.code =
        result?.code;

      error.retryable =
        result?.retryable;

      throw error;
    }


    return result;
  }


  /*
   * =========================================================
   * 요금제 선택
   *
   * 등록카드 있음
   * → prepare
   * → authorized
   * → charge
   *
   * 등록카드 없음
   * → prepare
   * → prepared
   * → Toss 카드등록
   * → success
   * → issue
   * → charge
   * =========================================================
   */

  async function handleSelectPlan(
    plan,
  ) {
    const code =
      normalizePlanCode(
        plan?.plan_code,
      );

    const currentCode =
      normalizePlanCode(
        currentPlan
          ?.plan_code,
      );


    if (
      code ===
      currentCode
    ) {
      return;
    }


    if (
      code === "trial"
    ) {
      alert(
        "TRIAL 요금제는 신규 가입 체험용 요금제입니다.",
      );

      return;
    }


    if (
      preparingPlan
    ) {
      return;
    }


    try {
      setError("");

      setPreparedBilling(
        null,
      );

      setSelectedPlan(
        plan.plan_code,
      );

      setPreparingPlan(
        plan.plan_code,
      );


      /*
       * 로그인 세션
       */

      const {
        data:
          sessionData,
        error:
          sessionError,
      } =
        await supabase
          .auth
          .getSession();


      if (sessionError) {
        throw sessionError;
      }


      const accessToken =
        sessionData
          ?.session
          ?.access_token;


      if (!accessToken) {
        alert(
          "로그인이 만료되었습니다. 다시 로그인해주세요.",
        );

        window.location.href =
          "/admin";

        return;
      }


      /*
       * 서버 prepare
       */

      const response =
        await fetch(
          "/api/billing/prepare",
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
                plan_code:
                  plan.plan_code,
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
            "결제 준비에 실패했습니다.",
        );
      }


      const customerKey =
        result
          ?.customerKey;

      const checkoutSessionId =
        result
          ?.checkoutSessionId;


      if (!customerKey) {
        throw new Error(
          "결제 고객키를 확인할 수 없습니다.",
        );
      }


      if (
        !checkoutSessionId
      ) {
        throw new Error(
          "결제 세션을 확인할 수 없습니다.",
        );
      }


      setPreparedBilling(
        result,
      );


      const preparedPlanCode =
        result
          ?.plan
          ?.plan_code ||
        result
          ?.plan
          ?.code ||
        plan.plan_code;


      setSelectedPlan(
        preparedPlanCode,
      );


      /*
       * =====================================================
       * 기존 등록카드 있음
       *
       * Toss 카드등록창을 다시 열지 않습니다.
       * 바로 최초 결제 실행
       * =====================================================
       */

      if (
        result
          ?.hasPaymentMethod
      ) {
        const confirmed =
          window.confirm(
            `${getPlanLabel(
              result
                ?.plan
                ?.plan_code,
              result
                ?.plan
                ?.plan_name,
            )} 요금제 ${formatPrice(
              result
                ?.plan
                ?.monthly_price_krw,
            )}을 등록된 카드로 결제하시겠습니까?`,
          );


        if (!confirmed) {
          setSelectedPlan(
            currentPlan
              ?.plan_code ||
              null,
          );

          setPreparedBilling(
            null,
          );

          return;
        }


        const chargeResult =
          await chargeExistingCard({
            accessToken,
            checkoutSessionId,
          });


        alert(
          chargeResult
            ?.alreadyPaid
            ? "이미 완료된 결제입니다."
            : "결제가 완료되었습니다.",
        );


        /*
         * DB의 변경된 플랜을 다시 읽기 위해
         * 요금제 페이지 새로고침
         */

        window.location.href =
          "/admin/billing";

        return;
      }


      /*
       * =====================================================
       * 등록카드 없음
       *
       * Toss 카드 자동결제 등록 진행
       * =====================================================
       */

      const clientKey =
        process.env
          .NEXT_PUBLIC_TOSS_CLIENT_KEY;


      if (!clientKey) {
        throw new Error(
          "Toss 클라이언트 키가 설정되지 않았습니다.",
        );
      }


      const tossPayments =
        await loadTossPayments(
          clientKey,
        );


      const payment =
        tossPayments.payment({
          customerKey,
        });


      const origin =
        window.location.origin;


      const successUrl =
        `${origin}/admin/billing/success` +
        `?checkoutSessionId=${encodeURIComponent(
          checkoutSessionId,
        )}`;


      const failUrl =
        `${origin}/admin/billing/fail` +
        `?checkoutSessionId=${encodeURIComponent(
          checkoutSessionId,
        )}`;


      const billingAuthOptions = {
        method:
          "CARD",

        successUrl,

        failUrl,
      };


      const customerEmail =
        sessionData
          ?.session
          ?.user
          ?.email;


      if (
        customerEmail
      ) {
        billingAuthOptions
          .customerEmail =
          customerEmail;
      }


      const customerName =
        result
          ?.company
          ?.representative_name ||
        result
          ?.company
          ?.name ||
        result
          ?.company
          ?.company_name;


      if (
        customerName
      ) {
        billingAuthOptions
          .customerName =
          customerName;
      }


      await payment
        .requestBillingAuth(
          billingAuthOptions,
        );

    } catch (
      prepareError
    ) {
      console.error(
        "결제 처리 오류:",
        prepareError,
      );


      if (
        prepareError
          ?.code ===
        "USER_CANCEL"
      ) {
        setError(
          "카드 등록이 취소되었습니다.",
        );

      } else {
        setError(
          prepareError
            ?.message ||
            "결제 처리 중 오류가 발생했습니다.",
        );
      }


      setSelectedPlan(
        currentPlan
          ?.plan_code ||
          null,
      );

      setPreparedBilling(
        null,
      );

    } finally {
      setPreparingPlan(
        "",
      );
    }
  }


  if (loading) {
    return (
      <main
        style={{
          maxWidth:
            "1000px",
          margin:
            "0 auto",
          minHeight:
            "100vh",
          padding:
            "40px 16px",
          background:
            "#f8fafc",
          color:
            "#111827",
        }}
      >
        요금제 정보를 불러오는 중...
      </main>
    );
  }


  return (
    <main
      style={{
        maxWidth:
          "1000px",
        margin:
          "0 auto",
        minHeight:
          "100vh",
        padding:
          "18px 14px 80px",
        background:
          "#f8fafc",
        color:
          "#111827",
      }}
    >
      {/* 상단 */}

      <div
        style={{
          display:
            "flex",
          alignItems:
            "center",
          gap:
            "10px",
          marginBottom:
            "18px",
        }}
      >
        <button
          type="button"
          onClick={
            goBack
          }
          style={{
            width:
              "38px",
            height:
              "38px",
            borderRadius:
              "10px",
            border:
              "1px solid #cbd5e1",
            background:
              "#ffffff",
            cursor:
              "pointer",
            fontSize:
              "18px",
          }}
        >
          ←
        </button>

        <div>
          <h1
            style={{
              margin: 0,
              fontSize:
                "23px",
            }}
          >
            요금제
          </h1>

          <div
            style={{
              marginTop:
                "3px",
              color:
                "#64748b",
              fontSize:
                "12px",
            }}
          >
            이용 중인 요금제를 확인하고 변경할 수 있습니다.
          </div>
        </div>
      </div>


      {/* 오류 */}

      {error && (
        <div
          style={{
            marginBottom:
              "16px",
            padding:
              "13px",
            border:
              "1px solid #fecaca",
            borderRadius:
              "12px",
            background:
              "#fef2f2",
            color:
              "#b91c1c",
            fontSize:
              "13px",
            lineHeight:
              "1.5",
          }}
        >
          {error}

          <button
            type="button"
            onClick={
              loadBillingPage
            }
            style={{
              display:
                "block",
              marginTop:
                "10px",
              border:
                "1px solid #fecaca",
              borderRadius:
                "8px",
              padding:
                "7px 10px",
              background:
                "#ffffff",
              color:
                "#b91c1c",
              fontWeight:
                "700",
              cursor:
                "pointer",
            }}
          >
            다시 불러오기
          </button>
        </div>
      )}


      {/* 현재 요금제 */}

      {currentPlan && (
        <section
          style={{
            marginBottom:
              "18px",
            padding:
              "15px",
            borderRadius:
              "14px",
            background:
              "#111827",
            color:
              "#ffffff",
          }}
        >
          <div
            style={{
              fontSize:
                "11px",
              opacity:
                0.7,
              marginBottom:
                "4px",
            }}
          >
            현재 이용 중
          </div>

          <div
            style={{
              display:
                "flex",
              justifyContent:
                "space-between",
              alignItems:
                "flex-end",
              gap:
                "12px",
            }}
          >
            <strong
              style={{
                fontSize:
                  "21px",
              }}
            >
              {getPlanLabel(
                currentPlan
                  .plan_code,
                currentPlan
                  .plan_name,
              )}
            </strong>

            <div
              style={{
                textAlign:
                  "right",
              }}
            >
              <strong
                style={{
                  fontSize:
                    "17px",
                }}
              >
                {formatPrice(
                  currentPlan
                    .monthly_price_krw,
                )}
              </strong>

              {Number(
                currentPlan
                  .monthly_price_krw ||
                  0,
              ) > 0 && (
                <span
                  style={{
                    fontSize:
                      "11px",
                    opacity:
                      0.7,
                  }}
                >
                  {" "}
                  / 월
                </span>
              )}
            </div>
          </div>
        </section>
      )}


      {/* 결제 준비 결과 */}

      {preparedBilling && (
        <section
          style={{
            marginBottom:
              "18px",
            padding:
              "15px",
            border:
              "1px solid #bbf7d0",
            borderRadius:
              "14px",
            background:
              "#f0fdf4",
          }}
        >
          <div
            style={{
              color:
                "#166534",
              fontSize:
                "14px",
              fontWeight:
                "800",
              marginBottom:
                "8px",
            }}
          >
            ✓ 결제 준비 확인 완료
          </div>

          <div
            style={{
              color:
                "#334155",
              fontSize:
                "13px",
              lineHeight:
                "1.8",
            }}
          >
            <div>
              업체:{" "}
              <strong>
                {preparedBilling
                  ?.company
                  ?.company_name ||
                  "-"}
              </strong>
            </div>

            <div>
              선택 요금제:{" "}
              <strong>
                {getPlanLabel(
                  preparedBilling
                    ?.plan
                    ?.plan_code,
                  preparedBilling
                    ?.plan
                    ?.plan_name,
                )}
              </strong>
            </div>

            <div>
              결제금액:{" "}
              <strong>
                {formatPrice(
                  preparedBilling
                    ?.plan
                    ?.monthly_price_krw,
                )}
              </strong>
              {" / 월"}
            </div>

            <div>
              결제수단:{" "}
              <strong>
                {preparedBilling
                  ?.hasPaymentMethod
                  ? "등록된 카드 사용"
                  : "카드 등록 필요"}
              </strong>
            </div>
          </div>
        </section>
      )}


      {/* 제목 */}

      <div
        style={{
          marginBottom:
            "12px",
        }}
      >
        <strong
          style={{
            fontSize:
              "16px",
          }}
        >
          요금제 비교
        </strong>

        <div
          style={{
            marginTop:
              "4px",
            color:
              "#64748b",
            fontSize:
              "12px",
          }}
        >
          표시되는 가격과 이용 한도는 현재 설정된 요금제 기준입니다.
        </div>
      </div>


      {/* 요금제 */}

      <div
        style={{
          display:
            "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(220px, 1fr))",
          gap:
            "12px",
        }}
      >
        {plans.map(
          (plan) => {
            const code =
              normalizePlanCode(
                plan
                  .plan_code,
              );

            const currentCode =
              normalizePlanCode(
                currentPlan
                  ?.plan_code,
              );

            const isCurrent =
              code ===
              currentCode;

            const isSelected =
              normalizePlanCode(
                selectedPlan,
              ) === code;

            const isTrial =
              code ===
              "trial";

            const isPreparing =
              normalizePlanCode(
                preparingPlan,
              ) === code;

            const anyPreparing =
              Boolean(
                preparingPlan,
              );


            return (
              <section
                key={
                  plan
                    .plan_code
                }
                style={{
                  display:
                    "flex",
                  flexDirection:
                    "column",
                  background:
                    "#ffffff",

                  border:
                    isCurrent
                      ? "2px solid #111827"
                      : isSelected
                        ? "2px solid #2563eb"
                        : "1px solid #e2e8f0",

                  borderRadius:
                    "16px",
                  padding:
                    "16px",

                  boxShadow:
                    "0 1px 3px rgba(15,23,42,0.05)",
                }}
              >
                <div
                  style={{
                    display:
                      "flex",
                    alignItems:
                      "center",
                    justifyContent:
                      "space-between",
                    gap:
                      "8px",
                    marginBottom:
                      "10px",
                  }}
                >
                  <strong
                    style={{
                      fontSize:
                        "19px",
                    }}
                  >
                    {getPlanLabel(
                      plan
                        .plan_code,
                      plan
                        .plan_name,
                    )}
                  </strong>

                  {isCurrent && (
                    <span
                      style={{
                        borderRadius:
                          "999px",
                        padding:
                          "4px 7px",
                        background:
                          "#111827",
                        color:
                          "#ffffff",
                        fontSize:
                          "10px",
                        fontWeight:
                          "800",
                      }}
                    >
                      이용 중
                    </span>
                  )}
                </div>


                <div
                  style={{
                    marginBottom:
                      "13px",
                  }}
                >
                  <strong
                    style={{
                      fontSize:
                        "22px",
                    }}
                  >
                    {formatPrice(
                      plan
                        .monthly_price_krw,
                    )}
                  </strong>

                  {Number(
                    plan
                      .monthly_price_krw ||
                      0,
                  ) > 0 && (
                    <span
                      style={{
                        color:
                          "#64748b",
                        fontSize:
                          "12px",
                      }}
                    >
                      {" "}
                      / 월
                    </span>
                  )}
                </div>


                <div
                  style={{
                    flex: 1,
                  }}
                >
                  <PlanFeature
                    label="AI 사진분석"
                    value={
                      plan
                        .ai_photo_analysis_limit
                    }
                  />

                  <PlanFeature
                    label="자동견적"
                    value={
                      plan
                        .auto_estimate_limit
                    }
                  />

                  <PlanFeature
                    label="유사 이미지 검색"
                    value={
                      plan
                        .similar_image_search_limit
                    }
                  />

                  <PlanFeature
                    label="가상시공"
                    value={
                      plan
                        .virtual_remodel_limit
                    }
                  />

                  <PlanFeature
                    label="사진 업로드"
                    value={
                      plan
                        .image_upload_limit
                    }
                  />

                  <PlanFeature
                    label="저장공간"
                    value={
                      plan
                        .storage_mb_limit
                    }
                    unit="MB"
                  />

                  <PlanFeature
                    label="고객상담"
                    value={
                      plan
                        .customer_lead_limit
                    }
                  />
                </div>


                <button
                  type="button"
                  disabled={
                    isCurrent ||
                    anyPreparing
                  }
                  onClick={() =>
                    handleSelectPlan(
                      plan,
                    )
                  }
                  style={{
                    width:
                      "100%",
                    marginTop:
                      "15px",
                    border:
                      "none",
                    borderRadius:
                      "10px",
                    padding:
                      "11px 10px",

                    background:
                      isCurrent
                        ? "#e2e8f0"
                        : isPreparing
                          ? "#94a3b8"
                          : isTrial
                            ? "#f1f5f9"
                            : "#111827",

                    color:
                      isCurrent
                        ? "#64748b"
                        : isTrial
                          ? "#475569"
                          : "#ffffff",

                    fontSize:
                      "13px",
                    fontWeight:
                      "800",

                    cursor:
                      isCurrent ||
                      anyPreparing
                        ? "default"
                        : "pointer",

                    opacity:
                      anyPreparing &&
                      !isPreparing
                        ? 0.6
                        : 1,
                  }}
                >
                  {isCurrent
                    ? "현재 요금제"
                    : isPreparing
                      ? "결제 처리 중..."
                      : isTrial
                        ? "체험 요금제"
                        : `${getPlanLabel(
                            plan
                              .plan_code,
                            plan
                              .plan_name,
                          )} 선택`}
                </button>
              </section>
            );
          },
        )}
      </div>


      {/* 안내 */}

      <div
        style={{
          marginTop:
            "18px",
          padding:
            "13px",
          border:
            "1px solid #e2e8f0",
          borderRadius:
            "12px",
          background:
            "#ffffff",
          color:
            "#64748b",
          fontSize:
            "12px",
          lineHeight:
            "1.6",
        }}
      >
        유료 요금제를 선택하면 서버에서 로그인 사용자,
        소속 업체, 요금제와 월 결제금액을 다시 확인합니다.
        등록된 카드가 있으면 해당 카드로 결제를 진행하고,
        등록된 카드가 없으면 카드 자동결제 등록을 먼저 진행합니다.
        실제 결제가 성공한 뒤에만 유료 요금제가 적용됩니다.
      </div>
    </main>
  );
            }
