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
  const [savingPlan, setSavingPlan] = useState("");
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
      status?.name || "슈퍼관리자"
    );

    return true;
  }, []);

  /* =========================================================
     요금제 조회
  ========================================================= */

  const loadPlans = useCallback(async () => {
    setMessage("");

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

    const rows =
      Array.isArray(data)
        ? data
        : [];

    const normalized = rows.map((plan) => ({
      plan_code:
        plan.plan_code || "",

      plan_name:
        plan.plan_name || "",

      monthly_price_krw:
        Number(
          plan.monthly_price_krw || 0
        ),

      ai_photo_analysis_limit:
        Number(
          plan.ai_photo_analysis_limit || 0
        ),

      auto_estimate_limit:
        Number(
          plan.auto_estimate_limit || 0
        ),

      similar_image_search_limit:
        Number(
          plan.similar_image_search_limit || 0
        ),

      virtual_remodel_limit:
        Number(
          plan.virtual_remodel_limit || 0
        ),

      image_upload_limit:
        Number(
          plan.image_upload_limit || 0
        ),

      storage_mb_limit:
        Number(
          plan.storage_mb_limit || 0
        ),

      customer_lead_limit:
        Number(
          plan.customer_lead_limit || 0
        ),

      is_active:
        plan.is_active !== false,

      sort_order:
        Number(
          plan.sort_order || 0
        ),
    }));

    normalized.sort(
      (a, b) =>
        a.sort_order - b.sort_order
    );

    setPlans(normalized);
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
     입력값 변경
  ========================================================= */

  function updatePlan(
    planCode,
    field,
    value
  ) {
    setPlans((current) =>
      current.map((plan) =>
        plan.plan_code === planCode
          ? {
              ...plan,
              [field]: value,
            }
          : plan
      )
    );
  }

  /* =========================================================
     숫자 입력값 변경
  ========================================================= */

  function updateNumber(
    planCode,
    field,
    value
  ) {
    const clean =
      String(value).replace(
        /[^0-9.]/g,
        ""
      );

    updatePlan(
      planCode,
      field,
      clean
    );
  }

  /* =========================================================
     요금제 저장
  ========================================================= */

  async function savePlan(plan) {
    if (!plan?.plan_code) {
      return;
    }

    setSavingPlan(
      plan.plan_code
    );

    setMessage("");

    try {
      const params = {
        p_plan_code:
          plan.plan_code,

        p_plan_name:
          String(
            plan.plan_name || ""
          ).trim(),

        p_monthly_price_krw:
          Number(
            plan.monthly_price_krw || 0
          ),

        p_ai_photo_analysis_limit:
          Number(
            plan.ai_photo_analysis_limit || 0
          ),

        p_auto_estimate_limit:
          Number(
            plan.auto_estimate_limit || 0
          ),

        p_similar_image_search_limit:
          Number(
            plan.similar_image_search_limit || 0
          ),

        p_virtual_remodel_limit:
          Number(
            plan.virtual_remodel_limit || 0
          ),

        p_image_upload_limit:
          Number(
            plan.image_upload_limit || 0
          ),

        p_storage_mb_limit:
          Number(
            plan.storage_mb_limit || 0
          ),

        p_customer_lead_limit:
          Number(
            plan.customer_lead_limit || 0
          ),

        p_is_active:
          Boolean(plan.is_active),
      };

      const {
        error,
      } = await supabase.rpc(
        "super_admin_update_subscription_plan",
        params
      );

      if (error) {
        throw error;
      }

      setMessage(
        `✅ ${plan.plan_name} 요금제 저장 완료`
      );

      await loadPlans();

      setMessage(
        `✅ ${plan.plan_name} 요금제 저장 완료`
      );
    } catch (error) {
      console.error(
        "요금제 저장 실패:",
        error
      );

      setMessage(
        `❌ 요금제 저장 실패: ${
          error?.message ||
          "오류가 발생했습니다."
        }`
      );
    } finally {
      setSavingPlan("");
    }
  }

  /* =========================================================
     페이지 이동
  ========================================================= */

  function openCompanies() {
    window.location.href =
      "/super-admin";
  }

  function openPlans() {
    window.location.href =
      "/super-admin/plans";
  }

  /* =========================================================
     로딩
  ========================================================= */

  if (loading) {
    return (
      <main style={styles.page}>
        <div style={styles.centerBox}>
          <div style={styles.loadingIcon}>
            💳
          </div>

          <div style={styles.loadingTitle}>
            요금제 불러오는 중...
          </div>

          <div style={styles.loadingText}>
            서비스 요금제와 사용 한도를
            불러오고 있습니다.
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
          <div style={styles.deniedIcon}>
            🔒
          </div>

          <h2 style={styles.deniedTitle}>
            접근할 수 없습니다
          </h2>

          <div style={styles.deniedText}>
            슈퍼관리자 전용 페이지입니다.
          </div>

          {message && (
            <div style={styles.errorBox}>
              {message}
            </div>
          )}

          <button
            type="button"
            style={styles.homeButton}
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
            <div style={styles.badge}>
              SUPER ADMIN
            </div>

            <h1 style={styles.title}>
              💳 요금제 관리
            </h1>

            <div style={styles.subtitle}>
              서비스 요금과 월별 사용 한도를
              관리합니다.
            </div>
          </div>

          <button
            type="button"
            style={styles.adminButton}
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

        {/* 상단 메뉴 */}

        <div style={styles.menuGrid}>
          <button
            type="button"
            style={styles.menuButton}
            onClick={openCompanies}
          >
            <span style={styles.menuIcon}>
              🏢
            </span>

            업체 관리
          </button>

          <button
            type="button"
            style={{
              ...styles.menuButton,
              ...styles.menuButtonActive,
            }}
            onClick={openPlans}
          >
            <span style={styles.menuIcon}>
              💳
            </span>

            요금제 관리
          </button>
        </div>

        {/* 안내 */}

        <div style={styles.noticeBox}>
          <div style={styles.noticeTitle}>
            📌 사용 한도 설정
          </div>

          <div style={styles.noticeText}>
            각 숫자는 회사당 월간 사용 한도입니다.
            한도에 0을 입력하면 무제한으로
            처리하도록 사용할 예정입니다.
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

        {/* 새로고침 */}

        <div style={styles.toolbar}>
          <div>
            <div style={styles.toolbarTitle}>
              서비스 요금제
            </div>

            <div style={styles.toolbarText}>
              체험판 · Basic · Pro · Business
            </div>
          </div>

          <button
            type="button"
            style={styles.refreshButton}
            onClick={async () => {
              try {
                await loadPlans();

                setMessage(
                  "✅ 요금제를 새로고침했습니다."
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

        {/* 요금제 목록 */}

        {plans.length === 0 ? (
          <div style={styles.emptyBox}>
            등록된 요금제가 없습니다.
          </div>
        ) : (
          <div style={styles.planList}>
            {plans.map((plan) => (
              <PlanCard
                key={plan.plan_code}
                plan={plan}
                saving={
                  savingPlan ===
                  plan.plan_code
                }
                onChange={(
                  field,
                  value
                ) =>
                  updatePlan(
                    plan.plan_code,
                    field,
                    value
                  )
                }
                onNumberChange={(
                  field,
                  value
                ) =>
                  updateNumber(
                    plan.plan_code,
                    field,
                    value
                  )
                }
                onSave={() =>
                  savePlan(plan)
                }
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

/* =========================================================
   요금제 카드
========================================================= */

function PlanCard({
  plan,
  saving,
  onChange,
  onNumberChange,
  onSave,
}) {
  const code =
    String(
      plan.plan_code || ""
    ).toLowerCase();

  let icon = "📦";

  if (code === "trial") {
    icon = "🎁";
  } else if (code === "basic") {
    icon = "🥉";
  } else if (code === "pro") {
    icon = "🥈";
  } else if (code === "business") {
    icon = "🥇";
  }

  return (
    <section style={styles.planCard}>
      <div style={styles.planHeader}>
        <div>
          <div style={styles.planTitleRow}>
            <span style={styles.planIcon}>
              {icon}
            </span>

            <div>
              <div style={styles.planName}>
                {plan.plan_name}
              </div>

              <div style={styles.planCode}>
                {plan.plan_code}
              </div>
            </div>
          </div>
        </div>

        <label style={styles.activeControl}>
          <input
            type="checkbox"
            checked={
              Boolean(plan.is_active)
            }
            onChange={(event) =>
              onChange(
                "is_active",
                event.target.checked
              )
            }
            style={styles.checkbox}
          />

          <span>
            {plan.is_active
              ? "활성"
              : "정지"}
          </span>
        </label>
      </div>

      <div style={styles.divider} />

      {/* 요금제명 */}

      <Field
        label="요금제명"
        hint="고객 및 관리자에게 표시되는 이름"
      >
        <input
          type="text"
          value={plan.plan_name}
          onChange={(event) =>
            onChange(
              "plan_name",
              event.target.value
            )
          }
          style={styles.input}
        />
      </Field>

      {/* 월 요금 */}

      <Field
        label="월 요금"
        hint="원 / 월"
      >
        <div style={styles.inputWithUnit}>
          <input
            type="text"
            inputMode="numeric"
            value={
              plan.monthly_price_krw
            }
            onChange={(event) =>
              onNumberChange(
                "monthly_price_krw",
                event.target.value
              )
            }
            style={styles.unitInput}
          />

          <span style={styles.unit}>
            원
          </span>
        </div>
      </Field>

      <div style={styles.limitTitle}>
        월간 사용 한도
      </div>

      <LimitField
        label="🤖 AI 사진분석"
        value={
          plan.ai_photo_analysis_limit
        }
        unit="회"
        onChange={(value) =>
          onNumberChange(
            "ai_photo_analysis_limit",
            value
          )
        }
      />

      <LimitField
        label="🧾 자동견적"
        value={
          plan.auto_estimate_limit
        }
        unit="회"
        onChange={(value) =>
          onNumberChange(
            "auto_estimate_limit",
            value
          )
        }
      />

      <LimitField
        label="🔎 유사이미지 검색"
        value={
          plan.similar_image_search_limit
        }
        unit="회"
        onChange={(value) =>
          onNumberChange(
            "similar_image_search_limit",
            value
          )
        }
      />

      <LimitField
        label="🪄 가상시공"
        value={
          plan.virtual_remodel_limit
        }
        unit="회"
        onChange={(value) =>
          onNumberChange(
            "virtual_remodel_limit",
            value
          )
        }
      />

      <LimitField
        label="📷 이미지 업로드"
        value={
          plan.image_upload_limit
        }
        unit="장"
        onChange={(value) =>
          onNumberChange(
            "image_upload_limit",
            value
          )
        }
      />

      <LimitField
        label="💾 저장용량"
        value={
          plan.storage_mb_limit
        }
        unit="MB"
        onChange={(value) =>
          onNumberChange(
            "storage_mb_limit",
            value
          )
        }
      />

      <LimitField
        label="💬 고객상담"
        value={
          plan.customer_lead_limit
        }
        unit="건"
        onChange={(value) =>
          onNumberChange(
            "customer_lead_limit",
            value
          )
        }
      />

      <button
        type="button"
        disabled={saving}
        onClick={onSave}
        style={{
          ...
