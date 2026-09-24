"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  createQuotePreview,
  downloadQuoteImage,
  shareQuoteImage,
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
        "✅ 견적서가 만들어졌습니다. 내용을 확인한 후 고객에게 전송해주세요.",
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
     견적 이미지 고객에게 보내기

     중요:
     클립보드를 사용하지 않습니다.

     실제 견적 이미지 파일을
     Android 공유창으로 전달합니다.

     공유창에서
     메시지 / 카카오톡 등을 선택합니다.
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
          "✅ 직접 공유를 지원하지 않는 브라우저라 견적 이미지를 저장했습니다.",
        );
      } else {
        setLeadsMessage?.(
          "✅ 견적 이미지를 공유했습니다.",
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
     고객번호 문자창만 열기

     이미지 자동첨부는 하지 않습니다.
     Android 웹 보안 제한 때문에
     sms: 링크와 이미지 첨부를
     동시에 강제로 처리할 수 없습니다.
  ======================================================= */

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
          error?.message ||
          "실패"
        }`,
      );
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

          {/* 가장 중요한 버튼 */}

          <button
            type="button"
            onClick={
              handleSendQuote
            }
            disabled={busy}
            style={{
              width: "100%",
              padding: "15px",
              marginTop: "12px",
              border: "none",
              borderRadius:
                "10px",
              background:
                "#5d4037",
              color: "#ffffff",
              fontSize: "16px",
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
              ? "전송 준비 중..."
              : "📤 견적서 고객에게 보내기"}
          </button>

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
              marginTop: "10px",
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

          {/* 고객 문자창 */}

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
              padding: "12px",
              marginTop: "10px",
              border:
                "1px solid #78716c",
              borderRadius:
                "10px",
              background:
                "#ffffff",
              color: "#57534e",
              fontSize: "14px",
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
            📱 고객 문자창만 열기
            {displayPhone
              ? ` · ${displayPhone}`
              : ""}
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
              lineHeight: 1.7,
              color: "#78716c",
            }}
          >
            📤 고객에게 보내기:
            견적 이미지 파일을
            휴대폰 공유창으로
            보냅니다.
            <br />

            공유창에서 메시지 또는
            카카오톡을 선택해
            전송할 수 있습니다.
            <br />

            💾 저장하기:
            견적 이미지를 JPG
            파일로 저장합니다.
            <br />

            📱 문자창만 열기:
            등록된 고객 전화번호의
            문자 작성창만 엽니다.
          </div>
        </>
      )}
    </div>
  );
              }
