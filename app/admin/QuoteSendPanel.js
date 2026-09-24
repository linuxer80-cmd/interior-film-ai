"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  createQuotePreview,
  downloadQuoteImage,
  openCustomerSms,
} from "./quoteUtils";

export default function QuoteSendPanel({
  lead,
  companyName = "",
  representativeName = "",
  setLeadsMessage,
}) {
  const [
    quotePreview,
    setQuotePreview,
  ] = useState(null);

  const [
    creating,
    setCreating,
  ] = useState(false);

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [
    sending,
    setSending,
  ] = useState(false);

  /* =======================================================
     미리보기 URL 정리
  ======================================================= */

  useEffect(() => {
    return () => {
      if (quotePreview?.url) {
        URL.revokeObjectURL(
          quotePreview.url,
        );
      }
    };
  }, [quotePreview]);

  /* =======================================================
     견적서 만들기
  ======================================================= */

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
        "✅ 견적서가 만들어졌습니다. 내용을 확인한 후 견적서 보내기를 눌러주세요.",
      );
    } catch (error) {
      console.error(
        "견적서 만들기 오류:",
        error,
      );

      setLeadsMessage?.(
        `❌ 견적서 만들기 오류: ${
          error?.message ||
          "실패"
        }`,
      );
    } finally {
      setCreating(false);
    }
  }

  /* =======================================================
     견적 이미지 저장
  ======================================================= */

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
          ? `✅ 견적 이미지를 저장했습니다. ${result.fileName}`
          : "✅ 견적 이미지를 저장했습니다.",
      );
    } catch (error) {
      console.error(
        "견적 이미지 저장 오류:",
        error,
      );

      setLeadsMessage?.(
        `❌ 견적 이미지 저장 오류: ${
          error?.message ||
          "실패"
        }`,
      );
    } finally {
      setSaving(false);
    }
  }

  /* =======================================================
     고객에게 견적서 보내기

     순서
     1. 견적 이미지 저장
     2. 고객 전화번호 확인
     3. 고객번호 문자창 바로 실행

     Android 공유창은 사용하지 않음
  ======================================================= */

  function handleSendQuote() {
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
       * 먼저 견적 이미지를
       * 휴대폰에 저장합니다.
       */
      downloadQuoteImage(
        quotePreview.blob,
        lead,
        companyName,
      );

      /*
       * 고객 전화번호가 지정된
       * 문자 작성창을 바로 엽니다.
       *
       * quoteUtils.js의
       * openCustomerSms()가
       * sms:고객번호 형식으로 실행됩니다.
       */
      openCustomerSms(lead);
    } catch (error) {
      console.error(
        "견적서 문자 전송 준비 오류:",
        error,
      );

      setLeadsMessage?.(
        `❌ 견적서 문자 전송 준비 오류: ${
          error?.message ||
          "실패"
        }`,
      );

      setSending(false);
    }
  }

  /* =======================================================
     표시용 데이터
  ======================================================= */

  const displayCompanyName =
    String(
      companyName || "",
    ).trim();

  const displayPhone =
    String(
      lead?.phone || "",
    ).trim();

  const busy =
    creating ||
    saving ||
    sending;

  /* =======================================================
     화면
  ======================================================= */

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
            busy && !creating
              ? 0.65
              : 1,
        }}
      >
        {creating
          ? "견적서 만드는 중..."
          : "🧾 견적서 만들기"}
      </button>

      {/* 견적서 미리보기 */}

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

          <img
            src={
              quotePreview.url
            }
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
              borderRadius:
                "10px",
              background:
                "#ffffff",
            }}
          />

          {/* 고객에게 보내기 */}

          <button
            type="button"
            onClick={
              handleSendQuote
            }
            disabled={
              busy ||
              !displayPhone
            }
            style={{
              width: "100%",
              padding: "16px",
              marginTop: "14px",
              border: "none",
              borderRadius:
                "10px",
              background:
                "#5d4037",
              color: "#ffffff",
              fontSize: "16px",
              fontWeight: "bold",
              cursor:
                !busy &&
                displayPhone
                  ? "pointer"
                  : "not-allowed",
              opacity:
                !busy &&
                displayPhone
                  ? 1
                  : 0.55,
            }}
          >
            {sending
              ? "문자창 여는 중..."
              : "📱 견적서 고객에게 보내기"}
          </button>

          {/* 고객 전화번호 */}

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

          {/* 이미지 저장 */}

          <button
            type="button"
            onClick={
              handleSaveQuote
            }
            disabled={busy}
            style={{
              width: "100%",
              padding: "12px",
              marginTop: "12px",
              border:
                "1px solid #166534",
              borderRadius:
                "10px",
              background:
                "#ffffff",
              color: "#166534",
              fontSize: "14px",
              fontWeight: "bold",
              cursor: saving
                ? "wait"
                : busy
                  ? "not-allowed"
                  : "pointer",
              opacity:
                busy &&
                !saving
                  ? 0.65
                  : 1,
            }}
          >
            {saving
              ? "저장 중..."
              : "💾 견적 이미지 저장하기"}
          </button>

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
              lineHeight: 1.7,
              color: "#78716c",
            }}
          >
            📱 견적서 고객에게
            보내기를 누르면 견적
            이미지를 먼저 저장하고
            등록된 고객번호의 문자
            작성창을 바로 엽니다.
            <br />
            <br />
            휴대폰 공유 대상 선택창은
            사용하지 않습니다.
          </div>
        </>
      )}
    </div>
  );
              }
