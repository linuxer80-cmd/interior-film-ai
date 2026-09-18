"use client";

import { useEffect, useState } from "react";
import {
  copyQuoteImage,
  createQuotePreview,
  openCustomerSms,
} from "./quoteUtils";

export default function QuoteSendPanel({
  lead,
  setLeadsMessage,
}) {
  const [quotePreview, setQuotePreview] = useState(null);
  const [creating, setCreating] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    return () => {
      if (quotePreview?.url) {
        URL.revokeObjectURL(quotePreview.url);
      }
    };
  }, [quotePreview]);

  async function handleCreateQuote() {
    setCreating(true);
    setLeadsMessage?.("");

    try {
      if (quotePreview?.url) {
        URL.revokeObjectURL(quotePreview.url);
      }

      const preview = await createQuotePreview(lead);

      setQuotePreview(preview);
      setLeadsMessage?.(
        "✅ 견적서가 만들어졌습니다. 내용을 확인한 후 전송해주세요.",
      );
    } catch (error) {
      console.error("견적서 만들기 오류:", error);

      setLeadsMessage?.(
        `❌ 견적서 만들기 오류: ${error?.message || "실패"}`,
      );
    } finally {
      setCreating(false);
    }
  }

  async function handleSendQuote() {
    if (!quotePreview?.blob) {
      setLeadsMessage?.("⚠️ 먼저 견적서 만들기를 눌러주세요.");
      return;
    }

    setSending(true);
    setLeadsMessage?.("");

    try {
      await copyQuoteImage(quotePreview.blob);

      setLeadsMessage?.(
        "✅ 견적 이미지가 복사되었습니다. 문자 입력창을 길게 눌러 붙여넣으세요.",
      );

      openCustomerSms(lead);
    } catch (error) {
      console.error("견적서 전송 오류:", error);

      setLeadsMessage?.(
        `❌ 견적서 전송 오류: ${error?.message || "실패"}`,
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      style={{
        marginTop: "12px",
        padding: "12px",
        border: "1px solid #d6d3d1",
        borderRadius: "12px",
        background: "#fafaf9",
      }}
    >
      <button
        type="button"
        onClick={handleCreateQuote}
        disabled={creating || sending}
        style={{
          width: "100%",
          padding: "12px",
          border: "1px solid #5d4037",
          borderRadius: "10px",
          background: "#ffffff",
          color: "#5d4037",
          fontSize: "15px",
          fontWeight: "bold",
          cursor: creating ? "wait" : "pointer",
        }}
      >
        {creating ? "견적서 만드는 중..." : "🧾 견적서 만들기"}
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
          </div>

          <img
            src={quotePreview.url}
            alt="기분좋은공간 견적서 미리보기"
            style={{
              display: "block",
              width: "100%",
              maxHeight: "520px",
              marginTop: "8px",
              objectFit: "contain",
              border: "1px solid #d6d3d1",
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
              cursor: sending ? "wait" : "pointer",
            }}
          >
            {sending
              ? "이미지 복사 중..."
              : "💬 견적서 전송하기"}
          </button>

          <div
            style={{
              marginTop: "8px",
              fontSize: "12px",
              lineHeight: 1.5,
              color: "#78716c",
            }}
          >
            전송 버튼을 누르면 견적 이미지가 복사되고 고객
            전화번호가 입력된 문자 앱이 열립니다. 문자 입력창을
            길게 눌러 이미지를 붙여넣으세요.
          </div>
        </>
      )}
    </div>
  );
}
