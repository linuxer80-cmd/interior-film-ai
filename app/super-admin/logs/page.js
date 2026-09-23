"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { supabase } from "../../../lib/supabase";

const EMPTY_STATS = {
  today: 0,
  seven_days: 0,
  total: 0,
  sessions: 0,
  leads: 0,
  converted: 0,
  conversion: 0,
};

export default function SuperAdminLogsPage() {
  const [loading, setLoading] =
    useState(true);

  const [
    statsLoading,
    setStatsLoading,
  ] = useState(false);

  const [
    authorized,
    setAuthorized,
  ] = useState(false);

  const [
    adminName,
    setAdminName,
  ] = useState("");

  const [
    userEmail,
    setUserEmail,
  ] = useState("");

  const [
    companies,
    setCompanies,
  ] = useState([]);

  const [
    selectedCompanyId,
    setSelectedCompanyId,
  ] = useState("");

  const [
    stats,
    setStats,
  ] = useState(
    EMPTY_STATS,
  );

  const [
    message,
    setMessage,
  ] = useState("");

  /* =========================================================
     슈퍼관리자 확인
  ========================================================= */

  const checkSuperAdmin =
    useCallback(async () => {
      const {
        data: authData,
        error: authError,
      } =
        await supabase.auth.getUser();

      if (authError) {
        throw new Error(
          `로그인 확인 실패: ${authError.message}`,
        );
      }

      const user =
        authData?.user;

      if (!user?.id) {
        throw new Error(
          "로그인이 필요합니다.",
        );
      }

      setUserEmail(
        user.email || "",
      );

      const {
        data,
        error,
      } =
        await supabase.rpc(
          "get_super_admin_status",
        );

      if (error) {
        throw new Error(
          `슈퍼관리자 확인 실패: ${error.message}`,
        );
      }

      const status =
        Array.isArray(data)
          ? data[0]
          : data;

      if (
        !status?.is_super_admin
      ) {
        throw new Error(
          "슈퍼관리자 권한이 없습니다.",
        );
      }

      setAuthorized(true);

      setAdminName(
        status?.name ||
          "슈퍼관리자",
      );

      return true;
    }, []);

  /* =========================================================
     전체 회사 조회
  ========================================================= */

  const loadCompanies =
    useCallback(async () => {
      const {
        data,
        error,
      } =
        await supabase.rpc(
          "super_admin_get_companies",
        );

      if (error) {
        throw new Error(
          `회사 목록 조회 실패: ${error.message}`,
        );
      }

      setCompanies(
        Array.isArray(data)
          ? data
          : [],
      );
    }, []);

  /* =========================================================
     로그 통계 조회
  ========================================================= */

  const loadStats =
    useCallback(
      async (
        companyId = "",
      ) => {
        setStatsLoading(
          true,
        );

        setMessage("");

        try {
          const {
            data,
            error,
          } =
            await supabase.rpc(
              "super_admin_get_estimate_log_stats",
              {
                p_company_id:
                  companyId ||
                  null,
              },
            );

          if (error) {
            throw new Error(
              `로그 통계 조회 실패: ${error.message}`,
            );
          }

          const row =
            Array.isArray(data)
              ? data[0]
              : data;

          setStats({
            today:
              Number(
                row?.today,
              ) || 0,

            seven_days:
              Number(
                row?.seven_days,
              ) || 0,

            total:
              Number(
                row?.total,
              ) || 0,

            sessions:
              Number(
                row?.sessions,
              ) || 0,

            leads:
              Number(
                row?.leads,
              ) || 0,

            converted:
              Number(
                row?.converted,
              ) || 0,

            conversion:
              Number(
                row?.conversion,
              ) || 0,
          });
        } catch (
          error
        ) {
          console.error(
            "슈퍼관리자 로그 통계:",
            error,
          );

          setStats(
            EMPTY_STATS,
          );

          setMessage(
            `❌ ${
              error?.message ||
              "로그 통계를 불러오지 못했습니다."
            }`,
          );
        } finally {
          setStatsLoading(
            false,
          );
        }
      },
      [],
    );

  /* =========================================================
     초기 로딩
  ========================================================= */

  useEffect(() => {
    let alive = true;

    async function initialize() {
      setLoading(true);
      setMessage("");

      try {
        await checkSuperAdmin();

        if (!alive) {
          return;
        }

        await loadCompanies();

        if (!alive) {
          return;
        }

        await loadStats("");
      } catch (
        error
      ) {
        console.error(
          "전체 로그 분석 초기화:",
          error,
        );

        if (!alive) {
          return;
        }

        setAuthorized(false);

        setMessage(
          `❌ ${
            error?.message ||
            "페이지를 불러오지 못했습니다."
          }`,
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
  }, [
    checkSuperAdmin,
    loadCompanies,
    loadStats,
  ]);

  /* =========================================================
     선택 회사
  ========================================================= */

  const selectedCompany =
    useMemo(() => {
      if (
        !selectedCompanyId
      ) {
        return null;
      }

      return (
        companies.find(
          (company) =>
            company.id ===
            selectedCompanyId,
        ) || null
      );
    }, [
      companies,
      selectedCompanyId,
    ]);

  /* =========================================================
     회사 선택
  ========================================================= */

  async function handleCompanyChange(
    event,
  ) {
    const companyId =
      event.target.value;

    setSelectedCompanyId(
      companyId,
    );

    await loadStats(
      companyId,
    );
  }

  /* =========================================================
     새로고침
  ========================================================= */

  async function refreshStats() {
    await loadStats(
      selectedCompanyId,
    );
  }

  /* =========================================================
     로딩
  ========================================================= */

  if (loading) {
    return (
      <main
        style={
          styles.page
        }
      >
        <div
          style={
            styles.centerBox
          }
        >
          <div
            style={
              styles.loadingIcon
            }
          >
            📊
          </div>

          <div
            style={
              styles.loadingTitle
            }
          >
            로그 분석을
            불러오는 중...
          </div>

          <div
            style={
              styles.loadingText
            }
          >
            전체 업체의
            자동견적과 상담
            데이터를 집계하고
            있습니다.
          </div>
        </div>
      </main>
    );
  }

  /* =========================================================
     권한 없음
  ========================================================= */

  if (!authorized) {
    return (
      <main
        style={
          styles.page
        }
      >
        <div
          style={
            styles.centerBox
          }
        >
          <div
            style={
              styles.deniedIcon
            }
          >
            🔒
          </div>

          <h2
            style={
              styles.deniedTitle
            }
          >
            접근할 수 없습니다
          </h2>

          <div
            style={
              styles.deniedText
            }
          >
            슈퍼관리자 전용
            페이지입니다.
          </div>

          {message && (
            <div
              style={
                styles.errorBox
              }
            >
              {message}
            </div>
          )}

          <button
            type="button"
            style={
              styles.homeButton
            }
            onClick={() => {
              window.location.href =
                "/admin";
            }}
          >
            관리자 페이지로 이동
          </button>
        </div>
      </main>
    );
  }

  /* =========================================================
     화면
  ========================================================= */

  return (
    <main
      style={
        styles.page
      }
    >
      <div
        style={
          styles.container
        }
      >

        {/* =====================================================
            헤더
        ===================================================== */}

        <div
          style={
            styles.header
          }
        >
          <div>
            <div
              style={
                styles.badge
              }
            >
              SUPER ADMIN
            </div>

            <h1
              style={
                styles.title
              }
            >
              📊 전체 로그 분석
            </h1>

            <div
              style={
                styles.subtitle
              }
            >
              전체 업체 또는
              특정 업체의 자동견적과
              상담 전환을 확인합니다.
            </div>
          </div>

          <button
            type="button"
            style={
              styles.backButton
            }
            onClick={() => {
              window.location.href =
                "/super-admin";
            }}
          >
            ← 돌아가기
          </button>
        </div>

        {/* =====================================================
            로그인 정보
        ===================================================== */}

        <div
          style={
            styles.loginBox
          }
        >
          <div>
            <div
              style={
                styles.smallLabel
              }
            >
              슈퍼관리자
            </div>

            <div
              style={
                styles.adminName
              }
            >
              {adminName}
            </div>
          </div>

          <div
            style={
              styles.email
            }
          >
            {userEmail}
          </div>
        </div>

        {/* =====================================================
            조회 대상
        ===================================================== */}

        <section
          style={
            styles.section
          }
        >
          <div
            style={
              styles.sectionHeader
            }
          >
            <div>
              <h2
                style={
                  styles.sectionTitle
                }
              >
                조회 대상
              </h2>

              <div
                style={
                  styles.sectionDescription
                }
              >
                전체 업체 또는
                특정 업체를 선택할
                수 있습니다.
              </div>
            </div>

            <button
              type="button"
              style={
                styles.refreshButton
              }
              disabled={
                statsLoading
              }
              onClick={
                refreshStats
              }
            >
              {statsLoading
                ? "조회 중..."
                : "새로고침"}
            </button>
          </div>

          <select
            value={
              selectedCompanyId
            }
            onChange={
              handleCompanyChange
            }
            disabled={
              statsLoading
            }
            style={
              styles.select
            }
          >
            <option value="">
              전체 업체
            </option>

            {companies.map(
              (
                company,
              ) => (
                <option
                  key={
                    company.id
                  }
                  value={
                    company.id
                  }
                >
                  {company.company_name ||
                    "회사명 없음"}
                </option>
              ),
            )}
          </select>

          <div
            style={
              styles.targetBox
            }
          >
            <span
              style={
                styles.targetLabel
              }
            >
              현재 조회
            </span>

            <strong>
              {selectedCompany
                ? selectedCompany.company_name
                : "전체 업체"}
            </strong>
          </div>

          {message && (
            <div
              style={
                styles.errorMessage
              }
            >
              {message}
            </div>
          )}
        </section>

        {/* =====================================================
            로그 통계
        ===================================================== */}

        <section
          style={
            styles.section
          }
        >
          <div
            style={
              styles.sectionHeader
            }
          >
            <div>
              <h2
                style={
                  styles.sectionTitle
                }
              >
                자동견적 로그
              </h2>

              <div
                style={
                  styles.sectionDescription
                }
              >
                한국시간 기준으로
                집계합니다.
              </div>
            </div>
          </div>

          <div
            style={
              styles.statsGrid
            }
          >
            <LogCard
              label="오늘 자동견적"
              value={
                stats.today
              }
              suffix="건"
              loading={
                statsLoading
              }
            />

            <LogCard
              label="최근 7일"
              value={
                stats.seven_days
              }
              suffix="건"
              loading={
                statsLoading
              }
            />

            <LogCard
              label="전체 자동견적"
              value={
                stats.total
              }
              suffix="건"
              loading={
                statsLoading
              }
            />

            <LogCard
              label="예상 사용자"
              value={
                stats.sessions
              }
              suffix="명"
              loading={
                statsLoading
              }
            />

            <LogCard
              label="상세 상담"
              value={
                stats.leads
              }
              suffix="건"
              loading={
                statsLoading
              }
            />

            <LogCard
              label="견적→상담 전환"
              value={
                stats.converted
              }
              suffix="건"
              loading={
                statsLoading
              }
            />
          </div>

          <div
            style={
              styles.conversionCard
            }
          >
            <div
              style={
                styles.conversionLabel
              }
            >
              자동견적 → 상세상담
              전환율
            </div>

            <div
              style={
                styles.conversionValue
              }
            >
              {statsLoading
                ? "..."
                : `${Number(
                    stats.conversion ||
                      0,
                  ).toLocaleString(
                    "ko-KR",
                  )}%`}
            </div>
          </div>

          <div
            style={
              styles.summaryBox
            }
          >
            {selectedCompany
              ? `${selectedCompany.company_name} 기준`
              : "전체 업체 기준"}

            {" · "}

            자동견적{" "}
            {Number(
              stats.total || 0,
            ).toLocaleString(
              "ko-KR",
            )}
            건

            {" · "}

            사용자{" "}
            {Number(
              stats.sessions ||
                0,
            ).toLocaleString(
              "ko-KR",
            )}
            명

            {" · "}

            상세상담{" "}
            {Number(
              stats.leads || 0,
            ).toLocaleString(
              "ko-KR",
            )}
            건

            {" · "}

            전환{" "}
            {Number(
              stats.converted ||
                0,
            ).toLocaleString(
              "ko-KR",
            )}
            건
          </div>
        </section>

        {/* =====================================================
            업체 선택
        ===================================================== */}

        <section
          style={
            styles.section
          }
        >
          <div
            style={
              styles.sectionHeader
            }
          >
            <div>
              <h2
                style={
                  styles.sectionTitle
                }
              >
                업체 선택
              </h2>

              <div
                style={
                  styles.sectionDescription
                }
              >
                업체를 누르면 해당
                업체의 로그만
                조회합니다.
              </div>
            </div>
          </div>

          <div
            style={
              styles.companyGrid
            }
          >
            <button
              type="button"
              disabled={
                statsLoading
              }
              style={{
                ...styles.companyButton,

                ...(!selectedCompanyId
                  ? styles.companyButtonActive
                  : {}),
              }}
              onClick={
                async () => {
                  setSelectedCompanyId(
                    "",
                  );

                  await loadStats(
                    "",
                  );
                }
              }
            >
              <span>
                전체 업체
              </span>

              <small>
                {companies.length}
                개 업체
              </small>
            </button>

            {companies.map(
              (
                company,
              ) => {
                const active =
                  selectedCompanyId ===
                  company.id;

                return (
                  <button
                    type="button"
                    key={
                      company.id
                    }
                    disabled={
                      statsLoading
                    }
                    style={{
                      ...styles.companyButton,

                      ...(active
                        ? styles.companyButtonActive
                        : {}),
                    }}
                    onClick={
                      async () => {
                        setSelectedCompanyId(
                          company.id,
                        );

                        await loadStats(
                          company.id,
                        );
                      }
                    }
                  >
                    <span>
                      {company.company_name ||
                        "회사명 없음"}
                    </span>

                    <small>
                      {company.is_active
                        ? "활성"
                        : "정지"}
                    </small>
                  </button>
                );
              },
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

/* =========================================================
   로그 카드
========================================================= */

function LogCard({
  label,
  value,
  suffix,
  loading,
}) {
  return (
    <div
      style={
        styles.statCard
      }
    >
      <div
        style={
          styles.statLabel
        }
      >
        {label}
      </div>

      <div
        style={
          styles.statValue
        }
      >
        {loading
          ? "..."
          : Number(
              value || 0,
            ).toLocaleString(
              "ko-KR",
            )}

        {!loading && (
          <span
            style={
              styles.statSuffix
            }
          >
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

/* =========================================================
   스타일
========================================================= */

const styles = {
  page: {
    minHeight: "100vh",
    background: "#f3f4f6",
    color: "#111827",
    padding:
      "18px 14px 50px",
  },

  container: {
    width: "100%",
    maxWidth: "900px",
    margin: "0 auto",
  },

  header: {
    display: "flex",
    justifyContent:
      "space-between",
    alignItems:
      "flex-start",
    gap: "12px",
    marginBottom: "16px",
  },

  badge: {
    display: "inline-block",
    padding: "5px 8px",
    borderRadius: "999px",
    background: "#111827",
    color: "#ffffff",
    fontSize: "10px",
    fontWeight: 900,
    letterSpacing: "1px",
    marginBottom: "7px",
  },

  title: {
    margin: 0,
    fontSize: "26px",
    fontWeight: 900,
    letterSpacing: "-0.6px",
  },

  subtitle: {
    marginTop: "5px",
    color: "#6b7280",
    fontSize: "13px",
    lineHeight: 1.5,
  },

  backButton: {
    border:
      "1px solid #d1d5db",
    borderRadius: "10px",
    background: "#ffffff",
    padding: "10px 12px",
    fontWeight: 800,
    fontSize: "12px",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },

  loginBox: {
    display: "flex",
    justifyContent:
      "space-between",
    alignItems: "center",
    gap: "12px",
    background: "#ffffff",
    borderRadius: "14px",
    padding: "14px",
    border:
      "1px solid #e5e7eb",
    marginBottom: "14px",
  },

  smallLabel: {
    fontSize: "11px",
    color: "#6b7280",
    marginBottom: "3px",
  },

  adminName: {
    fontSize: "15px",
    fontWeight: 900,
  },

  email: {
    fontSize: "12px",
    color: "#6b7280",
    textAlign: "right",
    wordBreak: "break-all",
  },

  section: {
    background: "#ffffff",
    borderRadius: "16px",
    padding: "15px",
    border:
      "1px solid #e5e7eb",
    marginBottom: "14px",
  },

  sectionHeader: {
    display: "flex",
    justifyContent:
      "space-between",
    alignItems:
      "flex-start",
    gap: "10px",
    marginBottom: "13px",
  },

  sectionTitle: {
    margin: 0,
    fontSize: "19px",
    fontWeight: 900,
  },

  sectionDescription: {
    marginTop: "4px",
    color: "#6b7280",
    fontSize: "12px",
    lineHeight: 1.5,
  },

  refreshButton: {
    border:
      "1px solid #d1d5db",
    background: "#ffffff",
    borderRadius: "9px",
    padding: "8px 10px",
    fontSize: "12px",
    fontWeight: 800,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },

  select: {
    width: "100%",
    boxSizing:
      "border-box",
    minHeight: "46px",
    border:
      "1px solid #d1d5db",
    borderRadius: "10px",
    background: "#ffffff",
    color: "#111827",
    padding: "0 12px",
    fontSize: "14px",
    fontWeight: 700,
    outline: "none",
  },

  targetBox: {
    marginTop: "10px",
    padding: "10px 12px",
    borderRadius: "10px",
    background: "#f8fafc",
    border:
      "1px solid #e2e8f0",
    display: "flex",
    justifyContent:
      "space-between",
    alignItems: "center",
    gap: "10px",
    fontSize: "13px",
  },

  targetLabel: {
    color: "#64748b",
  },

  errorMessage: {
    marginTop: "10px",
    padding: "10px",
    borderRadius: "9px",
    background: "#fef2f2",
    border:
      "1px solid #fecaca",
    color: "#991b1b",
    fontSize: "12px",
    lineHeight: 1.5,
  },

  statsGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(2, minmax(0, 1fr))",
    gap: "9px",
  },

  statCard: {
    minWidth: 0,
    background: "#f8fafc",
    border:
      "1px solid #e5e7eb",
    borderRadius: "13px",
    padding: "14px",
  },

  statLabel: {
    color: "#6b7280",
    fontSize: "12px",
    fontWeight: 700,
  },

  statValue: {
    marginTop: "7px",
    fontSize: "25px",
    lineHeight: 1.1,
    fontWeight: 900,
    wordBreak: "break-word",
  },

  statSuffix: {
    marginLeft: "3px",
    fontSize: "13px",
    color: "#6b7280",
    fontWeight: 700,
  },

  conversionCard: {
    marginTop: "10px",
    borderRadius: "14px",
    background: "#111827",
    color: "#ffffff",
    padding: "17px",
  },

  conversionLabel: {
    fontSize: "13px",
    fontWeight: 700,
    opacity: 0.8,
  },

  conversionValue: {
    marginTop: "5px",
    fontSize: "32px",
    fontWeight: 900,
  },

  summaryBox: {
    marginTop: "10px",
    padding: "11px",
    borderRadius: "10px",
    background: "#f0fdf4",
    border:
      "1px solid #bbf7d0",
    color: "#166534",
    fontSize: "12px",
    fontWeight: 700,
    lineHeight: 1.6,
  },

  companyGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(2, minmax(0, 1fr))",
    gap: "8px",
  },

  companyButton: {
    minWidth: 0,
    minHeight: "58px",
    border:
      "1px solid #d1d5db",
    borderRadius: "11px",
    background: "#ffffff",
    color: "#111827",
    padding: "10px",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    justifyContent: "center",
    gap: "3px",
    textAlign: "left",
    fontWeight: 900,
    wordBreak: "break-word",
  },

  companyButtonActive: {
    background: "#111827",
    color: "#ffffff",
    borderColor: "#111827",
  },

  centerBox: {
    width: "100%",
    maxWidth: "420px",
    margin:
      "100px auto 0",
    background: "#ffffff",
    border:
      "1px solid #e5e7eb",
    borderRadius: "18px",
    padding: "28px 20px",
    textAlign: "center",
  },

  loadingIcon: {
    fontSize: "40px",
    marginBottom: "10px",
  },

  loadingTitle: {
    fontSize: "18px",
    fontWeight: 900,
  },

  loadingText: {
    marginTop: "7px",
    color: "#6b7280",
    fontSize: "13px",
    lineHeight: 1.6,
  },

  deniedIcon: {
    fontSize: "42px",
  },

  deniedTitle: {
    margin:
      "12px 0 5px",
    fontSize: "20px",
  },

  deniedText: {
    color: "#6b7280",
    fontSize: "13px",
  },

  errorBox: {
    marginTop: "15px",
    padding: "10px",
    borderRadius: "9px",
    background: "#fef2f2",
    color: "#991b1b",
    fontSize: "12px",
    lineHeight: 1.5,
  },

  homeButton: {
    marginTop: "16px",
    width: "100%",
    minHeight: "44px",
    border: 0,
    borderRadius: "10px",
    background: "#111827",
    color: "#ffffff",
    fontWeight: 900,
    cursor: "pointer",
  },
};
