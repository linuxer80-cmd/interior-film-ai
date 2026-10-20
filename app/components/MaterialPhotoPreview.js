"use client";
import { useEffect, useRef } from "react";

export default function MaterialPhotoPreview({ photo, onClose }) {
  const dialog = useRef(null);
  const closeButton = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.showModal();
    closeButton.current?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  return <dialog ref={dialog} aria-label={`${photo.label} 사진 크게 보기`}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onKeyDown={event => event.stopPropagation()}
    onClick={event => { event.stopPropagation(); if (event.target === dialog.current) onClose(); }}
    style={{ maxWidth: "94vw", width: 640, maxHeight: "90dvh", padding: 16, border: "1px solid #d8dfd0", borderRadius: 18, background: "#fffefb", color: "#29392e" }}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 12 }}>
      <strong>{photo.label}</strong>
      <button ref={closeButton} type="button" onClick={onClose} style={{ minHeight: 44, padding: "8px 14px", border: "1px solid #d8dfd0", borderRadius: 10, background: "#edf3e8", color: "#355940" }}>닫기</button>
    </div>
    <img src={photo.url} alt={`${photo.label} 필름 샘플 확대`} style={{ width: "100%", maxHeight: "72dvh", objectFit: "contain", display: "block", borderRadius: 10 }} />
  </dialog>;
}
