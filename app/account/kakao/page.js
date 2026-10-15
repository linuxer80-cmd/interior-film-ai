"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabase";

const pendingKey = "film-kakao-link";
export default function KakaoAccount() {
  const [user,setUser]=useState(null);
  const [ready,setReady]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const lock=useRef(false);
  useEffect(()=>{
    let active=true;
    supabase.auth.getUser().then(({data,error})=>{
      if(active){setUser(error?null:data?.user);setReady(true);}
    }).catch(()=>{if(active){setError("계정을 확인하지 못했습니다. 새로고침해주세요.");setReady(true);}});
    return ()=>{active=false;};
  },[]);
  async function connect(){
    if(lock.current)return;
    lock.current=true;setBusy(true);setError("");
    try{
      const {data,error:failure}=await supabase.auth.getUser();
      if(failure||!data?.user)throw Error("기존 이메일 계정으로 먼저 로그인해주세요.");
      if(data.user.identities?.some(i=>i.provider==="kakao")){setUser(data.user);return;}
      const callback=new URL("/auth/kakao",window.location.origin);
      callback.searchParams.set("mode","link");
      sessionStorage.setItem(pendingKey,JSON.stringify({userId:data.user.id,createdAt:Date.now()}));
      const result=await supabase.auth.linkIdentity({provider:"kakao",options:{redirectTo:callback.toString()}});
      if(result.error)throw result.error;
      if(!result.data?.url)throw Error("카카오 연결 주소를 받지 못했습니다.");
    }catch(e){
      sessionStorage.removeItem(pendingKey);
      const code=String(e.code||"")+" "+String(e.message||"");
      setError(/manual.*link.*disabled|manual_linking_disabled/i.test(code)
        ?"계정 연결 기능이 아직 활성화되지 않았습니다. 서비스 관리자에게 문의해주세요."
        :/identity_already_exists|already.*linked/i.test(code)
        ?"이 카카오는 다른 회원 계정에 연결되어 있습니다. 기존 계정과 별도 가입 계정 확인이 필요합니다. 업체를 다시 만들지 마세요."
        :"카카오 연결을 시작하지 못했습니다. 로그인 상태를 확인하고 다시 시도해주세요.");
    }finally{lock.current=false;setBusy(false);}
  }
  const linked=user?.identities?.some(i=>i.provider==="kakao");
  return <main style={{maxWidth:480,margin:"40px auto",padding:24}}>
    <h1>카카오 계정 연결</h1>
    {!ready?<p role="status">계정을 확인하고 있습니다…</p>:!user?
      <p>기존 이메일 계정으로 로그인한 후 이 화면에서 연결해주세요. <Link href="/login">로그인하기</Link></p>:
      <>
        <p>현재 계정: {user.email||"이메일 없는 계정"}</p>
        <p>카카오 이메일이 달라도 연결할 수 있습니다. 연결 후에는 기존 업체와 이용 내역을 카카오 로그인으로 이용할 수 있습니다.</p>
        {linked?<p role="status">카카오 연결 완료 · 다음부터 카카오로 로그인할 수 있습니다.</p>:
          <button type="button" onClick={connect} disabled={busy} style={{width:"100%",padding:16,border:0,borderRadius:12,background:"#FEE500",color:"#191919",fontWeight:800}}>
            {busy?"카카오 인증으로 이동 중…":"다음부터 카카오로 로그인하기"}
          </button>}
      </>}
    {error&&<p role="alert">{error}</p>}
    <p><Link href="/admin">관리자 홈</Link> · <Link href="/worker/account">시공자 개인설정</Link></p>
  </main>;
}
