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

  if (code === "light") {
    return "LIGHT";
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


function formatKstDate(
  value,
) {
  if (!value) {
    return "-";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return "-";
  }

  return new Intl.DateTimeFormat(
    "ko-KR",
    {
      timeZone:
        "Asia/Seoul",
      year:
        "numeric",
      month:
        "2-digit",
      day:
        "2-digit",
      hour:
        "2-digit",
      minute:
        "2-digit",
    },
  ).format(date);
}


function PlanFeature({
  label,
  value,
  unit = "회",
}) {
  return (
    <div
      style={{
        display:
          "flex",
        alignItems:
          "center",
        justifyContent:
          "space-between",
        gap:
          "12px",
        padding:
          "9px 0",
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

  const [pendingPlan, setPendingPlan] = useState(null);
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [refundBusy, setRefundBusy] = useState(false);
  const [billingConsent, setBillingConsent] = useState(false);

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

  const [
    canceling,
    setCanceling,
  ] = useState(false);

  const [
    cancellation,
    setCancellation,
  ] = useState(null);


  useEffect(() => {
    loadBillingPage();
  }, []);
  async function loadPaymentHistory() {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) return;
    const response = await fetch("/api/billing/refunds", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.ok) setPaymentHistory((await response.json()).payments || []);
  }

  useEffect(() => { loadPaymentHistory().catch(console.error); }, []);

  async function requestRefund(payment) {
    const reason = window.prompt("환불 또는 중복 결제 사유를 입력해주세요. 구독 취소는 별도 버튼으로 처리됩니다.");
    if (reason === null) return;
    if (reason.trim().length < 3) { alert("환불 사유를 입력해주세요."); return; }
    setRefundBusy(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) throw new Error("로그인이 필요합니다.");
      const response = await fetch("/api/billing/refunds", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ payment_id: payment.id, reason: reason.trim() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "환불 신청에 실패했습니다.");
      alert("환불 신청을 접수했습니다. 결제 취소 가능 금액을 확인한 뒤 원래 결제수단으로 처리합니다.");
      await loadPaymentHistory();
    } catch (error) { alert(error.message); } finally { setRefundBusy(false); }
  }



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
        subscriptionResult,
        plansResult,
      ] =
        await Promise.all([
          supabase.rpc(
            "get_my_plan_usage",
          ),

          supabase.rpc(
            "get_my_subscription",
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
        subscriptionResult.error
      ) {
        throw subscriptionResult.error;
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

      const subscription =
        Array.isArray(
          subscriptionResult.data,
        )
          ? subscriptionResult
              .data[0]
          : subscriptionResult
              .data;

      setCurrentPlan(
        current || null,
      );
      const { data: authSession } = await supabase.auth.getSession();
      if (authSession?.session?.access_token) {
        const res = await fetch("/api/billing/change-plan", { headers: { Authorization: "Bearer " + authSession.session.access_token } });
        if (res.ok) setPendingPlan((await res.json()).pendingPlanCode || null);
      }

      setPlans(
        plansResult.data ||
          [],
      );

      /*
       * =====================================================
       * 새로고침 후에도 실제 DB의 구독 취소 예약 상태 복원
       * =====================================================
       */

      if (
        subscription
          ?.cancel_at_period_end ===
        true
      ) {
        setCancellation({
          cancelScheduled: true,
          alreadyScheduled: true,

          subscription: {
            plan_code:
              subscription.plan_code,

            status:
              subscription.subscription_status,

            current_period_start:
              subscription.current_period_start,

            current_period_end:
              subscription.current_period_end,

            next_billing_at:
              subscription.next_billing_at,

            cancel_at_period_end:
              subscription.cancel_at_period_end,

            canceled_at:
              subscription.canceled_at,
          },
        });
      } else {
        setCancellation(
          null,
        );
      }

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
   * 구독 취소 예약
   * =========================================================
   */

  async function handleCancelSubscription() {
    if (canceling) {
      return;
    }

    const code =
      normalizePlanCode(
        currentPlan
          ?.plan_code,
      );

    if (
      !code ||
      code === "trial"
    ) {
      alert(
        "현재 취소할 유료 구독이 없습니다.",
      );

      return;
    }

    const confirmed =
      window.confirm(
        `${getPlanLabel(
          currentPlan
            ?.plan_code,
          currentPlan
            ?.plan_name,
        )} 요금제 구독을 취소하시겠습니까?\n\n취소 후에도 현재 결제기간이 끝날 때까지 이용할 수 있으며 다음 자동결제부터 중단됩니다.`,
      );

    if (!confirmed) {
      return;
    }

    try {
      setCanceling(true);
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

      const response =
        await fetch(
          "/api/billing/cancel",
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
              JSON.stringify({}),
          },
        );

      let result =
        null;

      try {
        result =
          await response.json();
      } catch {
        result =
          null;
      }

      if (
        !response.ok ||
        !result?.ok
      ) {
        throw new Error(
          result?.error ||
            "구독 취소 예약에 실패했습니다.",
        );
      }

      setCancellation(
        result,
      );

      if (
        result
          ?.alreadyScheduled
      ) {
        alert(
          "이미 구독 취소가 예약되어 있습니다.",
        );
      } else if (
        result
          ?.alreadyCanceled
      ) {
        alert(
          "이미 취소된 구독입니다.",
        );
      } else {
        alert(
          "구독 취소가 예약되었습니다.\n현재 결제기간까지는 정상적으로 이용할 수 있습니다.",
        );
      }
    } catch (
      cancelError
    ) {
      console.error(
        "구독 취소 오류:",
        cancelError,
      );

      setError(
        cancelError
          ?.message ||
          "구독 취소 예약 중 오류가 발생했습니다.",
      );
    } finally {
      setCanceling(
        false,
      );
    }
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

    let result =
      null;

    try {
      result =
        await response.json();
    } catch {
      result =
        null;
    }

    if (
      !response.ok ||
      !result?.ok
    ) {
      const chargeError =
        new Error(
          result?.error ||
            "결제에 실패했습니다.",
        );

      chargeError.code =
        result?.code;

      chargeError.retryable =
        result?.retryable;

      throw chargeError;
    }

    return result;
  }


  /*
   * =========================================================
   * 요금제 선택
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

      const currentPrice = Number(currentPlan?.monthly_price_krw);
      const targetPrice = Number(plan?.monthly_price_krw);
      if (currentCode !== "trial" && Number.isFinite(currentPrice) && Number.isFinite(targetPrice) && targetPrice < currentPrice) {
        if (!window.confirm(getPlanLabel(code) + " 요금제로 다음 결제일부터 변경하시겠습니까?\n지금 추가 결제: 0원 / 다음 결제: " + formatPrice(targetPrice))) return;
        const res = await fetch("/api/billing/change-plan", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + accessToken }, body: JSON.stringify({ plan_code: code }) });
        const change = await res.json();
        if (!res.ok) throw new Error(change.error || "변경 예약에 실패했습니다.");
        setPendingPlan(change.pendingPlanCode);
        alert("변경 예약 완료: " + formatKstDate(change.effectiveAt) + "부터 적용, 다음 결제 " + formatPrice(change.nextAmount));
        return;
      }

      if (!billingConsent) {
        alert("월 정기결제 및 환불 안내를 확인하고 동의해주세요.");
        return;
      }

      if (currentCode !== "trial" && Number.isFinite(currentPrice) &&
          Number.isFinite(targetPrice) && targetPrice > currentPrice) {
        const quoteResponse = await fetch("/api/billing/upgrade", {
          method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ action: "quote", plan_code: code }),
        });
        const quote = await quoteResponse.json();
        if (!quoteResponse.ok) throw new Error(quote.error || "변경 금액을 확인하지 못했습니다.");
        if (!window.confirm(`${getPlanLabel(code)} 상향 변경\n지금 결제: ${formatPrice(quote.amountNow)} (남은 기간 차액)\n다음 결제부터: ${formatPrice(quote.monthlyPrice)} / 월\n현재 결제기간 종료: ${formatKstDate(quote.periodEnd)}\n결제하시겠습니까?`)) return;
        if (!billingConsent) { alert("정기결제 및 환불 안내를 확인하고 동의해주세요."); return; }
        const chargeResponse = await fetch("/api/billing/upgrade", {
          method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ action: "confirm", plan_code: code,
            quoteAt: quote.quoteAt, signature: quote.signature }),
        });
        const charge = await chargeResponse.json();
        if (!chargeResponse.ok) throw new Error(charge.error || "결제 결과를 확인하지 못했습니다. 다시 결제하지 말고 관리자에게 문의해주세요.");
        alert(`상향 변경 완료. 이번 결제 ${formatPrice(charge.amountPaid)}. 다음 결제일부터 월 ${formatPrice(quote.monthlyPrice)}입니다.`);
        window.location.href = "/admin/billing";
        return;
      }

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

      let result =
        null;

      try {
        result =
          await response.json();
      } catch {
        result =
          null;
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
       * 등록된 카드가 있으면 즉시 결제
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

        window.location.href =
          "/admin/billing";

        return;
      }

      /*
       * 등록 카드가 없으면 Toss 카드 등록
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


  const currentCode =
    normalizePlanCode(
      currentPlan
        ?.plan_code,
    );

  const isPaidPlan =
    currentCode &&
    currentCode !==
      "trial";

  const cancelScheduled =
    Boolean(
      cancellation
        ?.cancelScheduled ||
      cancellation
        ?.alreadyScheduled,
    );

  const cancellationSubscription =
    cancellation
      ?.subscription ||
    null;


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


          {/* 유료 구독 취소 */}

          {isPaidPlan && (
            <div
              style={{
                marginTop:
                  "14px",
                paddingTop:
                  "13px",
                borderTop:
                  "1px solid rgba(255,255,255,0.15)",
              }}
            >
              {cancelScheduled ? (
                <div
                  style={{
                    padding:
                      "11px 12px",
                    borderRadius:
                      "10px",
                    background:
                      "rgba(245,158,11,0.16)",
                    border:
                      "1px solid rgba(245,158,11,0.45)",
                    fontSize:
                      "12px",
                    lineHeight:
                      "1.6",
                  }}
                >
                  <strong>
                    ✓ 구독 취소 예약됨
                  </strong>

                  <div
                    style={{
                      marginTop:
                        "3px",
                      opacity:
                        0.85,
                    }}
                  >
                    {cancellationSubscription
                      ?.current_period_end
                      ? `${formatKstDate(
                          cancellationSubscription
                            .current_period_end,
                        )}까지 현재 요금제를 이용할 수 있습니다.`
                      : "현재 결제기간 종료 후 자동결제가 중단됩니다."}
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={
                    canceling ||
                    Boolean(
                      preparingPlan,
                    )
                  }
                  onClick={
                    handleCancelSubscription
                  }
                  style={{
                    width:
                      "100%",
                    border:
                      "1px solid rgba(255,255,255,0.32)",
                    borderRadius:
                      "10px",
                    padding:
                      "10px 12px",
                    background:
                      "transparent",
                    color:
                      "#ffffff",
                    fontSize:
                      "12px",
                    fontWeight:
                      "700",
                    cursor:
                      canceling ||
                      Boolean(
                        preparingPlan,
                      )
                        ? "default"
                        : "pointer",
                    opacity:
                      canceling ||
                      Boolean(
                        preparingPlan,
                      )
                        ? 0.6
                        : 0.9,
                  }}
                >
                  {canceling
                    ? "취소 예약 처리 중..."
                    : "구독 취소"}
                </button>
              )}
            </div>
          )}
        </section>
      )}


      {/* 취소 예약 결과 */}

      {cancelScheduled && (
        <section
          style={{
            marginBottom:
              "18px",
            padding:
              "14px",
            border:
              "1px solid #fde68a",
            borderRadius:
              "14px",
            background:
              "#fffbeb",
            color:
              "#92400e",
          }}
        >
          <strong
            style={{
              fontSize:
                "14px",
            }}
          >
            구독 취소가 예약되었습니다.
          </strong>

          <div
            style={{
              marginTop:
                "6px",
              fontSize:
                "12px",
              lineHeight:
                "1.7",
            }}
          >
            현재 결제기간까지는 기존 요금제를 정상적으로 이용할 수 있습니다.
            다음 자동결제는 진행되지 않습니다.

            {cancellationSubscription
              ?.current_period_end && (
              <div
                style={{
                  marginTop:
                    "5px",
                }}
              >
                이용 종료 예정:{" "}
                <strong>
                  {formatKstDate(
                    cancellationSubscription
                      .current_period_end,
                  )}
                </strong>
              </div>
            )}
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


      {/* 요금제 비교 제목 */}

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


      {pendingPlan && <p role="status">다음 결제일부터 {getPlanLabel(pendingPlan)} 요금제가 적용됩니다. 지금 추가 결제는 없습니다.</p>}
      <p>월 정기결제입니다. 하향 변경은 다음 결제일부터 적용되고, 취소하면 현재 결제 기간 종료 후 자동결제가 중단됩니다.</p>
      <details style={{ margin: "16px 0", padding: 14, background: "#fff", borderRadius: 12 }}>
        <summary>정기결제 · 청약철회 · 환불 안내</summary>
        <p>선택한 요금제의 월 요금이 지금 결제되고, 이후 화면에 표시된 다음 결제일부터 매월 자동 결제됩니다. 하위 요금제는 현재 기간 종료 후 변경됩니다.</p>
        <p>구독 취소는 다음 결제를 중단합니다. 이미 결제한 금액의 청약철회 또는 환불은 결제 내역에서 별도로 신청할 수 있습니다.</p>
        <p>전자상거래법상 청약철회 가능 기간 및 예외가 적용됩니다. 디지털 서비스 제공이 시작된 경우에도 법에서 정한 조건과 안내를 충족했는지 확인합니다. 계약 내용과 다른 서비스, 중복 결제 또는 결제 오류는 사유에 따라 별도로 검토합니다.</p>
        <p>환불이 결정되면 원래 결제수단에 대해 토스페이먼츠 결제 취소를 요청합니다. 법정 환급 기한이 적용되며 카드사 반영 시점은 다를 수 있습니다.</p>
      </details>
      <label style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "start" }}>
        <input type="checkbox" checked={billingConsent} onChange={(event) => setBillingConsent(event.target.checked)} />
        월 요금의 자동결제와 위 취소·환불 안내를 확인했습니다.
      </label>
      {/* 요금제 목록 */}

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

            const currentPlanCode =
              normalizePlanCode(
                currentPlan
                  ?.plan_code,
              );

            const isCurrent =
              code ===
              currentPlanCode;

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
                    anyPreparing ||
                    canceling
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
                      anyPreparing ||
                      canceling
                        ? "default"
                        : "pointer",

                    opacity:
                      (
                        anyPreparing &&
                        !isPreparing
                      ) ||
                      canceling
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


      <section style={{ marginTop: 24, padding: 16, background: "#fff", borderRadius: 12 }}>
        <h2 style={{ fontSize: 18 }}>결제 내역 · 환불 신청</h2>
        <p style={{ fontSize: 13, lineHeight: 1.6 }}>
          구독 취소는 다음 자동결제를 중단하며 이미 결제한 금액의 환불 신청과는 별개입니다.
          청약철회 가능 여부와 이용한 서비스 범위를 확인해 환불액을 안내합니다.
          중복 결제 또는 결제 오류는 전액 취소 대상으로 확인합니다.
          환불이 확정되면 토스페이먼츠를 통해 원래 결제수단의 결제를 취소합니다.
        </p>
        {paymentHistory.length === 0 && <p>표시할 결제 내역이 없습니다.</p>}
        {paymentHistory.map((payment) => (
          <div key={payment.id} style={{ borderTop: "1px solid #e5e7eb", padding: "12px 0" }}>
            <strong>{getPlanLabel(payment.plan_code)} · {formatPrice(payment.amount_krw)}</strong>
            <div style={{ fontSize: 13 }}>{formatKstDate(payment.paid_at)} · {payment.status === "refunded" ? "환불 완료" : "결제 완료"}</div>
            {payment.refundRequestedAt ? <span>환불 신청 접수됨</span> : payment.status === "paid" && (
              <button type="button" disabled={refundBusy} onClick={() => requestRefund(payment)}
                style={{ marginTop: 8, padding: "8px 12px" }}>환불·중복 결제 문의</button>
            )}
          </div>
        ))}
      </section>

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
        유료 구독을 취소하면 현재 결제기간까지 이용할 수 있고,
        다음 자동결제부터 중단됩니다.
      </div>
    </main>
  );
          }
