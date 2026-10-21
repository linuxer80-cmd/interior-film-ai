"use client";
import {useState} from 'react';
import StockMovementHistory from './StockMovementHistory';
export default function RollMovementHistory({rollId}) {
  const [open,setOpen]=useState(false);
  return <details onToggle={event=>setOpen(event.currentTarget.open)} style={{margin:'16px 0',borderTop:'1px solid #d7ddd5',paddingTop:12}}>
    <summary style={{cursor:'pointer',fontWeight:800,color:'#315746',padding:'12px 0',minHeight:44,boxSizing:'border-box'}}>사용 현장 · 반출·반납 기록 보기</summary>
    {open&&<StockMovementHistory rollId={rollId}/>}
  </details>;
}
