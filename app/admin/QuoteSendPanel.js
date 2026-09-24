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
    sharing,
    setSharing,
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

     현재 lead 값을 그대로 사용합니다.

     따라서 기존에 정상 작동 중인:
     - 최종 견적금액
     - 작업 내용
     - 고객이 선택한 필름
     - 방염 / 비방염
     - quote_material

     모두 그대로 견적서에 들어갑니다.
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
        "✅ 견적서가 만들어졌습니다. 금액과 사용 자재를 확인해주세요.",
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

     단순 JPG 저장 기능입니다.
     클립보드는 사용하지 않습니다.
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
     MMS용 이미지 전달

     과거 정상 작동했던 방식입니다.

     copyQuoteImage 사용 안 함
     ClipboardItem 사용 안 함
     텍스트 클립보드 사용 안 함

     실제 견적 이미지 File 자체를
     Android 공유 기능으로 전달합니다.

     메시지를 선택하면
     이미지가 MMS 첨부물로 전달됩니다.
  ======================================================= */

  async function handleShareQuote() {
    if (!quotePreview?.blob) {
      setLeadsMessage?.(
        "⚠️ 먼저 견적서 만들기를 눌러주세요.",
      );

      return;
    }

    setSharing(true);
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
          "⚠️ 이 브라우저에서는 이미지 파일 공유를 지원하지 않아 견적 이미지를 저장했습니다.",
        );

        return;
      }

      setLeadsMessage?.(
        "✅ 견적 이미지 파일을 전달했습니다.",
      );
    } catch (error) {
      /*
       * Android 공유창을
       * 사용자가 직접 닫은 경우
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
      setSharing(false);
    }
  }

  /* =======================================================
     고객 전화번호 문자창

     이미지 공유와 별도입니다.

     등록된 고객 전화번호가 지정된
     문자 작성창을 바로 엽니다.
  ======================================================= */

  function handleOpenCustomerSms() {
    if (!lead?.phone) {
      setLeadsMessage?.(
        "⚠️ 고객 전화번호가 없습니다.",
      );

      return;
    }

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
     표시 데이터
  ======================================================= */

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
    sharing;

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

          {/* ================================================
              고객 선택 필름 확인

              quote_material을 읽기만 합니다.
              기존 자동입력 로직은 건드리지 않습니다.
          ================================================= */}

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

          {/* ================================================
              1. 이미지 MMS 전달

              성공했던 File 공유 방식
          ================================================= */}

          <button
            type="button"
            onClick={
              handleShareQuote
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
              cursor: sharing
                ? "wait"
                : busy
                  ? "not-allowed"
                  : "pointer",
              opacity:
                busy &&
                !sharing
                  ? 0.6
                  : 1,
            }}
          >
            {sharing
              ? "견적 이미지 준비 중..."
              : "📎 1. 견적 이미지 MMS 준비"}
          </button>

          {/* ================================================
              2. 고객 문자창
          ================================================= */}

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
            📱 2. 고객 문자창 열기
          </button>

          {/* 고객 번호 */}

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

          {/* ================================================
              이미지 저장 보조기능
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
                  ? 0.6
                  : 1,
            }}
          >
            {saving
              ? "저장 중..."
              : "💾 견적 이미지 저장하기"}
          </button>

          {/* ================================================
              안내
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
              lineHeight: 1.8,
              color: "#78716c",
            }}
          >
            ① MMS 준비를 누르면
            견적 이미지 파일 자체를
            휴대폰으로 전달합니다.
            <br />

            ② 메시지를 선택하면
            견적 이미지가 MMS
            첨부파일로 들어갑니다.
            <br />

            ③ 고객 문자창은 등록된
            고객번호로 바로 이동할 때
            사용합니다.
            <br />

            ※ 클립보드 이미지 복사는
            사용하지 않습니다.
          </div>
        </>
      )}
    </div>
  );
        }
