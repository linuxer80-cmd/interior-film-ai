"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {supabase} from "../../../lib/supabase";

export default function WageAgreementsPage(){
 const [items,setItems]=useState([]);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState("");
 const [message,setMessage]=useState("");
 async function api(body){
  const {data}=await supabase.auth.getSession();
  if(!data?.session)throw Error("로그인이 필요합니다.");
  const response=await fetch("/api/worker/wage-agreements",{
   method:body?"POST":"GET",cache:"no-store",
   headers:{Authorization:"Bearer "+data.session.access_token,...(body?{"Content-Type":"application/json"}:{})},
   ...(body?{body:JSON.stringify(body)}:{})
  });
  const result=await response.json();
  if(!response.ok)throw Error(result.error||"요청에 실패했습니다.");
  return result;
 }
 async function refresh(){
  try{const result=await api();setItems(result.agreements||[]);}
  catch(e){setMessage(e.message);}
  finally{setLoading(false);}
 }
 useEffect(()=>{void refresh();},[]);
 async function respond(id,accept){
  setBusy(id);setMessage("");
  try{await api({action:"respond",agreementId:id,accept});setMessage(accept?"일당이 확정되었습니다.":"제안을 거절했습니다.");await refresh();}
  catch(e){setMessage(e.message);}
  finally{setBusy("");}
 }
 return <main style={{maxWidth:650,margin:"0 auto",padding:18}}>
  <Link href="/worker">시공자 홈으로</Link>
  <h1>현장별 일당 확인</h1>
  <p>업체가 제안한 현장별 일당을 확인하세요. 개인 프로필 일당은 변경되지 않습니다.</p>
  {message&&<p role="status">{message}</p>}
  {loading?<p>불러오는 중...</p>:items.length===0?<p>현재 일당 합의 요청이 없습니다.</p>:items.map(a=><article key={a.id} style={{border:"1px solid #dbe2e8",borderRadius:14,padding:16,marginBottom:12}}>
   <strong>{a.work_date} / {Number(a.proposed_wage).toLocaleString("ko-KR")}원</strong>
   <p>{a.status==="proposed"?"확인 대기":a.status==="accepted"?"승인 완료":"거절 완료"}</p>
   <Link href={"/worker/site/"+a.site_id}>현장 보기</Link>
   {a.status==="proposed"&&<div style={{display:"flex",gap:8,marginTop:12}}>
    <button disabled={!!busy} onClick={()=>respond(a.id,true)} style={{padding:12,flex:1}}>일당 승인</button>
    <button disabled={!!busy} onClick={()=>respond(a.id,false)} style={{padding:12,flex:1}}>거절</button>
   </div>}
  </article>)}
 </main>;
}
