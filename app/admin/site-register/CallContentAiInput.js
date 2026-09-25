"use client";

import { useState } from "react";

/* =========================================================
   통화내용 AI 자동입력
========================================================= */

export default function CallContentAiInput({
  disabled = false,
  onApply,
}) {
  const [open, setOpen] =
    useState(false);

  const [callContent, setCallContent] =
    useState("");

  const [analyzing, setAnalyzing] =
    useState(false);

  const [message, setMessage] =
    useState("");

  /* =======================================================
     열기
  ======================================================= */

  function openInput() {
    if (disabled || analyzing) {
      return;
    }

    setMessage("");
    setOpen(true);
  }

  /* =======================================================
     닫기
  ======================================================= */

  function closeInput() {
    if (analyzing) {
      return;
    }

    setMessage("");
    setOpen(false);
  }

  /* =======================================================
     AI 분석
  ======================================================= */

  async function analyzeCallContent() {
    if (analyzing) {
      return;
    }

    const content =
      callContent.trim();

    if (!content) {
      setMessage(
        "❌ 통화내용을 붙여넣어 주세요.",
      );

      return;
    }

    if (content.length < 5) {
      setMessage(
        "❌ 통화내용이 너무 짧습니다.",
      );

      return;
    }

    setAnalyzing(true);
    setMessage("");

    try {
      const response =
        await fetch(
          "/api/admin/parse-site-call",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
              content,
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

      if (!response.ok) {
        throw new Error(
          result?.error ||
            "통화내용 분석에 실패했습니다.",
        );
      }

      if (!result?.success) {
        throw new Error(
          result?.error ||
            "통화내용 분석에 실패했습니다.",
        );
      }

      if (!result?.data) {
        throw new Error(
          "AI 분석 결과가 없습니다.",
        );
      }

      /*
       * 실제 입력폼 적용은
       * SiteRegisterModal에서 처리합니다.
       */

      if (
        typeof onApply === "function"
      ) {
        onApply(result.data);
      }

      setMessage(
        "✅ 통화내용을 분석해 일정등록 화면에 입력했습니다.\n내용을 확인한 후 현장 일정을 등록해주세요.",
      );

      setOpen(false);
    } catch (error) {
      console.error(
        "통화내용 AI 분석 오류:",
        error,
      );

      setMessage(
        `❌ ${
          error?.message ||
          "통화내용 분석 중 오류가 발생했습니다."
        }`,
      );
    } finally {
      setAnalyzing(false);
    }
  }

  /* =======================================================
     화면
  ======================================================= */

  return (
    <section
      style={{
        marginBottom: "16px",

        padding: "14px",

        border:
          "1px solid #bfdbfe",

        borderRadius: "12px",

        background: "#eff6ff",
      }}
    >
      {/* =================================================
          제목
      ================================================= */}

      <div
        style={{
          display: "flex",

          alignItems: "flex-start",

          justifyContent:
            "space-between",

          gap: "10px",
        }}
      >
        <div>
          <div
            style={{
              fontSize: "15px",

              fontWeight: "900",

              color: "#1e3a8a",
            }}
          >
            📞 통화내용으로 자동입력
          </div>

          <div
            style={{
              marginTop: "4px",

              fontSize: "12px",

              lineHeight: "1.5",

              color: "#475569",
            }}
          >
            통화 요약이나 녹취 내용을
            붙여넣으면 AI가 현장정보를
            찾아서 아래 입력칸에
            자동으로 채웁니다.
          </div>
        </div>

        {!open && (
          <button
            type="button"
            onClick={openInput}
            disabled={
              disabled ||
              analyzing
            }
            style={{
              flex: "0 0 auto",

              border:
                "1px solid #2563eb",

              borderRadius: "9px",

              padding: "9px 11px",

              background: "#ffffff",

              color: "#1d4ed8",

              fontSize: "12px",

              fontWeight: "900",

              cursor:
                disabled
                  ? "default"
                  : "pointer",

              opacity:
                disabled
                  ? 0.6
                  : 1,
            }}
          >
            내용 붙여넣기
          </button>
        )}
      </div>

      {/* =================================================
          입력 영역
      ================================================= */}

      {open && (
        <div
          style={{
            marginTop: "12px",
          }}
        >
          <textarea
            value={callContent}
            onChange={(event) =>
              setCallContent(
                event.target.value,
              )
            }
            disabled={
              disabled ||
              analyzing
            }
            placeholder={
              "여기에 통화 요약 또는 녹취 내용을 그대로 붙여넣으세요.\n\n예)\n김철수 고객, 10월 5일 오전 9시 인천 서구 검단 ○○아파트. 싱크대 상하부장하고 냉장고장 시공. 현대 S115 사용. 계약금액 120만원, 선금 30만원."
            }
            rows={8}
            style={{
              width: "100%",

              boxSizing:
                "border-box",

              padding: "12px",

              border:
                "1px solid #93c5fd",

              borderRadius: "10px",

              background: "#ffffff",

              color: "#111827",

              fontSize: "14px",

              lineHeight: "1.6",

              resize: "vertical",

              outline: "none",
            }}
          />

          <div
            style={{
              marginTop: "6px",

              fontSize: "11px",

              lineHeight: "1.5",

              color: "#64748b",
            }}
          >
            없는 정보는 AI가 임의로
            만들지 않고 빈칸으로
            남겨둡니다.
          </div>

          {/* =============================================
              버튼
          ============================================= */}

          <div
            style={{
              display: "grid",

              gridTemplateColumns:
                "1fr 2fr",

              gap: "8px",

              marginTop: "10px",
            }}
          >
            <button
              type="button"
              onClick={closeInput}
              disabled={analyzing}
              style={{
                border:
                  "1px solid #cbd5e1",

                borderRadius: "9px",

                padding: "11px",

                background: "#ffffff",

                color: "#475569",

                fontSize: "12px",

                fontWeight: "800",

                cursor:
                  analyzing
                    ? "default"
                    : "pointer",

                opacity:
                  analyzing
                    ? 0.6
                    : 1,
              }}
            >
              취소
            </button>

            <button
              type="button"
              onClick={
                analyzeCallContent
              }
              disabled={
                analyzing ||
                disabled
              }
              style={{
                border: "none",

                borderRadius: "9px",

                padding: "11px",

                background:
                  analyzing
                    ? "#93c5fd"
                    : "#2563eb",

                color: "#ffffff",

                fontSize: "12px",

                fontWeight: "900",

                cursor:
                  analyzing
                    ? "default"
                    : "pointer",
              }}
            >
              {analyzing
                ? "AI 분석 중..."
                : "✨ AI 내용 추출"}
            </button>
          </div>
        </div>
      )}

      {/* =================================================
          메시지
      ================================================= */}

      {message && (
        <div
          style={{
            marginTop: "10px",

            padding: "10px",

            borderRadius: "9px",

            background:
              message.startsWith("✅")
                ? "#f0fdf4"
                : "#fef2f2",

            color:
              message.startsWith("✅")
                ? "#166534"
                : "#b91c1c",

            fontSize: "12px",

            fontWeight: "800",

            lineHeight: "1.5",

            whiteSpace: "pre-wrap",

            wordBreak: "break-word",
          }}
        >
          {message}
        </div>
      )}
    </section>
  );
}
