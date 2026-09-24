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
        "✅ 견적서가 만들어졌습니다. 다음으로 '1. 견적 이미지 저장 + 복사'를 눌러주세요.",
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
     견적 이미지 저장 + 클립보드 복사

     문자창은 열지 않습니다.
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

    try {
      /*
       * 먼저 견적 이미지를
       * 휴대폰에 JPG로 저장
       */
      downloadQuoteImage(
        quotePreview.blob,
        lead,
        companyName,
      );

      /*
       * 같은 견적 이미지를
       * PNG 이미지로 변환하여
       * 클립보드에 복사
       */
      await copyQuoteImage(
        quotePreview.blob,
      );

      /*
       * 클립보드 복사가 실제로
       * 성공한 경우에만 true
       */
      setImageCopied(true);

      setLeadsMessage?.(
        "✅ 견적 이미지 저장 및 복사가 완료되었습니다. 이제 '2. 고객에게 문자 보내기'를 눌러주세요.",
      );
    } catch (error) {
      console.error(
        "견적 이미지 준비 오류:",
        error,
      );

      setImageCopied(false);

      setLeadsMessage?.(
        `❌ 견적 이미지 복사 오류: ${
          error?.message ||
          "이 브라우저에서 이미지 클립보드를 지원하지 않습니다."
        }`,
      );
    } finally {
      setPreparing(false);
    }
  }

  /* =======================================================
     2단계
     고객번호 문자창만 열기

     저장/다운로드/복사는 여기서 하지 않습니다.
  ======================================================= */

  function handleOpenCustomerSms() {
    if (!lead?.phone) {
      setLeadsMessage?.(
        "⚠️ 고객 전화번호가 없습니다.",
      );

      return;
    }

    if (!imageCopied) {
      setLeadsMessage?.(
        "⚠️ 먼저 '1. 견적 이미지 저장 + 복사'를 눌러주세요.",
      );

      return;
    }

    try {
      setLeadsMessage?.(
        "✅ 고객 문자창을 엽니다. 입력창을 길게 눌러 견적 이미지를 붙여넣고 전송해주세요.",
      );

      /*
       * 고객 전화번호가 지정된
       * 문자 작성창만 실행
       */
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
              ? 0.6
              : 1,
        }}
      >
        {creating
          ? "견적서 만드는 중..."
          : "🧾 견적서 만들기"}
      </button>

      {/* 견적서 생성 후 */}

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

          {/* 견적서 이미지 */}

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
              1단계
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
              ? "이미지 저장 및 복사 중..."
              : imageCopied
                ? "✅ 1. 견적 이미지 복사 완료"
                : "💾 1. 견적 이미지 저장 + 복사"}
          </button>

          {/* 복사 성공 표시 */}

          {imageCopied && (
            <div
              style={{
                marginTop: "8px",
                padding: "9px",
                borderRadius:
                  "8px",
                background:
                  "#f0fdf4",
                border:
                  "1px solid #bbf7d0",
                color: "#166534",
                fontSize: "13px",
                fontWeight: "bold",
                textAlign: "center",
              }}
            >
              견적 이미지가
              클립보드에
              복사되었습니다.
            </div>
          )}

          {/* =============================================
              2단계
          ============================================== */}

          <button
            type="button"
            onClick={
              handleOpenCustomerSms
            }
            disabled={
              !displayPhone ||
              !imageCopied ||
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
                imageCopied &&
                displayPhone
                  ? "#2563eb"
                  : "#a8a29e",
              color: "#ffffff",
              fontSize: "16px",
              fontWeight: "bold",
              cursor:
                imageCopied &&
                displayPhone &&
                !busy
                  ? "pointer"
                  : "not-allowed",
              opacity:
                imageCopied &&
                displayPhone
                  ? 1
                  : 0.65,
            }}
          >
            📱 2. 고객에게 문자 보내기
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

          {/* 사용방법 */}

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
            ② 복사 완료가 표시되면
            고객에게 문자 보내기를
            누릅니다.
            <br />
            ③ 고객번호가 입력된
            문자창이 열립니다.
            <br />
            ④ 문자 입력창을 길게
            눌러 붙여넣기 후
            전송합니다.
          </div>
        </>
      )}
    </div>
  );
            }
