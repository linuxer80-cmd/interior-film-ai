"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";

import { supabase } from "../../../lib/supabase";

export default function SuperAdminPlansPage() {
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  const [adminName, setAdminName] = useState("");
  const [userEmail, setUserEmail] = useState("");

  const [plans, setPlans] = useState([]);
  const [forms, setForms] = useState({});

  const [savingCode, setSavingCode] = useState(null);
  const [message, setMessage] = useState("");

  /* =========================================================
     슈퍼관리자 확인
  ========================================================= */

  const checkSuperAdmin = useCallback(async () => {
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
      throw new Error("로그인이 필요합니다.");
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

    const status = Array.isArray(data)
      ? data[0]
      : data;

    if (!status?.is_super_admin) {
      throw new Error(
        "슈퍼관리자 권한이 없습니다."
      );
    }

    setAuthorized(true);

    setAdminName(
      status?.name || "슈퍼관리자"
    );

    return true;
  }, []);

  /* =========================================================
     요금제 조회
  ========================================================= */

  const loadPlans = useCallback(async () => {
    const {
      data,
      error,
    } = await supabase.rpc(
      "super_admin_get_subscription_plans"
    );

    if (error) {
      throw new Error(
        `요금제 조회 실패: ${error.message}`
      );
    }

    const list = Array.isArray(data)
      ? data
      : [];

    setPlans(list);

    const nextForms = {};

    for (const plan of list) {
      nextForms[plan.plan_code] = {
        plan_code: plan.plan_code || "",
        plan_name: plan.plan_name || "",

        monthly_price_krw:
          plan.monthly_price_krw ?? 0,

        ai_photo_analysis_limit:
          plan.ai_photo_analysis_limit ?? 0,

        auto_estimate_limit:
          plan.auto_estimate_limit ?? 0,

        similar_image_search_limit:
          plan.similar_image_search_limit ?? 0,

        virtual_remodel_limit:
          plan.virtual_remodel_limit ?? 0,

        image_upload_limit:
          plan.image_upload_limit ?? 0,

        storage_mb_limit:
          plan.storage_mb_limit ?? 0,

        customer_lead_limit:
          plan.customer_lead_limit ?? 0,

        is_active:
          plan.is_active !== false,
      };
    }

    setForms(nextForms);
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

        await loadPlans();
      } catch (error) {
        console.error(
          "요금제 관리 초기화:",
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
    loadPlans,
  ]);

  /* =========================================================
     입력 변경
  ========================================================= */

  function updateForm(
    planCode,
    field,
    value
  ) {
    setForms((current) => ({
      ...current,

      [planCode]: {
        ...current[planCode],
        [field]: value,
      },
    }));
  }

  /* =========================================================
     숫자 변환
  ========================================================= */

  function toNumber(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return 0;
    }

    return Math.max(0, number);
  }

  /* =========================================================
     요금제 저장

     다음 단계에서 DB RPC를 정확히 맞춰 생성합니다.
  ========================================================= */

  async function savePlan(planCode) {
    const form = forms[planCode];

    if (!form) return;

    if (!form.plan_name?.trim()) {
      setMessage(
        "❌ 요금제 이름을 입력해주세요."
      );

      return;
    }

    setSavingCode(planCode);
    setMessage("");

    try {
      const {
        error,
      } = await supabase.rpc(
        "super_admin_update_subscription_plan",
        {
          p_plan_code:
            form.plan_code,

          p_plan_name:
            form.plan_name.trim(),

          p_monthly_price_krw:
            toNumber(
              form.monthly_price_krw
            ),

          p_ai_photo_analysis_limit:
            toNumber(
              form.ai_photo_analysis_limit
            ),

          p_auto_estimate_limit:
            toNumber(
              form.auto_estimate_limit
            ),

          p_similar_image_search_limit:
            toNumber(
              form.similar_image_search_limit
            ),

          p_virtual_remodel_limit:
            toNumber(
              form.virtual_remodel_limit
            ),

          p_image_upload_limit:
            toNumber(
              form.image_upload_limit
            ),

          p_storage_mb_limit:
            toNumber(
              form.storage_mb_limit
            ),

          p_customer_lead_limit:
            toNumber(
              form.customer_lead_limit
            ),

          p_is_active:
            Boolean(form.is_active),
        }
      );

      if (error) {
        throw error;
      }

      await loadPlans();

      setMessage(
        `✅ ${form.plan_name} 요금제를 저장했습니다.`
      );
    } catch (error) {
      console.error(
        "요금제 저장:",
        error
      );

      setMessage(
        `❌ 요금제 저장 실패: ${
          error?.message ||
          "오류가 발생했습니다."
        }`
      );
    } finally {
      setSavingCode(null);
    }
  }

  /* =========================================================
     로딩
  ========================================================= */

  if (loading) {
    return (
      <main style={styles.page}>
        <div style={styles.centerBox}>
          <div style={styles.bigIcon}>
            💳
          </div>

          <div style={styles.loadingTitle}>
            요금제 불러오는 중...
          </div>

          <div style={styles.loadingText}>
            슈퍼관리자 권한과 요금제 정보를
            확인하고 있습니다.
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
          <div style={styles.bigIcon}>
            🔒
          </div>

          <h2 style={styles.deniedTitle}>
            접근할 수 없습니다
          </h2>

          <div style={styles.loadingText}>
            슈퍼관리자 전용 페이지입니다.
          </div>

          {message && (
            <div style={styles.errorBox}>
              {message}
            </div>
          )}

          <button
            type="button"
            style={styles.darkButton}
            onClick={() => {
              window.location.href =
                "/super-admin";
            }}
          >
            슈퍼관리자로 돌아가기
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

        {/* 상단 */}

        <div style={styles.header}>
          <div>
            <div style={styles.badge}>
              SUPER ADMIN
            </div>

            <h1 style={styles.title}>
              💳 요금제 관리
            </h1>

            <div style={styles.subtitle}>
              서비스 전체 요금제의 가격과
              사용량 한도를 관리합니다.
            </div>
          </div>

          <button
            type="button"
            style={styles.backButton}
            onClick={() => {
              window.location.href =
                "/super-admin";
            }}
          >
            ← 업체 관리
          </button>
        </div>

        {/* 로그인 정보 */}

        <div style={styles.loginBox}>
          <div>
            <div style={styles.smallLabel}>
              슈퍼관리자
            </div>

            <div style={styles.adminName}>
              {adminName}
            </div>
          </div>

          <div style={styles.email}>
            {userEmail}
          </div>
        </div>

        {/* 메뉴 */}

        <div style={styles.menuGrid}>
          <button
            type="button"
            style={styles.menuButton}
            onClick={() => {
              window.location.href =
                "/super-admin";
            }}
          >
            <span style={styles.menuIcon}>
              🏢
            </span>

            <span>
              업체 관리
            </span>
          </button>

          <button
            type="button"
            style={{
              ...styles.menuButton,
              ...styles.menuButtonActive,
            }}
          >
            <span style={styles.menuIcon}>
              💳
            </span>

            <span>
              요금제 관리
            </span>
          </button>
        </div>

        {/* 안내 */}

        <div style={styles.noticeBox}>
          <strong>
            요금제 공통 설정
          </strong>

          <div style={styles.noticeText}>
            여기서 변경한 가격과 사용량 한도는
            해당 요금제를 사용하는 모든 업체에
            적용됩니다.
          </div>

          <div style={styles.noticeSubText}>
            숫자 0은 제한 없음으로 사용하도록
            현재 사용량 제한 로직과 맞출
            예정입니다.
          </div>
        </div>

        {/* 메시지 */}

        {message && (
          <div
            style={{
              ...styles.message,

              ...(message.startsWith("❌")
                ? styles.messageError
                : styles.messageSuccess),
            }}
          >
            {message}
          </div>
        )}

        {/* 요금제 */}

        <div style={styles.planList}>
          {plans.length === 0 ? (
            <div style={styles.empty}>
              등록된 요금제가 없습니다.
            </div>
          ) : (
            plans.map((plan) => {
              const form =
                forms[plan.plan_code];

              if (!form) {
                return null;
              }

              const saving =
                savingCode ===
                plan.plan_code;

              return (
                <PlanCard
                  key={plan.plan_code}
                  form={form}
                  saving={saving}
                  updateForm={updateForm}
                  savePlan={savePlan}
                />
              );
            })
          )}
        </div>
      </div>
    </main>
  );
}

/* =========================================================
   요금제 카드
========================================================= */

function PlanCard({
  form,
  saving,
  updateForm,
  savePlan,
}) {
  const code = form.plan_code;

  return (
    <section style={styles.planCard}>
      <div style={styles.planHeader}>
        <div>
          <div style={styles.planCode}>
            {code}
          </div>

          <input
            type="text"
            value={form.plan_name}
            onChange={(event) =>
              updateForm(
                code,
                "plan_name",
                event.target.value
              )
            }
            style={styles.planNameInput}
          />
        </div>

        <label style={styles.activeSwitch}>
          <input
            type="checkbox"
            checked={Boolean(
              form.is_active
            )}
            onChange={(event) =>
              updateForm(
                code,
                "is_active",
                event.target.checked
              )
            }
          />

          <span>
            {form.is_active
              ? "활성"
              : "비활성"}
          </span>
        </label>
      </div>

      {/* 월 요금 */}

      <div style={styles.priceBox}>
        <div style={styles.priceLabel}>
          월 이용요금
        </div>

        <div style={styles.priceRow}>
          <input
            type="number"
            min="0"
            step="1000"
            inputMode="numeric"
            value={
              form.monthly_price_krw
            }
            onChange={(event) =>
              updateForm(
                code,
                "monthly_price_krw",
                event.target.value
              )
            }
            style={styles.priceInput}
          />

          <span style={styles.priceUnit}>
            원 / 월
          </span>
        </div>
      </div>

      {/* 사용량 한도 */}

      <div style={styles.limitTitle}>
        월 사용량 한도
      </div>

      <div style={styles.limitGrid}>
        <LimitInput
          label="AI 사진분석"
          unit="회"
          value={
            form.ai_photo_analysis_limit
          }
          onChange={(value) =>
            updateForm(
              code,
              "ai_photo_analysis_limit",
              value
            )
          }
        />

        <LimitInput
          label="자동견적"
          unit="회"
          value={
            form.auto_estimate_limit
          }
          onChange={(value) =>
            updateForm(
              code,
              "auto_estimate_limit",
              value
            )
          }
        />

        <LimitInput
          label="유사이미지 검색"
          unit="회"
          value={
            form.similar_image_search_limit
          }
          onChange={(value) =>
            updateForm(
              code,
              "similar_image_search_limit",
              value
            )
          }
        />

        <LimitInput
          label="가상시공"
          unit="회"
          value={
            form.virtual_remodel_limit
          }
          onChange={(value) =>
            updateForm(
              code,
              "virtual_remodel_limit",
              value
            )
          }
        />

        <LimitInput
          label="이미지 업로드"
          unit="장"
          value={
            form.image_upload_limit
          }
          onChange={(value) =>
            updateForm(
              code,
              "image_upload_limit",
              value
            )
          }
        />

        <LimitInput
          label="저장용량"
          unit="MB"
          value={
            form.storage_mb_limit
          }
          step="0.1"
          onChange={(value) =>
            updateForm(
              code,
              "storage_mb_limit",
              value
            )
          }
        />

        <LimitInput
          label="고객상담"
          unit="건"
          value={
            form.customer_lead_limit
          }
          onChange={(value) =>
            updateForm(
              code,
              "customer_lead_limit",
              value
            )
          }
        />
      </div>

      <div style={styles.zeroHelp}>
        0 = 제한 없음
      </div>

      <button
        type="button"
        disabled={saving}
        onClick={() =>
          savePlan(code)
        }
        style={{
          ...styles.saveButton,

          opacity:
            saving
              ? 0.6
              : 1,
        }}
      >
        {saving
          ? "저장 중..."
          : `${form.plan_name} 저장`}
      </button>
    </section>
  );
}

/* =========================================================
   사용량 입력
========================================================= */

function LimitInput({
  label,
  unit,
  value,
  onChange,
  step = "1",
}) {
  return (
    <div style={styles.limitItem}>
      <div style={styles.limitLabel}>
        {label}
      </div>

      <div style={styles.limitInputRow}>
        <input
          type="number"
          min="0"
          step={step}
          inputMode="decimal"
          value={value}
          onChange={(event) =>
            onChange(
              event.target.value
            )
          }
          style={styles.limitInput}
        />

        <span style={styles.limitUnit}>
          {unit}
        </span>
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
    border: "1px solid #d1d5db",
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
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    background: "#ffffff",
    borderRadius: "14px",
    padding: "14px",
    border: "1px solid #e5e7eb",
    marginBottom: "12px",
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

  menuGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(2, minmax(0, 1fr))",
    gap: "8px",
    marginBottom: "14px",
  },

  menuButton: {
    minHeight: "58px",
    border: "1px solid #d1d5db",
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

  noticeBox: {
    padding: "14px",
    borderRadius: "13px",
    background: "#eff6ff",
    border: "1px solid #bfdbfe",
    color: "#1e3a8a",
    fontSize: "13px",
    lineHeight: 1.6,
    marginBottom: "14px",
  },

  noticeText: {
    marginTop: "4px",
  },

  noticeSubText: {
    marginTop: "5px",
    fontSize: "11px",
    color: "#475569",
  },

  message: {
    padding: "11px",
    borderRadius: "10px",
    marginBottom: "14px",
    fontSize: "13px",
    lineHeight: 1.6,
    wordBreak: "break-word",
  },

  messageSuccess: {
    background: "#f0fdf4",
    color: "#166534",
    border: "1px solid #bbf7d0",
  },

  messageError: {
    background: "#fef2f2",
    color: "#991b1b",
    border: "1px solid #fecaca",
  },

  planList: {
    display: "grid",
    gap: "14px",
  },

  planCard: {
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: "17px",
    padding: "16px",
  },

  planHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "12px",
    marginBottom: "14px",
  },

  planCode: {
    color: "#9ca3af",
    fontSize: "10px",
    fontWeight: 800,
    marginBottom: "4px",
    textTransform: "uppercase",
  },

  planNameInput: {
    width: "170px",
    maxWidth: "100%",
    border: "1px solid #d1d5db",
    borderRadius: "9px",
    padding: "9px 10px",
    fontSize: "17px",
    fontWeight: 900,
    boxSizing: "border-box",
  },

  activeSwitch: {
    display: "flex",
    alignItems: "center",
    gap: "5px",
    fontSize: "12px",
    fontWeight: 800,
    cursor: "pointer",
  },

  priceBox: {
    padding: "13px",
    borderRadius: "12px",
    background: "#eff6ff",
    border: "1px solid #bfdbfe",
    marginBottom: "16px",
  },

  priceLabel: {
    fontSize: "11px",
    fontWeight: 800,
    color: "#1d4ed8",
    marginBottom: "6px",
  },

  priceRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },

  priceInput: {
    width: "150px",
    maxWidth: "65%",
    border: "1px solid #93c5fd",
    borderRadius: "9px",
    padding: "9px 10px",
    background: "#ffffff",
    fontSize: "18px",
    fontWeight: 900,
    boxSizing: "border-box",
  },

  priceUnit: {
    color: "#1e3a8a",
    fontSize: "13px",
    fontWeight: 800,
  },

  limitTitle: {
    fontSize: "14px",
    fontWeight: 900,
    marginBottom: "9px",
  },

  limitGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(2, minmax(0, 1fr))",
    gap: "8px",
  },

  limitItem: {
    border: "1px solid #e5e7eb",
    borderRadius: "11px",
    padding: "10px",
    background: "#fafafa",
    minWidth: 0,
  },

  limitLabel: {
    fontSize: "11px",
    color: "#6b7280",
    fontWeight: 800,
    marginBottom: "6px",
  },

  limitInputRow: {
    display: "flex",
    alignItems: "center",
    gap: "5px",
  },

  limitInput: {
    width: "100%",
    minWidth: 0,
    border: "1px solid #d1d5db",
    borderRadius: "8px",
    padding: "8px",
    fontSize: "14px",
    fontWeight: 800,
    boxSizing: "border-box",
  },

  limitUnit: {
    flexShrink: 0,
    color: "#6b7280",
    fontSize: "11px",
    fontWeight: 800,
  },

  zeroHelp: {
    marginTop: "9px",
    color: "#9ca3af",
    fontSize: "10px",
  },

  saveButton: {
    width: "100%",
    minHeight: "46px",
    marginTop: "14px",
    border: 0,
    borderRadius: "11px",
    background: "#111827",
    color: "#ffffff",
    fontSize: "14px",
    fontWeight: 900,
    cursor: "pointer",
  },

  empty: {
    padding: "40px 10px",
    background: "#ffffff",
    borderRadius: "15px",
    border: "1px solid #e5e7eb",
    textAlign: "center",
    color: "#9ca3af",
  },

  centerBox: {
    width: "100%",
    maxWidth: "420px",
    margin: "100px auto 0",
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: "18px",
    padding: "28px 20px",
    textAlign: "center",
    boxSizing: "border-box",
  },

  bigIcon: {
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

  deniedTitle: {
    margin: "12px 0 5px",
    fontSize: "20px",
  },

  errorBox: {
    marginTop: "15px",
    padding: "10px",
    borderRadius: "9px",
    background: "#fef2f2",
    color: "#991b1b",
    fontSize: "12px",
    lineHeight: 1.5,
    wordBreak: "break-word",
  },

  darkButton: {
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
