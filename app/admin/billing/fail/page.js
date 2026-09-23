"use client";

import {
  Suspense,
} from "react";

import {
  useSearchParams,
} from "next/navigation";


function BillingFailContent() {
  const searchParams =
    useSearchParams();

  const code =
    searchParams.get("code") ||
    "";

  const message =
    searchParams.get("message") ||
    "카드 등록이 완료되지 않았습니다.";

  const checkoutSessionId =
    searchParams.get(
      "checkoutSessionId",
    );


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
          <div
            style={{
              width: "52px",
              height: "52px",
              margin:
                "0 auto 18px",
              borderRadius: "50%",
              background: "#fee2e2",
              display: "flex",
              alignItems: "center",
              justifyContent:
                "center",
              color: "#b91c1c",
              fontSize: "24px",
              fontWeight: "900",
            }}
          >
            !
          </div>


          <h1
            style={{
              margin:
                "0 0 10px",
              textAlign: "center",
              fontSize: "21px",
              color: "#b91c1c",
            }}
          >
            카드 등록이 취소되었습니다
          </h1>


          <div
            style={{
              textAlign: "center",
              color: "#475569",
              fontSize: "14px",
              lineHeight: "1.7",
            }}
          >
            {message}
          </div>


          {code && (
            <div
              style={{
                marginTop: "14px",
                padding: "10px",
                borderRadius: "10px",
                background: "#f8fafc",
                color: "#64748b",
                fontSize: "12px",
                wordBreak:
                  "break-all",
              }}
            >
              오류 코드: {code}
            </div>
          )}


          {checkoutSessionId && (
            <div
              style={{
                marginTop: "8px",
                color: "#94a3b8",
                fontSize: "10px",
                textAlign: "center",
                wordBreak:
                  "break-all",
              }}
            >
              결제 세션:{" "}
              {checkoutSessionId}
            </div>
          )}


          <div
            style={{
              marginTop: "16px",
              padding: "12px",
              borderRadius: "10px",
              background: "#f8fafc",
              color: "#64748b",
              fontSize: "12px",
              lineHeight: "1.6",
            }}
          >
            카드 등록이 완료되지 않았기 때문에
            결제는 발생하지 않았으며 요금제도 변경되지 않습니다.
            다시 진행하려면 요금제 화면에서 유료 요금제를 선택해주세요.
          </div>


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
              onClick={goAdmin}
              style={{
                border:
                  "1px solid #cbd5e1",
                borderRadius: "10px",
                padding: "11px 10px",
                background: "#ffffff",
                color: "#334155",
                fontWeight: "800",
                cursor: "pointer",
              }}
            >
              관리자 홈
            </button>

            <button
              type="button"
              onClick={goBilling}
              style={{
                border: "none",
                borderRadius: "10px",
                padding: "11px 10px",
                background: "#111827",
                color: "#ffffff",
                fontWeight: "800",
                cursor: "pointer",
              }}
            >
              다시 시도
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}


export default function BillingFailPage() {
  return (
    <Suspense
      fallback={
        <main
          style={{
            minHeight: "100vh",
            background: "#f8fafc",
            padding: "40px 16px",
            color: "#111827",
          }}
        >
          결제 결과를 확인하는 중...
        </main>
      }
    >
      <BillingFailContent />
    </Suspense>
  );
                }
