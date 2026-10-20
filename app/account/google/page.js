"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabase";

const pendingKey = "film-google-link";
export default function GoogleAccount() {
  const [dealer,setDealer]=useState(false);
  const [user,setUser]=useState(null);
  const [ready,setReady]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const lock=useRef(false);
  useEffect(()=>{
    let active=true;
    setDealer(new URLSearchParams(window.location.search).get("role")==="dealer");
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
      if(data.user.identities?.some(i=>i.provider==="google")){setUser(data.user);return;}
      const callback=new URL("/auth/google",window.location.origin);
      callback.searchParams.set("mode","link");
      if(dealer)callback.searchParams.set("role","dealer");
      sessionStorage.setItem(pendingKey,JSON.stringify({userId:data.user.id,createdAt:Date.now()}));
      const result=await supabase.auth.linkIdentity({provider:"google",options:{redirectTo:callback.toString(),queryParams:{prompt:"select_account"}}});
      if(result.error)throw result.error;
      if(!result.data?.url)throw Error("구글 연결 주소를 받지 못했습니다.");
    }catch(e){
      sessionStorage.removeItem(pendingKey);
      const code=String(e.code||"")+" "+String(e.message||"");
      setError(/manual.*link.*disabled|manual_linking_disabled/i.test(code)
        ?"계정 연결 기능이 아직 활성화되지 않았습니다. 서비스 관리자에게 문의해주세요."
        :/identity_already_exists|already.*linked/i.test(code)
        ?"이 구글 계정은 다른 회원 계정에 연결되어 있습니다. 기존 계정과 별도 가입 계정 확인이 필요합니다. 업체를 다시 만들지 마세요."
        :"구글 연결을 시작하지 못했습니다. 로그인 상태를 확인하고 다시 시도해주세요.");
    }finally{lock.current=false;setBusy(false);}
  }
  async function switchAccount(){
    if(lock.current)return;
    lock.current=true;setBusy(true);setError("");
    try{
      const {error:failure}=await supabase.auth.signOut({scope:"local"});
      if(failure)throw failure;
      sessionStorage.removeItem(pendingKey);
      window.location.replace(dealer?"/dealer":"/login?role=owner");
    }catch{
      setError("계정 전환에 실패했습니다. 다시 시도해주세요.");
      lock.current=false;setBusy(false);
    }
  }
  const emailIdentity=user?.identities?.some(i=>i.provider==="email");
  const linked=user?.identities?.some(i=>i.provider==="google");
  return <main style={{maxWidth:480,margin:"40px auto",padding:24}}>
    <h1>구글 계정 연결</h1>
    {!ready?<p role="status">계정을 확인하고 있습니다…</p>:!user?
      <p>기존 이메일 계정으로 로그인한 후 이 화면에서 연결해주세요. <Link href={dealer?"/dealer":"/login"} data-ui-link="action">로그인하기</Link></p>:
      <>
        <p>현재 계정: {user.email||"이메일 없는 계정"}</p>
        <p>연결할 기존 계정의 이메일이 맞는지 먼저 확인해주세요. 구글 이메일과 달라도 연결할 수 있습니다.</p>
        {linked?<div role="status">
          <p>현재 계정은 구글로 로그인할 수 있습니다.</p>
          {!emailIdentity && <p>구글로 가입한 계정입니다. 이 표시는 다른 이메일로 가입한 기존 업체 계정과의 연결 완료를 뜻하지 않습니다.</p>}
          <p>기존 가입 이메일이 위 이메일과 다르면 기존 계정으로 전환해주세요. 이미 가입된 구글는 별도 계정 확인이 필요할 수 있습니다.</p>
        </div>:
          <button type="button" onClick={connect} disabled={busy} style={{width:"100%",padding:16,border:"1px solid #d1d5db",borderRadius:12,background:"#fff",color:"#1f2937",fontWeight:800}}>
            {busy?"구글 인증으로 이동 중…":"다음부터 구글로 로그인하기"}
          </button>}
        <button type="button" disabled={busy} onClick={switchAccount} style={{marginTop:20,padding:14}}>기존 이메일 계정으로 전환</button>
      </>}
    {error&&<p role="alert">{error}</p>}
    {dealer?<p><Link href="/dealer" data-ui-link="action">대리점 홈으로 돌아가기</Link></p>:<p><Link href="/admin" data-ui-link="action">관리자 홈</Link> · <Link href="/worker/account" data-ui-link="action">시공자 개인설정</Link></p>}
  </main>;
}
