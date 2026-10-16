'use client';
import {useEffect,useRef} from 'react';
import {registerAdminOverlay} from './adminOverlayHistory.mjs';
export default function useAdminOverlayBack(open,onClose,canClose=()=>true,priority=0){
 const current=useRef({onClose,canClose});current.current={onClose,canClose};
 const guard=useRef(null);
 useEffect(()=>{
  if(!open||!window.location.pathname.startsWith('/admin'))return;
  const entry=registerAdminOverlay(window,{onClose:()=>current.current.onClose?.(),canClose:()=>current.current.canClose(),priority});
  guard.current=entry;
  return()=>{entry.dispose();guard.current=null;};
 },[Boolean(open),priority]);
 return ()=>{if(guard.current)guard.current.close();else if(current.current.canClose())current.current.onClose?.();};
}
