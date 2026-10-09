"use client";

import { useEffect } from "react";

export default function CuttingError({ error, reset }) {
  useEffect(() => {
    console.error("재단 페이지 실행 오류:", error);
  }, [error]);

  return (
    <main
      style={{
        maxWidth: 640,
        margin: "40px auto",
        padding: 20,
        lineHeight: 1.7,
      }}
    >
      <h1>재단 화면을 열지 못했습니다</h1>

      <p>
        아래 오류 내용을 확인해주세요.
        저장된 재단 기록은 삭제하지 않습니다.
      </p>

      <pre
        style={{
          padding: 16,
          background: "#fff1f2",
          borderRadius: 12,
          whiteSpace: "pre-wrap",
          overflowWrap: "anywhere",
        }}
      >
        {error?.message || "오류 내용을 가져오지 못했습니다."}
        {error?.digest
          ? "\n오류 번호: " + error.digest
          : ""}
      </pre>

      <button
        type="button"
        onClick={reset}
        style={{ padding: "12px 18px" }}
      >
        다시 시도
      </button>

      <p>
        <a href="/worker">시공자 홈으로 돌아가기</a>
      </p>
    </main>
  );
}
