"use client";

import { useEffect, useRef, useState } from "react";

// Prepare images before the click so mobile sharing keeps its user activation.
export default function QuoteFileActions({ draft, filename = "견적서", disabled = false, preview = false, onEdit }) {
  const [ready, setReady] = useState(null);
  const [error, setError] = useState("");
  const [sharing, setSharing] = useState(false);
  const [showImages, setShowImages] = useState(preview);
  const lock = useRef(false);
  useEffect(() => {
    let active = true;
    const urls = [];
    setReady(null);
    setError("");
    setShowImages(preview);
    if (!draft || disabled) return;
    const timer = setTimeout(async () => {
      try {
        const { completionImages, jpegPagesPdf } = await import("../../lib/completionEstimatePdf.mjs");
        const blobs = await completionImages(draft);
        if (!active) return;
        const name = filename.replace(/[\\/:*?"<>|]/g, "_");
        const images = blobs.map((blob, index) => new File([blob], `${name}_${index + 1}.jpg`, { type: "image/jpeg" }));
        const pages = await Promise.all(blobs.map(async blob => new Uint8Array(await blob.arrayBuffer())));
        if (!active) return;
        const pdf = new File([jpegPagesPdf(pages)], name + ".pdf", { type: "application/pdf" });
        images.forEach(file => urls.push(URL.createObjectURL(file)));
        setReady({ draft, images, urls, pdf });
      } catch (err) {
        if (active) setError(err.message || "견적서 이미지를 만들지 못했습니다.");
      }
    }, 400);
    return () => { active = false; clearTimeout(timer); urls.forEach(url => URL.revokeObjectURL(url)); };
  }, [draft, filename, disabled, preview]);

  const files = ready?.draft === draft && !disabled ? ready : null;
  function download(file) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url; link.download = file.name;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  function saveImages() {
    if (!files) return;
    setShowImages(true);
    if (files.images.length === 1) download(files.images[0]);
  }
  async function share() {
    if (!files || lock.current) return;
    setError("");
    try {
      if (!navigator.share || !navigator.canShare?.({ files: files.images })) {
        setShowImages(true);
        setError("이 브라우저에서는 이미지 공유를 지원하지 않습니다. 아래에서 이미지를 저장한 뒤 카톡에 사진으로 첨부해주세요.");
        return;
      }
      lock.current = true;
      setSharing(true);
      await navigator.share({ files: files.images, title: filename });
    } catch (err) {
      if (err.name !== "AbortError") {
        setShowImages(true);
        setError("공유창을 열지 못했습니다. 아래 이미지 저장을 이용해주세요.");
      }
    } finally { lock.current = false; setSharing(false); }
  }
  const style = { padding: "12px 18px", minHeight: 44, borderRadius: 12, background: "#edf3ec", color: "#285440", border: "1px solid #d6ded3" };
  return <div style={{ marginTop: 16 }}>
    {preview && <h3>이미지 미리보기·전달</h3>}
    {files && showImages && preview && <div aria-label="견적서 이미지 미리보기">{files.urls.map((url,index)=><img key={url} src={url} alt={`견적서 ${index+1} / ${files.images.length}장`} style={{display:"block",width:"100%",maxWidth:620,height:"auto",margin:"12px 0",border:"1px solid #d6ded3"}} />)}{files.images.length>1 && files.images.map((file,index)=><a key={file.name} href={files.urls[index]} download={file.name} style={{display:"inline-flex",minHeight:44,alignItems:"center",marginRight:12}}>{index+1}장 이미지 저장</a>)}</div>}
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <button type="button" disabled={!files || sharing} onClick={share}
        style={{ ...style, background: "#285440", color: "#fff", border: 0 }}>견적서 이미지 공유</button>
      <button type="button" disabled={!files || sharing} onClick={saveImages} style={style}>이미지 저장</button>
      {onEdit && <button type="button" disabled={sharing} onClick={onEdit} style={style}>수정하기</button>}
      <details><summary style={{ minHeight: 44, padding: "12px 8px", color: "#285440", cursor: "pointer" }}>PDF 저장</summary>
        <button type="button" disabled={!files || sharing} onClick={() => download(files.pdf)} style={style}>PDF 파일 저장</button>
      </details>
    </div>
    <p role="status" style={{ fontSize: 13, color: "#68746c" }}>{error || (files ? preview ? `이미지 ${files.images.length}장 · 저장한 견적서입니다. 수정 후에는 다시 저장해주세요.` : `이미지 ${files.images.length}장 · 현재 입력한 내용으로 공유합니다. 앱에 보관하려면 견적서 저장도 눌러주세요.` : disabled ? "항목의 수량과 금액을 확인해주세요." : "견적서 이미지 준비 중…")}</p>
    {files && showImages && !preview && <div aria-label="견적서 이미지 저장">
      <p style={{fontSize:13}}>여러 장이면 각 장을 저장해주세요. 저장이 안 되면 이미지를 길게 눌러 저장할 수 있습니다.</p>
      {files.images.map((file,index) => <div key={file.name} style={{marginTop:12}}>
        <a href={files.urls[index]} download={file.name} style={{...style,display:"inline-flex",alignItems:"center",textDecoration:"none"}}>{index+1} / {files.images.length}장 이미지 저장</a>
        <img src={files.urls[index]} alt={`견적서 ${index+1} / ${files.images.length}장`} style={{display:"block",width:"100%",maxWidth:620,height:"auto",marginTop:8}} />
      </div>)}
    </div>}
  </div>;
}
