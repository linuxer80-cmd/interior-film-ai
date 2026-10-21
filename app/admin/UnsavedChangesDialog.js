"use client";
import { useEffect, useRef } from "react";

export default function UnsavedChangesDialog({ request, onContinue, onDiscard }) {
  const dialog = useRef(null);
  useEffect(() => {
    if (request && !dialog.current.open) dialog.current.showModal();
    else if (!request && dialog.current.open) dialog.current.close();
  }, [request]);
  return <dialog ref={dialog} aria-labelledby="site-unsaved-title" onCancel={event => { event.preventDefault(); onContinue(); }}>
    <h3 id="site-unsaved-title">{request?.busy ? "저장 상태를 확인해주세요" : "저장하지 않은 변경이 있어요"}</h3>
    <p>{request?.labels?.join(" · ")}</p>
    <p>{request?.busy ? "저장 중이거나 결과 확인이 필요한 작업이 있습니다. 저장 결과를 확인한 뒤 이동해주세요." : "계속 수정하거나, 저장하지 않은 변경을 취소하고 이동할 수 있습니다."}</p>
    <div>
      <button autoFocus type="button" onClick={onContinue}>{request?.busy ? "돌아가기" : "계속 수정"}</button>
      {!request?.busy && <button type="button" onClick={onDiscard}>변경 취소하고 이동</button>}
    </div>
    <style jsx>{`
      dialog { width: min(420px, calc(100vw - 40px)); box-sizing: border-box; border: 1px solid #dfe4d7; border-radius: 18px; padding: 20px; color: #29392e; background: #fffefa; }
      dialog::backdrop { background: rgba(25,39,60,.48); }
      h3 { margin: 0 0 12px; font-size: 18px; }
      p { line-height: 1.6; overflow-wrap: anywhere; }
      div { display: flex; flex-wrap: wrap; gap: 8px; }
      button { min-height: 44px; padding: 10px 14px; border-radius: 10px; border: 1px solid #cad8c6; background: white; color: #285340; font-weight: 800; cursor: pointer; }
      button:first-child { background: #285340; color: white; }
    `}</style>
  </dialog>;
}
