"use client";

import {useEffect,useRef} from "react";
import {createPortal} from "react-dom";
import useAdminOverlayBack from "../../lib/useAdminOverlayBack";
import AdminTodayTasks from "./AdminTodayTasks";

export default function AdminTodayDialog({companyId,onClose}) {
  const dialog=useRef(null);
  const close=useAdminOverlayBack(true,onClose,()=>true,1600);
  useEffect(()=>{
    const previousFocus=document.activeElement;
    const previousOverflow=document.body.style.overflow;
    document.body.style.overflow="hidden";
    dialog.current?.querySelector("button")?.focus();
    return()=>{
      document.body.style.overflow=previousOverflow;
      if(previousFocus?.isConnected)previousFocus.focus();
    };
  },[]);
  function keyDown(event) {
    if(event.key==="Escape"){event.preventDefault();event.stopPropagation();close();return;}
    if(event.key!=="Tab")return;
    const controls=[...dialog.current.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary')].filter(node=>node.getClientRects().length);
    const first=controls[0],last=controls[controls.length-1];
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
  }
  return createPortal(<div className="today-overlay" onClick={close}>
    <section ref={dialog} role="dialog" aria-modal="true" aria-labelledby="admin-today-dialog-title" className="today-dialog" onClick={event=>event.stopPropagation()} onKeyDown={keyDown}>
      <header><div><h2 id="admin-today-dialog-title">오늘 할 일</h2><p>현장별로 필요한 작업을 확인하세요.</p></div><button type="button" onClick={close} aria-label="오늘 할 일 닫기">닫기 ×</button></header>
      <div className="today-body"><AdminTodayTasks companyId={companyId} embedded /></div>
    </section>
    <style jsx>{`
      .today-overlay{position:fixed;inset:0;z-index:3000;background:rgba(25,39,30,.4);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box}
      .today-dialog{display:flex;flex-direction:column;width:100%;max-width:900px;height:calc(100dvh - 32px);min-height:0;background:#f8f7f3;color:#29392e;border-radius:20px;overflow:hidden;box-shadow:0 20px 60px #0003}
      header{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-shrink:0;padding:16px 20px;background:#fffefa;border-bottom:1px solid #dfe4d7}h2{font-size:22px;margin:0}p{font-size:13px;color:#53665a;margin:6px 0 0}button{flex-shrink:0;min-height:44px;padding:10px 14px;border:1px solid #d5dfcd;border-radius:12px;background:white;color:#285340;font-weight:700;cursor:pointer}.today-body{padding:16px;overflow-y:auto;overscroll-behavior:contain;min-height:0}
      @media(max-width:600px){.today-overlay{padding:0}.today-dialog{height:100dvh;max-width:none;border-radius:0}header{padding:14px 16px}.today-body{padding:12px 12px calc(20px + env(safe-area-inset-bottom))}}
    `}</style>
  </div>,document.body);
}
