"use client";

import {
  useRef,
  useState,
} from "react";

/* =========================================================
   통화내용 / 통화녹음 AI 자동입력
========================================================= */

export default function CallContentAiInput({
  disabled = false,
  onApply,
}) {
  const fileInputRef =
    useRef(null);

  const [
    open,
    setOpen,
  ] = useState(false);

  const [
    callContent,
    setCallContent,
  ] = useState("");

  const [
    selectedFile,
    setSelectedFile,
  ] = useState(null);

  const [
    analyzing,
    setAnalyzing,
  ] = useState(false);

  const [
    stage,
    setStage,
  ] = useState("");

  const [
    message,
    setMessage,
  ] = useState("");

  /* =======================================================
     입력창 열기
  ======================================================= */

  function openInput() {
    if (
      disabled ||
      analyzing
    ) {
      return;
    }

    setMessage("");
    setOpen(true);
  }

  /* =======================================================
     입력창 닫기
  ======================================================= */

  function closeInput() {
    if (analyzing) {
      return;
    }

    setMessage("");
    setOpen(false);
  }

  /* =======================================================
     파일 선택창
  ======================================================= */

  function openFilePicker() {
    if (
      disabled ||
      analyzing
    ) {
      return;
    }

    setMessage("");

    fileInputRef.current?.click();
  }

  /* =======================================================
     파일 선택
  ======================================================= */

  function handleFileChange(
    event,
  ) {
    const file =
      event.target.files?.[0];

    /*
     * 같은 파일을 다시 선택할 수 있도록
     * input 값은 바로 초기화
     */

    event.target.value = "";

    if (!file) {
      return;
    }

    const extension =
      String(file.name || "")
        .split(".")
        .pop()
        ?.toLowerCase();

    const allowed = [
      "m4a",
      "mp3",
      "mp4",
      "wav",
      "webm",
      "mpeg",
      "mpga",
    ];

    if (
      !allowed.includes(
        extension,
      )
    ) {
      setMessage(
        "❌ m4a, mp3, mp4, wav 통화녹음 파일을 선택해주세요.",
      );

      return;
    }

    const maxSize =
      25 * 1024 * 1024;

    if (
      file.size >
      maxSize
    ) {
      setMessage(
        "❌ 통화녹음 파일은 25MB 이하만 사용할 수 있습니다.",
      );

      return;
    }

    setSelectedFile(file);

    setMessage(
      `✅ 통화녹음 선택\n${file.name}\n\n아래 '통화녹음 AI 분석'을 누르면 일정정보를 자동으로 찾습니다.`,
    );
  }

  /* =======================================================
     선택 파일 취소
  ======================================================= */

  function clearSelectedFile() {
    if (analyzing) {
      return;
    }

    setSelectedFile(null);
    setMessage("");
  }

  /* =======================================================
     텍스트 → 일정정보 AI 분석
  ======================================================= */

  async function requestSiteCallParse(
    content,
  ) {
    const response =
      await fetch(
        "/api/admin/parse-site-call",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body:
            JSON.stringify({
              content,
            }),
        },
      );

    let result = null;

    try {
      result =
        await response.json();
    } catch {
      result = null;
    }

    if (!response.ok) {
      throw new Error(
        result?.error ||
          "통화내용 분석에 실패했습니다.",
      );
    }

    if (!result?.success) {
      throw new Error(
        result?.error ||
          "통화내용 분석에 실패했습니다.",
      );
    }

    if (
      !result?.data ||
      typeof result.data !==
        "object"
    ) {
      throw new Error(
        "AI 분석 결과가 없습니다.",
      );
    }

    return result.data;
  }

  /* =======================================================
     AI 결과 + 파일명 정보 병합

     우선순위:
     1. 파일명에서 명확히 확인한 전화번호
     2. 음성 AI 분석 전화번호

     고객명:
     AI 분석 결과 우선
     → 없을 경우 파일명 이름 후보 사용
  ======================================================= */

  function mergeResult(
    aiData,
    transcriptionData,
  ) {
    const source =
      aiData &&
      typeof aiData ===
        "object"
        ? aiData
        : {};

    const transcript =
      transcriptionData &&
      typeof transcriptionData ===
        "object"
        ? transcriptionData
        : {};

    return {
      ...source,

      customer_phone:
        transcript.customer_phone ||
        source.customer_phone ||
        "",

      customer_name:
        source.customer_name ||
        transcript.customer_name ||
        "",
    };
  }

  /* =======================================================
     통화녹음 → 텍스트 → 일정 AI 분석
  ======================================================= */

  async function analyzeRecording() {
    if (
      disabled ||
      analyzing
    ) {
      return;
    }

    if (!selectedFile) {
      setMessage(
        "❌ 먼저 통화녹음 파일을 선택해주세요.",
      );

      return;
    }

    setAnalyzing(true);
    setStage(
      "통화녹음을 글자로 변환하고 있습니다...",
    );
    setMessage("");

    try {
      /* ---------------------------------------------------
         1. 녹음파일 업로드 / 전사
      --------------------------------------------------- */

      const formData =
        new FormData();

      formData.append(
        "file",
        selectedFile,
      );

      const transcribeResponse =
        await fetch(
          "/api/admin/transcribe-site-call",
          {
            method: "POST",

            body:
              formData,
          },
        );

      let transcribeResult =
        null;

      try {
        transcribeResult =
          await transcribeResponse.json();
      } catch {
        transcribeResult =
          null;
      }

      if (
        !transcribeResponse.ok
      ) {
        throw new Error(
          transcribeResult?.error ||
            "통화녹음 변환에 실패했습니다.",
        );
      }

      if (
        !transcribeResult?.success
      ) {
        throw new Error(
          transcribeResult?.error ||
            "통화녹음 변환에 실패했습니다.",
        );
      }

      const transcriptionData =
        transcribeResult?.data;

      const transcript =
        String(
          transcriptionData?.transcript ||
            "",
        ).trim();

      if (!transcript) {
        throw new Error(
          "통화녹음에서 음성내용을 찾지 못했습니다.",
        );
      }

      /*
       * 변환된 통화내용을 화면에도 넣어
       * 관리자가 필요하면 확인/수정 가능
       */

      setCallContent(
        transcript,
      );

      /* ---------------------------------------------------
         2. 전사문 → 일정정보 추출
      --------------------------------------------------- */

      setStage(
        "통화내용에서 일정정보를 찾고 있습니다...",
      );

      const aiData =
        await requestSiteCallParse(
          transcript,
        );

      /* ---------------------------------------------------
         3. 파일명 정보 병합
      --------------------------------------------------- */

      const finalData =
        mergeResult(
          aiData,
          transcriptionData,
        );

      /* ---------------------------------------------------
         4. 부모 일정등록 폼으로 전달
      --------------------------------------------------- */

      if (
        typeof onApply ===
          "function"
      ) {
        onApply(
          finalData,
        );
      }

      setStage("");

      setMessage(
        `✅ 통화녹음 분석 완료\n\n파일: ${selectedFile.name}\n\n일정등록 화면에 분석 결과를 입력했습니다. 아래 내용을 확인한 후 현장 일정을 등록해주세요.`,
      );

      /*
       * 파일은 분석 완료 후에도
       * 이름 확인용으로 유지
       */

      setOpen(false);
    } catch (error) {
      console.error(
        "통화녹음 AI 분석 오류:",
        error,
      );

      setStage("");

      setMessage(
        `❌ ${
          error?.message ||
          "통화녹음 분석 중 오류가 발생했습니다."
        }`,
      );
    } finally {
      setAnalyzing(false);
    }
  }

  /* =======================================================
     직접 붙여넣은 텍스트 분석
  ======================================================= */

  async function analyzeCallContent() {
    if (
      disabled ||
      analyzing
    ) {
      return;
    }

    const content =
      callContent.trim();

    if (!content) {
      setMessage(
        "❌ 통화내용을 붙여넣어 주세요.",
      );

      return;
    }

    if (
      content.length < 5
    ) {
      setMessage(
        "❌ 통화내용이 너무 짧습니다.",
      );

      return;
    }

    setAnalyzing(true);

    setStage(
      "통화내용에서 일정정보를 찾고 있습니다...",
    );

    setMessage("");

    try {
      const data =
        await requestSiteCallParse(
          content,
        );

      if (
        typeof onApply ===
          "function"
      ) {
        onApply(data);
      }

      setStage("");

      setMessage(
        "✅ 통화내용을 분석해 일정등록 화면에 입력했습니다.\n내용을 확인한 후 현장 일정을 등록해주세요.",
      );

      setOpen(false);
    } catch (error) {
      console.error(
        "통화내용 AI 분석 오류:",
        error,
      );

      setStage("");

      setMessage(
        `❌ ${
          error?.message ||
          "통화내용 분석 중 오류가 발생했습니다."
        }`,
      );
    } finally {
      setAnalyzing(false);
    }
  }

  /* =======================================================
     파일 크기 표시
  ======================================================= */

  function formatFileSize(
    bytes,
  ) {
    const value =
      Number(bytes);

    if (
      !Number.isFinite(
        value,
      ) ||
      value <= 0
    ) {
      return "";
    }

    if (
      value <
      1024 * 1024
    ) {
      return `${Math.round(
        value / 1024,
      )} KB`;
    }

    return `${(
      value /
      (1024 * 1024)
    ).toFixed(2)} MB`;
  }

  /* =======================================================
     화면
  ======================================================= */

  return (
    <section
      style={{
        marginBottom:
          "16px",

        padding:
          "14px",

        border:
          "1px solid #bfdbfe",

        borderRadius:
          "12px",

        background:
          "#eff6ff",
      }}
    >
      {/* =================================================
          제목
      ================================================= */}

      <div>
        <div
          style={{
            fontSize:
              "15px",

            fontWeight:
              "900",

            color:
              "#1e3a8a",
          }}
        >
          📞 통화내용 자동입력
        </div>

        <div
          style={{
            marginTop:
              "4px",

            fontSize:
              "12px",

            lineHeight:
              "1.5",

            color:
              "#475569",
          }}
        >
          통화녹음 파일을
          선택하거나 통화내용을
          직접 붙여넣으면 AI가
          현장정보를 자동으로
          입력합니다.
        </div>
      </div>

      {/* =================================================
          숨겨진 파일 선택
      ================================================= */}

      <input
        ref={
          fileInputRef
        }
        type="file"
        accept=".m4a,.mp3,.mp4,.wav,.webm,.mpeg,.mpga,audio/*"
        disabled={
          disabled ||
          analyzing
        }
        onChange={
          handleFileChange
        }
        style={{
          display:
            "none",
        }}
      />

      {/* =================================================
          통화녹음 선택
      ================================================= */}

      <button
        type="button"
        onClick={
          openFilePicker
        }
        disabled={
          disabled ||
          analyzing
        }
        style={{
          width: "100%",

          marginTop:
            "12px",

          border:
            "1px solid #2563eb",

          borderRadius:
            "10px",

          padding:
            "12px",

          background:
            "#2563eb",

          color:
            "#ffffff",

          fontSize:
            "13px",

          fontWeight:
            "900",

          cursor:
            disabled ||
            analyzing
              ? "default"
              : "pointer",

          opacity:
            disabled
              ? 0.6
              : 1,
        }}
      >
        📁 통화녹음 선택
      </button>

      {/* =================================================
          선택된 녹음
      ================================================= */}

      {selectedFile && (
        <div
          style={{
            marginTop:
              "10px",

            padding:
              "11px",

            border:
              "1px solid #bfdbfe",

            borderRadius:
              "10px",

            background:
              "#ffffff",
          }}
        >
          <div
            style={{
              fontSize:
                "12px",

              fontWeight:
                "900",

              color:
                "#1e3a8a",

              wordBreak:
                "break-all",
            }}
          >
            🎙️{" "}
            {
              selectedFile.name
            }
          </div>

          <div
            style={{
              marginTop:
                "4px",

              fontSize:
                "11px",

              color:
                "#64748b",
            }}
          >
            {formatFileSize(
              selectedFile.size,
            )}
          </div>

          <div
            style={{
              display:
                "grid",

              gridTemplateColumns:
                "2fr 1fr",

              gap: "7px",

              marginTop:
                "9px",
            }}
          >
            <button
              type="button"
              onClick={
                analyzeRecording
              }
              disabled={
                disabled ||
                analyzing
              }
              style={{
                border:
                  "none",

                borderRadius:
                  "8px",

                padding:
                  "10px",

                background:
                  analyzing
                    ? "#93c5fd"
                    : "#1d4ed8",

                color:
                  "#ffffff",

                fontSize:
                  "12px",

                fontWeight:
                  "900",

                cursor:
                  analyzing
                    ? "default"
                    : "pointer",
              }}
            >
              {analyzing
                ? "분석 중..."
                : "✨ 통화녹음 AI 분석"}
            </button>

            <button
              type="button"
              onClick={
                clearSelectedFile
              }
              disabled={
                analyzing
              }
              style={{
                border:
                  "1px solid #cbd5e1",

                borderRadius:
                  "8px",

                padding:
                  "10px",

                background:
                  "#ffffff",

                color:
                  "#475569",

                fontSize:
                  "12px",

                fontWeight:
                  "800",

                cursor:
                  analyzing
                    ? "default"
                    : "pointer",
              }}
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* =================================================
          처리 단계
      ================================================= */}

      {stage && (
        <div
          style={{
            marginTop:
              "10px",

            padding:
              "10px",

            borderRadius:
              "9px",

            background:
              "#dbeafe",

            color:
              "#1e40af",

            fontSize:
              "12px",

            fontWeight:
              "900",

            lineHeight:
              "1.5",
          }}
        >
          ⏳ {stage}
        </div>
      )}

      {/* =================================================
          직접 붙여넣기 열기
      ================================================= */}

      {!open && (
        <button
          type="button"
          onClick={
            openInput
          }
          disabled={
            disabled ||
            analyzing
          }
          style={{
            width:
              "100%",

            marginTop:
              "8px",

            border:
              "1px solid #93c5fd",

            borderRadius:
              "9px",

            padding:
              "10px",

            background:
              "#ffffff",

            color:
              "#1d4ed8",

            fontSize:
              "12px",

            fontWeight:
              "900",

            cursor:
              disabled ||
              analyzing
                ? "default"
                : "pointer",
          }}
        >
          📝 통화내용 직접 붙여넣기
        </button>
      )}

      {/* =================================================
          텍스트 입력
      ================================================= */}

      {open && (
        <div
          style={{
            marginTop:
              "12px",
          }}
        >
          <textarea
            value={
              callContent
            }
            onChange={(
              event,
            ) =>
              setCallContent(
                event.target
                  .value,
              )
            }
            disabled={
              disabled ||
              analyzing
            }
            placeholder={
              "여기에 통화 요약 또는 녹취 내용을 그대로 붙여넣으세요.\n\n예)\n김철수 고객, 10월 5일 오전 9시 인천 서구 검단 ○○아파트. 싱크대 상하부장 시공. 현대 S115 사용. 계약금액 120만원."
            }
            rows={8}
            style={{
              width:
                "100%",

              boxSizing:
                "border-box",

              padding:
                "12px",

              border:
                "1px solid #93c5fd",

              borderRadius:
                "10px",

              background:
                "#ffffff",

              color:
                "#111827",

              fontSize:
                "14px",

              lineHeight:
                "1.6",

              resize:
                "vertical",

              outline:
                "none",
            }}
          />

          <div
            style={{
              marginTop:
                "6px",

              fontSize:
                "11px",

              lineHeight:
                "1.5",

              color:
                "#64748b",
            }}
          >
            없는 정보는 AI가
            임의로 만들지 않고
            빈칸으로 남겨둡니다.
          </div>

          <div
            style={{
              display:
                "grid",

              gridTemplateColumns:
                "1fr 2fr",

              gap: "8px",

              marginTop:
                "10px",
            }}
          >
            <button
              type="button"
              onClick={
                closeInput
              }
              disabled={
                analyzing
              }
              style={{
                border:
                  "1px solid #cbd5e1",

                borderRadius:
                  "9px",

                padding:
                  "11px",

                background:
                  "#ffffff",

                color:
                  "#475569",

                fontSize:
                  "12px",

                fontWeight:
                  "800",

                cursor:
                  analyzing
                    ? "default"
                    : "pointer",
              }}
            >
              취소
            </button>

            <button
              type="button"
              onClick={
                analyzeCallContent
              }
              disabled={
                analyzing ||
                disabled
              }
              style={{
                border:
                  "none",

                borderRadius:
                  "9px",

                padding:
                  "11px",

                background:
                  analyzing
                    ? "#93c5fd"
                    : "#2563eb",

                color:
                  "#ffffff",

                fontSize:
                  "12px",

                fontWeight:
                  "900",

                cursor:
                  analyzing
                    ? "default"
                    : "pointer",
              }}
            >
              {analyzing
                ? "AI 분석 중..."
                : "✨ AI 내용 추출"}
            </button>
          </div>
        </div>
      )}

      {/* =================================================
          결과 메시지
      ================================================= */}

      {message && (
        <div
          style={{
            marginTop:
              "10px",

            padding:
              "10px",

            borderRadius:
              "9px",

            background:
              message.startsWith(
                "✅",
              )
                ? "#f0fdf4"
                : "#fef2f2",

            color:
              message.startsWith(
                "✅",
              )
                ? "#166534"
                : "#b91c1c",

            fontSize:
              "12px",

            fontWeight:
              "800",

            lineHeight:
              "1.5",

            whiteSpace:
              "pre-wrap",

            wordBreak:
              "break-word",
          }}
        >
          {message}
        </div>
      )}
    </section>
  );
             }
