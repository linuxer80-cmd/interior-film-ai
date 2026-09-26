"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../../lib/supabase";

const EMPTY_USAGE = {
  ai_photo_analysis: 0,
  auto_estimate: 0,
  similar_image_search: 0,
  virtual_remodel: 0,
  image_upload: 0,
  storage_mb: 0,
  customer_lead: 0,
  total_cost_krw: 0,
};

const LIMIT_FIELDS = [
  {
    key: "ai_photo_analysis_limit",
    usageKey: "ai_photo_analysis",
    label: "AI 사진분석",
    icon: "🤖",
    unit: "회",
  },
  {
    key: "auto_estimate_limit",
    usageKey: "auto_estimate",
    label: "자동견적",
    icon: "🧾",
    unit: "회",
  },
  {
    key: "similar_image_search_limit",
    usageKey: "similar_image_search",
    label: "유사이미지 검색",
    icon: "🔍",
    unit: "회",
  },
  {
    key: "virtual_remodel_limit",
    usageKey: "virtual_remodel",
    label: "가상시공",
    icon: "✨",
    unit: "회",
  },
  {
    key: "image_upload_limit",
    usageKey: "image_upload",
    label: "이미지 업로드",
    icon: "🖼️",
    unit: "장",
  },
  {
    key: "storage_mb_limit",
    usageKey: "storage_mb",
    label: "저장용량",
    icon: "💾",
    unit: "MB",
  },
  {
    key: "customer_lead_limit",
    usageKey: "customer_lead",
    label: "고객상담",
    icon: "💬",
    unit: "건",
  },
];

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
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [saving, setSaving] = useState(false);
  const [usageLoading, setUsageLoading] = useState(false);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [user, setUser] = useState(null);
  const [company, setCompany] = useState(null);
  const [companyUsers, setCompanyUsers] = useState([]);

  const [usage, setUsage] = useState({
    ...EMPTY_USAGE,
  });

  const [plans, setPlans] = useState([]);

  const [form, setForm] = useState({
    company_name: "",
    representative_name: "",
    phone: "",
    address: "",
    subscription_plan: "basic",
  });

  /*
   * 현재 회사에 적용되는 요금제
   *
   * plans는 항상 subscription_plans의
   * 최신 데이터를 다시 불러옵니다.
   */
  const currentPlan = useMemo(() => {
    const code =
      form.subscription_plan ||
      company?.subscription_plan ||
      "basic";

    return (
      plans.find(
        (plan) =>
          plan.plan_code === code
      ) || null
    );
  }, [
    plans,
    form.subscription_plan,
    company?.subscription_plan,
  ]);

  function formatDate(value) {
    if (!value) {
      return "-";
    }

    try {
      return new Intl.DateTimeFormat(
        "ko-KR",
        {
          year: "numeric",
          month: "numeric",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }
      ).format(
        new Date(value)
      );
    } catch {
      return "-";
    }
  }

  function formatNumber(value) {
    const number =
      Number(value || 0);

    if (
      !Number.isFinite(number)
    ) {
      return "0";
    }

    return new Intl.NumberFormat(
      "ko-KR",
      {
        maximumFractionDigits: 2,
      }
    ).format(number);
  }

  function formatWon(value) {
    const number =
      Number(value || 0);

    if (
      !Number.isFinite(number)
    ) {
      return "₩0";
    }

    return `₩${Math.round(
      number
    ).toLocaleString("ko-KR")}`;
  }

  function showMessage(text) {
    setMessage(text);

    setTimeout(() => {
      setMessage("");
    }, 3000);
  }

  function getUsagePercent(
    value,
    limit
  ) {
    const used =
      Number(value || 0);

    const max =
      Number(limit || 0);

    if (
      !Number.isFinite(max) ||
      max <= 0
    ) {
      return 0;
    }

    return Math.max(
      0,
      Math.min(
        100,
        (used / max) * 100
      )
    );
  }

  /*
   * 슈퍼관리자 확인
   */
  async function checkSuperAdmin() {
    try {
      setCheckingAuth(true);
      setError("");

      const {
        data: { session },
        error: sessionError,
      } =
        await supabase.auth.getSession();

      if (sessionError) {
        throw sessionError;
      }

      if (!session?.user) {
        setError(
          "로그인이 필요합니다."
        );

        setUser(null);

        return false;
      }

      setUser(
        session.user
      );

      const {
        data,
        error: rpcError,
      } =
        await supabase.rpc(
          "is_super_admin"
        );

      if (rpcError) {
        throw rpcError;
      }

      if (!data) {
        setError(
          "슈퍼관리자 권한이 없습니다."
        );

        return false;
      }

      return true;
    } catch (err) {
      console.error(
        "슈퍼관리자 확인 오류:",
        err
      );

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

  /*
   * 회사 정보 조회
   */
  async function loadCompany() {
    if (!companyId) {
      throw new Error(
        "회사 ID가 없습니다."
      );
    }

    const {
      data,
      error: rpcError,
    } =
      await supabase.rpc(
        "super_admin_get_company",
        {
          p_company_id:
            companyId,
        }
      );

    if (rpcError) {
      throw rpcError;
    }

    const row =
      Array.isArray(data)
        ? data[0]
        : data;

    if (!row) {
      setCompany(null);

      throw new Error(
        "회사 정보를 찾을 수 없습니다."
      );
    }

    setCompany(row);

    setForm({
      company_name:
        row.company_name || "",

      representative_name:
        row.representative_name ||
        "",

      phone:
        row.phone || "",

      address:
        row.address || "",

      subscription_plan:
        row.subscription_plan ||
        "basic",
    });

    return row;
  }

  /*
   * 회사 계정 조회
   */
  async function loadCompanyUsers() {
    if (!companyId) {
      return;
    }

    const {
      data,
      error: rpcError,
    } =
      await supabase.rpc(
        "super_admin_get_company_users",
        {
          p_company_id:
            companyId,
        }
      );

    if (rpcError) {
      throw rpcError;
    }

    setCompanyUsers(
      Array.isArray(data)
        ? data
        : []
    );
  }

  /*
   * 이번 달 사용량 조회
   */
  async function loadCompanyUsage() {
    if (!companyId) {
      return;
    }

    const {
      data,
      error: rpcError,
    } =
      await supabase.rpc(
        "super_admin_get_company_usage",
        {
          p_company_id:
            companyId,
        }
      );

    if (rpcError) {
      throw rpcError;
    }

    const nextUsage = {
      ...EMPTY_USAGE,
    };

    const rows =
      Array.isArray(data)
        ? data
        : [];

    rows.forEach((row) => {
      const eventType =
        row?.event_type;

      if (
        eventType &&
        Object.prototype
          .hasOwnProperty.call(
            nextUsage,
            eventType
          )
      ) {
        nextUsage[eventType] +=
          Number(
            row?.total_quantity ||
              0
          );
      }

      nextUsage.total_cost_krw +=
        Number(
          row?.total_cost_krw ||
            0
        );
    });

    setUsage(nextUsage);

    return nextUsage;
  }

  /*
   * =========================================================
   * 최신 요금제 조회
   * =========================================================
   *
   * 회사 상세 화면에서 요금제 값을 따로 저장하지 않습니다.
   *
   * /super-admin/plans 에서 변경된
   * subscription_plans의 최신 값을 다시 조회합니다.
   */
  async function loadPlans() {
    const {
      data,
      error: rpcError,
    } =
      await supabase.rpc(
        "super_admin_get_subscription_plans"
      );

    if (rpcError) {
      throw rpcError;
    }

    const rows =
      Array.isArray(data)
        ? data
        : [];

    setPlans(rows);

    return rows;
  }

  /*
   * 전체 데이터 로드
   */
  async function loadAll() {
    try {
      setLoading(true);
      setError("");

      const allowed =
        await checkSuperAdmin();

      if (!allowed) {
        return;
      }

      /*
       * 회사 / 계정 / 사용량 /
       * 최신 요금제를 모두 다시 조회
       */
      await Promise.all([
        loadCompany(),
        loadCompanyUsers(),
        loadCompanyUsage(),
        loadPlans(),
      ]);
    } catch (err) {
      console.error(
        "상세페이지 로드 오류:",
        err
      );

      setError(
        err?.message ||
          "회사 정보를 불러오는 중 오류가 발생했습니다."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!companyId) {
      return;
    }

    loadAll();
  }, [companyId]);

  function handleChange(e) {
    const {
      name,
      value,
    } = e.target;

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  /*
   * 회사 기본정보 + 적용 요금제 저장
   *
   * 요금제의 가격/한도 자체는
   * 이 페이지에서 수정하지 않습니다.
   */
  async function saveCompany() {
    if (!companyId) {
      alert(
        "회사 ID가 없습니다."
      );

      return;
    }

    if (
      !form.company_name.trim()
    ) {
      alert(
        "회사명을 입력해주세요."
      );

      return;
    }

    if (
      !form.subscription_plan
    ) {
      alert(
        "요금제를 선택해주세요."
      );

      return;
    }

    const confirmed =
      window.confirm(
        "회사 정보와 적용 요금제를 저장하시겠습니까?"
      );

    if (!confirmed) {
      return;
    }

    try {
      setSaving(true);
      setError("");

      const {
        data,
        error: rpcError,
      } =
        await supabase.rpc(
          "super_admin_update_company",
          {
            p_company_id:
              companyId,

            p_company_name:
              form.company_name.trim(),

            p_representative_name:
              form.representative_name.trim() ||
              null,

            p_phone:
              form.phone.trim() ||
              null,

            p_address:
              form.address.trim() ||
              null,

            p_subscription_plan:
              form.subscription_plan,
          }
        );

      if (rpcError) {
        throw rpcError;
      }

      const updated =
        Array.isArray(data)
          ? data[0]
          : data;

      if (updated) {
        setCompany(
          updated
        );

        setForm({
          company_name:
            updated.company_name ||
            "",

          representative_name:
            updated.representative_name ||
            "",

          phone:
            updated.phone || "",

          address:
            updated.address || "",

          subscription_plan:
            updated.subscription_plan ||
            "basic",
        });
      } else {
        await loadCompany();
      }

      /*
       * 회사 요금제 변경 직후에도
       * 최신 요금제 정의를 다시 읽습니다.
       */
      await loadPlans();

      showMessage(
        "회사 정보와 적용 요금제가 저장되었습니다."
      );
    } catch (err) {
      console.error(
        "회사 저장 오류:",
        err
      );

      setError(
        err?.message
          ? `저장 실패: ${err.message}`
          : "회사 정보 저장에 실패했습니다."
      );
    } finally {
      setSaving(false);
    }
  }

  /*
   * =========================================================
   * 사용량 + 최신 요금제 새로고침
   * =========================================================
   *
   * /super-admin/plans 에서 한도를 변경한 뒤
   * 이 버튼을 누르면 최신 한도가 즉시 반영됩니다.
   */
  async function refreshUsage() {
    try {
      setUsageLoading(true);
      setError("");

      await Promise.all([
        loadCompanyUsage(),
        loadPlans(),
      ]);

      showMessage(
        "최신 사용량과 요금제 한도를 불러왔습니다."
      );
    } catch (err) {
      console.error(
        "사용량 새로고침 오류:",
        err
      );

      setError(
        err?.message ||
          "사용량 새로고침에 실패했습니다."
      );
    } finally {
      setUsageLoading(false);
    }
  }

  function UsageItem({
    icon,
    label,
    value,
    limit,
    unit,
  }) {
    const used =
      Number(value || 0);

    const max =
      Number(limit || 0);

    const percent =
      getUsagePercent(
        used,
        max
      );

    /*
     * 현재 시스템 규칙:
     * 한도가 0 이하이면 무제한
     */
    const hasLimit =
      Number.isFinite(max) &&
      max > 0;

    const exceeded =
      hasLimit &&
      used >= max;

    return (
      <div
        style={
          styles.usageItem
        }
      >
        <div
          style={
            styles.usageTop
          }
        >
          <div
            style={
              styles.usageIcon
            }
          >
            {icon}
          </div>

          <div
            style={
              styles.usageContent
            }
          >
            <div
              style={
                styles.usageLabel
              }
            >
              {label}
            </div>

            <div
              style={
                styles.usageValue
              }
            >
              {formatNumber(
                used
              )}

              <span
                style={
                  styles.usageDivider
                }
              >
                {" / "}
              </span>

              <span>
                {hasLimit
                  ? formatNumber(
                      max
                    )
                  : "무제한"}
              </span>

              <span
                style={
                  styles.usageUnit
                }
              >
                {unit}
              </span>
            </div>
          </div>
        </div>

        <div
          style={
            styles.progressTrack
          }
        >
          <div
            style={{
              ...styles.progressBar,

              width:
                `${percent}%`,

              background:
                exceeded
                  ? "#dc2626"
                  : percent >=
                    80
                  ? "#f59e0b"
                  : "#2563eb",
            }}
          />
        </div>

        <div
          style={
            styles.percentRow
          }
        >
          <span>
            {hasLimit
              ? `${formatNumber(
                  percent
                )}% 사용`
              : "사용 한도 없음"}
          </span>

          {exceeded && (
            <span
              style={
                styles.exceededText
              }
            >
              한도 도달
            </span>
          )}
        </div>
      </div>
    );
  }

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
      boxShadow:
        "0 2px 8px rgba(0,0,0,0.12)",
    },

    headerTop: {
      display: "flex",
      alignItems: "center",
      gap: "12px",
    },

    backButton: {
      border: "none",
      background:
        "rgba(255,255,255,0.12)",
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
    },

    headerSub: {
      marginTop: "4px",
      fontSize: "13px",
      color: "#cbd5e1",
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
      border:
        "1px solid #e5e7eb",
      boxShadow:
        "0 2px 8px rgba(15,23,42,0.04)",
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
      justifyContent:
        "space-between",
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
      padding: "7px 11px",
      borderRadius: "999px",
      background: "#dcfce7",
      color: "#15803d",
      fontWeight: "800",
      fontSize: "13px",
    },

    inactiveBadge: {
      display: "inline-flex",
      padding: "7px 11px",
      borderRadius: "999px",
      background: "#fee2e2",
      color: "#b91c1c",
      fontWeight: "800",
      fontSize: "13px",
    },

    infoGrid: {
      display: "grid",
      gridTemplateColumns:
        "1fr 1fr",
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

    planSummary: {
      marginTop: "12px",
      background: "#eff6ff",
      border:
        "1px solid #bfdbfe",
      borderRadius: "14px",
      padding: "14px",
    },

    planSummaryTitle: {
      fontSize: "13px",
      color: "#1d4ed8",
      fontWeight: "800",
    },

    planSummaryPrice: {
      marginTop: "4px",
      fontSize: "20px",
      fontWeight: "900",
      color: "#1e3a8a",
    },

    usageHeader: {
      display: "flex",
      justifyContent:
        "space-between",
      alignItems:
        "flex-start",
      gap: "12px",
      marginBottom: "16px",
    },

    usageRefreshButton: {
      border:
        "1px solid #d1d5db",
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
      gridTemplateColumns:
        "1fr 1fr",
      gap: "10px",
    },

    usageItem: {
      minWidth: 0,
      background: "#f8fafc",
      border:
        "1px solid #eef2f7",
      borderRadius: "15px",
      padding: "14px",
    },

    usageTop: {
      display: "flex",
      alignItems: "center",
      gap: "10px",
    },

    usageIcon: {
      width: "38px",
      height: "38px",
      borderRadius: "12px",
      background: "#ffffff",
      border:
        "1px solid #e5e7eb",
      display: "flex",
      alignItems: "center",
      justifyContent:
        "center",
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
      fontSize: "17px",
      fontWeight: "900",
      lineHeight: 1.2,
    },

    usageDivider: {
      color: "#9ca3af",
      fontWeight: "700",
    },

    usageUnit: {
      marginLeft: "3px",
      color: "#6b7280",
      fontSize: "11px",
      fontWeight: "700",
    },

    progressTrack: {
      width: "100%",
      height: "7px",
      background: "#e5e7eb",
      borderRadius: "999px",
      overflow: "hidden",
      marginTop: "11px",
    },

    progressBar: {
      height: "100%",
      borderRadius: "999px",
      transition:
        "width 0.2s ease",
    },

    percentRow: {
      marginTop: "6px",
      display: "flex",
      justifyContent:
        "space-between",
      fontSize: "10px",
      color: "#6b7280",
      fontWeight: "700",
    },

    exceededText: {
      color: "#dc2626",
      fontWeight: "900",
    },

    costBox: {
      marginTop: "12px",
      padding: "18px",
      borderRadius: "16px",
      background: "#111827",
      color: "#ffffff",
      display: "flex",
      alignItems: "center",
      justifyContent:
        "space-between",
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
      border:
        "1px solid #fde68a",
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
      border:
        "1px solid #d1d5db",
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
      border:
        "1px solid #d1d5db",
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
      border:
        "1px solid #e5e7eb",
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
      border:
        "1px solid #fecaca",
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
      border:
        "1px solid #bbf7d0",
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
      justifyContent:
        "center",
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
      border:
        "1px solid #e5e7eb",
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
      borderTop:
        "1px dashed #e5e7eb",
      color: "#9ca3af",
      fontSize: "11px",
      wordBreak: "break-all",
    },
  };  if (
    loading ||
    checkingAuth
  ) {
    return (
      <div
        style={
          styles.loading
        }
      >
        회사 정보를 불러오는 중입니다...
      </div>
    );
  }

  if (
    !user ||
    (error && !company)
  ) {
    return (
      <div
        style={
          styles.page
        }
      >
        <div
          style={
            styles.container
          }
        >
          <div
            style={
              styles.authCard
            }
          >
            <div
              style={
                styles.authIcon
              }
            >
              🔒
            </div>

            <div
              style={
                styles.authTitle
              }
            >
              접근할 수 없습니다
            </div>

            <div
              style={
                styles.authDescription
              }
            >
              슈퍼관리자 전용 페이지입니다.
            </div>

            {error && (
              <div
                style={
                  styles.error
                }
              >
                ❌ {error}
              </div>
            )}

            <button
              type="button"
              style={
                styles.adminButton
              }
              onClick={() =>
                router.push(
                  "/admin"
                )
              }
            >
              관리자 페이지로 이동
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={
        styles.page
      }
    >
      <header
        style={
          styles.header
        }
      >
        <div
          style={
            styles.headerTop
          }
        >
          <button
            type="button"
            style={
              styles.backButton
            }
            onClick={() =>
              router.push(
                "/super-admin"
              )
            }
          >
            ←
          </button>

          <div
            style={
              styles.headerTitleWrap
            }
          >
            <h1
              style={
                styles.headerTitle
              }
            >
              회사 상세관리
            </h1>

            <div
              style={
                styles.headerSub
              }
            >
              {company
                ?.company_name ||
                "회사"}
            </div>
          </div>
        </div>
      </header>

      <main
        style={
          styles.container
        }
      >
        {message && (
          <div
            style={
              styles.success
            }
          >
            ✓ {message}
          </div>
        )}

        {error && (
          <div
            style={
              styles.error
            }
          >
            ❌ {error}
          </div>
        )}

        {/* 회사 요약 */}
        <section
          style={
            styles.card
          }
        >
          <div
            style={
              styles.statusRow
            }
          >
            <div>
              <h2
                style={
                  styles.companyName
                }
              >
                {company
                  ?.company_name ||
                  "-"}
              </h2>

              <div
                style={
                  styles.slug
                }
              >
                /
                {company
                  ?.slug ||
                  "-"}
              </div>
            </div>

            <div>
              {company
                ?.is_active ? (
                <span
                  style={
                    styles.activeBadge
                  }
                >
                  ● 활성
                </span>
              ) : (
                <span
                  style={
                    styles.inactiveBadge
                  }
                >
                  ● 정지
                </span>
              )}
            </div>
          </div>

          <div
            style={
              styles.infoGrid
            }
          >
            <div
              style={
                styles.infoBox
              }
            >
              <div
                style={
                  styles.infoLabel
                }
              >
                요금제
              </div>

              <div
                style={
                  styles.infoValue
                }
              >
                {currentPlan
                  ?.plan_name ||
                  company
                    ?.subscription_plan ||
                  "basic"}
              </div>
            </div>

            <div
              style={
                styles.infoBox
              }
            >
              <div
                style={
                  styles.infoLabel
                }
              >
                대표자
              </div>

              <div
                style={
                  styles.infoValue
                }
              >
                {company
                  ?.representative_name ||
                  "-"}
              </div>
            </div>

            <div
              style={
                styles.infoBox
              }
            >
              <div
                style={
                  styles.infoLabel
                }
              >
                가입일
              </div>

              <div
                style={
                  styles.infoValue
                }
              >
                {formatDate(
                  company
                    ?.created_at
                )}
              </div>
            </div>

            <div
              style={
                styles.infoBox
              }
            >
              <div
                style={
                  styles.infoLabel
                }
              >
                소속 계정
              </div>

              <div
                style={
                  styles.infoValue
                }
              >
                {
                  companyUsers.length
                }
                명
              </div>
            </div>
          </div>

          {currentPlan && (
            <div
              style={
                styles.planSummary
              }
            >
              <div
                style={
                  styles.planSummaryTitle
                }
              >
                현재 월 요금
              </div>

              <div
                style={
                  styles.planSummaryPrice
                }
              >
                {formatWon(
                  currentPlan
                    .monthly_price_krw
                )}
                /월
              </div>
            </div>
          )}

          <div
            style={
              styles.idText
            }
          >
            회사 ID:{" "}
            {company?.id}
          </div>
        </section>

        {/* 이번 달 사용량 */}
        <section
          style={
            styles.card
          }
        >
          <div
            style={
              styles.usageHeader
            }
          >
            <div>
              <h2
                style={
                  styles.cardTitle
                }
              >
                이번 달 사용량
              </h2>

              <p
                style={{
                  ...styles.cardDescription,
                  marginBottom: 0,
                }}
              >
                현재 요금제의 최신 월 사용 한도와 실제 사용량입니다.
              </p>
            </div>

            <button
              type="button"
              style={
                styles.usageRefreshButton
              }
              disabled={
                usageLoading
              }
              onClick={
                refreshUsage
              }
            >
              {usageLoading
                ? "조회 중..."
                : "새로고침"}
            </button>
          </div>

          {!currentPlan && (
            <div
              style={
                styles.error
              }
            >
              현재 회사에 적용된 요금제 정보를 찾을 수 없습니다.
            </div>
          )}

          <div
            style={
              styles.usageGrid
            }
          >
            {LIMIT_FIELDS.map(
              (item) => (
                <UsageItem
                  key={
                    item.usageKey
                  }
                  icon={
                    item.icon
                  }
                  label={
                    item.label
                  }
                  value={
                    usage[
                      item
                        .usageKey
                    ]
                  }
                  limit={
                    currentPlan?.[
                      item.key
                    ] ?? 0
                  }
                  unit={
                    item.unit
                  }
                />
              )
            )}
          </div>

          <div
            style={
              styles.costBox
            }
          >
            <div>
              <div
                style={
                  styles.costLabel
                }
              >
                이번 달 AI/API 원가
              </div>

              <div
                style={
                  styles.costDescription
                }
              >
                서비스 운영자가 실제 부담한 API 비용
              </div>
            </div>

            <div
              style={
                styles.costValue
              }
            >
              {formatWon(
                usage
                  .total_cost_krw
              )}
            </div>
          </div>

          <div
            style={
              styles.usageNotice
            }
          >
            사용량은 실제 서비스 실행 기록을 기준으로
            집계됩니다. 요금제 관리에서 한도를 변경한
            뒤 새로고침하면 최신 한도와 사용률이 바로
            반영됩니다.
          </div>
        </section>

        {/* 회사 정보 */}
        <section
          style={
            styles.card
          }
        >
          <h2
            style={
              styles.cardTitle
            }
          >
            회사 정보
          </h2>

          <p
            style={
              styles.cardDescription
            }
          >
            회사 기본정보와 이 회사에 적용할 요금제만
            관리합니다. 요금제의 가격과 사용 한도는
            요금제 관리 메뉴에서 설정합니다.
          </p>

          <div
            style={
              styles.field
            }
          >
            <label
              style={
                styles.label
              }
            >
              회사명
            </label>

            <input
              type="text"
              name="company_name"
              value={
                form.company_name
              }
              onChange={
                handleChange
              }
              style={
                styles.input
              }
              placeholder="회사명"
            />
          </div>

          <div
            style={
              styles.field
            }
          >
            <label
              style={
                styles.label
              }
            >
              대표자
            </label>

            <input
              type="text"
              name="representative_name"
              value={
                form.representative_name
              }
              onChange={
                handleChange
              }
              style={
                styles.input
              }
              placeholder="대표자명"
            />
          </div>

          <div
            style={
              styles.field
            }
          >
            <label
              style={
                styles.label
              }
            >
              전화번호
            </label>

            <input
              type="tel"
              name="phone"
              value={
                form.phone
              }
              onChange={
                handleChange
              }
              style={
                styles.input
              }
              placeholder="01012345678"
            />
          </div>

          <div
            style={
              styles.field
            }
          >
            <label
              style={
                styles.label
              }
            >
              주소
            </label>

            <input
              type="text"
              name="address"
              value={
                form.address
              }
              onChange={
                handleChange
              }
              style={
                styles.input
              }
              placeholder="회사 주소"
            />
          </div>

          <div
            style={
              styles.field
            }
          >
            <label
              style={
                styles.label
              }
            >
              적용 요금제
            </label>

            <select
              name="subscription_plan"
              value={
                form.subscription_plan
              }
              onChange={
                handleChange
              }
              style={
                styles.select
              }
            >
              {plans
                .filter(
                  (plan) =>
                    plan.is_active ||
                    plan.plan_code ===
                      form.subscription_plan
                )
                .map(
                  (plan) => (
                    <option
                      key={
                        plan.plan_code
                      }
                      value={
                        plan.plan_code
                      }
                    >
                      {
                        plan.plan_name
                      }{" "}
                      -{" "}
                      {Number(
                        plan.monthly_price_krw ||
                          0
                      ).toLocaleString(
                        "ko-KR"
                      )}
                      원/월
                    </option>
                  )
                )}
            </select>

            {currentPlan && (
              <div
                style={{
                  marginTop:
                    "10px",
                  padding:
                    "12px",
                  background:
                    "#f8fafc",
                  borderRadius:
                    "12px",
                  fontSize:
                    "12px",
                  lineHeight:
                    "1.6",
                  color:
                    "#475569",
                }}
              >
                선택된 요금제:{" "}
                <strong>
                  {
                    currentPlan.plan_name
                  }
                </strong>
                <br />
                월 요금:{" "}
                <strong>
                  {formatWon(
                    currentPlan.monthly_price_krw
                  )}
                </strong>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={
              saveCompany
            }
            disabled={
              saving
            }
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

        {/* 회사 계정 */}
        <section
          style={
            styles.card
          }
        >
          <h2
            style={
              styles.cardTitle
            }
          >
            회사 계정
          </h2>

          <p
            style={
              styles.cardDescription
            }
          >
            이 회사에 연결되어 있는 로그인 계정입니다.
          </p>

          {companyUsers.length ===
          0 ? (
            <div
              style={
                styles.empty
              }
            >
              연결된 계정이 없습니다.
            </div>
          ) : (
            companyUsers.map(
              (member) => (
                <div
                  key={
                    member.user_id
                  }
                  style={
                    styles.userCard
                  }
                >
                  <div
                    style={
                      styles.userEmail
                    }
                  >
                    {member.email ||
                      "이메일 없음"}
                  </div>

                  <div
                    style={
                      styles.userMeta
                    }
                  >
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

                  <div
                    style={
                      styles.idText
                    }
                  >
                    User ID:{" "}
                    {
                      member.user_id
                    }
                  </div>
                </div>
              )
            )
          )}
        </section>
      </main>
    </div>
  );
        }
