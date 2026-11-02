"use client";
import { useEffect, useState } from "react";
import { nativeKakaoReturn } from "../../../lib/nativeKakaoReturn.mjs";

export default function NativeKakaoReturn() {
  const [target, setTarget] = useState(null);
  useEffect(() => {
    const url = nativeKakaoReturn(new URLSearchParams(window.location.search));
    window.history.replaceState(null, "", "/auth/kakao?assistant_return=1");
    setTarget(url);
    if (url) window.location.replace(url);
  }, []);
  return <main style={{maxWidth:480,margin:"60px auto",padding:24,fontFamily:"sans-serif"}}>
    <meta name="referrer" content="no-referrer" />
    <h1>현장 AI 비서로 돌아가기</h1>
    <p>{target ? "앱에서 카카오 로그인을 마무리합니다. 자동으로 열리지 않으면 아래 버튼을 눌러주세요." : "비서 앱의 카카오 로그인 버튼에서 다시 시작해 주세요."}</p>
    {target && <a href={target} style={{display:"block",padding:18,background:"#FEE500",color:"#191919",borderRadius:12,textAlign:"center",textDecoration:"none",fontWeight:700}}>비서 앱 열기</a>}
  </main>;
}
