"use client";

import { useEffect, useState } from "react";
import {
  createQuotePreview,
  shareQuoteImage,
  openCustomerSms,
} from "./quoteUtils";

export default function QuoteSendPanel({
  lead,
  companyName = "",
  representativeName = "",
  setLeadsMessage,
}) {
  const [quotePreview, setQuotePreview] =
    useState(null);

  const [creating, setCreating] =
    useState(false);

  const [sending, setSending] =
    useState(false);

  useEffect(() => {
    return () => {
      if (quotePreview?.url) {
        URL.revokeObjectURL(
          quotePreview.url,
        );
      }
    };
  }, [quotePreview]);

  async function handleCreateQuote() {
    setCreating(true);
    setLeadsMessage?.("");

    try {
      if (quotePreview?.url) {
        URL.revokeObjectURL(
          quotePreview.url,
        );
      }

      const preview =
        await createQuotePreview(
          lead,
          companyName,
          representativeName,
        );

      setQuotePreview(preview);

      setLeadsMessage?.(
        "✅ 견적서가 만들어졌습니다. 업체명과 견적 내용을 확인한 후 전송해주세요.",
      );
    } catch (error) {
      console.error(
        "견적서 만들기 오류:",
        error,
      );

      setLeadsMessage?.(
        `❌ 견적서 만들기 오류: ${
          error?.message || "실패"
        }`,
      );
    } finally {
      setCreating(false);
    }
  }

  async function handleSendQuote() {
    if (!quotePreview?.blob) {
      setLeadsMessage?.(
        "⚠️ 먼저 견적서 만들기를 눌러주세요.",
      );

      return;
    }

    setSending(true);
    setLeadsMessage?.("");

    try {
      const result =
        await shareQuoteImage(
          quotePreview.blob,
          lead,
          companyName,
        );

      if (result?.downloaded) {
        setLeadsMessage?.(
          "✅ 이 브라우저에서는 직접 공유를 지원하지 않아 견적 이미지를 저장했습니다. 저장된 이미지를 고객에게 전송해주세요.",
        );
      } else {
        setLeadsMessage?.(
          "✅ 견적 이미지를 공유했습니다.",
        );
      }
    } catch (error) {
      /*
       * Android 공유창에서 사용자가
       * 뒤로가기/취소한 경우 오류처럼 표시하지 않음
       */
      if (
        error?.name === "AbortError"
      ) {
        setLeadsMessage?.(
          "견적 이미지 공유를 취소했습니다.",
        );

        return;
      }

      console.error(
        "견적서 전송 오류:",
        error,
      );

      setLeadsMessage?.(
        `❌ 견적서 전송 오류: ${
          error?.message || "실패"
        }`,
      );
    } finally {
      setSending(false);
    }
  }

  function handleOpenCustomerSms() {
    try {
      setLeadsMessage?.("");

      openCustomerSms(lead);
    } catch (error) {
      console.error(
        "고객 문자 열기 오류:",
        error,
      );

      setLeadsMessage?.(
        `❌ 고객 문자 열기 오류: ${
          error?.message || "실패"
        }`,
      );
    }
  }

  const displayCompanyName =
    String(companyName || "").trim();

  const displayPhone =
    String(lead?.phone || "").trim();

  return (
    <div
      style={{
        marginTop: "12px",
        padding: "12px",
        border:
          "1px solid #d6d3d1",
        borderRadius: "12px",
        background: "#fafaf9",
      }}
    >
      <button
        type="button"
        onClick={handleCreateQuote}
        disabled={
          creating || sending
        }
        style={{
          width: "100%",
          padding: "12px",
          border:
            "1px solid #5d4037",
          borderRadius: "10px",
          background: "#ffffff",
          color: "#5d4037",
          fontSize: "15px",
          fontWeight: "bold",
          cursor: creating
            ? "wait"
            : "pointer",
        }}
      >
        {creating
          ? "견적서 만드는 중..."
          : "🧾 견적서 만들기"}
      </button>

      {quotePreview?.url && (
        <>
          <div
            style={{
              marginTop: "12px",
              fontSize: "13px",
              fontWeight: "bold",
              color: "#44403c",
            }}
          >
            견적서 미리보기
            {displayCompanyName
              ? ` · ${displayCompanyName}`
              : ""}
          </div>

          <img
            src={quotePreview.url}
            alt={
              displayCompanyName
                ? `${displayCompanyName} 견적서 미리보기`
                : "견적서 미리보기"
            }
            style={{
              display: "block",
              width: "100%",
              maxHeight: "520px",
              marginTop: "8px",
              objectFit: "contain",
              border:
                "1px solid #d6d3d1",
              borderRadius: "10px",
              background: "#ffffff",
            }}
          />

          <button
            type="button"
            onClick={handleSendQuote}
            disabled={sending}
            style={{
              width: "100%",
              padding: "13px",
              marginTop: "12px",
              border: "none",
              borderRadius: "10px",
              background: "#5d4037",
              color: "#ffffff",
              fontSize: "15px",
              fontWeight: "bold",
              cursor: sending
                ? "wait"
                : "pointer",
            }}
          >
            {sending
              ? "공유 준비 중..."
              : "📤 견적 이미지 전송하기"}
          </button>

          <button
            type="button"
            onClick={
              handleOpenCustomerSms
            }
            disabled={!displayPhone}
            style={{
              width: "100%",
              padding: "13px",
              marginTop: "10px",
              border:
                "1px solid #5d4037",
              borderRadius: "10px",
              background: "#ffffff",
              color: "#5d4037",
              fontSize: "15px",
              fontWeight: "bold",
              cursor: displayPhone
                ? "pointer"
                : "not-allowed",
              opacity: displayPhone
                ? 1
                : 0.5,
            }}
          >
            📱 고객에게 문자 보내기
            {displayPhone
              ? ` · ${displayPhone}`
              : ""}
          </button>

          <div
            style={{
              marginTop: "8px",
              fontSize: "12px",
              lineHeight: 1.5,
              color: "#78716c",
            }}
          >
            견적 이미지 전송은 이미지
            파일을 공유합니다. 고객 문자
            버튼을 누르면 등록된 고객
            번호의 문자 작성창이 바로
            열립니다.
          </div>
        </>
      )}
    </div>
  );
}
