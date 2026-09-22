"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { supabase } from "../../../lib/supabase";

export default function SuperAdminPage() {
  const [loading, setLoading] = useState(true);
  const [changingId, setChangingId] =
    useState(null);

  const [authorized, setAuthorized] =
    useState(false);

  const [adminName, setAdminName] =
    useState("");

  const [userEmail, setUserEmail] =
    useState("");

  const [companies, setCompanies] =
    useState([]);

  const [search, setSearch] =
    useState("");

  const [message, setMessage] =
    useState("");

  /* =========================================================
     슈퍼관리자 확인
  ========================================================= */

  const checkSuperAdmin =
    useCallback(async () => {
      const {
        data: authData,
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) {
        throw new Error(
          `로그인 확인 실패: ${authError.message}`
        );
      }

      const user = authData?.user;

      if (!user?.id) {
        throw new Error(
          "로그인이 필요합니다."
        );
      }

      setUserEmail(user.email || "");

      const {
        data,
        error,
      } = await supabase.rpc(
        "get_super_admin_status"
      );

      if (error) {
        throw new Error(
          `슈퍼관리자 확인 실패: ${error.message}`
        );
      }

      const status =
        Array.isArray(data)
          ? data[0]
          : data;

      if (!status?.is_super_admin) {
        throw new Error(
          "슈퍼관리자 권한이 없습니다."
        );
      }

      setAuthorized(true);

      setAdminName(
        status?.name ||
          "슈퍼관리자"
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
      } = await supabase.rpc(
        "super_admin_get_companies"
      );

      if (error) {
        throw new Error(
          `회사 목록 조회 실패: ${error.message}`
        );
      }

      setCompanies(
        Array.isArray(data)
          ? data
          : []
      );
    }, []);

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

        if (!alive) return;

        await loadCompanies();
      } catch (error) {
        console.error(
          "슈퍼관리자 초기화:",
          error
        );

        if (!alive) return;

        setAuthorized(false);

        setMessage(
          `❌ ${
            error?.message ||
            "페이지를 불러오지 못했습니다."
          }`
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
  ]);

  /* =========================================================
     회사 활성 / 정지
  ========================================================= */

  async function changeCompanyActive(
    company
  ) {
    if (!company?.id) return;

    const nextActive =
      !Boolean(company.is_active);

    const actionText =
      nextActive
        ? "활성화"
        : "정지";

    const confirmed =
      window.confirm(
        `${
          company.company_name ||
          "회사"
        }를 ${actionText}할까요?`
      );

    if (!confirmed) return;

    setChangingId(company.id);
    setMessage("");

    try {
      const {
        data,
        error,
      } = await supabase.rpc(
        "super_admin_set_company_active",
        {
          p_company_id:
            company.id,

          p_is_active:
            nextActive,
        }
      );

      if (error) {
        throw error;
      }

      const updated =
        Array.isArray(data)
          ? data[0]
          : data;

      setCompanies(
        (current) =>
          current.map((item) =>
            item.id ===
            company.id
              ? {
                  ...item,

                  is_active:
                    updated?.is_active ??
                    nextActive,
                }
              : item
          )
      );

      setMessage(
        `✅ ${
          company.company_name
        } ${
          nextActive
            ? "활성화"
            : "정지"
        } 완료`
      );
    } catch (error) {
      console.error(
        "회사 상태 변경:",
        error
      );

      setMessage(
        `❌ 회사 상태 변경 실패: ${
          error?.message ||
          "오류가 발생했습니다."
        }`
      );
    } finally {
      setChangingId(null);
    }
  }

  /* =========================================================
     회사 상세관리 이동
  ========================================================= */

  function openCompany(company) {
    if (!company?.id) return;

    window.location.href =
      `/super-admin/company/${company.id}`;
  }

  /* =========================================================
     요금제 관리 이동
  ========================================================= */

  function openPlans() {
    window.location.href =
      "/super-admin/plans";
  }

  /* =========================================================
     검색
  ========================================================= */

  const filteredCompanies =
    useMemo(() => {
      const keyword =
        search
          .trim()
          .toLowerCase();

      if (!keyword) {
        return companies;
      }

      return companies.filter(
        (company) => {
          const text = [
            company.company_name,
            company.slug,
            company.representative_name,
            company.phone,
            company.address,
            company.subscription_plan,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

          return text.includes(
            keyword
          );
        }
      );
    }, [
      companies,
      search,
    ]);

  /* =========================================================
     통계
  ========================================================= */

  const totalCount =
    companies.length;

  const activeCount =
    companies.filter(
      (item) =>
        item.is_active === true
    ).length;

  const inactiveCount =
    totalCount -
    activeCount;

  /* =========================================================
     로딩
  ========================================================= */

  if (loading) {
    return (
      <main style={styles.page}>
        <div style={styles.centerBox}>
          <div
            style={
              styles.loadingIcon
            }
          >
            🛡️
          </div>

          <div
            style={
              styles.loadingTitle
            }
          >
            슈퍼관리자 확인 중...
          </div>

          <div
            style={
              styles.loadingText
            }
          >
            관리자 권한과 회사
            정보를 불러오고
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
      <main style={styles.page}>
        <div style={styles.centerBox}>
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
    <main style={styles.page}>
      <div style={styles.container}>

        {/* 헤더 */}

        <div style={styles.header}>
          <div>
            <div
              style={styles.badge}
            >
              SUPER ADMIN
            </div>

            <h1
              style={styles.title}
            >
              🛡️ 서비스 관리
            </h1>

            <div
              style={
                styles.subtitle
              }
            >
              전체 회사 계정과
              서비스 요금제를
              관리합니다.
            </div>
          </div>

          <button
            type="button"
            style={
              styles.adminButton
            }
            onClick={() => {
              window.location.href =
                "/admin";
            }}
          >
            회사 관리자
          </button>
        </div>

        {/* 로그인 정보 */}

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
            style={styles.email}
          >
            {userEmail}
          </div>
        </div>

        {/* =====================================================
            슈퍼관리자 메뉴
        ===================================================== */}

        <div
          style={
            styles.menuGrid
          }
        >
          <button
            type="button"
            style={{
              ...styles.menuButton,
              ...styles.menuButtonActive,
            }}
          >
            <span
              style={
                styles.menuIcon
              }
            >
              🏢
            </span>

            <span>
              업체 관리
            </span>
          </button>

          <button
            type="button"
            style={
              styles.menuButton
            }
            onClick={openPlans}
          >
            <span
              style={
                styles.menuIcon
              }
            >
              💳
            </span>

            <span>
              요금제 관리
            </span>
          </button>
        </div>

        {/* 통계 */}

        <div
          style={
            styles.statsGrid
          }
        >
          <StatCard
            label="전체 회사"
            value={totalCount}
          />

          <StatCard
            label="활성"
            value={activeCount}
          />

          <StatCard
            label="정지"
            value={inactiveCount}
          />
        </div>

        {/* 회사 관리 */}

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
                회사 관리
              </h2>

              <div
                style={
                  styles.sectionDescription
                }
              >
                가입된 회사를
                조회하고 서비스
                이용 상태를
                관리합니다.
              </div>
            </div>

            <button
              type="button"
              style={
                styles.refreshButton
              }
              onClick={
                async () => {
                  setMessage("");

                  try {
                    await loadCompanies();

                    setMessage(
                      "✅ 회사 목록을 새로고침했습니다."
                    );
                  } catch (
                    error
                  ) {
                    setMessage(
                      `❌ ${
                        error?.message ||
                        "새로고침 실패"
                      }`
                    );
                  }
                }
              }
            >
              새로고침
            </button>
          </div>

          {/* 검색 */}

          <input
            type="search"
            value={search}
            onChange={(
              event
            ) =>
              setSearch(
                event.target.value
              )
            }
            placeholder="회사명, 대표자, 전화번호 검색"
            style={
              styles.searchInput
            }
          />

          {/* 메시지 */}

          {message && (
            <div
              style={{
                ...styles.message,

                ...(message.startsWith(
                  "❌"
                )
                  ? styles.messageError
                  : styles.messageSuccess),
              }}
            >
              {message}
            </div>
          )}

          {/* 회사 목록 */}

          <div
            style={
              styles.companyList
            }
          >
            {filteredCompanies.length ===
            0 ? (
              <div
                style={
                  styles.empty
                }
              >
                검색 결과가
                없습니다.
              </div>
            ) : (
              filteredCompanies.map(
                (company) => (
                  <CompanyCard
                    key={
                      company.id
                    }
                    company={
                      company
                    }
                    changing={
                      changingId ===
                      company.id
                    }
                    onManage={() =>
                      openCompany(
                        company
                      )
                    }
                    onToggle={() =>
                      changeCompanyActive(
                        company
                      )
                    }
                  />
                )
              )
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

/* =========================================================
   통계 카드
========================================================= */

function StatCard({
  label,
  value,
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
        {value}
      </div>
    </div>
  );
}

/* =========================================================
   회사 카드
========================================================= */

function CompanyCard({
  company,
  changing,
  onToggle,
  onManage,
}) {
  const active =
    company?.is_active ===
    true;

  return (
    <div
      style={
        styles.companyCard
      }
    >
      <div
        style={
          styles.companyTop
        }
      >
        <div
          style={{
            minWidth: 0,
          }}
        >
          <div
            style={
              styles.companyNameRow
            }
          >
            <div
              style={
                styles.companyName
              }
            >
              {company.company_name ||
                "회사명 없음"}
            </div>

            <span
              style={{
                ...styles.statusBadge,

                ...(active
                  ? styles.activeBadge
                  : styles.inactiveBadge),
              }}
            >
              {active
                ? "활성"
                : "정지"}
            </span>
          </div>

          {company.slug && (
            <div
              style={
                styles.slug
              }
            >
              /{company.slug}
            </div>
          )}
        </div>

        <button
          type="button"
          disabled={changing}
          onClick={onToggle}
          style={{
            ...styles.toggleButton,

            ...(active
              ? styles.stopButton
              : styles.activateButton),

            opacity:
              changing
                ? 0.6
                : 1,
          }}
        >
          {changing
            ? "처리 중..."
            : active
              ? "회사 정지"
              : "활성화"}
        </button>
      </div>

      <div
        style={
          styles.divider
        }
      />

      <InfoRow
        label="대표자"
        value={
          company.representative_name ||
          "-"
        }
      />

      <InfoRow
        label="전화번호"
        value={
          company.phone ||
          "-"
        }
      />

      <InfoRow
        label="요금제"
        value={
          company.subscription_plan ||
          "basic"
        }
      />

      <InfoRow
        label="가입일"
        value={
          company.created_at
            ? new Date(
                company.created_at
              ).toLocaleDateString(
                "ko-KR",
                {
                  timeZone:
                    "Asia/Seoul",
                }
              )
            : "-"
        }
      />

      {/* 회사 상세관리 */}

      <button
        type="button"
        onClick={onManage}
        style={
          styles.manageButton
        }
      >
        ⚙️ 회사 관리
      </button>

      <div
        style={
          styles.companyId
        }
      >
        ID: {company.id}
      </div>
    </div>
  );
}

/* =========================================================
   정보 행
========================================================= */

function InfoRow({
  label,
  value,
}) {
  return (
    <div
      style={
        styles.infoRow
      }
    >
      <span
        style={
          styles.infoLabel
        }
      >
        {label}
      </span>

      <span
        style={
          styles.infoValue
        }
      >
        {value}
      </span>
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
    alignItems: "flex-start",
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

  adminButton: {
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

  /* =======================================================
     슈퍼관리자 메뉴
  ======================================================= */

  menuGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(2, minmax(0, 1fr))",
    gap: "8px",
    marginBottom: "14px",
  },

  menuButton: {
    minHeight: "58px",
    border:
      "1px solid #d1d5db",
    borderRadius: "13px",
    background: "#ffffff",
    color: "#374151",
    fontWeight: 900,
    fontSize: "13px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "7px",
  },

  menuButtonActive: {
    background: "#111827",
    borderColor: "#111827",
    color: "#ffffff",
  },

  menuIcon: {
    fontSize: "18px",
  },

  statsGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(3, minmax(0, 1fr))",
    gap: "8px",
    marginBottom: "14px",
  },

  statCard: {
    background: "#ffffff",
    border:
      "1px solid #e5e7eb",
    borderRadius: "14px",
    padding: "14px 10px",
    textAlign: "center",
  },

  statLabel: {
    fontSize: "12px",
    color: "#6b7280",
    fontWeight: 700,
  },

  statValue: {
    marginTop: "5px",
    fontSize: "25px",
    fontWeight: 900,
  },

  section: {
    background: "#ffffff",
    borderRadius: "16px",
    padding: "15px",
    border:
      "1px solid #e5e7eb",
  },

  sectionHeader: {
    display: "flex",
    justifyContent:
      "space-between",
    alignItems: "flex-start",
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

  searchInput: {
    width: "100%",
    boxSizing: "border-box",
    minHeight: "44px",
    border:
      "1px solid #d1d5db",
    borderRadius: "10px",
    padding: "0 12px",
    fontSize: "14px",
    outline: "none",
    marginBottom: "12px",
  },

  message: {
    padding: "10px",
    borderRadius: "9px",
    marginBottom: "12px",
    fontSize: "13px",
    lineHeight: 1.5,
  },

  messageSuccess: {
    background: "#f0fdf4",
    color: "#166534",
    border:
      "1px solid #bbf7d0",
  },

  messageError: {
    background: "#fef2f2",
    color: "#991b1b",
    border:
      "1px solid #fecaca",
  },

  companyList: {
    display: "grid",
    gap: "10px",
  },

  companyCard: {
    border:
      "1px solid #e5e7eb",
    borderRadius: "13px",
    padding: "13px",
    background: "#fafafa",
  },

  companyTop: {
    display: "flex",
    justifyContent:
      "space-between",
    alignItems: "flex-start",
    gap: "10px",
  },

  companyNameRow: {
    display: "flex",
    alignItems: "center",
    gap: "7px",
    flexWrap: "wrap",
  },

  companyName: {
    fontSize: "17px",
    fontWeight: 900,
    wordBreak: "break-word",
  },

  slug: {
    marginTop: "3px",
    color: "#9ca3af",
    fontSize: "11px",
  },

  statusBadge: {
    padding: "4px 7px",
    borderRadius: "999px",
    fontSize: "10px",
    fontWeight: 900,
  },

  activeBadge: {
    background: "#dcfce7",
    color: "#166534",
  },

  inactiveBadge: {
    background: "#fee2e2",
    color: "#991b1b",
  },

  toggleButton: {
    border: 0,
    borderRadius: "9px",
    padding: "9px 11px",
    fontWeight: 900,
    fontSize: "12px",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },

  stopButton: {
    background: "#fee2e2",
    color: "#991b1b",
  },

  activateButton: {
    background: "#dcfce7",
    color: "#166534",
  },

  divider: {
    height: "1px",
    background: "#e5e7eb",
    margin: "12px 0",
  },

  infoRow: {
    display: "flex",
    justifyContent:
      "space-between",
    alignItems: "center",
    gap: "12px",
    padding: "4px 0",
    fontSize: "13px",
  },

  infoLabel: {
    color: "#6b7280",
  },

  infoValue: {
    fontWeight: 700,
    textAlign: "right",
    wordBreak: "break-word",
  },

  manageButton: {
    width: "100%",
    minHeight: "43px",
    marginTop: "13px",
    border: 0,
    borderRadius: "10px",
    background: "#111827",
    color: "#ffffff",
    fontSize: "13px",
    fontWeight: 900,
    cursor: "pointer",
  },

  companyId: {
    marginTop: "9px",
    paddingTop: "8px",
    borderTop:
      "1px dashed #e5e7eb",
    color: "#9ca3af",
    fontSize: "10px",
    wordBreak: "break-all",
  },

  empty: {
    padding: "35px 10px",
    textAlign: "center",
    color: "#9ca3af",
    fontSize: "14px",
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
    boxSizing: "border-box",
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
