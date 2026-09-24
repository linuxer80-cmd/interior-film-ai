"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  createQuotePreview,
  downloadQuoteImage,
  shareQuoteImage,
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
        "✅ 견적서가 만들어졌습니다. 내용을 확인한 후 '견적 이미지 문자로 보내기'를 눌러주세요.",
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
     견적 이미지 문자 전송

     중요:
     - 클립보드 사용 안 함
     - SMS 링크 사용 안 함
     - 견적 JPG 파일 자체를 Android 공유창으로 전달
     - 공유창에서 '메시지' 선택
     - 메시지 앱에 MMS 이미지 첨부
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
          "⚠️ 이 브라우저에서는 이미지 공유를 지원하지 않아 견적 이미지를 저장했습니다.",
        );
      } else {
        setLeadsMessage?.(
          "✅ 견적 이미지가 전달되었습니다. 메시지 앱을 선택해 전송해주세요.",
        );
      }
    } catch (error) {
      /*
       * Android 공유창을 사용자가
       * 직접 닫은 경우
       */
      if (
        error?.name ===
        "AbortError"
      ) {
        setLeadsMessage?.(
          "견적 이미지 전송을 취소했습니다.",
        );

        return;
      }

      console.error(
        "견적 이미지 전송 오류:",
        error,
      );

      setLeadsMessage?.(
        `❌ 견적 이미지 전송 오류: ${
          error?.message ||
          "실패"
        }`,
      );
    } finally {
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
            busy && !creating
              ? 0.65
              : 1,
        }}
      >
        {creating
          ? "견적서 만드는 중..."
          : "🧾 견적서 만들기"}
      </button>

      {/* ================================================
          견적서 생성 후 표시
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

          {/* ================================================
              문자 전송 메인 버튼
          ================================================= */}

          <button
            type="button"
            onClick={
              handleSendQuote
            }
            disabled={busy}
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
              ? "견적 이미지 준비 중..."
              : "📱 견적 이미지 문자로 보내기"}
          </button>

          {/* 고객번호 표시 */}

          {displayPhone && (
            <div
              style={{
                marginTop: "7px",
                textAlign: "center",
                fontSize: "12px",
                color: "#78716c",
              }}
            >
              고객번호{" "}
              {displayPhone}
            </div>
          )}

          {/* ================================================
              이미지 저장 보조 버튼
          ================================================= */}

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

          {/* ================================================
              사용 안내
          ================================================= */}

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
            📱 견적 이미지 문자로
            보내기를 누르면 견적
            이미지 파일이 휴대폰
            공유창으로 전달됩니다.
            <br />
            <br />
            공유창에서 메시지를
            선택하면 견적 이미지가
            MMS 첨부파일로
            전달됩니다.
            <br />
            <br />
            클립보드 복사 기능은
            사용하지 않습니다.
          </div>
        </>
      )}
    </div>
  );
    }
