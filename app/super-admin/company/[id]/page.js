"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../../../lib/supabase";
import CompanyPhotoGallery from "../../CompanyPhotoGallery";
import ToolIllustration from "../../../components/ui/ToolIllustration";

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
  ["ai_photo_analysis_limit", "ai_photo_analysis", "AI 사진분석", "회"],
  ["auto_estimate_limit", "auto_estimate", "자동견적", "회"],
  ["similar_image_search_limit", "similar_image_search", "유사이미지 검색", "회"],
  ["virtual_remodel_limit", "virtual_remodel", "가상시공", "회"],
  ["image_upload_limit", "image_upload", "이미지 업로드", "장"],
  ["storage_mb_limit", "storage_mb", "저장용량", "MB"],
  ["customer_lead_limit", "customer_lead", "고객상담", "건"],
];

const MENUS = [
  ["summary", "요약"],
  ["usage", "사용량"],
  ["info", "회사정보"],
  ["accounts", "계정"],
  ["photos", "사진"],
];

function formatDate(value) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatNumber(value) {
  const number = Number(value || 0);

  return Number.isFinite(number)
    ? number.toLocaleString("ko-KR", {
        maximumFractionDigits: 2,
      })
    : "0";
}

function formatWon(value) {
  return `${formatNumber(Math.round(Number(value) || 0))}원`;
}

function companyForm(row) {
  return {
    company_name: row?.company_name || "",
    representative_name: row?.representative_name || "",
    phone: row?.phone || "",
    address: row?.address || "",
    subscription_plan: row?.subscription_plan || "basic",
  };
}

export default function SuperAdminCompanyDetailPage() {
  const params = useParams();
  const companyId = Array.isArray(params?.id)
    ? params.id[0]
    : params?.id || "";

  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [saving, setSaving] = useState(false);
  const [usageLoading, setUsageLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [company, setCompany] = useState(null);
  const [companyUsers, setCompanyUsers] = useState([]);
  const [usage, setUsage] = useState({ ...EMPTY_USAGE });
  const [plans, setPlans] = useState([]);
  const [form, setForm] = useState(companyForm(null));

  const [menu, setMenu] = useState("summary");
  const [photosVisited, setPhotosVisited] = useState(false);

  const currentPlan = useMemo(
    () =>
      plans.find(
        (plan) =>
          plan.plan_code ===
          (company?.subscription_plan || "basic")
      ) || null,
    [plans, company?.subscription_plan]
  );

  const selectedPlan = useMemo(
    () =>
      plans.find(
        (plan) => plan.plan_code === form.subscription_plan
      ) || null,
    [plans, form.subscription_plan]
  );

  async function checkSuperAdmin() {
    const { data, error: authError } = await supabase.auth.getUser();

    if (authError) throw authError;
    if (!data?.user) throw new Error("로그인이 필요합니다.");

    const { data: allowed, error: rpcError } = await supabase.rpc(
      "is_super_admin"
    );

    if (rpcError) throw rpcError;
    if (!allowed) throw new Error("슈퍼관리자 권한이 없습니다.");

    setAuthorized(true);
  }

  async function loadCompany() {
    const { data, error: rpcError } = await supabase.rpc(
      "super_admin_get_company",
      { p_company_id: companyId }
    );

    if (rpcError) throw rpcError;

    const row = Array.isArray(data) ? data[0] : data;

    if (!row) throw new Error("회사 정보를 찾을 수 없습니다.");

    setCompany(row);
    setForm(companyForm(row));
  }

  async function loadCompanyUsers() {
    const { data, error: rpcError } = await supabase.rpc(
      "super_admin_get_company_users",
      { p_company_id: companyId }
    );

    if (rpcError) throw rpcError;

    setCompanyUsers(Array.isArray(data) ? data : []);
  }

  async function loadCompanyUsage() {
    const { data, error: rpcError } = await supabase.rpc(
      "super_admin_get_company_usage",
      { p_company_id: companyId }
    );

    if (rpcError) throw rpcError;

    const next = { ...EMPTY_USAGE };

    for (const row of Array.isArray(data) ? data : []) {
      if (
        row?.event_type &&
        Object.prototype.hasOwnProperty.call(next, row.event_type)
      ) {
        next[row.event_type] += Number(row.total_quantity || 0);
      }

      next.total_cost_krw += Number(row.total_cost_krw || 0);
    }

    setUsage(next);
  }

  async function loadPlans() {
    const { data, error: rpcError } = await supabase.rpc(
      "super_admin_get_subscription_plans"
    );

    if (rpcError) throw rpcError;

    setPlans(Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    async function initialize() {
      setLoading(true);
      setAuthorized(false);
      setCompany(null);
      setCompanyUsers([]);
      setUsage({ ...EMPTY_USAGE });
      setError("");
      setMessage("");

      const nextMenu =
        window.location.hash === "#photos" ? "photos" : "summary";

      setMenu(nextMenu);
      setPhotosVisited(nextMenu === "photos");

      try {
        if (!companyId) throw new Error("회사 ID가 없습니다.");

        await checkSuperAdmin();

        await Promise.all([
          loadCompany(),
          loadCompanyUsers(),
          loadCompanyUsage(),
          loadPlans(),
        ]);
      } catch (err) {
        console.error("회사 상세 조회:", err);
        setError(err?.message || "회사 정보를 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    }

    initialize();
  }, [companyId]);

  useEffect(() => {
    function handleHashChange() {
      if (window.location.hash === "#photos") {
        setMenu("photos");
        setPhotosVisited(true);
      }
    }

    window.addEventListener("hashchange", handleHashChange);

    return () => {
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, []);

  function chooseMenu(id) {
    setMenu(id);

    if (id === "photos") setPhotosVisited(true);

    const url = new URL(window.location.href);
    url.hash = id === "photos" ? "photos" : "";
    window.history.replaceState(null, "", url);
  }

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function saveCompany(event) {
    event.preventDefault();
    if (saving || usageLoading) return;

    if (!form.company_name.trim()) {
      setError("회사명을 입력해주세요.");
      return;
    }

    if (!form.subscription_plan) {
      setError("요금제를 선택해주세요.");
      return;
    }

    if (
      !window.confirm("회사 정보와 적용 요금제를 저장하시겠습니까?")
    ) {
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const { data, error: rpcError } = await supabase.rpc(
        "super_admin_update_company",
        {
          p_company_id: companyId,
          p_company_name: form.company_name.trim(),
          p_representative_name:
            form.representative_name.trim() || null,
          p_phone: form.phone.trim() || null,
          p_address: form.address.trim() || null,
          p_subscription_plan: form.subscription_plan,
        }
      );

      if (rpcError) throw rpcError;

      const updated = Array.isArray(data) ? data[0] : data;

      if (updated) {
        setCompany(updated);
        setForm(companyForm(updated));
      } else {
        await loadCompany();
      }

      await loadPlans();
      setMessage("회사 정보와 적용 요금제가 저장되었습니다.");
    } catch (err) {
      console.error("회사 정보 저장:", err);
      setError(err?.message || "회사 정보 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function refreshUsage() {
    if (usageLoading || saving) return;

    setUsageLoading(true);
    setError("");
    setMessage("");

    try {
      await Promise.all([loadCompanyUsage(), loadPlans()]);
      setMessage("최신 사용량과 요금제 한도를 불러왔습니다.");
    } catch (err) {
      setError(err?.message || "사용량 새로고침에 실패했습니다.");
    } finally {
      setUsageLoading(false);
    }
  }

  if (loading) {
    return (
      <main style={styles.page}>
        <section style={styles.centerCard}>
          <h1 style={styles.centerTitle}>회사 정보를 불러오는 중...</h1>
        </section>
      </main>
    );
  }

  if (!authorized || !company) {
    return (
      <main style={styles.page}>
        <section style={styles.centerCard}>
          <div style={{ fontSize: 40 }}>🔒</div>
          <h1 style={styles.centerTitle}>
            회사 정보를 확인할 수 없습니다
          </h1>

          {error && (
            <div role="alert" style={styles.error}>
              {error}
            </div>
          )}

          <Link
            href="/super-admin"
            style={{
              ...styles.button,
              display: "block",
              marginTop: 20,
              textDecoration: "none",
            }}
          >
            슈퍼관리자로 돌아가기
          </Link>
        </section>
      </main>
    );
  }

  const busy = saving || usageLoading;

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
            <small style={styles.eyebrow}>필름장이 · 업체 상세관리</small>
            <h1 style={styles.title}>{company.company_name}</h1>
          </div>

          <ToolIllustration kind="home" size={52} />
        </header>

        <nav aria-label="업체 상세 메뉴" style={styles.menus}>
          {MENUS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={menu === id}
              onClick={() => chooseMenu(id)}
              style={{
                ...styles.menuButton,
                ...(menu === id ? styles.selected : {}),
              }}
            >
              {label}
            </button>
          ))}
        </nav>

        {message && (
          <div role="status" style={styles.success}>
            ✓ {message}
          </div>
        )}

        {error && (
          <div role="alert" style={styles.error}>
            {error}
          </div>
        )}

        {menu === "summary" && (
          <section style={styles.card}>
            <div style={styles.sectionHeader}>
              <div>
                <h2 style={styles.sectionTitle}>회사 요약</h2>
                <p style={styles.help}>/{company.slug || "-"}</p>
              </div>

              <span
                style={{
                  ...styles.badge,
                  background: company.is_active
                    ? "#ecfdf5"
                    : "#fff1f2",
                  color: company.is_active ? "#047857" : "#b91c1c",
                }}
              >
                {company.is_active ? "운영 중" : "정지"}
              </span>
            </div>

            <div style={styles.grid2}>
              {[
                [
                  "요금제",
                  currentPlan?.plan_name ||
                    company.subscription_plan ||
                    "basic",
                ],
                ["대표자", company.representative_name || "-"],
                ["가입일", formatDate(company.created_at)],
                ["소속 계정", `${companyUsers.length}명`],
              ].map(([label, value]) => (
                <div key={label} style={styles.infoBox}>
                  <div style={styles.help}>{label}</div>
                  <strong style={styles.infoValue}>{value}</strong>
                </div>
              ))}
            </div>

            {currentPlan && (
              <div style={styles.costBox}>
                <span>현재 월 요금</span>
                <strong style={styles.amount}>
                  {formatWon(currentPlan.monthly_price_krw)}
                </strong>
              </div>
            )}

            <p style={styles.idText}>회사 ID: {company.id}</p>
          </section>
        )}

        {menu === "usage" && (
          <section style={styles.card}>
            <div style={styles.sectionHeader}>
              <div>
                <h2 style={styles.sectionTitle}>이번 달 사용량</h2>
                <p style={styles.help}>현재 적용 요금제의 최신 한도</p>
              </div>

              <button
                type="button"
                disabled={busy}
                onClick={refreshUsage}
                style={{
                  ...styles.button,
                  ...(busy ? styles.disabled : {}),
                }}
              >
                {usageLoading ? "조회 중..." : "새로고침"}
              </button>
            </div>

            {!currentPlan ? (
              <div style={styles.error}>
                현재 적용된 요금제 정보를 찾을 수 없습니다.
              </div>
            ) : (
              <div style={styles.list}>
                {LIMIT_FIELDS.map(([key, usageKey, label, unit]) => (
                  <UsageItem
                    key={usageKey}
                    label={label}
                    value={usage[usageKey]}
                    limit={currentPlan[key]}
                    unit={unit}
                  />
                ))}
              </div>
            )}

            <div style={styles.costBox}>
              <div>
                <strong>이번 달 AI/API 원가</strong>
                <p style={styles.help}>서비스 운영자의 API 비용</p>
              </div>

              <strong style={styles.amount}>
                {formatWon(usage.total_cost_krw)}
              </strong>
            </div>

            <p style={styles.help}>
              요금제 한도를 변경한 뒤 새로고침하면 최신 한도가
              반영됩니다.
            </p>
          </section>
        )}

        <section hidden={menu !== "info"} style={styles.card}>
          <h2 style={styles.sectionTitle}>회사 정보 수정</h2>

          <p style={{ ...styles.help, marginBottom: 16 }}>
            회사 기본정보와 적용 요금제를 수정합니다. 요금제의 가격과
            사용 한도는 요금제 관리 메뉴에서 설정합니다.
          </p>

          <form onSubmit={saveCompany}>
            {[
              ["company_name", "회사명", "text"],
              ["representative_name", "대표자", "text"],
              ["phone", "전화번호", "tel"],
              ["address", "주소", "text"],
            ].map(([name, label, type]) => (
              <div key={name} style={styles.field}>
                <label htmlFor={`company-${name}`} style={styles.label}>
                  {label}
                </label>

                <input
                  id={`company-${name}`}
                  name={name}
                  type={type}
                  value={form[name]}
                  onChange={handleChange}
                  disabled={busy}
                  style={styles.input}
                />
              </div>
            ))}

            <label htmlFor="company-plan" style={styles.label}>
              적용 요금제
            </label>

            <select
              id="company-plan"
              name="subscription_plan"
              value={form.subscription_plan}
              onChange={handleChange}
              disabled={busy}
              style={styles.input}
            >
              {!plans.some(
                (plan) => plan.plan_code === form.subscription_plan
              ) && (
                <option value={form.subscription_plan}>
                  {form.subscription_plan}
                </option>
              )}

              {plans
                .filter(
                  (plan) =>
                    plan.is_active ||
                    plan.plan_code === form.subscription_plan
                )
                .map((plan) => (
                  <option key={plan.plan_code} value={plan.plan_code}>
                    {plan.plan_name} ·{" "}
                    {formatWon(plan.monthly_price_krw)}/월
                  </option>
                ))}
            </select>

            {selectedPlan && (
              <div style={styles.notice}>
                선택 요금제: <strong>{selectedPlan.plan_name}</strong>
                <br />
                월 요금: {formatWon(selectedPlan.monthly_price_krw)}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              style={{
                ...styles.primary,
                ...(busy ? styles.disabled : {}),
              }}
            >
              {saving ? "저장 중..." : "회사 정보 저장"}
            </button>
          </form>
        </section>

        {menu === "accounts" && (
          <section style={styles.card}>
            <h2 style={styles.sectionTitle}>
              회사 계정 · {companyUsers.length}명
            </h2>

            <p style={{ ...styles.help, marginBottom: 16 }}>
              이 회사에 연결된 로그인 계정입니다.
            </p>

            {companyUsers.length === 0 ? (
              <div style={styles.empty}>연결된 계정이 없습니다.</div>
            ) : (
              <div style={styles.list}>
                {companyUsers.map((member) => (
                  <article key={member.user_id} style={styles.infoBox}>
                    <strong style={{ overflowWrap: "anywhere" }}>
                      {member.email || "이메일 없음"}
                    </strong>

                    <p style={styles.help}>
                      가입일: {formatDate(member.created_at)}
                      <br />
                      최근 로그인:{" "}
                      {member.last_sign_in_at
                        ? formatDate(member.last_sign_in_at)
                        : "로그인 기록 없음"}
                    </p>

                    <p style={styles.idText}>
                      User ID: {member.user_id}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {photosVisited && (
          <section id="photos" hidden={menu !== "photos"}>
            <CompanyPhotoGallery
              companyId={companyId}
              companyName={company.company_name || "업체"}
            />
          </section>
        )}
      </div>
    </main>
  );
}

function UsageItem({ label, value, limit, unit }) {
  const used = Number(value || 0);
  const max = Number(limit || 0);
  const hasLimit = Number.isFinite(max) && max > 0;
  const percent = hasLimit
    ? Math.max(0, Math.min(100, (used / max) * 100))
    : 0;
  const reached = hasLimit && used >= max;

  return (
    <div style={styles.usageItem}>
      <div style={styles.sectionHeader}>
        <strong style={{ fontSize: 13 }}>{label}</strong>

        <span style={{ fontSize: 13, color: "#50617a" }}>
          {formatNumber(used)} /{" "}
          {hasLimit ? formatNumber(max) : "무제한"} {unit}
        </span>
      </div>

      <div style={styles.progressTrack}>
        <div
          style={{
            height: "100%",
            width: `${percent}%`,
            borderRadius: 999,
            background: reached
              ? "#e15b64"
              : percent >= 80
                ? "#eab34f"
                : "#3478ed",
          }}
        />
      </div>

      <div style={styles.percentRow}>
        <span>
          {hasLimit
            ? `${formatNumber(percent)}% 사용`
            : "사용 한도 없음"}
        </span>

        {reached && (
          <strong style={{ color: "#b91c1c" }}>한도 도달</strong>
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
    fontSize: 24,
    letterSpacing: "-0.7px",
    overflowWrap: "anywhere",
  },
  help: {
    margin: "6px 0 0",
    color: "#7b8798",
    fontSize: 12,
    lineHeight: 1.8,
    overflowWrap: "anywhere",
  },
  menus: {
    display: "grid",
    gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
    gap: 5,
    marginBottom: 18,
  },
  menuButton: {
    minHeight: 48,
    padding: "10px 2px",
    border: "1px solid #dfe6ef",
    borderRadius: 14,
    background: "#ffffff",
    color: "#50617a",
    fontSize: 11,
    fontWeight: 800,
    cursor: "pointer",
  },
  selected: {
    background: "#eaf3ff",
    color: "#3268bd",
    borderColor: "#3478ed",
  },
  card: {
    padding: 18,
    border: "1px solid #e4eaf2",
    borderRadius: 22,
    background: "#ffffff",
    boxShadow: "0 6px 20px rgba(48,77,116,0.04)",
  },
  sectionTitle: {
    margin: 0,
    fontSize: 18,
  },
  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 14,
  },
  badge: {
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 800,
  },
  grid2: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 10,
  },
  infoBox: {
    minWidth: 0,
    padding: 14,
    borderRadius: 16,
    background: "#f3f7fc",
  },
  infoValue: {
    display: "block",
    marginTop: 8,
    fontSize: 14,
    lineHeight: 1.7,
    overflowWrap: "anywhere",
  },
  costBox: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 18,
    padding: 16,
    borderRadius: 16,
    background: "#eaf3ff",
    color: "#3268bd",
    fontSize: 13,
  },
  amount: {
    fontSize: 21,
    overflowWrap: "anywhere",
  },
  idText: {
    paddingTop: 12,
    margin: "14px 0 0",
    borderTop: "1px dashed #dfe6ef",
    color: "#9ca3af",
    fontSize: 10,
    overflowWrap: "anywhere",
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
  },
  primary: {
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
  list: {
    display: "grid",
    gap: 12,
  },
  usageItem: {
    padding: 14,
    border: "1px solid #e4eaf2",
    borderRadius: 16,
    background: "#fbfcfe",
  },
  progressTrack: {
    height: 9,
    borderRadius: 999,
    overflow: "hidden",
    background: "#eaf0f7",
  },
  percentRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 8,
    color: "#7b8798",
    fontSize: 10,
  },
  field: {
    marginBottom: 16,
  },
  label: {
    display: "block",
    marginBottom: 8,
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
  notice: {
    padding: 14,
    marginTop: 14,
    borderRadius: 14,
    background: "#f3f7fc",
    color: "#50617a",
    fontSize: 12,
    lineHeight: 1.8,
  },
  success: {
    padding: 14,
    marginBottom: 16,
    borderRadius: 14,
    background: "#ecfdf5",
    color: "#047857",
    fontSize: 12,
    lineHeight: 1.8,
  },
  error: {
    padding: 14,
    marginBottom: 16,
    borderRadius: 14,
    background: "#fff1f2",
    color: "#b91c1c",
    fontSize: 12,
    lineHeight: 1.8,
    overflowWrap: "anywhere",
  },
  empty: {
    padding: "30px 14px",
    textAlign: "center",
    color: "#7b8798",
    fontSize: 13,
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
    margin: "16px 0",
    fontSize: 20,
  },
};
