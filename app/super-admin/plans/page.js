"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";

export default function PlansPage() {
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [email, setEmail] = useState("");
  const [plans, setPlans] = useState([]);
  const [saving, setSaving] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    start();
  }, []);

  async function start() {
    setLoading(true);
    setMessage("");

    try {
      // 로그인 확인
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

      // 슈퍼관리자 확인
      const {
        data: adminData,
        error: adminError,
      } = await supabase.rpc(
        "get_super_admin_status"
      );

      if (adminError) throw adminError;

      const admin = Array.isArray(adminData)
        ? adminData[0]
        : adminData;

      if (!admin?.is_super_admin) {
        throw new Error(
          "슈퍼관리자 권한이 없습니다."
        );
      }

      setAuthorized(true);

      // 요금제 조회
      await loadPlans();
    } catch (error) {
      console.error(error);

      setMessage(
        `❌ ${
          error?.message ||
          "페이지를 불러오지 못했습니다."
        }`
      );
    } finally {
      setLoading(false);
    }
  }

  async function loadPlans() {
    const {
      data,
      error,
    } = await supabase.rpc(
      "super_admin_get_subscription_plans"
    );

    if (error) throw error;

    const rows = Array.isArray(data)
      ? data
      : [];

    rows.sort(
      (a, b) =>
        Number(a.sort_order || 0) -
        Number(b.sort_order || 0)
    );

    setPlans(rows);
  }

  function changeValue(
    planCode,
    field,
    value
  ) {
    setPlans((old) =>
      old.map((plan) =>
        plan.plan_code === planCode
          ? {
              ...plan,
              [field]: value,
            }
          : plan
      )
    );
  }

  function changeNumber(
    planCode,
    field,
    value
  ) {
    const clean = String(value).replace(
      /[^0-9.]/g,
      ""
    );

    changeValue(
      planCode,
      field,
      clean
    );
  }

  async function savePlan(plan) {
    setSaving(plan.plan_code);
    setMessage("");

    try {
      const {
        error,
      } = await supabase.rpc(
        "super_admin_update_subscription_plan",
        {
          p_plan_code:
            plan.plan_code,

          p_plan_name:
            plan.plan_name,

          p_monthly_price_krw:
            Number(
              plan.monthly_price_krw || 0
            ),

          p_ai_photo_analysis_limit:
            Number(
              plan.ai_photo_analysis_limit ||
                0
            ),

          p_auto_estimate_limit:
            Number(
              plan.auto_estimate_limit ||
                0
            ),

          p_similar_image_search_limit:
            Number(
              plan.similar_image_search_limit ||
                0
            ),

          p_virtual_remodel_limit:
            Number(
              plan.virtual_remodel_limit ||
                0
            ),

          p_image_upload_limit:
            Number(
              plan.image_upload_limit ||
                0
            ),

          p_storage_mb_limit:
            Number(
              plan.storage_mb_limit ||
                0
            ),

          p_customer_lead_limit:
            Number(
              plan.customer_lead_limit ||
                0
            ),

          p_is_active:
            Boolean(plan.is_active),
        }
      );

      if (error) throw error;

      setMessage(
        `✅ ${plan.plan_name} 저장 완료`
      );

      await loadPlans();
    } catch (error) {
      console.error(error);

      setMessage(
        `❌ 저장 실패: ${
          error?.message ||
          "오류가 발생했습니다."
        }`
      );
    } finally {
      setSaving("");
    }
  }

  if (loading) {
    return (
      <main style={styles.page}>
        <div style={styles.center}>
          💳 요금제 불러오는 중...
        </div>
      </main>
    );
  }

  if (!authorized) {
    return (
      <main style={styles.page}>
        <div style={styles.center}>
          <h2>🔒 접근할 수 없습니다</h2>

          <p>
            슈퍼관리자 전용
            페이지입니다.
          </p>

          {message && (
            <div style={styles.error}>
              {message}
            </div>
          )}
        </div>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <div style={styles.container}>

        {/* 헤더 */}

        <div style={styles.header}>
          <div>
            <div style={styles.badge}>
              SUPER ADMIN
            </div>

            <h1 style={styles.title}>
              💳 요금제 관리
            </h1>

            <div style={styles.sub}>
              서비스 요금과 월별 사용
              한도를 관리합니다.
            </div>
          </div>

          <button
            style={styles.whiteButton}
            onClick={() => {
              window.location.href =
                "/admin";
            }}
          >
            회사 관리자
          </button>
        </div>

        {/* 로그인 정보 */}

        <div style={styles.loginBox}>
          <div>
            <div style={styles.small}>
              슈퍼관리자
            </div>

            <b>슈퍼관리자</b>
          </div>

          <div style={styles.email}>
            {email}
          </div>
        </div>

        {/* 메뉴 */}

        <div style={styles.menu}>
          <button
            style={styles.menuButton}
            onClick={() => {
              window.location.href =
                "/super-admin";
            }}
          >
            🏢 업체 관리
          </button>

          <button
            style={{
              ...styles.menuButton,
              ...styles.activeMenu,
            }}
          >
            💳 요금제 관리
          </button>
        </div>

        {/* 안내 */}

        <div style={styles.notice}>
          <b>📌 월간 사용 한도</b>

          <div style={styles.noticeText}>
            0으로 설정하면 무제한으로
            처리합니다.
          </div>
        </div>

        {/* 메시지 */}

        {message && (
          <div
            style={
              message.startsWith("❌")
                ? styles.error
                : styles.success
            }
          >
            {message}
          </div>
        )}

        {/* 새로고침 */}

        <div style={styles.toolbar}>
          <div>
            <b>서비스 요금제</b>

            <div style={styles.small}>
              체험판 · Basic · Pro ·
              Business
            </div>
          </div>

          <button
            style={styles.whiteButton}
            onClick={async () => {
              try {
                await loadPlans();

                setMessage(
                  "✅ 새로고침 완료"
                );
              } catch (error) {
                setMessage(
                  `❌ ${
                    error?.message ||
                    "새로고침 실패"
                  }`
                );
              }
            }}
          >
            새로고침
          </button>
        </div>

        {/* 요금제 */}

        <div style={styles.list}>
          {plans.map((plan) => (
            <PlanCard
              key={plan.plan_code}
              plan={plan}
              saving={
                saving ===
                plan.plan_code
              }
              changeValue={
                changeValue
              }
              changeNumber={
                changeNumber
              }
              savePlan={savePlan}
            />
          ))}
        </div>

        {plans.length === 0 && (
          <div style={styles.empty}>
            등록된 요금제가 없습니다.
          </div>
        )}
      </div>
    </main>
  );
}

function PlanCard({
  plan,
  saving,
  changeValue,
  changeNumber,
  savePlan,
}) {
  const icons = {
    trial: "🎁",
    basic: "🥉",
    pro: "🥈",
    business: "🥇",
  };

  const icon =
    icons[plan.plan_code] || "📦";

  return (
    <div style={styles.card}>

      {/* 카드 상단 */}

      <div style={styles.cardTop}>
        <div style={styles.planTitle}>
          <span style={styles.icon}>
            {icon}
          </span>

          <div>
            <div style={styles.planName}>
              {plan.plan_name}
            </div>

            <div style={styles.small}>
              {plan.plan_code}
            </div>
          </div>
        </div>

        <label style={styles.activeLabel}>
          <input
            type="checkbox"
            checked={
              plan.is_active !== false
            }
            onChange={(e) =>
              changeValue(
                plan.plan_code,
                "is_active",
                e.target.checked
              )
            }
          />

          {plan.is_active !== false
            ? "활성"
            : "정지"}
        </label>
      </div>

      <div style={styles.line} />

      {/* 요금제명 */}

      <label style={styles.label}>
        요금제명
      </label>

      <input
        style={styles.input}
        value={plan.plan_name || ""}
        onChange={(e) =>
          changeValue(
            plan.plan_code,
            "plan_name",
            e.target.value
          )
        }
      />

      {/* 월 요금 */}

      <label style={styles.label}>
        월 요금 (원)
      </label>

      <input
        style={styles.input}
        inputMode="numeric"
        value={
          plan.monthly_price_krw ?? 0
        }
        onChange={(e) =>
          changeNumber(
            plan.plan_code,
            "monthly_price_krw",
            e.target.value
          )
        }
      />

      <div style={styles.limitTitle}>
        월간 사용 한도
      </div>

      <Limit
        label="🤖 AI 사진분석"
        unit="회"
        value={
          plan.ai_photo_analysis_limit
        }
        onChange={(value) =>
          changeNumber(
            plan.plan_code,
            "ai_photo_analysis_limit",
            value
          )
        }
      />

      <Limit
        label="🧾 자동견적"
        unit="회"
        value={
          plan.auto_estimate_limit
        }
        onChange={(value) =>
          changeNumber(
            plan.plan_code,
            "auto_estimate_limit",
            value
          )
        }
      />

      <Limit
        label="🔎 유사이미지 검색"
        unit="회"
        value={
          plan.similar_image_search_limit
        }
        onChange={(value) =>
          changeNumber(
            plan.plan_code,
            "similar_image_search_limit",
            value
          )
        }
      />

      <Limit
        label="🪄 가상시공"
        unit="회"
        value={
          plan.virtual_remodel_limit
        }
        onChange={(value) =>
          changeNumber(
            plan.plan_code,
            "virtual_remodel_limit",
            value
          )
        }
      />

      <Limit
        label="📷 이미지 업로드"
        unit="장"
        value={
          plan.image_upload_limit
        }
        onChange={(value) =>
          changeNumber(
            plan.plan_code,
            "image_upload_limit",
            value
          )
        }
      />

      <Limit
        label="💾 저장용량"
        unit="MB"
        value={
          plan.storage_mb_limit
        }
        onChange={(value) =>
          changeNumber(
            plan.plan_code,
            "storage_mb_limit",
            value
          )
        }
      />

      <Limit
        label="💬 고객상담"
        unit="건"
        value={
          plan.customer_lead_limit
        }
        onChange={(value) =>
          changeNumber(
            plan.plan_code,
            "customer_lead_limit",
            value
          )
        }
      />

      {/* 저장 */}

      <button
        disabled={saving}
        style={{
          ...styles.saveButton,
          opacity: saving ? 0.6 : 1,
        }}
        onClick={() =>
          savePlan(plan)
        }
      >
        {saving
          ? "저장 중..."
          : `💾 ${plan.plan_name} 저장`}
      </button>
    </div>
  );
}

function Limit({
  label,
  value,
  unit,
  onChange,
}) {
  return (
    <div style={styles.limitRow}>
      <div style={styles.limitLabel}>
        {label}
      </div>

      <div style={styles.limitInputBox}>
        <input
          style={styles.limitInput}
          inputMode="decimal"
          value={value ?? 0}
          onChange={(e) =>
            onChange(e.target.value)
          }
        />

        <span style={styles.unit}>
          {unit}
        </span>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#f3f4f6",
    color: "#111827",
    padding: "18px 14px 60px",
  },

  container: {
    width: "100%",
    maxWidth: "900px",
    margin: "0 auto",
  },

  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "12px",
    marginBottom: "16px",
  },

  badge: {
    display: "inline-block",
    background: "#111827",
    color: "#ffffff",
    padding: "5px 8px",
    borderRadius: "999px",
    fontSize: "10px",
    fontWeight: 900,
    marginBottom: "7px",
  },

  title: {
    margin: 0,
    fontSize: "25px",
    fontWeight: 900,
  },

  sub: {
    marginTop: "5px",
    color: "#6b7280",
    fontSize: "12px",
  },

  whiteButton: {
    border: "1px solid #d1d5db",
    background: "#ffffff",
    borderRadius: "9px",
    padding: "9px 11px",
    fontWeight: 800,
    cursor: "pointer",
  },

  loginBox: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: "14px",
    padding: "14px",
    marginBottom: "14px",
  },

  small: {
    color: "#6b7280",
    fontSize: "11px",
  },

  email: {
    color: "#6b7280",
    fontSize: "12px",
    textAlign: "right",
  },

  menu: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "8px",
    marginBottom: "14px",
  },

  menuButton: {
    minHeight: "58px",
    border: "1px solid #d1d5db",
    background: "#ffffff",
    borderRadius: "13px",
    fontWeight: 900,
    cursor: "pointer",
  },

  activeMenu: {
    background: "#111827",
    color: "#ffffff",
    borderColor: "#111827",
  },

  notice: {
    background: "#eff6ff",
    border: "1px solid #bfdbfe",
    color: "#1e40af",
    borderRadius: "12px",
    padding: "12px",
    fontSize: "12px",
    marginBottom: "12px",
  },

  noticeText: {
    marginTop: "4px",
  },

  success: {
    background: "#f0fdf4",
    border: "1px solid #bbf7d0",
    color: "#166534",
    padding: "10px",
    borderRadius: "9px",
    marginBottom: "12px",
    fontSize: "12px",
  },

  error: {
    background: "#fef2f2",
    border: "1px solid #fecaca",
    color: "#991b1b",
    padding: "10px",
    borderRadius: "9px",
    marginBottom: "12px",
    fontSize: "12px",
  },

  toolbar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: "12px",
    padding: "12px",
    marginBottom: "12px",
  },

  list: {
    display: "grid",
    gap: "12px",
  },

  card: {
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: "15px",
    padding: "14px",
  },

  cardTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "10px",
  },

  planTitle: {
    display: "flex",
    alignItems: "center",
    gap: "9px",
  },

  icon: {
    fontSize: "27px",
  },

  planName: {
    fontSize: "18px",
    fontWeight: 900,
  },

  activeLabel: {
    display: "flex",
    alignItems: "center",
    gap: "5px",
    fontSize: "12px",
    fontWeight: 800,
  },

  line: {
    height: "1px",
    background: "#e5e7eb",
    margin: "13px 0",
  },

  label: {
    display: "block",
    fontSize: "12px",
    fontWeight: 800,
    margin: "10px 0 5px",
  },

  input: {
    width: "100%",
    boxSizing: "border-box",
    minHeight: "40px",
    border: "1px solid #d1d5db",
    borderRadius: "8px",
    padding: "0 10px",
    fontSize: "14px",
  },

  limitTitle: {
    marginTop: "18px",
    paddingBottom: "7px",
    borderBottom: "1px solid #e5e7eb",
    fontWeight: 900,
    fontSize: "13px",
  },

  limitRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "10px",
    padding: "7px 0",
    borderBottom: "1px solid #f3f4f6",
  },

  limitLabel: {
    fontSize: "12px",
    fontWeight: 700,
  },

  limitInputBox: {
    width: "115px",
    display: "flex",
    alignItems: "center",
    border: "1px solid #d1d5db",
    borderRadius: "8px",
    overflow: "hidden",
  },

  limitInput: {
    width: "100%",
    minWidth: 0,
    height: "36px",
    border: 0,
    outline: "none",
    textAlign: "right",
    padding: "0 6px",
    fontWeight: 800,
  },

  unit: {
    paddingRight: "7px",
    color: "#6b7280",
    fontSize: "10px",
  },

  saveButton: {
    width: "100%",
    minHeight: "44px",
    marginTop: "14px",
    border: 0,
    borderRadius: "9px",
    background: "#111827",
    color: "#ffffff",
    fontWeight: 900,
    cursor: "pointer",
  },

  empty: {
    background: "#ffffff",
    borderRadius: "12px",
    padding: "30px",
    textAlign: "center",
    color: "#6b7280",
  },

  center: {
    maxWidth: "400px",
    margin: "100px auto",
    background: "#ffffff",
    borderRadius: "15px",
    padding: "25px",
    textAlign: "center",
  },
};
