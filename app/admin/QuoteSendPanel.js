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
  const [quotePreview, setQuotePreview] =
    useState(null);

  const [creating, setCreating] =
    useState(false);

  const [saving, setSaving] =
    useState(false);

  const [sending, setSending] =
    useState(false);

  /* =========================================================
     미리보기 URL 정리
  ========================================================= */

  useEffect(() => {
    return () => {
      if (quotePreview?.url) {
        URL.revokeObjectURL(
          quotePreview.url,
        );
      }
    };
  }, [quotePreview]);

  /* =========================================================
     견적서 만들기
  ========================================================= */

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
        "✅ 견적서가 만들어졌습니다. 금액과 사용 자재를 확인해주세요.",
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

  /* =========================================================
     견적서 저장

     JPG 파일 저장만 수행
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
      const result =
        downloadQuoteImage(
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
     견적서 보내기

     1. 견적 이미지 PNG 클립보드 복사
     2. 복사가 완료될 때까지 기다림
     3. 고객 전화번호 문자창 열기

     Android 공유창은 사용하지 않음
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
       * 이미지 클립보드 복사
       */

      await copyQuoteImage(
        quotePreview.blob,
      );

      setLeadsMessage?.(
        "✅ 견적 이미지가 복사되었습니다. 고객 문자창을 엽니다.",
      );

      /*
       * 클립보드 write 완료 후
       * 아주 짧은 시간 뒤 문자창 이동
       */

      await new Promise((resolve) => {
        setTimeout(resolve, 120);
      });

      /*
       * 고객 전화번호 문자창
       */

      openCustomerSms(lead);
    } catch (error) {
      console.error(
        "견적서 보내기 오류:",
        error,
      );

      /*
       * 이미지 복사가 실패하면
       * 문자창을 열지 않음
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

  const displayCompanyName =
    String(
      companyName || "",
    ).trim();

  const displayPhone =
    String(
      lead?.phone || "",
    ).trim();

  const displayMaterial =
    String(
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
        border:
          "1px solid #d6d3d1",
        borderRadius: "12px",
        background: "#fafaf9",
      }}
    >
      {/* 견적서 만들기 */}

      <button
        type="button"
        onClick={
          handleCreateQuote
        }
        disabled={busy}
        style={{
          width: "100%",
          padding: "13px",
          border:
            "1px solid #5d4037",
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
            busy &&
            !creating
              ? 0.6
              : 1,
        }}
      >
        {creating
          ? "견적서 만드는 중..."
          : "🧾 견적서 만들기"}
      </button>

      {quotePreview?.url && (
        <>
          {/* 미리보기 제목 */}

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

          {/* 고객 선택 필름 */}

          {displayMaterial && (
            <div
              style={{
                marginTop: "8px",
                padding: "10px",
                borderRadius:
                  "8px",
                background:
                  "#f0f9ff",
                border:
                  "1px solid #bae6fd",
                fontSize: "13px",
                lineHeight: 1.6,
                color: "#0369a1",
              }}
            >
              <div
                style={{
                  fontWeight:
                    "bold",
                  marginBottom:
                    "3px",
                }}
              >
                🎨 사용 자재
              </div>

              {displayMaterial}
            </div>
          )}

          {/* 견적서 이미지 */}

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
              border:
                "1px solid #d6d3d1",
              borderRadius:
                "10px",
              background:
                "#ffffff",
            }}
          />

          {/* 견적서 저장 */}

          <button
            type="button"
            onClick={
              handleSaveQuote
            }
            disabled={busy}
            style={{
              width: "100%",
              padding: "15px",
              marginTop: "14px",
              border: "none",
              borderRadius:
                "10px",
              background:
                "#166534",
              color: "#ffffff",
              fontSize: "16px",
              fontWeight: "bold",
              cursor: saving
                ? "wait"
                : busy
                  ? "not-allowed"
                  : "pointer",
              opacity:
                busy &&
                !saving
                  ? 0.6
                  : 1,
            }}
          >
            {saving
              ? "견적서 저장 중..."
              : "💾 견적서 저장"}
          </button>

          {/* 견적서 보내기 */}

          <button
            type="button"
            onClick={
              handleSendQuote
            }
            disabled={
              !displayPhone ||
              busy
            }
            style={{
              width: "100%",
              padding: "16px",
              marginTop: "10px",
              border: "none",
              borderRadius:
                "10px",
              background:
                displayPhone &&
                !busy
                  ? "#2563eb"
                  : "#a8a29e",
              color: "#ffffff",
              fontSize: "16px",
              fontWeight: "bold",
              cursor:
                displayPhone &&
                !busy
                  ? "pointer"
                  : "not-allowed",
              opacity:
                displayPhone &&
                !busy
                  ? 1
                  : 0.65,
            }}
          >
            {sending
              ? "견적 이미지 복사 중..."
              : "📱 견적서 보내기"}
          </button>

          {/* 고객번호 */}

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

          {/* 안내 */}

          <div
            style={{
              marginTop: "12px",
              padding: "11px",
              borderRadius:
                "8px",
              background:
                "#f5f5f4",
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
            견적 이미지를 클립보드에 복사한 뒤 고객 전화번호의 문자창을 엽니다.
            <br />
            문자창에서 이미지 붙여넣기 후 전송하면 됩니다.
          </div>
        </>
      )}
    </div>
  );
          }
