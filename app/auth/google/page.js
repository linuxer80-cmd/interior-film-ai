"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabase";
import { workerProfileRequirements } from "../../utils/workerProfileRequirements";

export default function GoogleCallback() {
  const [roleContext, setRoleContext] = useState("owner");
  const [error, setError] = useState("");
  const [linked, setLinked] = useState(false);
  const [needsCompany, setNeedsCompany] = useState(false);
  const [newWorkerDestination, setNewWorkerDestination] = useState("");
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
    window.location.replace(roleContext === "worker" ? "/worker/login" : "/login");
  }
  useEffect(() => {
    let active = true;
    async function complete() {
      const query = new URLSearchParams(window.location.search);
      const fragment = new URLSearchParams(window.location.hash.slice(1));
      const role = ["worker", "dealer"].includes(query.get("role")) ? query.get("role") : "owner";
      if (active) setRoleContext(role);
      const linking = query.get("mode") === "link";
      if (query.has("error") || fragment.has("error")) {
        const code = query.get("error_code") || fragment.get("error_code") || "";
        window.history.replaceState(null, "", "/auth/google?role=" + role + (linking ? "&mode=link" : ""));
        throw Error(code === "identity_already_exists"
          ? "이 구글 계정은 이미 다른 회원 계정에 연결되어 있습니다. 별도 가입 계정 확인이 필요합니다. 업체를 다시 만들지 마세요."
          : "구글 인증이 취소되었거나 실패했습니다. 다시 시도해주세요.");
      }
      // The existing browser Supabase client consumes the OAuth URL and persists
      // its session. Do not copy tokens into another store or trust role metadata.
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !data?.session) throw Error("로그인 정보를 확인하지 못했습니다. 다시 로그인해주세요.");
      const { data: verified, error: userError } = await supabase.auth.getUser();
      if (userError || !verified?.user) throw Error("로그인 인증을 확인하지 못했습니다.");
      if (!verified.user.identities?.some(identity => identity.provider === "google")) {
        throw Error("구글 인증이 완료되지 않았습니다. 다시 시도해주세요.");
      }
      if (linking) {
        let pending;
        try { pending = JSON.parse(sessionStorage.getItem("film-google-link") || "null"); } catch {}
        const age = Date.now() - Number(pending?.createdAt);
        if (!pending || age < 0 || age > 15 * 60 * 1000 || pending.userId !== verified.user.id) {
          throw Error("연결을 시작한 계정과 현재 계정을 확인할 수 없습니다. 계정 연결 화면에서 연결 상태를 확인해주세요.");
        }
        if (!verified.user.identities?.some(identity => identity.provider === "google")) {
          throw Error("구글 연결이 완료되지 않았습니다. 계정 연결 화면에서 다시 시도해주세요.");
        }
        window.history.replaceState(null, "", "/auth/google?mode=link&role=" + role);
        sessionStorage.removeItem("film-google-link");
        if (active) setLinked(true);
        return;
      }
      window.history.replaceState(null, "", "/auth/google?role=" + role);
      let destination;
      if (role === "dealer") {
        destination = "/dealer";
      } else if (role === "worker") {
        const completion = await workerProfileRequirements();
        if (!completion.authenticated) throw Error("로그인 정보를 다시 확인해주세요.");
        if (!completion.complete) {
          if (active) setNewWorkerDestination("/worker/account?required=1");
          return;
        }
        destination = "/worker";
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
    <h1>구글 로그인</h1>
    <p role={error ? "alert" : "status"}>{error || (linked ? "구글 연결이 완료되었습니다. 다음부터 구글로 로그인하면 기존 계정으로 접속합니다." : newWorkerDestination ? "기존 가입 여부를 확인해주세요." : needsCompany ? "이 구글 계정에 연결된 업체가 없습니다. 기존 이메일 계정과 구글 계정은 다를 수 있습니다." : "계정 정보를 확인하고 있습니다…")}</p>
    {linked && roleContext === "dealer" && <p><Link href="/dealer" data-ui-link="action">대리점 홈</Link></p>}
    {linked && roleContext !== "dealer" && <p><Link href="/admin" data-ui-link="action">관리자 홈</Link> · <Link href="/worker" data-ui-link="action">시공자 홈</Link></p>}
    {newWorkerDestination && !error && <section>
      <h2>기존에 가입하셨나요?</h2>
      <p>이 구글 계정에서 완료된 시공자 프로필을 찾지 못했습니다. 이메일이나 카카오로 가입한 적이 있다면 기존 계정으로 로그인해주세요.</p>
      <button type="button" disabled={switching} onClick={useExistingAccount} style={{ padding: 16, width: "100%" }}>기존 계정으로 로그인</button>
      <p><Link href="/worker/forgot-password" data-ui-link="action">아이디 찾기 · 비밀번호 재설정</Link></p>
      <p>기존 계정의 개인설정에서 구글을 연결하면 같은 현장과 일정을 이용할 수 있습니다.</p>
      <Link href={newWorkerDestination} data-ui-link="action">처음 이용합니다 · 시공자 프로필 등록</Link>
    </section>}
    {needsCompany && <section>
      <p>이미 가입하셨나요? 기존 이메일과 비밀번호로 로그인해주세요. 업체를 다시 만들 필요는 없습니다.</p>
      <button type="button" onClick={useExistingAccount} disabled={switching} style={{ width: "100%", padding: 16, marginBottom: 20 }}>{switching ? "계정 전환 중…" : "기존 이메일 계정으로 로그인"}</button>
      <p>기존 계정으로 로그인한 뒤 ‘구글 계정 연결’에서 연결하면 기존 업체를 그대로 이용할 수 있습니다.</p>
      <p>처음 이용하시는 분만 새 업체를 등록해주세요.</p>
      <Link href="/signup" data-ui-link="action">처음 이용합니다 · 새 업체 등록</Link>
    </section>}
    {error && <>{roleContext === "dealer" && <p><Link href="/dealer" data-ui-link="action">대리점 로그인으로 돌아가기</Link></p>}<Link href={roleContext === "dealer" ? "/account/google?role=dealer" : "/account/google"} data-ui-link="action">구글 연결 상태 확인 · 다시 시도</Link><br /><Link href="/login" data-ui-link="action">업체 로그인</Link><br /><Link href="/worker/login" data-ui-link="action">시공자 로그인</Link></>}
  </main>;
}
