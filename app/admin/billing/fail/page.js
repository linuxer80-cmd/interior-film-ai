"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

function BillingFailContent() {
  const searchParams = useSearchParams();

  const code = searchParams.get("code") || "";
  const message =
    searchParams.get("message") ||
    "카드 등록이 완료되지 않았습니다.";

  const checkoutSessionId = searchParams.get("checkoutSessionId");

  return (
    <main style={styles.page}>
      <div style={styles.container}>
        <div style={styles.brand}>필름장이</div>

        <section style={styles.card}>
          <div aria-hidden="true" style={styles.icon}>
            !
          </div>

          <h1 style={styles.title}>
            카드 등록을 완료하지 못했어요
          </h1>

          <p role="status" style={styles.description}>
            {message}
          </p>

          <div style={styles.guide}>
            다시 진행하려면 요금제·결제 관리 화면에서
            카드 등록을 진행해주세요.
            <br />
            결제 여부는 결제 내역에서 확인할 수 있습니다.
          </div>

          <div style={styles.actions}>
            <Link href="/admin" style={styles.secondary}>
              관리자 홈
            </Link>

            <Link href="/admin/billing" style={styles.primary}>
              다시 시도 →
            </Link>
          </div>

          {(code || checkoutSessionId) && (
            <details style={styles.details}>
              <summary style={styles.summary}>
                오류 상세정보
              </summary>

              {code && (
                <div style={styles.errorDetail}>
                  오류 코드: {code}
                </div>
              )}

              {checkoutSessionId && (
                <div style={styles.errorDetail}>
                  결제 세션: {checkoutSessionId}
                </div>
              )}
            </details>
          )}
        </section>
      </div>
    </main>
  );
}

export default function BillingFailPage() {
  return (
    <Suspense
      fallback={
        <main style={styles.page}>
          <div style={styles.container}>
            <section style={styles.card}>
              <p style={styles.description}>
                결제 결과를 확인하는 중...
              </p>
            </section>
          </div>
        </main>
      }
    >
      <BillingFailContent />
    </Suspense>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    boxSizing: "border-box",
    background: "var(--film-bg, #f8f7f3)",
    padding: "40px 18px 60px",
    color: "#243247",
  },

  container: {
    width: "100%",
    maxWidth: "480px",
    margin: "0 auto",
  },

  brand: {
    marginBottom: "20px",
    textAlign: "center",
    color: "#3268bd",
    fontSize: "18px",
    fontWeight: 900,
    letterSpacing: "-0.5px",
  },

  card: {
    background: "#ffffff",
    border: "1px solid #e4eaf2",
    borderRadius: "24px",
    padding: "30px 22px 24px",
    boxShadow: "0 8px 28px rgba(48, 77, 116, 0.05)",
  },

  icon: {
    width: "72px",
    height: "72px",
    margin: "0 auto 22px",
    borderRadius: "24px",
    background: "#fff0e6",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#d97732",
    fontSize: "36px",
    fontWeight: 900,
  },

  title: {
    margin: "0 0 12px",
    textAlign: "center",
    fontSize: "22px",
    lineHeight: 1.4,
    letterSpacing: "-0.7px",
    color: "#243247",
  },

  description: {
    margin: 0,
    textAlign: "center",
    color: "#7b8798",
    fontSize: "14px",
    lineHeight: 1.8,
    overflowWrap: "anywhere",
  },

  guide: {
    marginTop: "22px",
    padding: "16px",
    borderRadius: "16px",
    background: "#f3f7fc",
    color: "#50617a",
    fontSize: "13px",
    lineHeight: 1.8,
  },

  actions: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "10px",
    marginTop: "24px",
  },

  secondary: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "50px",
    boxSizing: "border-box",
    border: "1px solid #dfe6ef",
    borderRadius: "15px",
    padding: "12px 8px",
    background: "#ffffff",
    color: "#50617a",
    fontSize: "14px",
    fontWeight: 800,
    textDecoration: "none",
    textAlign: "center",
  },

  primary: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "50px",
    boxSizing: "border-box",
    border: "1px solid transparent",
    borderRadius: "15px",
    padding: "12px 8px",
    background: "var(--film-blue, #3478ed)",
    color: "#ffffff",
    fontSize: "14px",
    fontWeight: 800,
    textDecoration: "none",
    textAlign: "center",
    boxShadow: "0 5px 14px rgba(52, 120, 237, 0.16)",
  },

  details: {
    marginTop: "24px",
    paddingTop: "16px",
    borderTop: "1px solid #eef2f7",
  },

  summary: {
    cursor: "pointer",
    color: "#7b8798",
    fontSize: "12px",
    fontWeight: 700,
  },

  errorDetail: {
    marginTop: "10px",
    padding: "10px 12px",
    borderRadius: "12px",
    background: "#f8fafc",
    color: "#7b8798",
    fontSize: "11px",
    lineHeight: 1.7,
    overflowWrap: "anywhere",
  },
};
