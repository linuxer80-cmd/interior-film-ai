"use client";

import {useEffect,useState} from "react";
import {tradeApi} from "../../components/TradeClients";

export default function SiteTradeSummary({siteId,active=true,onChange}) {
  const [state,setState]=useState({siteId:null,loading:true,data:null,error:""});
  const [attempt,setAttempt]=useState(0);
  useEffect(()=>{
    if(!active || !siteId)return;
    let alive=true,version=0;
    async function load(){
      const current=++version;
      setState({siteId,loading:true,data:null,error:""});
      try{
        const data=await tradeApi();
        if(!data?.sites?.some(site=>site.id===siteId))throw Error("이 현장의 거래처 연결 정보를 확인하지 못했습니다.");
        if(alive&&version===current)setState({siteId,loading:false,data,error:""});
      }catch(error){if(alive&&version===current)setState({siteId,loading:false,data:null,error:error.message||"거래처 연결 정보를 확인하지 못했습니다."});}
    }
    void load();
    window.addEventListener("trade-clients-changed",load);
    return()=>{alive=false;version++;window.removeEventListener("trade-clients-changed",load);};
  },[siteId,active,attempt]);
  if(!active)return null;
  const saved=state.siteId===siteId?state.data:null;
  const site=saved?.sites.find(row=>row.id===siteId);
  const client=site?.client_name || saved?.clients?.find(row=>row.id===site?.client_id)?.name;
  const contact=site?.contact_name || saved?.contacts?.find(row=>row.id===site?.contact_id)?.name;
  return <section aria-label="현장 거래처 연결 요약" aria-busy={state.loading} style={{padding:16,marginTop:16,border:"1px solid #dfe4d7",borderRadius:14,background:"#fffefa",color:"#29392e"}}>
    <h3 style={{fontSize:16,margin:"0 0 12px"}}>고객 구분·거래처</h3>
    {state.siteId!==siteId||state.loading?<p role="status">저장된 거래처 연결을 확인하고 있습니다…</p>:state.error?<div role="alert"><p>{state.error}</p><button type="button" onClick={()=>setAttempt(n=>n+1)}>다시 확인</button></div>:site&&<dl style={{display:"grid",gridTemplateColumns:"90px minmax(0,1fr)",gap:10,fontSize:14}}>
      <dt>고객 구분</dt><dd style={{margin:0}}>{site.client_id?"업체 고객":"개인 고객"}</dd>
      <dt>거래처</dt><dd style={{margin:0,overflowWrap:"anywhere"}}>{site.client_id?client||"거래처 확인 필요":"해당 없음"}</dd>
      <dt>담당자</dt><dd style={{margin:0,overflowWrap:"anywhere"}}>{site.contact_id?contact||"담당자 확인 필요":"미지정"}</dd>
    </dl>}
    {onChange&&<button type="button" onClick={onChange} style={{minHeight:44,padding:"10px 14px",border:"1px solid #d5dfcd",borderRadius:10,background:"white",color:"#285340",fontWeight:700,cursor:"pointer"}}>거래처 변경 →</button>}
  </section>;
}
