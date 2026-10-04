"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabase";
import ToolIllustration from "../../components/ui/ToolIllustration";

const LIMIT_FIELDS = [
  ["ai_photo_analysis_limit", "AI 사진분석", "회"],
  ["auto_estimate_limit", "자동견적", "회"],
  ["similar_image_search_limit", "유사이미지 검색", "회"],
  ["virtual_remodel_limit", "가상시공", "회"],
  ["image_upload_limit", "이미지 업로드", "장"],
  ["storage_mb_limit", "저장용량", "MB"],
  ["customer_lead_limit", "고객상담", "건"],
];

const PLAN_ICONS = {
  trial: "🎁",
  light: "🌱",
  basic: "🥉",
  pro: "🥈",
  business: "🥇",
};

export default function PlansPage() {
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [email, setEmail] = useState("");
  const [plans, setPlans] = useState([]);
  const [saving, setSaving] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    start();
  }, []);

  async function start() {
    setLoading(true);
    setMessage("");

    try {
      const {
        data: authData,
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;

      const user = authData?.user;

      if (!user) {
        throw new Error("로그인이 필요합니다.");
      }

      setEmail(user.email || "");

      const {
        data: adminData,
        error: adminError,
      } = await supabase.rpc("get_super_admin_status");

      if (adminError) throw adminError;

      const admin = Array.isArray(adminData)
        ? adminData[0]
        : adminData;

      if (!admin?.is_super_admin) {
        throw new Error("슈퍼관리자 권한이 없습니다.");
      }

      setAuthorized(true);
      await loadPlans();
    } catch (error) {
      console.error("요금제 초기화:", error);
      setMessage(
        `❌ ${error?.message || "페이지를 불러오지 못했습니다."}`
      );
    } finally {
      setLoading(false);
    }
  }

  async function loadPlans() {
    const { data, error } = await supabase.rpc(
      "super_admin_get_subscription_plans"
    );

    if (error) throw error;

    const rows = Array.isArray(data) ? [...data] : [];

    rows.sort(
      (a, b) =>
        Number(a.sort_order || 0) - Number(b.sort_order || 0)
    );

    setPlans(rows);
  }

  function changeValue(planCode, field, value) {
    setPlans((current) =>
      current.map((plan) =>
        plan.plan_code === planCode
          ? { ...plan, [field]: value }
          : plan
      )
    );
  }

  function changeNumber(planCode, field, value) {
    changeValue(
      planCode,
      field,
      String(value).replace(/[^0-9.]/g, "")
    );
  }

  async function savePlan(plan) {
    if (saving || refreshing) return;

    if (!String(plan.plan_name || "").trim()) {
      setMessage("❌ 요금제명을 입력해주세요.");
      return;
    }

    const numberFields = [
      "monthly_price_krw",
      ...LIMIT_FIELDS.map(([field]) => field),
    ];

    for (const field of numberFields) {
      const value = Number(plan[field] || 0);

      if (!Number.isFinite(value) || value < 0) {
        setMessage("❌ 요금과 사용 한도는 0 이상의 숫자로 입력해주세요.");
        return;
      }
    }

    setSaving(plan.plan_code);
    setMessage("");

    try {
      const { error } = await supabase.rpc(
        "super_admin_update_subscription_plan",
        {
          p_plan_code: plan.plan_code,
          p_plan_name: plan.plan_name,
          p_monthly_price_krw: Number(plan.monthly_price_krw || 0),
          p_ai_photo_analysis_limit: Number(
            plan.ai_photo_analysis_limit || 0
          ),
          p_auto_estimate_limit: Number(plan.auto_estimate_limit || 0),
          p_similar_image_search_limit: Number(
            plan.similar_image_search_limit || 0
          ),
          p_virtual_remodel_limit: Number(
            plan.virtual_remodel_limit || 0
          ),
          p_image_upload_limit: Number(plan.image_upload_limit || 0),
          p_storage_mb_limit: Number(plan.storage_mb_limit || 0),
          p_customer_lead_limit: Number(plan.customer_lead_limit || 0),
          p_is_active: plan.is_active !== false,
        }
      );

      if (error) throw error;

      setMessage(`✅ ${plan.plan_name} 저장 완료`);
    } catch (error) {
      console.error("요금제 저장:", error);
      setMessage(
        `❌ 저장 실패: ${error?.message || "오류가 발생했습니다."}`
      );
    } finally {
      setSaving("");
    }
  }

  async function refreshPlans() {
    if (saving || refreshing) return;

    setRefreshing(true);
    setMessage("");

    try {
      await loadPlans();
      setMessage("✅ 요금제를 새로고침했습니다.");
    } catch (error) {
      setMessage(`❌ ${error?.message || "새로고침 실패"}`);
    } finally {
      setRefreshing(false);
    }
  }

  if (loading || !authorized) {
    return (
      <main style={styles.page}>
        <section style={styles.centerCard}>
          <div style={{ fontSize: 40 }}>{loading ? "💳" : "🔒"}</div>

          <h1 style={styles.centerTitle}>
            {loading ? "요금제를 불러오는 중..." : "접근할 수 없습니다"}
          </h1>

          <p style={styles.help}>
            {loading
              ? "서비스 요금과 사용 한도를 확인하고 있습니다."
              : "슈퍼관리자 전용 페이지입니다."}
          </p>

          {!loading && message && (
            <div role="alert" style={styles.error}>
              {message}
            </div>
          )}

          {!loading && (
            <Link
              href="/super-admin"
              style={{
                ...styles.button,
                display: "block",
                marginTop: 20,
                textDecoration: "none",
              }}
            >
              돌아가기
            </Link>
          )}
        </section>
      </main>
    );
  }

  const busy = Boolean(saving) || refreshing;

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
            <small style={styles.eyebrow}>필름장이 · 슈퍼관리자</small>
            <h1 style={styles.title}>요금제 관리</h1>
            <p style={styles.help}>서비스 요금과 월간 사용 한도</p>
          </div>

          <ToolIllustration kind="money" size={52} />
        </header>

        <div style={styles.notice}>
          <strong>월간 사용 한도</strong>
          <div style={{ marginTop: 5 }}>
            사용 한도를 0으로 설정하면 무제한으로 처리합니다.
          </div>
        </div>

        {message && (
          <div
            role="status"
            style={{
              ...styles.message,
              background: message.startsWith("❌")
                ? "#fff1f2"
                : "#ecfdf5",
              color: message.startsWith("❌")
                ? "#b91c1c"
                : "#047857",
            }}
          >
            {message}
          </div>
        )}

        <div style={styles.toolbar}>
          <div>
            <h2 style={styles.sectionTitle}>
              서비스 요금제 · {plans.length}개
            </h2>
            <p style={styles.help}>요금제를 펼쳐서 수정해주세요.</p>
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={refreshPlans}
            style={{
              ...styles.button,
              ...(busy ? styles.disabled : {}),
            }}
          >
            {refreshing ? "불러오는 중..." : "새로고침"}
          </button>
        </div>

        <div style={styles.list}>
          {plans.map((plan) => (
            <PlanCard
              key={plan.plan_code}
              plan={plan}
              saving={saving === plan.plan_code}
              disabled={busy}
              changeValue={changeValue}
              changeNumber={changeNumber}
              savePlan={savePlan}
            />
          ))}
        </div>

        {plans.length === 0 && (
          <div style={styles.empty}>등록된 요금제가 없습니다.</div>
        )}

        <footer style={styles.account}>{email}</footer>
      </div>
    </main>
  );
}

function PlanCard({
  plan,
  saving,
  disabled,
  changeValue,
  changeNumber,
  savePlan,
}) {
  const active = plan.is_active !== false;
  const prefix = `plan-${plan.plan_code}`;

  return (
    <details style={styles.card}>
      <summary style={styles.cardSummary}>
        <div style={styles.planTitle}>
          <span aria-hidden="true" style={styles.icon}>
            {PLAN_ICONS[plan.plan_code] || "📦"}
          </span>

          <div style={{ minWidth: 0 }}>
            <strong style={styles.planName}>
              {plan.plan_name || plan.plan_code}
            </strong>

            <div style={styles.help}>
              {plan.plan_code} · {active ? "활성" : "정지"}
            </div>
          </div>
        </div>

        <strong style={styles.price}>
          {Number(plan.monthly_price_krw || 0).toLocaleString("ko-KR")}원
          <small style={styles.priceUnit}>/월</small>
        </strong>
      </summary>

      <div style={styles.editor}>
        <label style={styles.activeLabel}>
          <input
            type="checkbox"
            checked={active}
            disabled={disabled}
            onChange={(event) =>
              changeValue(plan.plan_code, "is_active", event.target.checked)
            }
            style={styles.checkbox}
          />
          요금제 활성화
        </label>

        <label htmlFor={`${prefix}-name`} style={styles.label}>
          요금제명
        </label>

        <input
          id={`${prefix}-name`}
          value={plan.plan_name || ""}
          disabled={disabled}
          onChange={(event) =>
            changeValue(plan.plan_code, "plan_name", event.target.value)
          }
          style={styles.input}
        />

        <label htmlFor={`${prefix}-price`} style={styles.label}>
          월 요금(원)
        </label>

        <input
          id={`${prefix}-price`}
          inputMode="numeric"
          value={plan.monthly_price_krw ?? 0}
          disabled={disabled}
          onChange={(event) =>
            changeNumber(
              plan.plan_code,
              "monthly_price_krw",
              event.target.value
            )
          }
          style={styles.input}
        />

        <h3 style={styles.limitTitle}>월간 사용 한도</h3>

        {LIMIT_FIELDS.map(([field, label, unit]) => (
          <div key={field} style={styles.limitRow}>
            <label
              htmlFor={`${prefix}-${field}`}
              style={styles.limitLabel}
            >
              {label}
            </label>

            <div style={styles.limitInputBox}>
              <input
                id={`${prefix}-${field}`}
                inputMode="decimal"
                value={plan[field] ?? 0}
                disabled={disabled}
                onChange={(event) =>
                  changeNumber(plan.plan_code, field, event.target.value)
                }
                style={styles.limitInput}
              />

              <span style={styles.unit}>{unit}</span>
            </div>
          </div>
        ))}

        <button
          type="button"
          disabled={disabled}
          onClick={() => savePlan(plan)}
          style={{
            ...styles.saveButton,
            ...(disabled ? styles.disabled : {}),
          }}
        >
          {saving ? "저장 중..." : `${plan.plan_name || "요금제"} 저장`}
        </button>
      </div>
    </details>
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
    margin: "5px 0 0",
    color: "#7b8798",
    fontSize: 12,
    lineHeight: 1.7,
  },
  notice: {
    marginBottom: 16,
    padding: 16,
    border: "1px solid #d7e6fc",
    borderRadius: 18,
    background: "#eaf3ff",
    color: "#3268bd",
    fontSize: 13,
    lineHeight: 1.7,
  },
  message: {
    padding: 14,
    marginBottom: 16,
    borderRadius: 14,
    fontSize: 13,
    lineHeight: 1.7,
    overflowWrap: "anywhere",
  },
  toolbar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  sectionTitle: {
    margin: 0,
    fontSize: 18,
  },
  button: {
    minHeight: 44,
    boxSizing: "border-box",
    padding: "10px 14px",
    border: "1px solid #dfe6ef",
    borderRadius: 14,
    background: "#ffffff",
    color: "#50617a",
    fontSize: 12,
    fontWeight: 800,
    cursor: "pointer",
    textAlign: "center",
    whiteSpace: "nowrap",
  },
  list: {
    display: "grid",
    gap: 14,
  },
  card: {
    padding: 18,
    border: "1px solid #e4eaf2",
    borderRadius: 22,
    background: "#ffffff",
    boxShadow: "0 6px 20px rgba(48,77,116,0.04)",
  },
  cardSummary: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 12,
    cursor: "pointer",
  },
  planTitle: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    minWidth: 0,
  },
  icon: {
    width: 46,
    height: 46,
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
    background: "#f3f7fc",
    fontSize: 26,
  },
  planName: {
    fontSize: 18,
    overflowWrap: "anywhere",
  },
  price: {
    fontSize: 19,
    color: "#3268bd",
    overflowWrap: "anywhere",
  },
  priceUnit: {
    marginLeft: 3,
    fontSize: 10,
    color: "#9ca3af",
  },
  editor: {
    marginTop: 18,
    paddingTop: 18,
    borderTop: "1px solid #eef2f7",
  },
  activeLabel: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    minHeight: 44,
    fontSize: 13,
    fontWeight: 800,
  },
  checkbox: {
    width: 20,
    height: 20,
    accentColor: "#3478ed",
  },
  label: {
    display: "block",
    margin: "14px 0 8px",
    color: "#50617a",
    fontSize: 13,
    fontWeight: 800,
  },
  input: {
    width: "100%",
    minHeight: 48,
    boxSizing: "border-box",
    padding: "10px 14px",
    border: "1px solid #dfe6ef",
    borderRadius: 14,
    background: "#fbfcfe",
    color: "#243247",
    fontSize: 16,
  },
  limitTitle: {
    margin: "24px 0 8px",
    fontSize: 15,
  },
  limitRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: "9px 0",
    borderBottom: "1px solid #eef2f7",
  },
  limitLabel: {
    color: "#50617a",
    fontSize: 12,
    fontWeight: 700,
  },
  limitInputBox: {
    width: 120,
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    border: "1px solid #dfe6ef",
    borderRadius: 12,
    background: "#fbfcfe",
    overflow: "hidden",
  },
  limitInput: {
    width: "100%",
    minWidth: 0,
    height: 44,
    boxSizing: "border-box",
    border: "none",
    padding: "0 10px",
    background: "transparent",
    color: "#243247",
    textAlign: "right",
    fontSize: 16,
    fontWeight: 800,
  },
  unit: {
    paddingRight: 10,
    color: "#7b8798",
    fontSize: 11,
  },
  saveButton: {
    width: "100%",
    minHeight: 50,
    marginTop: 20,
    padding: 14,
    border: "none",
    borderRadius: 15,
    background: "var(--film-blue, #3478ed)",
    color: "#ffffff",
    fontSize: 14,
    fontWeight: 800,
    cursor: "pointer",
  },
  disabled: {
    opacity: 0.5,
    cursor: "not-allowed",
  },
  empty: {
    padding: "40px 18px",
    border: "1px solid #e4eaf2",
    borderRadius: 22,
    background: "#ffffff",
    color: "#7b8798",
    fontSize: 13,
    textAlign: "center",
  },
  account: {
    marginTop: 24,
    color: "#9ca3af",
    fontSize: 11,
    textAlign: "center",
    overflowWrap: "anywhere",
  },
  centerCard: {
    maxWidth: 420,
    boxSizing: "border-box",
    margin: "70px auto 0",
    padding: "28px 22px",
    border: "1px solid #e4eaf2",
    borderRadius: 24,
    background: "#ffffff",
    textAlign: "center",
  },
  centerTitle: {
    margin: "16px 0 8px",
    fontSize: 20,
  },
  error: {
    marginTop: 16,
    padding: 13,
    borderRadius: 14,
    background: "#fff1f2",
    color: "#b91c1c",
    fontSize: 12,
    lineHeight: 1.7,
    overflowWrap: "anywhere",
  },
};
