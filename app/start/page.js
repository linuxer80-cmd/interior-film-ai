import Link from "next/link";

export const metadata = {
  title: "필름장이 | 시작하기",
  description: "관리자 또는 시공자로 필름장이를 시작하세요.",
};

export default function StartPage() {
  return (
    <main
      style={{
        minHeight: "100svh",
        padding: "48px 24px",
        background: "#f7f5ef",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxSizing: "border-box",
      }}
    >
      <section
        style={{
          width: "100%",
          maxWidth: 420,
          color: "#182620",
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 20,
            background: "#182620",
            color: "#d7bb7a",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 36,
            fontWeight: 800,
            marginBottom: 28,
          }}
        >
          F
        </div>

        <p
          style={{
            fontSize: 14,
            margin: "0 0 12px",
            color: "#687267",
          }}
        >
          오늘도 좋은 공간을 만듭니다
        </p>

        <h1
          style={{
            fontSize: 38,
            fontWeight: 800,
            margin: "0 0 16px",
            letterSpacing: "-1.5px",
          }}
        >
          필름장이
        </h1>

        <p
          style={{
            fontSize: 18,
            lineHeight: 1.6,
            margin: "0 0 32px",
          }}
        >
          어떤 역할로 이용하시나요?
        </p>

        <div style={{ display: "grid", gap: 16 }}>
          <Link
            href="/login"
            style={{
              display: "block",
              padding: 24,
              borderRadius: 22,
              background: "#182620",
              color: "#ffffff",
              textDecoration: "none",
              boxShadow: "0 8px 24px rgba(24,38,32,0.12)",
            }}
          >
            <strong style={{ display: "block", fontSize: 21 }}>
              관리자로 시작하기 →
            </strong>
            <span
              style={{
                display: "block",
                fontSize: 14,
                lineHeight: 1.7,
                marginTop: 8,
                color: "#d6dfd7",
              }}
            >
              현장 · 견적 · 일정 · 자재 · 정산 관리
            </span>
          </Link>

          <Link
            href="/worker/login?next=%2Fworker"
            style={{
              display: "block",
              padding: 24,
              borderRadius: 22,
              background: "#ffffff",
              color: "#182620",
              border: "1px solid #dce1d8",
              textDecoration: "none",
              boxShadow: "0 4px 16px rgba(24,38,32,0.04)",
            }}
          >
            <strong style={{ display: "block", fontSize: 21 }}>
              시공자로 시작하기 →
            </strong>
            <span
              style={{
                display: "block",
                fontSize: 14,
                lineHeight: 1.7,
                marginTop: 8,
                color: "#687267",
              }}
            >
              내 현장 · 시공 일정 · 완료보고 · 근무금액
            </span>
          </Link>
        </div>

        <p
          style={{
            marginTop: 28,
            fontSize: 13,
            color: "#687267",
            textAlign: "center",
          }}
        >
          기분좋은공간과 함께하는 현장 관리
        </p>
      </section>
    </main>
  );
                }
