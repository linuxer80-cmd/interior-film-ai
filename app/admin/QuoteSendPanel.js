"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  createQuotePreview,
  downloadQuoteImage,
  shareQuoteImage,
  copyQuoteImage,
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

  const [
    openingSms,
    setOpeningSms,
  ] = useState(false);

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
        "✅ 견적서가 만들어졌습니다. 내용을 확인한 후 저장하거나 고객에게 전송해주세요.",
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
     견적 이미지 공유
  ======================================================= */

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
          "✅ 이 브라우저에서는 직접 공유를 지원하지 않아 견적 이미지를 저장했습니다.",
        );
      } else {
        setLeadsMessage?.(
          "✅ 견적 이미지 공유창을 열었습니다.",
        );
      }
    } catch (error) {
      if (
        error?.name ===
        "AbortError"
      ) {
        setLeadsMessage?.(
          "견적 이미지 공유를 취소했습니다.",
        );

        return;
      }

      console.error(
        "견적 이미지 공유 오류:",
        error,
      );

      setLeadsMessage?.(
        `❌ 견적 이미지 공유 오류: ${
          error?.message ||
          "실패"
        }`,
      );
    } finally {
      setSending(false);
    }
  }

  /* =======================================================
     고객 문자
     1. 견적 이미지 클립보드 복사
     2. 고객번호 문자창 열기
  ======================================================= */

  async function handleOpenCustomerSms() {
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

    setOpeningSms(true);
    setLeadsMessage?.("");

    try {
      /*
       * 견적 이미지를 PNG로 변환한 뒤
       * 클립보드에 복사합니다.
       */
      await copyQuoteImage(
        quotePreview.blob,
      );

      setLeadsMessage?.(
        "✅ 견적 이미지를 복사했습니다. 문자창에서 길게 눌러 붙여넣기 해주세요.",
      );

      /*
       * 클립보드 복사가 완료된 후
       * 고객번호가 지정된 문자창을 엽니다.
       */
      openCustomerSms(lead);
    } catch (error) {
      console.error(
        "고객 문자 준비 오류:",
        error,
      );

      /*
       * 이미지 클립보드 복사를 지원하지 않는
       * 브라우저에서도 문자창은 열 수 있게 합니다.
       */
      try {
        setLeadsMessage?.(
          "⚠️ 이미지 자동 복사를 지원하지 않는 브라우저입니다. 문자창을 열겠습니다.",
        );

        openCustomerSms(lead);
      } catch (smsError) {
        console.error(
          "고객 문자 열기 오류:",
          smsError,
        );

        setLeadsMessage?.(
          `❌ 고객 문자 열기 오류: ${
            smsError?.message ||
            error?.message ||
            "실패"
          }`,
        );
      }
    } finally {
      setOpeningSms(false);
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
    sending ||
    openingSms;

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

          {/* 이미지 저장 */}

          <button
            type="button"
            onClick={
              handleSaveQuote
            }
            disabled={busy}
            style={{
              width: "100%",
              padding: "13px",
              marginTop: "12px",
              border:
                "1px solid #166534",
              borderRadius:
                "10px",
              background:
                "#ffffff",
              color: "#166534",
              fontSize: "15px",
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

          {/* 이미지 공유 */}

          <button
            type="button"
            onClick={
              handleSendQuote
            }
            disabled={busy}
            style={{
              width: "100%",
              padding: "13px",
              marginTop: "10px",
              border: "none",
              borderRadius:
                "10px",
              background:
                "#5d4037",
              color: "#ffffff",
              fontSize: "15px",
              fontWeight: "bold",
              cursor: sending
                ? "wait"
                : busy
                  ? "not-allowed"
                  : "pointer",
              opacity:
                busy &&
                !sending
                  ? 0.65
                  : 1,
            }}
          >
            {sending
              ? "공유 준비 중..."
              : "📤 견적 이미지 공유하기"}
          </button>

          {/* 고객 문자 */}

          <button
            type="button"
            onClick={
              handleOpenCustomerSms
            }
            disabled={
              !displayPhone ||
              busy
            }
            style={{
              width: "100%",
              padding: "13px",
              marginTop: "10px",
              border:
                "1px solid #5d4037",
              borderRadius:
                "10px",
              background:
                "#ffffff",
              color: "#5d4037",
              fontSize: "15px",
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
                  : 0.5,
            }}
          >
            {openingSms
              ? "📋 이미지 복사 중..."
              : `📱 고객에게 문자 보내기${
                  displayPhone
                    ? ` · ${displayPhone}`
                    : ""
                }`}
          </button>

          {/* 안내 */}

          <div
            style={{
              marginTop: "10px",
              padding: "10px",
              borderRadius:
                "8px",
              background:
                "#f5f5f4",
              fontSize: "12px",
              lineHeight: 1.6,
              color: "#78716c",
            }}
          >
            💾 저장하기:
            견적 이미지를 JPG로
            저장합니다.
            <br />

            📤 공유하기:
            견적 이미지를 휴대폰
            공유창으로 보냅니다.
            <br />

            📱 문자 보내기:
            견적 이미지를 먼저
            클립보드에 복사한 뒤
            고객번호의 문자창을
            엽니다.
            <br />

            문자창이 열리면
            입력창을 길게 눌러
            붙여넣기 해주세요.
          </div>
        </>
      )}
    </div>
  );
              }
