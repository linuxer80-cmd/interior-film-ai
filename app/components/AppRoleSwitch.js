"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import { loadMyWorkerSites } from "../utils/workerSites";

export default function AppRoleSwitch() {
  const pathname = usePathname();
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState(null);

  const isAdminHome = pathname === "/admin";
  const isWorkerHome = pathname === "/worker";

  if (!isAdminHome && !isWorkerHome) return null;

  async function switchRole() {
    if (loading) return;

    const target = isAdminHome ? "worker" : "admin";
    setLoading(true);
    setNotice(null);

    try {
      const { data, error } = await supabase.auth.getSession();

      if (error) throw error;

      if (!data?.session) {
        router.push(
          target === "admin"
            ? "/login"
            : "/worker/login?next=%2Fworker"
        );
        return;
      }

      if (target === "admin") {
        const { data: companyData, error: companyError } =
          await supabase.rpc("get_my_company");

        if (companyError) throw companyError;

        const company = Array.isArray(companyData)
          ? companyData[0]
          : companyData;

        if (
          !company?.company_id ||
          company.is_active === false
        ) {
          setNotice({
            target,
            text:
              "현재 계정의 활성 관리자 업체 연결을 확인하지 못했습니다. 관리자 계정으로 로그인해주세요.",
          });
          return;
        }

        router.push("/admin");
      } else {
        const result = await loadMyWorkerSites({
          profileOnly: true,
        });

        if (
          !result.worker?.worker_id ||
          result.worker.worker_is_active === false
        ) {
          setNotice({
            target,
            text:
              "현재 계정의 활성 시공자 등록을 확인하지 못했습니다. 업체 관리자에게 등록을 요청하거나 시공자 계정으로 로그인해주세요.",
          });
          return;
        }

        router.push("/worker");
      }
    } catch (error) {
      setNotice({
        target,
        text:
          error?.status === 401
            ? "로그인이 필요합니다. 해당 역할의 계정으로 로그인해주세요."
            : error?.status === 403
              ? "현재 계정으로 해당 역할을 이용할 수 없습니다. 등록 상태를 확인하거나 다른 계정으로 로그인해주세요."
              : "역할을 확인하지 못했습니다. 잠시 후 다시 시도해주세요.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <nav className="role-bar" aria-label="역할 전환">
      <div className="bar-content">
        <span>{isAdminHome ? "관리자 홈" : "시공자 홈"}</span>

        <button
          type="button"
          onClick={switchRole}
          disabled={loading}
        >
          {loading
            ? "확인 중…"
            : isAdminHome
              ? "시공자 홈으로 →"
              : "관리자 홈으로 →"}
        </button>
      </div>

      {notice && (
        <div className="notice" role="status">
          <p>{notice.text}</p>
          <p className="account-note">
            다른 계정으로 로그인하면 현재 계정이 바뀝니다.
          </p>

          <div className="notice-actions">
            <Link
              href={
                notice.target === "admin"
                  ? "/login"
                  : "/worker/login?next=%2Fworker"
              }
            >
              {notice.target === "admin"
                ? "관리자 로그인"
                : "시공자 로그인"}
            </Link>

            <button
              type="button"
              onClick={() => setNotice(null)}
            >
              닫기
            </button>
          </div>
        </div>
      )}

      <style jsx>{`
        .role-bar {
          padding: 12px 18px;
          background: #f7f5ef;
          color: #182620;
          border-bottom: 1px solid #dedfd4;
        }

        .bar-content {
          max-width: 1200px;
          margin: 0 auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          font-size: 14px;
          font-weight: 700;
        }

        button {
          font: inherit;
          cursor: pointer;
          padding: 10px 14px;
          border: 1px solid #dce1d8;
          border-radius: 12px;
          background: #fff;
          color: #182620;
          font-weight: 700;
        }

        button:disabled {
          opacity: 0.6;
          cursor: wait;
        }

        .notice {
          max-width: 1200px;
          margin: 12px auto 0;
          padding: 16px;
          border-radius: 14px;
          background: #fff;
          border: 1px solid #dce1d8;
        }

        .notice p {
          margin: 0 0 12px;
          font-size: 14px;
          line-height: 1.7;
        }

        .notice .account-note {
          color: #687267;
          font-size: 12px;
        }

        .notice-actions {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }

        .notice-actions :global(a) {
          padding: 10px 14px;
          border-radius: 12px;
          background: #182620;
          color: #fff;
          text-decoration: none;
          font-size: 14px;
          font-weight: 700;
        }

        button:focus-visible,
        .notice-actions :global(a:focus-visible) {
          outline: 3px solid #9b7532;
          outline-offset: 3px;
        }
      `}</style>
    </nav>
  );
}
