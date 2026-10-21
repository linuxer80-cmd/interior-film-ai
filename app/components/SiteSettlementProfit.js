"use client";

import {useEffect,useState} from "react";
import {reportRequest} from "../utils/reportClient";
import {profitState} from "../../lib/settlementFlow.mjs";
import {revenueSourceLabel} from "../../lib/siteRevenue.mjs";

const won = value => value == null ? "확인 필요" : `${Number(value).toLocaleString("ko-KR")}원`;
export default function SiteSettlementProfit({siteId,onNavigate}) {
  const [state,setState]=useState({loading:true,data:null,error:""});
  const [attempt,setAttempt]=useState(0);
  useEffect(()=>{
    const changed=event=>{if(event.detail?.siteId===siteId)setAttempt(n=>n+1);};
    window.addEventListener("site-materials-changed",changed);
    return()=>window.removeEventListener("site-materials-changed",changed);
  },[siteId]);
  useEffect(()=>{
    let alive=true;
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),20000);
    setState({loading:true,data:null,error:""});
    reportRequest(`/api/admin/profit?siteId=${encodeURIComponent(siteId)}`,undefined,{signal:controller.signal})
      .then(data=>{if(!data.sites?.some(site=>site.id===siteId))throw Error("현장 비용을 확인하지 못했습니다.");if(alive)setState({loading:false,data,error:""});})
      .catch(error=>{if(alive)setState({loading:false,data:null,error:error.name==="AbortError"?"비용 조회가 지연됩니다. 다시 확인해주세요.":error.message});})
      .finally(()=>clearTimeout(timer));
    return()=>{alive=false;clearTimeout(timer);controller.abort();};
  },[siteId,attempt]);
  const site=state.data?.sites.find(item=>item.id===siteId);
  const summary=profitState(site);
  return <section aria-label="이 현장 실제 수익" aria-busy={state.loading} className="profit-detail">
    <div className="heading"><h3>이 현장 실제 수익</h3><button type="button" disabled={state.loading} onClick={()=>setAttempt(n=>n+1)}>다시 확인</button></div>
    {state.loading ? <p role="status">실제 비용을 불러오는 중…</p> : state.error ? <p role="alert">{state.error}</p> : <>
      <div className="result"><span>{summary.pending?"수익 확인 필요":"현재 등록 비용 기준 수익"}</span><strong>{summary.pending?"확인 필요":won(site.profit)}</strong></div>
      {summary.pending && <div className="notice"><strong>먼저 확인할 항목</strong>{summary.reasons.map(reason=><p key={reason}>{reason}</p>)}</div>}
      <dl><dt>{revenueSourceLabel(site.revenueSource)}</dt><dd>{site.missingContract?"확인 필요":won(site.revenue)}</dd><dt>실제 인건비</dt><dd>{site.laborPending?"일당·수당 확인 필요":won(site.labor)}</dd><dt>실제 자재비</dt><dd>{site.materialPending?"사용량·단가 확인 필요":`${won(site.material)}${site.materialProvisional?" · 잠정":""}`}</dd><dt>현장 경비</dt><dd>{won(site.expense)}</dd></dl>
      <p>매출 − 인건비 − 자재비 − 경비</p><p className="hint">등록된 금액 기준입니다. 매출과 매입원가의 부가세 포함·제외 기준을 확인해주세요. 수금·인건비 지급 여부는 별도로 관리합니다.</p>
      <details><summary>비용 상세 보기</summary>{[["labor","인건비"],["material","자재비"],["expense","경비"]].map(([key,label])=><div key={key}><h4>{label}</h4>{(state.data.breakdown?.[key]||[]).filter(row=>row.siteId===siteId).map((row,index)=><p key={index}>{row.name||row.product||row.description||label} · {row.pricePending||row.quantityPending?"확인 필요":won(row.amount)}</p>)}</div>)}</details>
      {onNavigate ? <button type="button" onClick={()=>onNavigate("materials",{id:"price"})}>자재 단가·사용량 확인 →</button> : <a href={`/admin?tab=sites&site=${encodeURIComponent(siteId)}&section=material-prices`} data-ui-link="action">자재 단가·사용량 확인 →</a>}
    </>}
    <style jsx>{`
      .profit-detail{padding:16px;background:#fffefa;border:1px solid #dfe4d7;border-radius:16px;margin-top:14px;color:#29392e}
      .heading{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}h3{font-size:17px;margin:0}p{font-size:13px;line-height:1.6;overflow-wrap:anywhere}button,a{display:inline-flex;align-items:center;min-height:44px;padding:10px 12px;border:1px solid #d5dfcd;border-radius:10px;background:white;color:#285340;font-size:14px;cursor:pointer}button:disabled{opacity:.5}.result{padding:16px;background:#edf3e8;border-radius:12px;margin:12px 0}.result strong{display:block;font-size:26px;margin-top:8px}.notice{padding:12px;border-radius:12px;background:#fff2dd}.notice p{margin:6px 0}.hint{color:#53665a}dl{display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:14px}dd{margin:0;text-align:right;overflow-wrap:anywhere}summary{min-height:44px;cursor:pointer;padding:12px 0}
    `}</style>
  </section>;
}
