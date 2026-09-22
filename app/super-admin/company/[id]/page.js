"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../../lib/supabase";

export default function SuperAdminCompanyDetailPage() {
  const params = useParams();
  const router = useRouter();

  const companyId = useMemo(() => {
    const value = params?.id;

    if (Array.isArray(value)) {
      return value[0];
    }

    return value || "";
  }, [params]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [user, setUser] = useState(null);
  const [company, setCompany] = useState(null);
  const [companyUsers, setCompanyUsers] = useState([]);

  // ============================================================
  // 이번 달 사용량
  // ============================================================

  const [usage, setUsage] = useState({
    ai_photo_analysis: 0,
    auto_estimate: 0,
    similar_image_search: 0,
    virtual_remodel: 0,
    image_upload: 0,
    storage_mb: 0,
    customer_lead: 0,
    total_cost_krw: 0,
  });

  const [usageLoading, setUsageLoading] = useState(false);

  const [form, setForm] = useState({
    company_name: "",
    representative_name: "",
    phone: "",
    address: "",
    subscription_plan: "basic",
  });

  // ============================================================
  // 날짜 표시
  // ============================================================

  function formatDate(value) {
    if (!value) return "-";

    try {
      return new Intl.DateTimeFormat("ko-KR", {
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(value));
    } catch {
      return "-";
    }
  }

  // ============================================================
  // 숫자 표시
  // ============================================================

  function formatNumber(value) {
    const number = Number(value || 0);

    if (!Number.isFinite(number)) {
      return "0";
    }

    return new Intl.NumberFormat("ko-KR", {
      maximumFractionDigits: 2,
    }).format(number);
  }

  // ============================================================
  // 원화 표시
  // ============================================================

  function formatWon(value) {
    const number = Number(value || 0);

    if (!Number.isFinite(number)) {
      return "₩0";
    }

    return `₩${Math.round(number).toLocaleString("ko-KR")}`;
  }

  // ============================================================
  // 메시지
  // ============================================================

  function showMessage(text) {
    setMessage(text);

    setTimeout(() => {
      setMessage("");
    }, 3000);
  }

  // ============================================================
  // 로그인 + 슈퍼관리자 확인
  // ============================================================

  async function checkSuperAdmin() {
    try {
      setCheckingAuth(true);
      setError("");

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        throw sessionError;
      }

      if (!session?.user) {
        setError("로그인이 필요합니다.");
        setUser(null);
        return false;
      }

      setUser(session.user);

      const { data, error: rpcError } = await supabase.rpc(
        "is_super_admin"
      );

      if (rpcError) {
        throw rpcError;
      }

      if (!data) {
        setError("슈퍼관리자 권한이 없습니다.");
        return false;
      }

      return true;
    } catch (err) {
      console.error("슈퍼관리자 확인 오류:", err);

      setError(
        err?.message
          ? `권한 확인 실패: ${err.message}`
          : "슈퍼관리자 권한을 확인할 수 없습니다."
      );

      return false;
    } finally {
      setCheckingAuth(false);
    }
  }

  // ============================================================
  // 회사 상세 조회
  // ============================================================

  async function loadCompany() {
    if (!companyId) {
      throw new Error("회사 ID가 없습니다.");
    }

    try {
      const { data, error: rpcError } = await supabase.rpc(
        "super_admin_get_company",
        {
          p_company_id: companyId,
        }
      );

      if (rpcError) {
        throw rpcError;
      }

      const row = Array.isArray(data) ? data[0] : data;

      if (!row) {
        setCompany(null);
        throw new Error("회사 정보를 찾을 수 없습니다.");
      }

      setCompany(row);

      setForm({
        company_name: row.company_name || "",
        representative_name: row.representative_name || "",
        phone: row.phone || "",
        address: row.address || "",
        subscription_plan: row.subscription_plan || "basic",
      });

      return row;
    } catch (err) {
      console.error("회사 조회 오류:", err);

      throw new Error(
        err?.message
          ? `회사 조회 실패: ${err.message}`
          : "회사 정보를 불러오지 못했습니다."
      );
    }
  }

  // ============================================================
  // 회사 사용자 조회
  // ============================================================

  async function loadCompanyUsers() {
    if (!companyId) return;

    try {
      const { data, error: rpcError } = await supabase.rpc(
        "super_admin_get_company_users",
        {
          p_company_id: companyId,
        }
      );

      if (rpcError) {
        throw rpcError;
      }

      setCompanyUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("회사 사용자 조회 오류:", err);

      throw new Error(
        err?.message
          ? `회사 사용자 조회 실패: ${err.message}`
          : "회사 사용자 정보를 불러오지 못했습니다."
      );
    }
  }

  // ============================================================
  // 이번 달 사용량 조회
  // ============================================================

  async function loadCompanyUsage() {
    if (!companyId) return;

    try {
      setUsageLoading(true);

      const { data, error: rpcError } = await supabase.rpc(
        "super_admin_get_company_usage",
        {
          p_company_id: companyId,
        }
      );

      if (rpcError) {
        throw rpcError;
      }

      const nextUsage = {
        ai_photo_analysis: 0,
        auto_estimate: 0,
        similar_image_search: 0,
        virtual_remodel: 0,
        image_upload: 0,
        storage_mb: 0,
        customer_lead: 0,
        total_cost_krw: 0,
      };

      const rows = Array.isArray(data) ? data : [];

      rows.forEach((row) => {
        const eventType = row?.event_type;

        if (
          eventType &&
          Object.prototype.hasOwnProperty.call(
            nextUsage,
            eventType
          )
        ) {
          nextUsage[eventType] += Number(
            row?.total_quantity || 0
          );
        }

        nextUsage.total_cost_krw += Number(
          row?.total_cost_krw || 0
        );
      });

      setUsage(nextUsage);
    } catch (err) {
      console.error("회사 사용량 조회 오류:", err);

      throw new Error(
        err?.message
          ? `사용량 조회 실패: ${err.message}`
          : "사용량 정보를 불러오지 못했습니다."
      );
    } finally {
      setUsageLoading(false);
    }
  }

  // ============================================================
  // 전체 로드
  // ============================================================

  async function loadAll() {
    try {
      setLoading(true);
      setError("");

      const allowed = await checkSuperAdmin();

      if (!allowed) {
        return;
      }

      await Promise.all([
        loadCompany(),
        loadCompanyUsers(),
        loadCompanyUsage(),
      ]);
    } catch (err) {
      console.error("상세페이지 로드 오류:", err);

      setError(
        err?.message ||
          "회사 정보를 불러오는 중 오류가 발생했습니다."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!companyId) return;

    loadAll();
  }, [companyId]);

  // ============================================================
  // 입력 변경
  // ============================================================

  function handleChange(e) {
    const { name, value } = e.target;

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  // ============================================================
  // 회사정보 저장
  // ============================================================

  async function saveCompany() {
    if (!companyId) {
      alert("회사 ID가 없습니다.");
      return;
    }

    if (!form.company_name.trim()) {
      alert("회사명을 입력해주세요.");
      return;
    }

    const confirmed = window.confirm(
      "회사 정보를 저장하시겠습니까?"
    );

    if (!confirmed) return;

    try {
      setSaving(true);
      setError("");

      const { data, error: rpcError } = await supabase.rpc(
        "super_admin_update_company",
        {
          p_company_id: companyId,
          p_company_name: form.company_name.trim(),
          p_representative_name:
            form.representative_name.trim() || null,
          p_phone: form.phone.trim() || null,
          p_address: form.address.trim() || null,
          p_subscription_plan:
            form.subscription_plan.trim() || "basic",
        }
      );

      if (rpcError) {
        throw rpcError;
      }

      const updated = Array.isArray(data) ? data[0] : data;

      if (updated) {
        setCompany(updated);

        setForm({
          company_name: updated.company_name || "",
          representative_name:
            updated.representative_name || "",
          phone: updated.phone || "",
          address: updated.address || "",
          subscription_plan:
            updated.subscription_plan || "basic",
        });
      }

      showMessage("회사 정보가 저장되었습니다.");
    } catch (err) {
      console.error("회사 저장 오류:", err);

      setError(
        err?.message
          ? `저장 실패: ${err.message}`
          : "회사 정보 저장에 실패했습니다."
      );
    } finally {
      setSaving(false);
    }
  }

  // ============================================================
  // 사용량 새로고침
  // ============================================================

  async function refreshUsage() {
    try {
      setError("");

      await loadCompanyUsage();

      showMessage("이번 달 사용량을 새로고침했습니다.");
    } catch (err) {
      setError(
        err?.message ||
          "사용량 새로고침에 실패했습니다."
      );
    }
  }

  // ============================================================
  // 사용량 카드
  // ============================================================

  function UsageItem({
    icon,
    label,
    value,
    unit,
  }) {
    return (
      <div style={styles.usageItem}>
        <div style={styles.usageIcon}>
          {icon}
        </div>

        <div style={styles.usageContent}>
          <div style={styles.usageLabel}>
            {label}
          </div>

          <div style={styles.usageValue}>
            {formatNumber(value)}
            <span style={styles.usageUnit}>
              {unit}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // 스타일
  // ============================================================

  const styles = {
    page: {
      minHeight: "100vh",
      background: "#f4f6f8",
      color: "#111827",
      paddingBottom: "60px",
    },

    header: {
      background: "#111827",
      color: "#ffffff",
      padding: "18px 18px 20px",
      position: "sticky",
      top: 0,
      zIndex: 20,
      boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
    },

    headerTop: {
      display: "flex",
      alignItems: "center",
      gap: "12px",
    },

    backButton: {
      border: "none",
      background: "rgba(255,255,255,0.12)",
      color: "#ffffff",
      width: "42px",
      height: "42px",
      borderRadius: "12px",
      fontSize: "22px",
      cursor: "pointer",
    },

    headerTitleWrap: {
      minWidth: 0,
      flex: 1,
    },

    headerTitle: {
      fontSize: "20px",
      fontWeight: "900",
      margin: 0,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    },

    headerSub: {
      marginTop: "4px",
      fontSize: "13px",
      color: "#cbd5e1",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    },

    container: {
      width: "100%",
      maxWidth: "760px",
      margin: "0 auto",
      padding: "18px",
      boxSizing: "border-box",
    },

    card: {
      background: "#ffffff",
      borderRadius: "20px",
      padding: "20px",
      marginBottom: "16px",
      border: "1px solid #e5e7eb",
      boxShadow: "0 2px 8px rgba(15,23,42,0.04)",
    },

    cardTitle: {
      fontSize: "20px",
      fontWeight: "900",
      margin: "0 0 6px",
    },

    cardDescription: {
      margin: "0 0 18px",
      color: "#6b7280",
      fontSize: "14px",
      lineHeight: "1.5",
    },

    statusRow: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: "12px",
    },

    companyName: {
      fontSize: "24px",
      fontWeight: "900",
      margin: 0,
    },

    slug: {
      color: "#9ca3af",
      fontSize: "14px",
      marginTop: "4px",
    },

    activeBadge: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "7px 11px",
      borderRadius: "999px",
      background: "#dcfce7",
      color: "#15803d",
      fontWeight: "800",
      fontSize: "13px",
      whiteSpace: "nowrap",
    },

    inactiveBadge: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "7px 11px",
      borderRadius: "999px",
      background: "#fee2e2",
      color: "#b91c1c",
      fontWeight: "800",
      fontSize: "13px",
      whiteSpace: "nowrap",
    },

    infoGrid: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "10px",
      marginTop: "18px",
    },

    infoBox: {
      background: "#f8fafc",
      borderRadius: "14px",
      padding: "14px",
      minWidth: 0,
    },

    infoLabel: {
      color: "#6b7280",
      fontSize: "12px",
      fontWeight: "700",
      marginBottom: "5px",
    },

    infoValue: {
      fontSize: "14px",
      fontWeight: "800",
      wordBreak: "break-all",
    },

    // ============================================================
    // 사용량 스타일
    // ============================================================

    usageHeader: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: "12px",
      marginBottom: "16px",
    },

    usageRefreshButton: {
      border: "1px solid #d1d5db",
      background: "#ffffff",
      color: "#374151",
      borderRadius: "10px",
      padding: "8px 10px",
      fontSize: "12px",
      fontWeight: "800",
      cursor: "pointer",
      whiteSpace: "nowrap",
    },

    usageGrid: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "10px",
    },

    usageItem: {
      display: "flex",
      alignItems: "center",
      gap: "11px",
      minWidth: 0,
      background: "#f8fafc",
      border: "1px solid #eef2f7",
      borderRadius: "15px",
      padding: "14px",
    },

    usageIcon: {
      width: "38px",
      height: "38px",
      borderRadius: "12px",
      background: "#ffffff",
      border: "1px solid #e5e7eb",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
      fontSize: "18px",
    },

    usageContent: {
      minWidth: 0,
      flex: 1,
    },

    usageLabel: {
      color: "#6b7280",
      fontSize: "11px",
      fontWeight: "700",
      marginBottom: "3px",
    },

    usageValue: {
      color: "#111827",
      fontSize: "19px",
      fontWeight: "900",
      lineHeight: 1.2,
    },

    usageUnit: {
      marginLeft: "3px",
      color: "#6b7280",
      fontSize: "11px",
      fontWeight: "700",
    },

    costBox: {
      marginTop: "12px",
      padding: "18px",
      borderRadius: "16px",
      background: "#111827",
      color: "#ffffff",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "12px",
    },

    costLabel: {
      fontSize: "13px",
      color: "#cbd5e1",
      fontWeight: "700",
    },

    costDescription: {
      marginTop: "4px",
      fontSize: "11px",
      color: "#94a3b8",
    },

    costValue: {
      fontSize: "25px",
      fontWeight: "900",
      whiteSpace: "nowrap",
    },

    usageNotice: {
      marginTop: "12px",
      background: "#fffbeb",
      border: "1px solid #fde68a",
      color: "#92400e",
      borderRadius: "12px",
      padding: "11px",
      fontSize: "12px",
      lineHeight: "1.5",
    },

    field: {
      marginBottom: "16px",
    },

    label: {
      display: "block",
      marginBottom: "7px",
      fontSize: "14px",
      fontWeight: "800",
      color: "#374151",
    },

    input: {
      width: "100%",
      boxSizing: "border-box",
      border: "1px solid #d1d5db",
      background: "#ffffff",
      borderRadius: "13px",
      padding: "14px",
      fontSize: "16px",
      outline: "none",
      color: "#111827",
    },

    select: {
      width: "100%",
      boxSizing: "border-box",
      border: "1px solid #d1d5db",
      background: "#ffffff",
      borderRadius: "13px",
      padding: "14px",
      fontSize: "16px",
      outline: "none",
      color: "#111827",
    },

    saveButton: {
      width: "100%",
      border: "none",
      borderRadius: "14px",
      padding: "15px",
      background: "#111827",
      color: "#ffffff",
      fontSize: "16px",
      fontWeight: "900",
      cursor: "pointer",
    },

    disabledButton: {
      width: "100%",
      border: "none",
      borderRadius: "14px",
      padding: "15px",
      background: "#9ca3af",
      color: "#ffffff",
      fontSize: "16px",
      fontWeight: "900",
      cursor: "not-allowed",
    },

    userCard: {
      border: "1px solid #e5e7eb",
      borderRadius: "15px",
      padding: "15px",
      marginTop: "10px",
    },

    userEmail: {
      fontSize: "16px",
      fontWeight: "900",
      wordBreak: "break-all",
    },

    userMeta: {
      color: "#6b7280",
      fontSize: "13px",
      marginTop: "7px",
      lineHeight: "1.6",
    },

    empty: {
      background: "#f8fafc",
      borderRadius: "14px",
      padding: "20px",
      textAlign: "center",
      color: "#6b7280",
    },

    error: {
      background: "#fee2e2",
      color: "#b91c1c",
      border: "1px solid #fecaca",
      borderRadius: "14px",
      padding: "14px",
      marginBottom: "16px",
      fontSize: "14px",
      fontWeight: "700",
      lineHeight: "1.5",
      wordBreak: "break-word",
    },

    success: {
      background: "#dcfce7",
      color: "#15803d",
      border: "1px solid #bbf7d0",
      borderRadius: "14px",
      padding: "14px",
      marginBottom: "16px",
      fontSize: "14px",
      fontWeight: "800",
    },

    loading: {
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#f4f6f8",
      color: "#374151",
      fontSize: "16px",
      fontWeight: "800",
      padding: "30px",
      textAlign: "center",
    },

    authCard: {
      maxWidth: "520px",
      margin: "80px auto",
      background: "#ffffff",
      borderRadius: "22px",
      padding: "30px 20px",
      border: "1px solid #e5e7eb",
      textAlign: "center",
    },

    authIcon: {
      fontSize: "48px",
      marginBottom: "14px",
    },

    authTitle: {
      fontSize: "25px",
      fontWeight: "900",
      marginBottom: "8px",
    },

    authDescription: {
      color: "#6b7280",
      marginBottom: "20px",
      lineHeight: "1.6",
    },

    adminButton: {
      width: "100%",
      border: "none",
      borderRadius: "14px",
      padding: "15px",
      background: "#111827",
      color: "#ffffff",
      fontSize: "16px",
      fontWeight: "900",
      cursor: "pointer",
    },

    idText: {
      marginTop: "15px",
      paddingTop: "15px",
      borderTop: "1px dashed #e5e7eb",
      color: "#9ca3af",
      fontSize: "11px",
      wordBreak: "break-all",
    },
  };

  // ============================================================
  // 로딩
  // ============================================================

  if (loading || checkingAuth) {
    return (
      <div style={styles.loading}>
        회사 정보를 불러오는 중입니다...
      </div>
    );
  }

  // ============================================================
  // 권한 오류
  // ============================================================

  if (!user || (error && !company)) {
    return (
      <div style={styles.page}>
        <div style={styles.container}>
          <div style={styles.authCard}>
            <div style={styles.authIcon}>
              🔒
            </div>

            <div style={styles.authTitle}>
              접근할 수 없습니다
            </div>

            <div style={styles.authDescription}>
              슈퍼관리자 전용 페이지입니다.
            </div>

            {error && (
              <div style={styles.error}>
                ❌ {error}
              </div>
            )}

            <button
              type="button"
              style={styles.adminButton}
              onClick={() =>
                router.push("/admin")
              }
            >
              관리자 페이지로 이동
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // 화면
  // ============================================================

  return (
    <div style={styles.page}>
      {/* 상단 */}

      <header style={styles.header}>
        <div style={styles.headerTop}>
          <button
            type="button"
            style={styles.backButton}
            onClick={() =>
              router.push("/super-admin")
            }
          >
            ←
          </button>

          <div style={styles.headerTitleWrap}>
            <h1 style={styles.headerTitle}>
              회사 상세관리
            </h1>

            <div style={styles.headerSub}>
              {company?.company_name || "회사"}
            </div>
          </div>
        </div>
      </header>

      <main style={styles.container}>
        {/* 메시지 */}

        {message && (
          <div style={styles.success}>
            ✓ {message}
          </div>
        )}

        {error && (
          <div style={styles.error}>
            ❌ {error}
          </div>
        )}

        {/* 회사 상태 */}

        <section style={styles.card}>
          <div style={styles.statusRow}>
            <div>
              <h2 style={styles.companyName}>
                {company?.company_name || "-"}
              </h2>

              <div style={styles.slug}>
                /{company?.slug || "-"}
              </div>
            </div>

            <div>
              {company?.is_active ? (
                <span style={styles.activeBadge}>
                  ● 활성
                </span>
              ) : (
                <span style={styles.inactiveBadge}>
                  ● 정지
                </span>
              )}
            </div>
          </div>

          <div style={styles.infoGrid}>
            <div style={styles.infoBox}>
              <div style={styles.infoLabel}>
                요금제
              </div>

              <div style={styles.infoValue}>
                {company?.subscription_plan ||
                  "basic"}
              </div>
            </div>

            <div style={styles.infoBox}>
              <div style={styles.infoLabel}>
                대표자
              </div>

              <div style={styles.infoValue}>
                {company?.representative_name ||
                  "-"}
              </div>
            </div>

            <div style={styles.infoBox}>
              <div style={styles.infoLabel}>
                가입일
              </div>

              <div style={styles.infoValue}>
                {formatDate(
                  company?.created_at
                )}
              </div>
            </div>

            <div style={styles.infoBox}>
              <div style={styles.infoLabel}>
                소속 계정
              </div>

              <div style={styles.infoValue}>
                {companyUsers.length}명
              </div>
            </div>
          </div>

          <div style={styles.idText}>
            회사 ID: {company?.id}
          </div>
        </section>

        {/* =====================================================
            이번 달 사용량
        ===================================================== */}

        <section style={styles.card}>
          <div style={styles.usageHeader}>
            <div>
              <h2 style={styles.cardTitle}>
                이번 달 사용량
              </h2>

              <p
                style={{
                  ...styles.cardDescription,
                  marginBottom: 0,
                }}
              >
                현재 회사의 월간 서비스 사용량입니다.
              </p>
            </div>

            <button
              type="button"
              style={styles.usageRefreshButton}
              disabled={usageLoading}
              onClick={refreshUsage}
            >
              {usageLoading
                ? "조회 중..."
                : "새로고침"}
            </button>
          </div>

          <div style={styles.usageGrid}>
            <UsageItem
              icon="🤖"
              label="AI 사진분석"
              value={usage.ai_photo_analysis}
              unit="회"
            />

            <UsageItem
              icon="🧾"
              label="자동견적"
              value={usage.auto_estimate}
              unit="회"
            />

            <UsageItem
              icon="🔍"
              label="유사이미지 검색"
              value={
                usage.similar_image_search
              }
              unit="회"
            />

            <UsageItem
              icon="✨"
              label="가상시공"
              value={usage.virtual_remodel}
              unit="회"
            />

            <UsageItem
              icon="🖼️"
              label="이미지 업로드"
              value={usage.image_upload}
              unit="장"
            />

            <UsageItem
              icon="💾"
              label="저장용량"
              value={usage.storage_mb}
              unit="MB"
            />

            <UsageItem
              icon="💬"
              label="고객상담"
              value={usage.customer_lead}
              unit="건"
            />
          </div>

          <div style={styles.costBox}>
            <div>
              <div style={styles.costLabel}>
                이번 달 AI/API 원가
              </div>

              <div style={styles.costDescription}>
                서비스 운영자가 실제 부담한
                API 비용
              </div>
            </div>

            <div style={styles.costValue}>
              {formatWon(
                usage.total_cost_krw
              )}
            </div>
          </div>

          <div style={styles.usageNotice}>
            현재 사용량 기록 시스템을 막 구축한
            상태이므로 기존 과거 사용내역은 자동으로
            포함되지 않습니다. 앞으로 각 기능의 실제
            실행 API를 연결하면 사용량이 자동으로
            누적됩니다.
          </div>
        </section>

        {/* 회사정보 수정 */}

        <section style={styles.card}>
          <h2 style={styles.cardTitle}>
            회사 정보
          </h2>

          <p style={styles.cardDescription}>
            슈퍼관리자가 회사 기본정보와 요금제를
            관리합니다.
          </p>

          <div style={styles.field}>
            <label style={styles.label}>
              회사명
            </label>

            <input
              type="text"
              name="company_name"
              value={form.company_name}
              onChange={handleChange}
              style={styles.input}
              placeholder="회사명"
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>
              대표자
            </label>

            <input
              type="text"
              name="representative_name"
              value={form.representative_name}
              onChange={handleChange}
              style={styles.input}
              placeholder="대표자명"
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>
              전화번호
            </label>

            <input
              type="tel"
              name="phone"
              value={form.phone}
              onChange={handleChange}
              style={styles.input}
              placeholder="01012345678"
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>
              주소
            </label>

            <input
              type="text"
              name="address"
              value={form.address}
              onChange={handleChange}
              style={styles.input}
              placeholder="회사 주소"
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>
              요금제
            </label>

            <select
              name="subscription_plan"
              value={form.subscription_plan}
              onChange={handleChange}
              style={styles.select}
            >
              <option value="basic">
                Basic
              </option>

              <option value="standard">
                Standard
              </option>

              <option value="pro">
                Pro
              </option>

              <option value="enterprise">
                Enterprise
              </option>
            </select>
          </div>

          <button
            type="button"
            onClick={saveCompany}
            disabled={saving}
            style={
              saving
                ? styles.disabledButton
                : styles.saveButton
            }
          >
            {saving
              ? "저장 중..."
              : "회사 정보 저장"}
          </button>
        </section>

        {/* 소속 계정 */}

        <section style={styles.card}>
          <h2 style={styles.cardTitle}>
            회사 계정
          </h2>

          <p style={styles.cardDescription}>
            이 회사에 연결되어 있는 로그인
            계정입니다.
          </p>

          {companyUsers.length === 0 ? (
            <div style={styles.empty}>
              연결된 계정이 없습니다.
            </div>
          ) : (
            companyUsers.map((member) => (
              <div
                key={member.user_id}
                style={styles.userCard}
              >
                <div style={styles.userEmail}>
                  {member.email ||
                    "이메일 없음"}
                </div>

                <div style={styles.userMeta}>
                  가입일:{" "}
                  {formatDate(
                    member.created_at
                  )}
                  <br />

                  최근 로그인:{" "}
                  {member.last_sign_in_at
                    ? formatDate(
                        member.last_sign_in_at
                      )
                    : "로그인 기록 없음"}
                </div>

                <div style={styles.idText}>
                  User ID: {member.user_id}
                </div>
              </div>
            ))
          )}
        </section>
      </main>
    </div>
  );
        }
