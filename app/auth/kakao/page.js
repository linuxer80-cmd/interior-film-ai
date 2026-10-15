"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabase";
import { workerProfileRequirements } from "../../utils/workerProfileRequirements";

export default function KakaoCallback() {
  const [error, setError] = useState("");
  const [needsCompany, setNeedsCompany] = useState(false);
  const [switching, setSwitching] = useState(false);
  async function useExistingAccount() {
    if (switching) return;
    setSwitching(true);
    const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
    if (signOutError) {
      setError("계정 전환에 실패했습니다. 다시 시도해주세요.");
      setSwitching(false);
      return;
    }
    window.location.replace("/login");
  }
  useEffect(() => {
    let active = true;
    async function complete() {
      const query = new URLSearchParams(window.location.search);
      const fragment = new URLSearchParams(window.location.hash.slice(1));
      const role = query.get("role") === "worker" ? "worker" : "owner";
      if (query.has("error") || fragment.has("error")) throw Error("카카오 로그인이 취소되었거나 승인되지 않았습니다. 다시 로그인해주세요.");
      // The existing browser Supabase client consumes the OAuth URL and persists
      // its session. Do not copy tokens into another store or trust role metadata.
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !data?.session) throw Error("로그인 정보를 확인하지 못했습니다. 다시 로그인해주세요.");
      const { data: verified, error: userError } = await supabase.auth.getUser();
      if (userError || !verified?.user) throw Error("로그인 인증을 확인하지 못했습니다.");
      window.history.replaceState(null, "", "/auth/kakao?role=" + role);
      let destination;
      if (role === "worker") {
        const completion = await workerProfileRequirements();
        destination = completion.authenticated && completion.complete ? "/worker" : "/worker/account?required=1";
      } else {
        const { data: companies, error: companyError } = await supabase.rpc("get_my_company");
        if (companyError) throw Error("업체 정보를 확인하지 못했습니다. 잠시 후 다시 시도해주세요.");
        const company = Array.isArray(companies) ? companies[0] : companies;
        if (company?.is_active === false) throw Error("현재 사용이 중지된 업체 계정입니다.");
        if (!(company?.company_id && company.role === "owner")) {
          if (active) setNeedsCompany(true);
          return;
        }
        destination = "/admin";
      }
      if (active) window.location.replace(destination);
    }
    complete().catch(e => { if (active) setError(e.message || "로그인을 완료하지 못했습니다."); });
    return () => { active = false; };
  }, []);
  return <main style={{ maxWidth: 480, margin: "80px auto", padding: 24 }}>
    <h1>카카오 로그인</h1>
    <p role={error ? "alert" : "status"}>{error || (needsCompany ? "이 카카오 계정에 연결된 업체가 없습니다. 기존 이메일 계정과 카카오 계정은 다를 수 있습니다." : "계정 정보를 확인하고 있습니다…")}</p>
    {needsCompany && <section>
      <p>이미 가입하셨나요? 기존 이메일과 비밀번호로 로그인해주세요. 업체를 다시 만들 필요는 없습니다.</p>
      <button type="button" onClick={useExistingAccount} disabled={switching} style={{ width: "100%", padding: 16, marginBottom: 20 }}>{switching ? "계정 전환 중…" : "기존 이메일 계정으로 로그인"}</button>
      <p>처음 이용하시는 분만 새 업체를 등록해주세요.</p>
      <Link href="/signup">처음 이용합니다 · 새 업체 등록</Link>
    </section>}
    {error && <><Link href="/login">업체 로그인</Link><br /><Link href="/worker/login">시공자 로그인</Link></>}
  </main>;
}
