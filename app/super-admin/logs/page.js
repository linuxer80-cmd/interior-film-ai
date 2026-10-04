"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabase";
import ToolIllustration from "../../components/ui/ToolIllustration";

const EMPTY_STATS = {
  today: 0,
  seven_days: 0,
  total: 0,
  sessions: 0,
  leads: 0,
  converted: 0,
  conversion: 0,
};

const LOG_CARDS = [
  { key: "today", label: "오늘 자동견적", suffix: "건" },
  { key: "seven_days", label: "최근 7일", suffix: "건" },
  { key: "total", label: "전체 자동견적", suffix: "건" },
  { key: "sessions", label: "예상 사용자", suffix: "명" },
  { key: "leads", label: "상세 상담", suffix: "건" },
  { key: "converted", label: "견적 → 상담 전환", suffix: "건" },
];

export default function SuperAdminLogsPage() {
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [adminName, setAdminName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [companies, setCompanies] = useState([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [stats, setStats] = useState(EMPTY_STATS);
  const [message, setMessage] = useState("");

  const checkSuperAdmin = useCallback(async () => {
    const {
      data: authData,
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      throw new Error(`로그인 확인 실패: ${authError.message}`);
    }

    const user = authData?.user;

    if (!user?.id) {
      throw new Error("로그인이 필요합니다.");
    }

    setUserEmail(user.email || "");

    const { data, error } = await supabase.rpc(
      "get_super_admin_status"
    );

    if (error) {
      throw new Error(`슈퍼관리자 확인 실패: ${error.message}`);
    }

    const status = Array.isArray(data) ? data[0] : data;

    if (!status?.is_super_admin) {
      throw new Error("슈퍼관리자 권한이 없습니다.");
    }

    setAuthorized(true);
    setAdminName(status?.name || "슈퍼관리자");
  }, []);

  const loadCompanies = useCallback(async () => {
    const { data, error } = await supabase.rpc(
      "super_admin_get_companies"
    );

    if (error) {
      throw new Error(`회사 목록 조회 실패: ${error.message}`);
    }

    setCompanies(Array.isArray(data) ? data : []);
  }, []);

  const loadStats = useCallback(async (companyId = "") => {
    setStatsLoading(true);
    setMessage("");

    try {
      const { data, error } = await supabase.rpc(
        "super_admin_get_estimate_log_stats",
        {
          p_company_id: companyId || null,
        }
      );

      if (error) {
        throw new Error(`로그 통계 조회 실패: ${error.message}`);
      }

      const row = Array.isArray(data) ? data[0] : data;

      setStats({
        today: Number(row?.today) || 0,
        seven_days: Number(row?.seven_days) || 0,
        total: Number(row?.total) || 0,
        sessions: Number(row?.sessions) || 0,
        leads: Number(row?.leads) || 0,
        converted: Number(row?.converted) || 0,
        conversion: Number(row?.conversion) || 0,
      });
    } catch (error) {
      console.error("슈퍼관리자 로그 통계:", error);
      setStats(EMPTY_STATS);
      setMessage(
        error?.message || "로그 통계를 불러오지 못했습니다."
      );
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;

    async function initialize() {
      setLoading(true);
      setMessage("");

      try {
        await checkSuperAdmin();

        if (!alive) return;

        await loadCompanies();

        if (!alive) return;

        await loadStats("");
      } catch (error) {
        console.error("전체 로그 분석 초기화:", error);

        if (!alive) return;

        setAuthorized(false);
        setMessage(
          error?.message || "페이지를 불러오지 못했습니다."
        );
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    }

    initialize();

    return () => {
      alive = false;
    };
  }, [checkSuperAdmin, loadCompanies, loadStats]);

  const selectedCompany = useMemo(() => {
    if (!selectedCompanyId) return null;

    return (
      companies.find(
        (company) => company.id === selectedCompanyId
      ) || null
    );
  }, [companies, selectedCompanyId]);

  async function chooseCompany(companyId) {
    if (statsLoading) return;

    setSelectedCompanyId(companyId);
    await loadStats(companyId);
  }

  const targetName = selectedCompany
    ? selectedCompany.company_name || "회사명 없음"
    : "전체 업체";

  if (loading) {
    return (
      <main style={styles.page}>
        <section style={styles.centerCard}>
          <div style={styles.centerIcon}>
            <ToolIllustration kind="report" size={64} />
          </div>

          <h1 style={styles.centerTitle}>
            로그 분석을 불러오는 중...
          </h1>

          <p style={styles.help}>
            자동견적과 상담 데이터를 집계하고 있습니다.
          </p>
        </section>
      </main>
    );
  }

  if (!authorized) {
    return (
      <main style={styles.page}>
        <section style={styles.centerCard}>
          <div style={{ fontSize: 40 }}>🔒</div>
          <h1 style={styles.centerTitle}>접근할 수 없습니다</h1>

          <p style={styles.help}>
            슈퍼관리자 전용 페이지입니다.
          </p>

          {message && (
            <div role="alert" style={styles.error}>
              {message}
            </div>
          )}

          <Link
            href="/admin"
            style={{
              ...styles.primary,
              display: "block",
              marginTop: 20,
              textDecoration: "none",
            }}
          >
            관리자 페이지로 이동
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <div style={styles.container}>
        <header style={styles.header}>
          <Link
            href="/super-admin"
            aria-label="슈퍼관리자로 돌아가기"
            style={styles.back}
          >
            ←
          </Link>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={styles.eyebrow}>
              필름장이 · 슈퍼관리자
            </div>

            <h1 style={styles.title}>로그 분석</h1>

            <p style={styles.help}>
              자동견적 사용과 상담 전환을 확인하세요.
            </p>
          </div>

          <ToolIllustration kind="report" size={52} />
        </header>

        <section style={styles.card}>
          <div style={styles.sectionHeader}>
            <div>
              <h2 style={styles.sectionTitle}>조회 대상</h2>
              <p style={styles.help}>한국시간 기준으로 집계합니다.</p>
            </div>

            <button
              type="button"
              disabled={statsLoading}
              onClick={() => loadStats(selectedCompanyId)}
              style={{
                ...styles.button,
                opacity: statsLoading ? 0.55 : 1,
              }}
            >
              {statsLoading ? "조회 중..." : "새로고침"}
            </button>
          </div>

          <select
            aria-label="조회할 업체 선택"
            value={selectedCompanyId}
            onChange={(event) => chooseCompany(event.target.value)}
            disabled={statsLoading}
            style={styles.select}
          >
            <option value="">전체 업체</option>

            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.company_name || "회사명 없음"}
              </option>
            ))}
          </select>

          <div style={styles.target}>
            <span style={styles.help}>현재 조회</span>
            <strong style={{ overflowWrap: "anywhere" }}>
              {targetName}
            </strong>
          </div>

          {message && (
            <div role="alert" style={styles.error}>
              {message}
            </div>
          )}
        </section>

        <section aria-label="자동견적 통계" aria-busy={statsLoading}>
          <div style={styles.statsGrid}>
            {LOG_CARDS.map((card) => (
              <LogCard
                key={card.key}
                label={card.label}
                value={stats[card.key]}
                suffix={card.suffix}
                loading={statsLoading}
              />
            ))}
          </div>

          <div style={styles.conversion}>
            <div style={styles.conversionLabel}>
              자동견적 → 상세상담 전환율
            </div>

            <strong style={styles.conversionValue}>
              {statsLoading
                ? "..."
                : `${Number(stats.conversion || 0).toLocaleString(
                    "ko-KR"
                  )}%`}
            </strong>

            <div style={styles.conversionHelp}>{targetName} 기준</div>
          </div>
        </section>

        <details style={{ ...styles.card, marginTop: 18 }}>
          <summary style={styles.summary}>
            업체별 빠른 선택 · {companies.length}개 업체
          </summary>

          <div style={styles.companyGrid}>
            <button
              type="button"
              disabled={statsLoading}
              aria-pressed={!selectedCompanyId}
              onClick={() => chooseCompany("")}
              style={{
                ...styles.companyButton,
                ...(!selectedCompanyId ? styles.selected : {}),
              }}
            >
              <span>전체 업체</span>
              <small>{companies.length}개 업체</small>
            </button>

            {companies.map((company) => (
              <button
                key={company.id}
                type="button"
                disabled={statsLoading}
                aria-pressed={selectedCompanyId === company.id}
                onClick={() => chooseCompany(company.id)}
                style={{
                  ...styles.companyButton,
                  ...(selectedCompanyId === company.id
                    ? styles.selected
                    : {}),
                }}
              >
                <span>{company.company_name || "회사명 없음"}</span>
                <small>{company.is_active ? "운영 중" : "정지"}</small>
              </button>
            ))}
          </div>
        </details>

        <footer style={styles.account}>
          {adminName} · {userEmail}
        </footer>
      </div>
    </main>
  );
}

function LogCard({ label, value, suffix, loading }) {
  return (
    <div style={styles.statCard}>
      <div style={styles.statLabel}>{label}</div>

      <div style={styles.statValue}>
        {loading ? "..." : Number(value || 0).toLocaleString("ko-KR")}

        {!loading && (
          <span style={styles.statSuffix}>{suffix}</span>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    boxSizing: "border-box",
    background: "var(--film-bg, #f8f7f3)",
    color: "#243247",
    padding: "24px 16px 60px",
  },

  container: {
    width: "100%",
    maxWidth: 760,
    margin: "0 auto",
  },

  header: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 24,
  },

  back: {
    width: 44,
    height: 44,
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid #dfe6ef",
    borderRadius: 14,
    background: "#ffffff",
    color: "#50617a",
    fontSize: 24,
    textDecoration: "none",
  },

  eyebrow: {
    color: "#7b8798",
    fontSize: 12,
    fontWeight: 800,
  },

  title: {
    margin: "6px 0",
    fontSize: 26,
    letterSpacing: "-0.7px",
  },

  help: {
    margin: "6px 0 0",
    color: "#7b8798",
    fontSize: 12,
    lineHeight: 1.7,
  },

  card: {
    padding: 18,
    marginBottom: 16,
    border: "1px solid #e4eaf2",
    borderRadius: 22,
    background: "#ffffff",
    boxShadow: "0 6px 20px rgba(48,77,116,0.04)",
  },

  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },

  sectionTitle: {
    margin: 0,
    fontSize: 18,
    letterSpacing: "-0.4px",
  },

  button: {
    minHeight: 44,
    padding: "10px 12px",
    border: "1px solid #dfe6ef",
    borderRadius: 14,
    background: "#ffffff",
    color: "#50617a",
    fontSize: 12,
    fontWeight: 800,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },

  select: {
    width: "100%",
    minHeight: 48,
    padding: "10px 12px",
    boxSizing: "border-box",
    border: "1px solid #dfe6ef",
    borderRadius: 14,
    background: "#fbfcfe",
    color: "#243247",
    fontSize: 16,
  },

  target: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginTop: 12,
    padding: "12px 14px",
    borderRadius: 14,
    background: "#f3f7fc",
    fontSize: 13,
  },

  error: {
    marginTop: 14,
    padding: 13,
    borderRadius: 14,
    background: "#fff1f2",
    color: "#b91c1c",
    fontSize: 12,
    lineHeight: 1.7,
    overflowWrap: "anywhere",
  },

  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 12,
  },

  statCard: {
    minWidth: 0,
    padding: 18,
    background: "#ffffff",
    border: "1px solid #e4eaf2",
    borderRadius: 20,
    boxShadow: "0 6px 20px rgba(48,77,116,0.04)",
  },

  statLabel: {
    color: "#7b8798",
    fontSize: 12,
    fontWeight: 700,
    lineHeight: 1.6,
  },

  statValue: {
    marginTop: 10,
    color: "#3268bd",
    fontSize: 27,
    fontWeight: 900,
    lineHeight: 1.3,
    overflowWrap: "anywhere",
  },

  statSuffix: {
    marginLeft: 4,
    color: "#7b8798",
    fontSize: 12,
    fontWeight: 700,
  },

  conversion: {
    marginTop: 16,
    padding: 22,
    borderRadius: 22,
    background: "var(--film-blue, #3478ed)",
    color: "#ffffff",
    boxShadow: "0 8px 22px rgba(52,120,237,0.16)",
  },

  conversionLabel: {
    fontSize: 13,
    fontWeight: 700,
    lineHeight: 1.7,
  },

  conversionValue: {
    display: "block",
    marginTop: 8,
    fontSize: 36,
    fontWeight: 900,
    overflowWrap: "anywhere",
  },

  conversionHelp: {
    marginTop: 8,
    fontSize: 12,
    opacity: 0.85,
  },

  summary: {
    cursor: "pointer",
    color: "#50617a",
    fontSize: 14,
    fontWeight: 800,
    lineHeight: 1.7,
  },

  companyGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 10,
    marginTop: 16,
  },

  companyButton: {
    minWidth: 0,
    minHeight: 66,
    padding: "12px",
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    justifyContent: "center",
    gap: 5,
    border: "1px solid #dfe6ef",
    borderRadius: 15,
    background: "#ffffff",
    color: "#50617a",
    textAlign: "left",
    fontSize: 13,
    fontWeight: 800,
    cursor: "pointer",
    overflowWrap: "anywhere",
  },

  selected: {
    background: "#eaf3ff",
    color: "#3268bd",
    borderColor: "#3478ed",
  },

  account: {
    marginTop: 20,
    color: "#9ca3af",
    fontSize: 11,
    textAlign: "center",
    overflowWrap: "anywhere",
  },

  centerCard: {
    width: "100%",
    maxWidth: 420,
    boxSizing: "border-box",
    margin: "70px auto 0",
    padding: "28px 22px",
    background: "#ffffff",
    border: "1px solid #e4eaf2",
    borderRadius: 24,
    textAlign: "center",
  },

  centerIcon: {
    display: "flex",
    justifyContent: "center",
    marginBottom: 16,
  },

  centerTitle: {
    margin: "12px 0",
    fontSize: 20,
  },

  primary: {
    minHeight: 44,
    boxSizing: "border-box",
    padding: "14px",
    borderRadius: 14,
    background: "var(--film-blue, #3478ed)",
    color: "#ffffff",
    fontSize: 14,
    fontWeight: 800,
    textAlign: "center",
  },
};
