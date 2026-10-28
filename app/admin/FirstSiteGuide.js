"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

export default function FirstSiteGuide({ companyId, onStart }) {
  const [guide, setGuide] = useState(null);

  useEffect(() => {
    let active = true;
    setGuide(null);
    if (!companyId) return;

    async function check() {
      try {
        const { data, error } = await supabase.auth.getSession();
        const userId = data?.session?.user?.id;
        if (error || !userId) return;
        const key = `first-site-guide:${companyId}:${userId}`;
        try { if (window.localStorage.getItem(key) === "dismissed") return; } catch {}
        const result = await supabase.from("sites").select("id").eq("company_id", companyId).limit(1);
        if (result.error || !Array.isArray(result.data)) return;
        if (active && result.data.length === 0) setGuide({ key });
      } catch {
        // An unavailable check must never block the existing dashboard.
      }
    }
    void check();
    return () => { active = false; };
  }, [companyId]);

  if (!guide) return null;

  function dismiss() {
    try { window.localStorage.setItem(guide.key, "dismissed"); } catch {}
    setGuide(null);
  }

  return (
    <section aria-label="첫 현장 등록 안내" style={{marginBottom:16,padding:18,border:"1px solid #cbdccf",borderRadius:16,background:"#f3f8f1",color:"#213d2d"}}>
      <div style={{display:"flex",alignItems:"start",justifyContent:"space-between",gap:12}}>
        <div><h2 style={{margin:"0 0 8px",fontSize:18}}>첫 현장을 등록해 보세요</h2>
          <p style={{margin:0,lineHeight:1.6,fontSize:14}}>현장명과 주소를 입력하고 상담 중으로 시작할 수 있어요. 일정과 자재는 나중에 등록해도 됩니다.</p></div>
        <button type="button" onClick={dismiss} aria-label="첫 현장 등록 안내 닫기" style={{minWidth:44,minHeight:44,border:0,background:"transparent",color:"#31513c",cursor:"pointer"}}>닫기</button>
      </div>
      <button type="button" onClick={onStart} style={{marginTop:14,minHeight:44,padding:"10px 16px",border:0,borderRadius:10,background:"#285340",color:"white",fontWeight:700,cursor:"pointer"}}>첫 현장 등록하기 →</button>
    </section>
  );
}
