"use client";
import {useState} from "react";
import {supabase} from "../../../lib/supabase";

async function api(body){
 const {data}=await supabase.auth.getSession();
 if(!data?.session?.access_token)throw Error("로그인이 필요합니다.");
 const response=await fetch("/api/direct-worker-invites",{
  method:"POST",cache:"no-store",
  headers:{"Content-Type":"application/json",Authorization:"Bearer "+data.session.access_token},
  body:JSON.stringify(body)
 });
 const result=await response.json();
 if(!response.ok)throw Error(result.error||"초대 요청 실패");
 return result;
}
const buttonStyle={padding:"12px 14px",borderRadius:11,border:"1px solid #cbd5e1",background:"#fff",fontWeight:750,cursor:"pointer"};
export default function DirectWorkerInvites(){
 const [type,setType]=useState("freelancer");
 const [invite,setInvite]=useState(null);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const [error,setError]=useState("");
 const selectedType=invite?.type||type;
 const inviteText="시공업체에서 "+(selectedType==="employee"?"소속 직원":"협력 프리랜서")+"으로 초대했습니다. 아래 링크에서 확인하고 수락해주세요.\n"+(invite?.url||"");

 async function create(){
  if(busy)return;
  setBusy(true);setMessage("");setError("");
  try{
   const result=await api({action:"create",relationshipType:type});
   if(!result?.code)throw Error("초대링크 생성 결과를 확인해주세요.");
   setInvite({url:window.location.origin+"/worker/direct-invite/"+result.code,type});
   setMessage("초대 준비 완료 · 7일 이내에 보내주세요.");
  }catch(e){setError(e.message||"초대링크를 생성하지 못했습니다.");}
  finally{setBusy(false);}
 }
 async function copy(){
  if(!invite)return;
  try{await navigator.clipboard.writeText(inviteText);setMessage("초대 문구와 링크를 복사했습니다.");}
  catch{setError("자동 복사가 지원되지 않습니다. 아래 링크를 길게 눌러 복사해주세요.");}
 }
 async function share(){
  if(!invite)return;
  setError("");
  if(navigator.share){
   try{await navigator.share({title:"시공자 초대",text:inviteText});return;}
   catch(e){if(e?.name==="AbortError")return;}
  }
  await copy();
  setMessage("카카오톡을 열어 복사한 초대 문구를 붙여넣어 보내주세요.");
 }
 function sms(){
  if(!invite)return;
  const separator=/iPad|iPhone|iPod/i.test(navigator.userAgent)?"&":"?";
  window.location.href="sms:"+separator+"body="+encodeURIComponent(inviteText);
 }
 function choose(value){
  setType(value);setInvite(null);setMessage("");setError("");
 }
 return <section style={{background:"#fff",padding:14,border:"1px solid #dce2e6",borderRadius:14}}>
  <h3 style={{margin:"0 0 6px",fontSize:17}}>어떤 관계로 초대할까요?</h3>
  <p style={{fontSize:13,color:"#64748b",margin:"0 0 14px"}}>관리자는 시공자를 미리 등록하지 않아도 됩니다. 시공자가 수락하면 업체 명단에 연결됩니다.</p>
  <div role="radiogroup" aria-label="초대 관계 유형" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9,marginBottom:12}}>
   {[["freelancer","협력 프리랜서","일당은 시공자 본인이 설정"],["employee","소속 직원","일당은 업체가 관리"]].map(([id,label,help])=>
    <label key={id} style={{padding:12,borderRadius:12,border:type===id?"2px solid #2563eb":"1px solid #cbd5e1",background:type===id?"#eff6ff":"#fff",cursor:"pointer"}}>
     <input type="radio" name="directWorkerType" checked={type===id} onChange={()=>choose(id)}/>
     <strong style={{fontSize:13}}> {label}</strong>
     <small style={{display:"block",marginTop:5,color:"#64748b",fontSize:11}}>{help}</small>
    </label>)}
  </div>
  {!invite?<button type="button" disabled={busy} onClick={create} style={{...buttonStyle,width:"100%",background:"#163153",color:"#fff",border:0}}>
   {busy?"초대링크 생성 중…":"초대링크 만들기"}
  </button>:<div style={{display:"grid",gap:9}}>
   <p style={{fontSize:13,fontWeight:800,color:"#166534",margin:0}}>✓ {selectedType==="employee"?"소속 직원":"협력 프리랜서"} 초대 준비 완료</p>
   <button type="button" onClick={share} style={{...buttonStyle,background:"#163153",color:"#fff",border:0}}>카카오톡 등으로 보내기</button>
   <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
    <button type="button" onClick={sms} style={buttonStyle}>문자 보내기</button>
    <button type="button" onClick={copy} style={buttonStyle}>링크·문구 복사</button>
   </div>
   <input aria-label="생성된 초대링크" readOnly value={invite.url} onFocus={e=>e.target.select()} style={{padding:10,width:"100%",boxSizing:"border-box",border:"1px solid #e2e8f0",borderRadius:8}}/>
   <button type="button" onClick={()=>{setInvite(null);setMessage("");}} style={{...buttonStyle,fontSize:12}}>새 초대 만들기</button>
  </div>}
  {message&&<p role="status" style={{fontSize:12,color:"#166534"}}>{message}</p>}
  {error&&<p role="alert" style={{fontSize:12,color:"#b91c1c"}}>{error}</p>}
  <p style={{fontSize:12,color:"#64748b",marginBottom:0}}>카카오톡·문자는 관리자가 받는 사람을 직접 선택해 보냅니다. 기존 회원은 수락 후 연결되고, 신규 회원은 가입·프로필 등록을 마친 뒤 연결됩니다.</p>
 </section>;
}
