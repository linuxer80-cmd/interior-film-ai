"use client";

import { useEffect, useState } from "react";

import {
  createQuotePreview,
  downloadQuoteImage,
  copyQuoteImage,
  openCustomerSms,
} from "./quoteUtils";

export default function QuoteSendPanel({
  lead,
  companyName = "",
  representativeName = "",
  setLeadsMessage,
}) {
  const [quotePreview, setQuotePreview] = useState(null);

  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);

  /* =========================================================
     미리보기 URL 정리
  ========================================================= */

  useEffect(() => {
    return () => {
      if (quotePreview?.url) {
        URL.revokeObjectURL(quotePreview.url);
      }
    };
  }, [quotePreview]);

  /* =========================================================
     견적서 만들기

     현재 lead 전체를 그대로 사용합니다.

     따라서 기존에 정상 작동 중인:
     - 최종 견적금액
     - 시공 내용
     - 고객 선택 필름
     - 방염 / 비방염
     - quote_material

     모두 그대로 유지됩니다.
  ========================================================= */

  async function handleCreateQuote() {
    setCreating(true);
    setLeadsMessage?.("");

    try {
      if (quotePreview?.url) {
        URL.revokeObjectURL(quotePreview.url);
      }

      const preview = await createQuotePreview(
        lead,
        companyName,
        representativeName,
      );

      setQuotePreview(preview);

      setLeadsMessage?.(
        "✅ 견적서가 만들어졌습니다. 금액과 사용 자재를 확인해주세요.",
      );
    } catch (error) {
      console.error("견적서 만들기 오류:", error);

      setLeadsMessage?.(
        `❌ 견적서 만들기 오류: ${
          error?.message || "실패"
        }`,
      );
    } finally {
      setCreating(false);
    }
  }

  /* =========================================================
     1. 견적서 저장

     견적 이미지 JPG를 휴대폰에 저장합니다.

     여기서는:
     - 클립보드 복사 안 함
     - 문자창 안 엶
     - 공유창 안 엶

     저장만 합니다.
  ========================================================= */

  function handleSaveQuote() {
    if (!quotePreview?.blob) {
      setLeadsMessage?.(
        "⚠️ 먼저 견적서 만들기를 눌러주세요.",
      );

      return;
    }

    setSaving(true);
    setLeadsMessage?.("");

    try {
      const result = downloadQuoteImage(
        quotePreview.blob,
        lead,
        companyName,
      );

      setLeadsMessage?.(
        result?.fileName
          ? `✅ 견적서를 저장했습니다. ${result.fileName}`
          : "✅ 견적서를 저장했습니다.",
      );
    } catch (error) {
      console.error(
        "견적서 저장 오류:",
        error,
      );

      setLeadsMessage?.(
        `❌ 견적서 저장 오류: ${
          error?.message || "실패"
        }`,
      );
    } finally {
      setSaving(false);
    }
  }

  /* =========================================================
     2. 견적서 보내기

     원하는 핵심 루틴:

     견적 이미지
        ↓
     이미지 클립보드 복사 완료
        ↓
     고객 전화번호 문자창 열기

     중요:
     navigator.clipboard.write()가 끝날 때까지
     반드시 await 합니다.

     공유창(navigator.share)은 사용하지 않습니다.
  ========================================================= */

  async function handleSendQuote() {
    if (!quotePreview?.blob) {
      setLeadsMessage?.(
        "⚠️ 먼저 견적서 만들기를 눌러주세요.",
      );

      return;
    }

    if (!lead?.phone) {
      setLeadsMessage?.(
        "⚠️ 고객 전화번호가 없습니다.",
      );

      return;
    }

    setSending(true);
    setLeadsMessage?.("");

    try {
      /*
       * 1단계
       * 견적 이미지 자체를 클립보드에 복사
       *
       * copyQuoteImage 내부에서:
       * JPG → PNG 변환
       * ClipboardItem(image/png)
       * navigator.clipboard.write()
       *
       * 작업이 끝날 때까지 기다립니다.
       */
      await copyQuoteImage(
        quotePreview.blob,
      );

      /*
       * 2단계
       * 이미지 복사가 성공한 경우에만
       * 고객 전화번호 문자창을 엽니다.
       */
      setLeadsMessage?.(
        "✅ 견적 이미지가 복사되었습니다. 고객 문자창을 엽니다.",
      );

      /*
       * 아주 짧게 브라우저에 상태 반영 시간을 준 뒤
       * 문자 앱으로 이동합니다.
       */
      await new Promise((resolve) => {
        setTimeout(resolve, 120);
      });

      openCustomerSms(lead);
    } catch (error) {
      console.error(
        "견적서 보내기 오류:",
        error,
      );

      /*
       * 이미지 복사가 실패하면
       * 문자창을 열지 않습니다.
       *
       * 이전처럼 텍스트 클립보드가 남은 상태에서
       * 문자창으로 넘어가는 문제를 막기 위함입니다.
       */
      setLeadsMessage?.(
        `❌ 견적 이미지 복사 실패: ${
          error?.message ||
          "이 브라우저에서 이미지 클립보드를 사용할 수 없습니다."
        }`,
      );
    } finally {
      setSending(false);
    }
  }

  /* =========================================================
     표시 데이터
  ========================================================= */

  const displayCompanyName = String(
    companyName || "",
  ).trim();

  const displayPhone = String(
    lead?.phone || "",
  ).trim();

  const displayMaterial = String(
    lead?.quote_material || "",
  ).trim();

  const busy =
    creating ||
    saving ||
    sending;

  /* =========================================================
     화면
  ========================================================= */

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
      {/* =====================================================
          견적서 만들기
      ===================================================== */}

      <button
        type="button"
        onClick={handleCreateQuote}
        disabled={busy}
        style={{
          width: "100%",
          padding: "13px",
          border: "1px solid #5d4037",
          borderRadius: "10px",
          background: "#ffffff",
          color: "#5d4037",
          fontSize: "15px",
          fontWeight: "bold",
          cursor: creating
            ? "wait"
            : busy
              ? "not-allowed"
              : "pointer",
          opacity:
            busy && !creating
              ? 0.6
              : 1,
        }}
      >
        {creating
          ? "견적서 만드는 중..."
          : "🧾 견적서 만들기"}
      </button>

      {/* =====================================================
          견적서 생성 후
      ===================================================== */}

      {quotePreview?.url && (
        <>
          <div
            style={{
              marginTop: "14px",
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

          {/* =================================================
              고객 선택 필름

              quote_material을 읽기만 합니다.
              기존 자동입력 기능은 수정하지 않습니다.
          ================================================= */}

          {displayMaterial && (
            <div
              style={{
                marginTop: "8px",
                padding: "10px",
                borderRadius: "8px",
                background: "#f0f9ff",
                border: "1px solid #bae6fd",
                fontSize: "13px",
                lineHeight: 1.6,
                color: "#0369a1",
              }}
            >
              <div
                style={{
                  fontWeight: "bold",
                  marginBottom: "3px",
                }}
              >
                🎨 사용 자재
              </div>

              {displayMaterial}
            </div>
          )}

          {/* =================================================
              견적서 이미지
          ================================================= */}

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
              marginTop: "10px",
              objectFit: "contain",
              border: "1px solid #d6d3d1",
              borderRadius: "10px",
              background: "#ffffff",
            }}
          />

          {/* =================================================
              1. 견적서 저장
          ================================================= */}

          <button
            type="button"
            onClick={handleSaveQuote}
            disabled={busy}
            style={{
              width: "100%",
              padding: "15px",
              marginTop: "14px",
              border: "none",
              borderRadius: "10px",
              background: "#166534",
              color: "#ffffff",
              fontSize: "16px",
              fontWeight: "bold",
              cursor: saving
                ? "wait"
                : busy
                  ? "not-allowed"
                  : "pointer",
              opacity:
                busy && !saving
                  ? 0.6
                  : 1,
            }}
          >
            {saving
              ? "견적서 저장 중..."
              : "💾 견적서 저장"}
          </button>

          {/* =================================================
              2. 견적서 보내기
          ================================================= */}

          <button
            type="button"
            onClick={handleSendQuote}
            disabled={
              !displayPhone ||
              busy
            }
            style={{
              width: "100%",
              padding: "16px",
              marginTop: "10px",
              border: "none",
              borderRadius: "10px",
              background:
                displayPhone && !busy
                  ? "#2563eb"
                  : "#a8a29e",
              color: "#ffffff",
              fontSize: "16px",
              fontWeight: "bold",
              cursor:
                displayPhone && !busy
                  ? "pointer"
                  : "not-allowed",
              opacity:
                displayPhone && !busy
                  ? 1
                  : 0.65,
            }}
          >
            {sending
              ? "이미지 복사 중..."
              : "📱 견적서 보내기"}
          </button>

          {/* =================================================
              고객 전화번호
          ================================================= */}

          <div
            style={{
              marginTop: "7px",
              textAlign: "center",
              fontSize: "13px",
              fontWeight: "bold",
              color: displayPhone
                ? "#57534e"
                : "#dc2626",
            }}
          >
            {displayPhone
              ? `수신 고객번호 · ${displayPhone}`
              : "고객 전화번호 없음"}
          </div>

          {/* =================================================
              안내
          ================================================= */}

          <div
            style={{
              marginTop: "12px",
              padding: "11px",
              borderRadius: "8px",
              background: "#f5f5f4",
              fontSize: "12px",
              lineHeight: 1.8,
              color: "#78716c",
            }}
          >
            💾 견적서 저장
            <br />
            견적 이미지를 휴대폰에 저장합니다.
            <br />
            <br />

            📱 견적서 보내기
            <br />
            견적 이미지를 복사한 뒤 고객 전화번호의 문자창을 엽니다.
            <br />
            문자창에서 이미지 붙여넣기 후 전송하면 됩니다.
          </div>
        </>
      )}
    </div>
  );
}
