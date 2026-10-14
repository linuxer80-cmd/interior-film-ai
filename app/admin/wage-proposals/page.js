"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {supabase} from "../../../lib/supabase";

export default function WageProposalsPage(){
 const [rows,setRows]=useState([]),[wages,setWages]=useState({});
 const [busy,setBusy]=useState(""),[message,setMessage]=useState("");
 async function api(path,body){
  const {data}=await supabase.auth.getSession();
  if(!data?.session)throw Error("관리자 로그인이 필요합니다.");
  const response=await fetch(path,{method:body?"POST":"GET",cache:"no-store",
   headers:{Authorization:"Bearer "+data.session.access_token,...(body?{"Content-Type":"application/json"}:{})},
   ...(body?{body:JSON.stringify(body)}:{})});
  const result=await response.json();
  if(!response.ok)throw Error(result.error||"요청 실패");
  return result;
 }
 async function load(){
  try{const result=await api("/api/admin/wage-proposals");setRows(result.items||[]);}
  catch(e){setMessage(e.message);}
 }
 useEffect(()=>{void load();},[]);
 async function propose(item){
  const key=item.site_id+":"+item.worker_id+":"+item.work_date;
  const wage=Number(wages[key]);
  if(!Number.isSafeInteger(wage)||wage<=0){setMessage("합의 일당을 숫자로 입력해주세요.");return;}
  setBusy(key);setMessage("");
  try{
   await api("/api/worker/wage-agreements",{action:"propose",siteId:item.site_id,workerId:item.worker_id,workDate:item.work_date,wage});
   setMessage("시공자에게 일당 확인 요청을 등록했습니다.");await load();
  }catch(e){setMessage(e.message);}
  finally{setBusy("");}
 }
 return <main style={{maxWidth:720,margin:"0 auto",padding:18}}>
  <Link href="/admin">관리자 홈으로</Link>
  <h1>프리랜서 일당 미확정</h1>
  <p>현장별 합의 일당을 제안하면 시공자가 확인 후 승인할 수 있습니다.</p>
  {message&&<p role="status">{message}</p>}
  {!rows.length&&<p>미확정 배정이 없거나 아직 불러오지 못했습니다.</p>}
  {rows.map(item=>{const key=item.site_id+":"+item.worker_id+":"+item.work_date;return <section key={key} style={{border:"1px solid #cbd5e1",borderRadius:14,padding:14,marginBottom:12}}>
   <strong>{item.site_name} / {item.worker_name}</strong>
   <p>{item.work_date} / 일당 미확정</p>
   <label>현장별 합의 일당 (원)
    <input type="number" min="1" max="100000000" value={wages[key]||""} onChange={e=>setWages(v=>({...v,[key]:e.target.value}))} style={{display:"block",width:"100%",padding:10,boxSizing:"border-box"}}/>
   </label>
   <button disabled={!!busy} onClick={()=>propose(item)} style={{padding:12,marginTop:10}}>일당 확인 요청</button>
  </section>})}
 </main>;
}
