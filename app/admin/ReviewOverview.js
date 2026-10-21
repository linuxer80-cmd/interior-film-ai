"use client";
import { useEffect, useState } from "react";
import { reportRequest } from "../utils/reportClient";
import { reviewOverview, reviewPaymentAction } from "../../lib/reviewOverview.mjs";
const money = value => `${Number(value || 0).toLocaleString("ko-KR")}원`;
const button = {minHeight:44,padding:"10px 12px",border:"1px solid #d5dfcd",borderRadius:10,background:"white",color:"#285340",fontWeight:800,cursor:"pointer"};
export default function ReviewOverview({siteId,data,onShow,onNavigate,disabled}) {
  const [state,setState]=useState({loading:true,operations:null,payment:null,error:""});
  const [attempt,setAttempt]=useState(0);
  const status=data.review?.status || data.report?.review_status || "pending";
  useEffect(()=>{
    let alive=true;
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),15000);
    setState({loading:true,operations:null,payment:null,error:""});
    (async()=>{
      const paths=["/api/site-operations",...(status==="approved"?["/api/admin/receivables"]:[])];
      const results=await Promise.allSettled(paths.map(path=>reportRequest(`${path}?siteId=${encodeURIComponent(siteId)}`,undefined,{signal:controller.signal})));
      const operations=results[0].status==="fulfilled" && Array.isArray(results[0].value.materials)?results[0].value:null;
      const payment=results[1]?.status==="fulfilled"?results[1].value:null;
      if(alive)setState({loading:false,operations,payment,error:[...(!operations?["반출·반납"]:[]),...(status==="approved"&&!payment?["입금"]:[])].join(" · ")});
    })().finally(()=>clearTimeout(timeout));
    return ()=>{alive=false;clearTimeout(timeout);controller.abort();};
  },[siteId,status,data.report?.updated_at,attempt]);
  const summary=reviewOverview(data,state.operations);
  const payment=reviewPaymentAction(state.payment);
  return <section aria-label="완료보고 요약" aria-busy={state.loading}>
    <h3>완료보고 한눈에 보기</h3>
    <p>{data.worker?.name || "제출자 정보 없음"} · {status==="approved"?"승인 완료":status==="rejected"?"보완 요청됨":"검수 대기"}</p>
    {summary.checks.length>0 && <div className="notice"><strong>확인이 필요한 항목</strong>{summary.checks.map(item=><div key={item.id}><p>{item.text}</p><button type="button" disabled={disabled} onClick={()=>onShow(item.view)}>{item.view==="cost"?"자재 내역 확인":"제출 내용 확인"} →</button></div>)}</div>}
    {summary.unpriced.length>0 && <div className="notice"><strong>원가 단가 미입력 {summary.unpriced.length}건 · 원가 정리 필요</strong><p>{summary.unpriced.map(item=>item.product_code||item.product_name||item.brand).join(" · ")}</p><p>원가 입력과 시공 완료 검수는 별개입니다. 단가 미입력만으로 승인을 막지 않습니다. 원가가 입력되어야 자재비·수익을 정확히 확인할 수 있습니다.</p><button type="button" disabled={disabled} onClick={()=>onShow("cost")}>원가 확인·입력 →</button></div>}
    {state.loading && <p role="status">반출·반납{status==="approved"?"과 입금":""} 내역 확인 중…</p>}
    {state.error && <div role="alert"><p>{state.error} 내역을 확인하지 못했습니다.</p><button type="button" disabled={disabled} onClick={()=>setAttempt(value=>value+1)}>다시 확인</button></div>}
    <div className="box"><strong>시공 내용</strong><p style={{whiteSpace:"pre-wrap"}}>{data.report.work_summary||"미입력"}</p><button type="button" disabled={disabled} onClick={()=>onShow("content")}>내용·메모 보기 →</button></div>
    <div className="box"><strong>완료사진 {data.afterPhotos?.length||0}장 · 시공 전 {data.beforePhotos?.length||0}장</strong><div className="photos">{(data.afterPhotos||[]).slice(0,4).map((photo,index)=>{const src=photo.signed_url||photo.photo_url;return src?<a key={photo.id||index} href={src} target="_blank" rel="noreferrer"><img src={src} alt={`완료사진 ${index+1}`} /></a>:<p key={photo.id||index}>사진 조회 불가</p>;})}</div><button type="button" disabled={disabled} onClick={()=>onShow("photos")}>전체 사진 보기 →</button></div>
    <div className="box"><strong>실제 사용 자재 {data.materials?.length||0}건</strong>{(data.materials||[]).map((item,index)=><p key={item.id||index}>{[item.brand,item.product_code||item.product_name].filter(Boolean).join(" ")} · {item.quantity}{item.unit}</p>)}<p>경비 {summary.expenseItems.length}건 · {money(summary.expenseTotal)}</p><p>추가 자재비 {summary.extraMaterials.length}건 · {money(summary.extraMaterialTotal)}</p>{summary.laborRows.length>0 && <p>별도 등록된 인건비 {summary.laborRows.length}건 · {money(summary.laborTotal)}</p>}<button type="button" disabled={disabled} onClick={()=>onShow("cost")}>자재·경비 상세 보기 →</button></div>
    {status==="pending" && <div className="box"><p>시공 내용·사진을 확인한 뒤 승인하거나 보완을 요청하세요.</p><button type="button" disabled={disabled} onClick={()=>onShow("review")} style={{...button,background:"#285340",color:"white",width:"100%"}}>승인·보완 요청 →</button></div>}
    {status==="rejected" && <div className="notice"><strong>시공자에게 보완을 요청했습니다.</strong><p style={{whiteSpace:"pre-wrap"}}>{data.review?.memo||data.report.review_memo}</p><p>시공자가 다시 제출하면 검수할 수 있습니다.</p></div>}
    {status==="approved" && <div className="box"><strong>검수 승인 완료 · 다음 업무</strong><p>{state.loading?"입금 내역 확인 중…":payment.text}</p>{onNavigate && <button type="button" disabled={disabled||state.loading} onClick={()=>onNavigate("settlement")}>{payment.label} →</button>}<button type="button" disabled={disabled} onClick={()=>onShow("review")} style={{marginLeft:8}}>승인 내역·견적자료 등록</button></div>}
    <style jsx>{`
      h3 { font-size:18px; margin:12px 0; }
      p { font-size:14px; line-height:1.6; overflow-wrap:anywhere; margin:8px 0; }
      .box,.notice { border:1px solid #dfe4d7; padding:14px; border-radius:14px; margin:12px 0; background:#fffefa; }
      .notice { background:#fff8eb; border-color:#ead6ae; }
      button { min-height:44px; padding:10px 12px; border:1px solid #d5dfcd; border-radius:10px; background:white; color:#285340; font-weight:800; cursor:pointer; }
      button:disabled { opacity:.6; cursor:wait; }
      .photos { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; margin:12px 0; }
      img { width:100%; aspect-ratio:1; object-fit:cover; border-radius:10px; }
      button:focus-visible,a:focus-visible { outline:2px solid #315c91; outline-offset:3px; }
    `}</style>
  </section>;
}
