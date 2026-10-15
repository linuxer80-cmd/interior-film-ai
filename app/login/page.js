"use client";
import { useEffect, useState } from "react";
import OwnerLogin from "./OwnerLogin";
import WorkerLogin from "./WorkerLogin";

export default function LoginPage() {
  const [role, setRole] = useState(null);
  useEffect(() => {
    const sync = () => setRole(new URLSearchParams(window.location.search).get("role") === "worker" ? "worker" : "owner");
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  function selectRole(value) {
    const url = new URL(window.location.href);
    url.searchParams.set("role", value);
    url.searchParams.delete("next");
    window.history.replaceState(null, "", url.pathname + url.search);
    setRole(value);
  }
  if (!role) return <p role="status">로그인 화면을 준비하고 있습니다…</p>;
  return <>
    <nav aria-label="로그인 역할" style={{display:"flex",gap:8,maxWidth:480,margin:"24px auto 0",padding:"0 16px"}}>
      {[["owner","관리자"],["worker","시공자"]].map(([value,label]) => <button key={value} type="button" aria-pressed={role===value} onClick={()=>selectRole(value)}
        style={{flex:1,padding:14,border:"1px solid #d1d5db",borderRadius:12,background:role===value?"#182620":"#fff",color:role===value?"#fff":"#182620",fontWeight:800}}>
        {label}
      </button>)}
    </nav>
    {role === "worker" ? <WorkerLogin /> : <OwnerLogin />}
  </>;
}
