"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabase";
import QuickRegisterTab from "../../admin/QuickRegisterTab";
import { inputStyle, sectionStyle } from "../../admin/adminStyles";
export default function BulkRegisterPage() {
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState("");
  const [pending, setPending] = useState(false);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("권한 확인 중...");
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: auth, error: authError } = await supabase.auth.getUser();
        if (authError || !auth?.user) throw Error("슈퍼관리자 로그인이 필요합니다.");
        const { data: status, error } = await supabase.rpc("get_super_admin_status");
        if (error || !(Array.isArray(status) ? status[0] : status)?.is_super_admin) throw Error("슈퍼관리자 권한이 없습니다.");
        const { data, error: listError } = await supabase.rpc("super_admin_get_companies");
        if (listError) throw listError;
        if (alive) { setCompanies(data || []); setReady(true); setMessage(""); }
      } catch (error) { if (alive) setMessage(error.message); }
    })();
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (!pending) return;
    const warn = event => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pending]);
  return <main style={{ maxWidth: 960, margin: "0 auto", padding: "24px 16px 100px" }}>
    <Link href="/super-admin" onClick={e => { if (pending && !window.confirm("아직 등록하지 않은 사진과 입력 내용이 사라집니다. 나가시겠습니까?")) e.preventDefault(); }}>← 슈퍼관리자 홈</Link>
    <section style={{ ...sectionStyle, marginTop: 20 }}>
      <h1>대량 시공데이터 등록</h1>
      {message && <p role="status">{message}</p>}
      {ready && <><label htmlFor="target-company">데이터를 등록할 업체</label>
        <select id="target-company" style={inputStyle} value={companyId} disabled={pending} onChange={e => setCompanyId(e.target.value)}>
          <option value="">업체를 선택해주세요</option>
          {companies.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
        </select>
        {companyId && <p><strong>{companies.find(c => c.id === companyId)?.company_name}</strong>의 시공 사례로 등록합니다. {pending && "현재 사진 등록을 마치면 업체를 바꿀 수 있습니다."}</p>}
        <p>같은 대상의 다른 각도 사진은 한 묶음으로 확인하고, 전체 시공 범위와 합계 금액을 입력하세요. 저장 전에는 이 화면을 유지해주세요.</p>
      </>}
    </section>
    {ready && companyId && <QuickRegisterTab key={companyId} companyId={companyId} superAdmin onPendingChange={setPending} />}
  </main>;
}
