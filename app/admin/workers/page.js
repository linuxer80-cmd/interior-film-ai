"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import WorkerManagement from "../WorkerManagement";
import useWorkers from "../hooks/useWorkers";

function WorkerContent({ companyId }) {
  const workers = useWorkers({ companyId });
  const { loadWorkers } = workers;

  useEffect(() => {
    loadWorkers();
  }, [loadWorkers]);

  return <WorkerManagement {...workers} />;
}

export default function AdminWorkersPage() {
  const [companyId, setCompanyId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError("");
      setCompanyId("");

      try {
        const { data, error: queryError } =
          await supabase.rpc("get_my_company");

        if (queryError) throw queryError;

        const company = Array.isArray(data) ? data[0] : data;

        if (
          !company?.company_id ||
          company.role !== "owner" ||
          company.is_active === false
        ) {
          throw new Error(
            "활성 관리자 계정으로 로그인해주세요."
          );
        }

        if (active) {
          setCompanyId(company.company_id);
        }
      } catch (cause) {
        if (active) {
          setError(
            cause.message ||
              "관리자 정보를 확인하지 못했습니다."
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    load();

    return () => {
      active = false;
    };
  }, [attempt]);

  return (
    <main
      style={{
        maxWidth: 900,
        margin: "0 auto",
        minHeight: "100vh",
        padding: "20px 16px 80px",
        background: "#fcf9f2",
        color: "#163153",
      }}
    >
      <Link
        href="/admin"
        style={{
          display: "inline-block",
          padding: "12px 16px",
          marginBottom: 18,
          borderRadius: 12,
          background: "white",
          border: "1px solid #e2e8f0",
          color: "#2563eb",
          textDecoration: "none",
          fontWeight: 700,
        }}
      >
        ‹ 관리자 홈
      </Link>

      <h1 style={{ fontSize: 25, margin: "0 0 20px" }}>
        시공자 관리
      </h1>

      {loading && (
        <p role="status">
          관리자 정보를 확인하고 있습니다…
        </p>
      )}

      {error && (
        <div
          role="alert"
          style={{
            padding: 16,
            background: "#fff1f2",
            borderRadius: 14,
            color: "#9f1239",
          }}
        >
          <p>{error}</p>

          <button
            type="button"
            onClick={() => setAttempt((value) => value + 1)}
            style={{
              minHeight: 44,
              padding: "10px 16px",
              borderRadius: 10,
              border: "1px solid #cbd5e1",
              background: "white",
            }}
          >
            다시 확인
          </button>
        </div>
      )}

      {!loading && !error && companyId && (
        <Link
          href="/admin/attendance"
          style={{
            display: "block",
            padding: "14px 16px",
            marginBottom: 16,
            borderRadius: 14,
            border: "1px solid #bfdbfe",
            background: "#eff6ff",
            color: "#1d4ed8",
            textDecoration: "none",
            fontWeight: 800,
          }}
        >
          오늘 출퇴근 현황 · 전체 내역 ›
        </Link>
      )}

      {!loading && !error && companyId && (
        <WorkerContent
          key={companyId}
          companyId={companyId}
        />
      )}
    </main>
  );
      }
