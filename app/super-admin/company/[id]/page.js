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
      setError("회사 ID가 없습니다.");
      return;
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
      ]);
    } catch (err) {
      console.error("상세페이지 로드 오류:", err);

      setError(
        err?.message || "회사 정보를 불러오는 중 오류가 발생했습니다."
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
            <div style={styles.authIcon}>🔒</div>

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
              onClick={() => router.push("/admin")}
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
            onClick={() => router.push("/super-admin")}
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
                {company?.subscription_plan || "basic"}
              </div>
            </div>

            <div style={styles.infoBox}>
              <div style={styles.infoLabel}>
                대표자
              </div>

              <div style={styles.infoValue}>
        {
