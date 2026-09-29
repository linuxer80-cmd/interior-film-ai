"use client";

import { useEffect, useState } from "react";
import useAdminCompany from "../hooks/useAdminCompany";
import QuickRegisterTab from "../QuickRegisterTab";
import ui from "../AdminUi.module.css";

export default function BulkRegisterPage() {
  const { companyId, companyName, adminError, initializeCompany } = useAdminCompany();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;
    initializeCompany().finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, []);

  return (
    <main className={ui.page}>
      <a className={ui.back} href="/admin?tab=register">← 시공 등록으로 돌아가기</a>
      {checking ? <p>관리자 정보를 확인하고 있습니다...</p> : !companyId ? (
        <p role="alert">{adminError || "관리자 정보를 확인할 수 없습니다."}</p>
      ) : (
        <>
          <div className={ui.eyebrow}>{companyName} · 관리자</div>
          <QuickRegisterTab companyId={companyId} />
        </>
      )}
    </main>
  );
}
