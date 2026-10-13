"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../../../lib/supabase";
import { confirmEmailDomain } from "../../../../lib/emailDomainGuard";

async function request(action,code,relationshipType){
 const {data}=await supabase.auth.getSession();
 if(!data?.session?.access_token)throw Error("로그인 후 초대를 확인해주세요.");
 const response=await fetch("/api/direct-worker-invites",{
  method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+data.session.access_token},
  body:JSON.stringify({action,code,relationshipType}),cache:"no-store"
 });
 const result=await response.json();
 if(!response.ok)throw Error(result.error||"요청에 실패했습니다.");
 return result;
}
export default function DirectWorkerInvitePage(){
 const params=useParams(),router=useRouter(),code=params?.code;
 const [session,setSession]=useState(null),[preview,setPreview]=useState(null);
 const [email,setEmail]=useState(""),[password,setPassword]=useState("");
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(""),[done,setDone]=useState(false);
 const [consented,setConsented]=useState(false);
 useEffect(()=>{
  let alive=true;
  supabase.auth.getSession().then(({data})=>{if(alive)setSession(data.session||null);});
  const {data:sub}=supabase.auth.onAuthStateChange((_event,s)=>{if(alive)setSession(s);});
  return ()=>{alive=false;sub.subscription.unsubscribe();};
 },[]);
 useEffect(()=>{
  if(!session?.access_token||!code)return;
  let alive=true;
  request("preview",code).then(v=>{if(alive)setPreview(v);}).catch(e=>{if(alive)setMessage(e.message);});
  return ()=>{alive=false;};
 },[session?.access_token,code]);
 async function signup(event){
  event.preventDefault();if(busy)return;
  if(!confirmEmailDomain(email))return;
  setBusy(true);setMessage("");
  try{
   const redirect=window.location.origin+"/worker/direct-invite/"+encodeURIComponent(code);
   const {data,error}=await supabase.auth.signUp({email:email.trim(),password,options:{
    data:{registration_type:"worker"},emailRedirectTo:redirect
   }});
   if(error)throw error;
   if(data.session){setSession(data.session);setMessage("가입되었습니다. 아래 초대 내용을 확인하고 수락해주세요.");}
   else setMessage("인증 메일을 보냈습니다. 메일에서 인증을 완료하면 초대 화면으로 돌아와 수락할 수 있습니다.");
  }catch(e){setMessage(e.message);}finally{setBusy(false);}
 }
 async function act(action){
  if(busy)return;setBusy(true);setMessage("");
  try{const result=await request(action,code);setDone(true);setMessage(action==="accept"?
   result.companyName+" 업체에 연결되었습니다.":"초대를 거부했습니다.");}
  catch(e){
   if(action==="accept" && /개인 프로필|이름과 연락처|기본 일당/.test(e.message)){
    router.push("/worker/account?invite="+encodeURIComponent(code));
    return;
   }
   setMessage(e.message);
  }finally{setBusy(false);}
 }
 return <main style={{maxWidth:560,margin:"24px auto",padding:22,borderRadius:16,background:"#fff",color:"#172b4d"}}>
  <h1>시공자 업체 초대</h1>
  {message&&<p role="status" style={{padding:10,background:"#f1f5f9",borderRadius:8}}>{message}</p>}
  {!session?<section>
   <p>처음 이용한다면 회원가입하세요. 기존 회원은 로그인 후 초대를 수락할 수 있습니다.</p>
   <form onSubmit={signup} style={{display:"grid",gap:10}}>
    <input type="email" required placeholder="이메일" value={email} onChange={e=>setEmail(e.target.value)} style={{padding:12}}/>
    <input type="password" minLength={6} required placeholder="비밀번호 (6자 이상)" value={password} onChange={e=>setPassword(e.target.value)} style={{padding:12}}/>
    <button type="submit" disabled={busy} style={{padding:12}}>신규 회원가입</button>
   </form>
   <p><Link href={`/worker/login?next=${encodeURIComponent("/worker/direct-invite/"+code)}`}>이미 가입했다면 로그인</Link></p>
  </section>:!done?<section>
   {preview?<><h2>{preview.companyName}</h2><p><strong>{preview.relationshipType==="employee"?"소속 직원":"협력 프리랜서"}</strong> 초대입니다.</p>
    <p>본인 계정으로 수락하면 해당 업체의 시공자 명단에 등록됩니다. 다른 업체 소속과 기존 근무 기록은 유지됩니다.</p>
    <p>초대 수락을 누르세요. 프로필이 필요한 경우 작성 후 저장하면 연결을 이어서 완료합니다.</p>
    {preview.status==="pending"?<div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
     <button disabled={busy} onClick={()=>{setConsented(true);act("accept");}} style={{padding:"13px 18px",background:"#163153",color:"#fff",border:0,borderRadius:10,fontWeight:800,flex:2}}>{busy?"처리 중…":"초대 수락하고 연결하기"}</button>
     <button disabled={busy} onClick={()=>act("decline")} style={{padding:12,borderRadius:10,flex:1}}>거부</button>
    </div>:<p>이미 처리된 초대입니다: {preview.status}</p>}
   </>:<p>초대 정보를 확인하는 중입니다.</p>}
  </section>:<p><Link href="/worker">시공자 홈으로 이동</Link></p>}
 </main>;
}
