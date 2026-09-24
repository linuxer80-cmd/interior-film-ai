"use client";

import {
  useEffect,
  useState,
} from "react";

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
  const [
    quotePreview,
    setQuotePreview,
  ] = useState(null);

  const [
    creating,
    setCreating,
  ] = useState(false);

  const [
    preparing,
    setPreparing,
  ] = useState(false);

  const [
    imageCopied,
    setImageCopied,
  ] = useState(false);

  const [
    imageSaved,
    setImageSaved,
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

    setImageCopied(false);
    setImageSaved(false);

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
        "✅ 견적서가 만들어졌습니다. 1번 버튼으로 이미지를 저장해주세요.",
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
     1단계
     이미지 저장 + 클립보드 복사 시도

     중요:
     클립보드 복사가 실패해도
     문자 버튼은 사용할 수 있게 합니다.
  ======================================================= */

  async function handlePrepareImage() {
    if (!quotePreview?.blob) {
      setLeadsMessage?.(
        "⚠️ 먼저 견적서 만들기를 눌러주세요.",
      );

      return;
    }

    setPreparing(true);

    setImageCopied(false);

    setLeadsMessage?.("");

    let saved = false;
    let copied = false;

    /* -------------------------------------------------------
       1. JPG 저장
    ------------------------------------------------------- */

    try {
      downloadQuoteImage(
        quotePreview.blob,
        lead,
        companyName,
      );

      saved = true;

      setImageSaved(true);
    } catch (error) {
      console.error(
        "견적 이미지 저장 오류:",
        error,
      );
    }

    /* -------------------------------------------------------
       2. 이미지 클립보드 복사 시도

       브라우저가 이미지 Clipboard API를
       지원하지 않아도 전체 작업을
       실패시키지 않습니다.
    ------------------------------------------------------- */

    try {
      await copyQuoteImage(
        quotePreview.blob,
      );

      copied = true;

      setImageCopied(true);
    } catch (error) {
      console.warn(
        "이미지 클립보드 복사 미지원 또는 실패:",
        error,
      );

      copied = false;

      setImageCopied(false);
    }

    /* -------------------------------------------------------
       결과 메시지
    ------------------------------------------------------- */

    if (saved && copied) {
      setLeadsMessage?.(
        "✅ 견적 이미지 저장 + 복사가 완료되었습니다. 이제 고객에게 문자 보내기를 눌러주세요.",
      );
    } else if (saved) {
      setLeadsMessage?.(
        "✅ 견적 이미지는 저장되었습니다. 이 브라우저에서는 이미지 자동 복사를 지원하지 않을 수 있습니다. 고객에게 문자 보내기를 눌러주세요.",
      );
    } else if (copied) {
      setLeadsMessage?.(
        "✅ 견적 이미지가 복사되었습니다. 고객에게 문자 보내기를 눌러주세요.",
      );
    } else {
      setLeadsMessage?.(
        "⚠️ 이미지 자동 저장/복사를 확인하지 못했습니다. 그래도 고객 문자창은 열 수 있습니다.",
      );
    }

    setPreparing(false);
  }

  /* =======================================================
     2단계
     고객번호 문자창 열기

     imageCopied 여부와 관계없이
     고객번호가 있으면 실행 가능
  ======================================================= */

  function handleOpenCustomerSms() {
    if (!lead?.phone) {
      setLeadsMessage?.(
        "⚠️ 고객 전화번호가 없습니다.",
      );

      return;
    }

    try {
      if (imageCopied) {
        setLeadsMessage?.(
          "✅ 고객 문자창을 엽니다. 입력창을 길게 눌러 붙여넣기 해주세요.",
        );
      } else if (imageSaved) {
        setLeadsMessage?.(
          "✅ 고객 문자창을 엽니다. 붙여넣기가 없으면 사진 첨부에서 방금 저장한 견적 이미지를 선택해주세요.",
        );
      } else {
        setLeadsMessage?.(
          "✅ 고객 문자창을 엽니다.",
        );
      }

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
    preparing;

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
      {/* ================================================
          견적서 만들기
      ================================================= */}

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

      {/* ================================================
          견적서 생성 후
      ================================================= */}

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

          {/* 견적 이미지 */}

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

          {/* =============================================
              1. 이미지 저장 + 복사
          ============================================== */}

          <button
            type="button"
            onClick={
              handlePrepareImage
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
                imageCopied
                  ? "#166534"
                  : imageSaved
                    ? "#15803d"
                    : "#5d4037",
              color: "#ffffff",
              fontSize: "16px",
              fontWeight: "bold",
              cursor: preparing
                ? "wait"
                : busy
                  ? "not-allowed"
                  : "pointer",
              opacity:
                busy &&
                !preparing
                  ? 0.6
                  : 1,
            }}
          >
            {preparing
              ? "이미지 준비 중..."
              : imageCopied
                ? "✅ 1. 견적 이미지 저장 + 복사 완료"
                : imageSaved
                  ? "✅ 1. 견적 이미지 저장 완료"
                  : "💾 1. 견적 이미지 저장 + 복사"}
          </button>

          {/* 상태 표시 */}

          {(imageSaved ||
            imageCopied) && (
            <div
              style={{
                marginTop: "8px",
                padding: "10px",
                borderRadius:
                  "8px",
                background:
                  "#f0fdf4",
                border:
                  "1px solid #bbf7d0",
                color: "#166534",
                fontSize: "13px",
                lineHeight: 1.6,
                fontWeight: "bold",
                textAlign: "center",
              }}
            >
              {imageCopied ? (
                <>
                  견적 이미지가
                  저장되고
                  클립보드에도
                  복사되었습니다.
                </>
              ) : (
                <>
                  견적 이미지가
                  저장되었습니다.
                </>
              )}
            </div>
          )}

          {/* =============================================
              2. 고객에게 문자 보내기

              복사 여부로 잠그지 않음
          ============================================== */}

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
              padding: "15px",
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
            📱 2. 고객에게 문자 보내기
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
            ① 견적 이미지 저장 +
            복사를 누릅니다.
            <br />

            ② 고객에게 문자 보내기를
            누릅니다.
            <br />

            ③ 고객번호가 입력된
            문자창이 바로 열립니다.
            <br />

            ④ 이미지 복사가 지원된
            경우 문자 입력창을 길게
            눌러 붙여넣기 합니다.
            <br />

            ⑤ 붙여넣기가 표시되지
            않으면 사진 첨부에서
            방금 저장된 견적 이미지를
            선택하면 됩니다.
          </div>
        </>
      )}
    </div>
  );
}
