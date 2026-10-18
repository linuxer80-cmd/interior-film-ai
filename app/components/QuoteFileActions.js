"use client";

import { useEffect, useState } from "react";

// Prepare before the click so mobile file sharing keeps its user activation.
export default function QuoteFileActions({ draft, filename = "견적서", disabled = false }) {
  const [ready, setReady] = useState(null);
  const [error, setError] = useState("");
  const [sharing, setSharing] = useState(false);
  useEffect(() => {
    let active = true;
    setReady(null);
    setError("");
    if (!draft || disabled) return;
    const timer = setTimeout(async () => {
      try {
        const { completionPdf } = await import("../../lib/completionEstimatePdf.mjs");
        const blob = await completionPdf(draft);
        const name = filename.replace(/[\\/:*?"<>|]/g, "_") + ".pdf";
        if (active) setReady({ draft, file: new File([blob], name, { type: "application/pdf" }) });
      } catch (err) {
        if (active) setError(err.message || "PDF를 만들지 못했습니다.");
      }
    }, 400);
    return () => { active = false; clearTimeout(timer); };
  }, [draft, filename, disabled]);

  const file = ready?.draft === draft ? ready.file : null;
  function download() {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url; link.download = file.name;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  async function share() {
    if (!file || sharing) return;
    setError("");
    try {
      if (!navigator.canShare?.({ files: [file] })) {
        download();
        setError("이 브라우저는 파일 공유를 지원하지 않아 PDF로 저장했습니다. 카톡에 파일을 첨부해주세요.");
        return;
      }
      setSharing(true);
      await navigator.share({ files: [file], title: filename });
    } catch (err) {
      if (err.name !== "AbortError") setError("공유창을 열지 못했습니다. PDF 저장 버튼을 이용해주세요.");
    } finally { setSharing(false); }
  }
  return <div style={{ marginTop: 16 }}>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <button type="button" disabled={!file || disabled || sharing} onClick={share}
        style={{ padding: "12px 18px", borderRadius: 12, background: "#285440", color: "#fff", border: 0 }}>카톡·공유</button>
      <button type="button" disabled={!file || disabled || sharing} onClick={download}
        style={{ padding: "12px 18px", borderRadius: 12, background: "#edf3ec", color: "#285440", border: "1px solid #d6ded3" }}>PDF 저장</button>
    </div>
    <p role="status" style={{ fontSize: 12, color: "#68746c" }}>{error || (file ? "현재 입력한 내용으로 공유합니다. 앱에 보관하려면 견적서 저장도 눌러주세요." : disabled ? "항목의 수량과 금액을 확인해주세요." : "PDF 준비 중…")}</p>
  </div>;
}
