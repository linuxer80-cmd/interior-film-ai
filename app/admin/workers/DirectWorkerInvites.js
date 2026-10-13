"use client";
import {useState} from "react";
import {supabase} from "../../../lib/supabase";
async function api(body){
 const {data}=await supabase.auth.getSession();
 if(!data?.session?.access_token)throw Error("로그인이 필요합니다.");
 const response=await fetch("/api/direct-worker-invites",{method:"POST",cache:"no-store",
  headers:{"Content-Type":"application/json",Authorization:"Bearer "+data.session.access_token},
  body:JSON.stringify(body)});
 const result=await response.json();
 if(!response.ok)throw Error(result.error||"초대 요청 실패");
 return result;
}
export default function DirectWorkerInvites(){
 const [type,setType]=useState("freelancer"),[busy,setBusy]=useState(false);
 const [url,setUrl]=useState(""),[message,setMessage]=useState("");
 async function create(){
  if(busy)return;setBusy(true);setMessage("");setUrl("");
  try{
   const result=await api({action:"create",relationshipType:type});
   setUrl(window.location.origin+"/worker/direct-invite/"+result.code);
   setMessage("초대링크가 생성되었습니다. 7일 이내에 공유해주세요.");
  }catch(e){setMessage(e.message);}finally{setBusy(false);}
 }
 const inviteText = "시공업체에서 "+(type==="employee"?"소속 직원":"협력 프리랜서")+"으로 초대했습니다. 아래 링크에서 확인하고 수락해주세요.\\n"+url;
 async function shareKakao(){
  if(!url)return;
  if(navigator.share){
   try{await navigator.share({title:"시공자 업체 초대",text:inviteText,url});return;}
   catch(error){if(error?.name==="AbortError")return;}
  }
  await copy();
  setMessage("초대 내용을 복사했습니다. 카카오톡 채팅방에 붙여넣어 보내주세요.");
 }
 function shareSms(){
  if(!url)return;
  const separator=/iPad|iPhone|iPod/i.test(navigator.userAgent)?"&":"?";
  window.location.href="sms:"+separator+"body="+encodeURIComponent(inviteText);
 }
 async function copy(){
  try{await navigator.clipboard.writeText(inviteText);setMessage("초대링크를 복사했습니다.");}
  catch{setMessage("링크를 길게 눌러 복사해주세요.");}
 }
 return <section style={{background:"#fff",padding:16,border:"1px solid #dce2e6",borderRadius:16,marginBottom:16}}>
  <h2 style={{marginTop:0}}>시공자 바로 초대</h2>
  <p style={{fontSize:13,color:"#475569"}}>시공자를 먼저 등록하지 않아도 초대링크를 만들 수 있습니다. 수락 시 업체 시공자 명단에 자동 등록됩니다.</p>
  <div style={{display:"flex",gap:12,flexWrap:"wrap",marginBottom:12}}>
   <label><input type="radio" name="directWorkerType" checked={type==="employee"} onChange={()=>setType("employee")}/> 소속 직원</label>
   <label><input type="radio" name="directWorkerType" checked={type==="freelancer"} onChange={()=>setType("freelancer")}/> 협력 프리랜서</label>
  </div>
  <button type="button" disabled={busy} onClick={create} style={{padding:"12px 16px",borderRadius:9,background:"#163153",color:"#fff",fontWeight:800,border:0}}>
   {busy?"생성 중...":"초대링크 만들기"}
  </button>
  {message&&<p role="status">{message}</p>}
  {url&&<div style={{display:"grid",gap:8}}>
   <input readOnly aria-label="생성된 초대링크" value={url} onFocus={e=>e.target.select()} style={{padding:10,width:"100%",boxSizing:"border-box"}}/>
   <button type="button" onClick={copy}>링크 복사</button>
   <button type="button" onClick={shareKakao}>카카오톡 등으로 공유</button>
   <button type="button" onClick={shareSms}>문자로 보내기</button>
  </div>}
 </section>;
}
