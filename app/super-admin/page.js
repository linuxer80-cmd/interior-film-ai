"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import ToolIllustration from "../components/ui/ToolIllustration";
import ui from "../admin/AdminUi.module.css";
import {
  disablePushNotifications,
  enablePushNotifications,
  getPushSubscriptionStatus,
  isPushSupported,
} from "../utils/pushSubscription";

export default function SuperAdminPage() {
  const [loading, setLoading] = useState(true);
  const [changingId, setChangingId] = useState(null);
  const [authorized, setAuthorized] = useState(false);
  const [adminName, setAdminName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [companies, setCompanies] = useState([]);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(0);

  const [pushSupported, setPushSupported] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushMessage, setPushMessage] = useState("");

  const checkSuperAdmin = useCallback(async () => {
    const {
      data: authData,
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      throw new Error(`로그인 확인 실패: ${authError.message}`);
    }

    const user = authData?.user;

    if (!user?.id) {
      throw new Error("로그인이 필요합니다.");
    }

    setUserEmail(user.email || "");

    const { data, error } = await supabase.rpc("get_super_admin_status");

    if (error) {
      throw new Error(`슈퍼관리자 확인 실패: ${error.message}`);
    }

    const status = Array.isArray(data) ? data[0] : data;

    if (!status?.is_super_admin) {
      throw new Error("슈퍼관리자 권한이 없습니다.");
    }

    setAuthorized(true);
    setAdminName(status?.name || "슈퍼관리자");

    return true;
  }, []);

  const loadCompanies = useCallback(async () => {
    const { data, error } = await supabase.rpc(
      "super_admin_get_companies"
    );

    if (error) {
      throw new Error(`회사 목록 조회 실패: ${error.message}`);
    }

    setCompanies(Array.isArray(data) ? data : []);
  }, []);

  const loadNotificationUnreadCount = useCallback(async () => {
    const { data, error } = await supabase.rpc(
      "get_unread_notification_count"
    );

    if (error) {
      console.error("알림 개수 조회:", error);
      return;
    }

    const count = Number(Array.isArray(data) ? data[0] : data) || 0;

    setNotificationUnreadCount(count);
  }, []);

  useEffect(() => {
    let alive = true;

    async function initialize() {
      setLoading(true);
      setMessage("");

      try {
        await checkSuperAdmin();

        if (!alive) return;

        await Promise.all([
          loadCompanies(),
          loadNotificationUnreadCount(),
        ]);
      } catch (error) {
        console.error("슈퍼관리자 초기화:", error);

        if (!alive) return;

        setAuthorized(false);
        setMessage(
          `❌ ${error?.message || "페이지를 불러오지 못했습니다."}`
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
    loadNotificationUnreadCount,
  ]);

  useEffect(() => {
    if (!authorized) return;

    const channel = supabase
      .channel("super-admin-home-notifications-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: "recipient_type=eq.super_admin",
        },
        () => {
          loadNotificationUnreadCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [authorized, loadNotificationUnreadCount]);

  const loadPushStatus = useCallback(async () => {
    const supported = isPushSupported();

    setPushSupported(supported);

    if (!supported) {
      setPushEnabled(false);
      return;
    }

    try {
      const status = await getPushSubscriptionStatus();
      setPushEnabled(Boolean(status?.enabled));
    } catch (error) {
      console.error("Push 상태 확인:", error);
      setPushEnabled(false);
    }
  }, []);

  useEffect(() => {
    if (!authorized) return;

    loadPushStatus();
  }, [authorized, loadPushStatus]);

  async function handleEnablePush() {
    setPushLoading(true);
    setPushMessage("");

    try {
      await enablePushNotifications();
      setPushEnabled(true);
      setPushMessage("✅ 이 휴대폰의 알림이 켜졌습니다.");
    } catch (error) {
      console.error("Push 알림 켜기:", error);
      setPushEnabled(false);
      setPushMessage(
        `❌ ${error?.message || "휴대폰 알림 등록에 실패했습니다."}`
      );
    } finally {
      setPushLoading(false);
    }
  }

  async function handleDisablePush() {
    const confirmed = window.confirm(
      "이 휴대폰의 슈퍼관리자 Push 알림을 끌까요?"
    );

    if (!confirmed) return;

    setPushLoading(true);
    setPushMessage("");

    try {
      await disablePushNotifications();
      setPushEnabled(false);
      setPushMessage("✅ 이 휴대폰의 알림을 껐습니다.");
    } catch (error) {
      console.error("Push 알림 끄기:", error);
      setPushMessage(
        `❌ ${error?.message || "휴대폰 알림 해제에 실패했습니다."}`
      );
    } finally {
      setPushLoading(false);
    }
  }

  async function changeCompanyActive(company) {
    if (!company?.id) return;

    const nextActive = !Boolean(company.is_active);
    const actionText = nextActive ? "활성화" : "정지";

    const confirmed = window.confirm(
      `${company.company_name || "회사"}를 ${actionText}할까요?`
    );

    if (!confirmed) return;

    setChangingId(company.id);
    setMessage("");

    try {
      const { data, error } = await supabase.rpc(
        "super_admin_set_company_active",
        {
          p_company_id: company.id,
          p_is_active: nextActive,
        }
      );

      if (error) throw error;

      const updated = Array.isArray(data) ? data[0] : data;

      setCompanies((current) =>
        current.map((item) =>
          item.id === company.id
            ? {
                ...item,
                is_active: updated?.is_active ?? nextActive,
              }
            : item
        )
      );

      setMessage(
        `✅ ${company.company_name} ${
          nextActive ? "활성화" : "정지"
        } 완료`
      );
    } catch (error) {
      console.error("회사 상태 변경:", error);
      setMessage(
        `❌ 회사 상태 변경 실패: ${
          error?.message || "오류가 발생했습니다."
        }`
      );
    } finally {
      setChangingId(null);
    }
  }

  async function refreshCompanies() {
    setMessage("");

    try {
      await Promise.all([
        loadCompanies(),
        loadNotificationUnreadCount(),
      ]);

      setMessage("✅ 회사 목록을 새로고침했습니다.");
    } catch (error) {
      setMessage(`❌ ${error?.message || "새로고침 실패"}`);
    }
  }

  function openPage(path) {
    window.location.href = path;
  }

  function openCompany(company) {
    if (!company?.id) return;

    openPage(`/super-admin/company/${company.id}`);
  }

  const filteredCompanies = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    if (!keyword) return companies;

    return companies.filter((company) => {
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

      return text.includes(keyword);
    });
  }, [companies, search]);

  const totalCount = companies.length;
  const activeCount = companies.filter(
    (item) => item.is_active === true
  ).length;
  const inactiveCount = totalCount - activeCount;

  if (loading) {
    return (
      <main style={styles.page}>
        <div style={styles.centerBox}>
          <div style={styles.loadingIcon}>🛡️</div>

          <div style={styles.loadingTitle}>
            슈퍼관리자 확인 중...
          </div>

          <div style={styles.loadingText}>
            관리자 권한과 회사 정보를 불러오고 있습니다.
          </div>
        </div>
      </main>
    );
  }

  if (!authorized) {
    return (
      <main style={styles.page}>
        <div style={styles.centerBox}>
          <div style={styles.deniedIcon}>🔒</div>

          <h2 style={styles.deniedTitle}>접근할 수 없습니다</h2>

          <div style={styles.deniedText}>
            슈퍼관리자 전용 페이지입니다.
          </div>

          {message && (
            <div role="alert" style={styles.errorBox}>
              {message}
            </div>
          )}

          <button
            type="button"
            style={styles.homeButton}
            onClick={() => openPage("/admin")}
          >
            관리자 페이지로 이동
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className={ui.page}>
      <header className={ui.header}>
        <div>
          <div className={ui.eyebrow}>필름장이 · 슈퍼관리자</div>
          <h1 className={ui.title}>서비스 관리</h1>
        </div>
      </header>

      <a
        className={ui.secondary}
        href="/admin"
        style={{
          width: "100%",
          justifyContent: "space-between",
          marginBottom: 20,
          boxSizing: "border-box",
        }}
      >
        관리자 페이지로 이동
        <span aria-hidden="true">↗</span>
      </a>

      <div className={ui.tasks}>
        <button
          type="button"
          className={ui.task}
          onClick={() => openPage("/super-admin/notifications")}
        >
          <ToolIllustration kind="report" size={46} />
          <span>새 알림</span>

          <strong>
            {notificationUnreadCount.toLocaleString("ko-KR")}
            <small> 건</small>
          </strong>
        </button>

        <button
          type="button"
          className={ui.task}
          onClick={() => openPage("/super-admin/material-orders")}
        >
          <ToolIllustration kind="film" size={46} />
          <span>자재 주문</span>

          <strong style={{ fontSize: 19 }}>
            주문 확인 <span aria-hidden="true">↗</span>
          </strong>
        </button>
      </div>

      <section>
        <div className={ui.sectionHeading}>
          <div>
            <h2>업체 관리</h2>

            <p className={ui.help} style={{ margin: "6px 0 0" }}>
              전체 {totalCount} · 운영 {activeCount} · 중지 {inactiveCount}
            </p>
          </div>

          <button
            type="button"
            className={ui.secondary}
            onClick={refreshCompanies}
          >
            새로고침
          </button>
        </div>

        <input
          type="search"
          aria-label="회사명, 대표자, 전화번호 검색"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="회사명, 대표자, 전화번호 검색"
          style={styles.searchInput}
        />

        {message && (
          <div
            role="status"
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

        <div style={styles.companyList}>
          {filteredCompanies.length === 0 ? (
            <div style={styles.empty}>검색 결과가 없습니다.</div>
          ) : (
            filteredCompanies.map((company) => (
              <CompanyCard
                key={company.id}
                company={company}
                changing={changingId === company.id}
                onManage={() => openCompany(company)}
                onToggle={() => changeCompanyActive(company)}
              />
            ))
          )}
        </div>
      </section>

      <details className={ui.more}>
        <summary>운영 메뉴 더보기</summary>

        <div className={ui.moreGrid}>
          <button
            type="button"
            onClick={() => openPage("/super-admin/plans")}
          >
            요금제 관리
          </button>

          <button
            type="button"
            onClick={() => openPage("/super-admin/billing")}
          >
            결제 관리
          </button>

          <button
            type="button"
            onClick={() => openPage("/super-admin/structure")}
          >
            구조분석 관리
          </button>

          <a href="/super-admin/materials">자재 관리</a>
        </div>

        <details className={ui.more}>
          <summary>알림 설정</summary>

          <div style={styles.pushBox}>
            <div style={styles.pushInfo}>
              <div style={styles.pushTitle}>📱 휴대폰 Push 알림</div>

              <div style={styles.pushDescription}>
                {pushSupported
                  ? pushEnabled
                    ? "이 휴대폰은 슈퍼관리자 알림을 받을 수 있습니다."
                    : "앱을 닫아도 신규 업체·결제·만료 등의 알림을 받을 수 있습니다."
                  : "현재 브라우저에서는 Web Push 알림을 지원하지 않습니다."}
              </div>

              {pushMessage && (
                <div
                  role="status"
                  style={{
                    ...styles.pushMessage,
                    color: pushMessage.startsWith("❌")
                      ? "#991b1b"
                      : "#166534",
                  }}
                >
                  {pushMessage}
                </div>
              )}
            </div>

            <button
              type="button"
              disabled={!pushSupported || pushLoading}
              onClick={
                pushEnabled ? handleDisablePush : handleEnablePush
              }
              style={{
                ...styles.pushButton,
                ...(pushEnabled
                  ? styles.pushButtonEnabled
                  : styles.pushButtonDisabled),
                opacity: !pushSupported || pushLoading ? 0.55 : 1,
              }}
            >
              {pushLoading
                ? "처리 중..."
                : pushEnabled
                  ? "✅ 알림 켜짐"
                  : "🔔 알림 켜기"}
            </button>
          </div>
        </details>

        <div className={ui.account}>
          {adminName} · {userEmail}
        </div>
      </details>
    </main>
  );
}

function CompanyCard({ company, changing, onToggle, onManage }) {
  const active = company?.is_active === true;

  return (
    <details className={ui.company}>
      <summary>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className={ui.companyName}>
            {company.company_name || "회사명 없음"}
          </div>

          <div className={ui.companyPlan}>
            {company.subscription_plan || "basic"} ·{" "}
            {company.representative_name || "대표자 미등록"}
          </div>
        </div>

        <span
          style={{
            ...styles.statusBadge,
            flexShrink: 0,
            ...(active ? styles.activeBadge : styles.inactiveBadge),
          }}
        >
          {active ? "운영 중" : "일시 중지"}
        </span>
      </summary>

      <div className={ui.companyDetails}>
        <InfoRow
          label="대표자"
          value={company.representative_name || "-"}
        />

        <InfoRow label="전화번호" value={company.phone || "-"} />

        <InfoRow
          label="요금제"
          value={company.subscription_plan || "basic"}
        />

        <InfoRow
          label="가입일"
          value={
            company.created_at
              ? new Date(company.created_at).toLocaleDateString(
                  "ko-KR",
                  { timeZone: "Asia/Seoul" }
                )
              : "-"
          }
        />

        {company.slug && (
          <InfoRow label="업체 주소" value={`/${company.slug}`} />
        )}

        <div className={ui.moreGrid} style={{ marginTop: 14 }}>
          <button type="button" onClick={onManage}>
            회사 관리
          </button>

          <a href={`/super-admin/company/${company.id}#photos`}>
            업체 사진 보기
          </a>
        </div>

        <button
          type="button"
          disabled={changing}
          onClick={onToggle}
          style={{
            ...styles.toggleButton,
            ...(active ? styles.stopButton : styles.activateButton),
            opacity: changing ? 0.6 : 1,
          }}
        >
          {changing ? "처리 중..." : active ? "회사 정지" : "활성화"}
        </button>

        <div style={styles.companyId}>ID: {company.id}</div>
      </div>
    </details>
  );
}

function InfoRow({ label, value }) {
  return (
    <div style={styles.infoRow}>
      <span style={styles.infoLabel}>{label}</span>
      <span style={styles.infoValue}>{value}</span>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "var(--film-bg, #f8f7f3)",
    color: "#243247",
    padding: "18px 14px 50px",
    boxSizing: "border-box",
  },

  pushBox: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    background: "#ffffff",
    border: "1px solid #e4eaf2",
    borderRadius: "18px",
    padding: "16px",
    marginBottom: "14px",
  },

  pushInfo: {
    minWidth: 0,
    flex: "1 1 180px",
  },

  pushTitle: {
    fontSize: "14px",
    fontWeight: 900,
  },

  pushDescription: {
    marginTop: "6px",
    color: "#7b8798",
    fontSize: "12px",
    lineHeight: 1.7,
  },

  pushMessage: {
    marginTop: "8px",
    fontSize: "12px",
    fontWeight: 700,
    lineHeight: 1.7,
  },

  pushButton: {
    flexShrink: 0,
    minWidth: "104px",
    minHeight: "44px",
    border: 0,
    borderRadius: "14px",
    padding: "10px 12px",
    fontSize: "12px",
    fontWeight: 900,
    cursor: "pointer",
    whiteSpace: "nowrap",
    WebkitTapHighlightColor: "transparent",
    touchAction: "manipulation",
  },

  pushButtonDisabled: {
    background: "var(--film-blue, #3478ed)",
    color: "#ffffff",
  },

  pushButtonEnabled: {
    background: "#dcfce7",
    color: "#166534",
  },

  searchInput: {
    width: "100%",
    boxSizing: "border-box",
    minHeight: "50px",
    border: "1px solid #dfe6ef",
    borderRadius: "15px",
    background: "#ffffff",
    color: "#243247",
    padding: "12px 14px",
    fontSize: "16px",
    marginBottom: "14px",
  },

  message: {
    padding: "13px",
    borderRadius: "14px",
    marginBottom: "14px",
    fontSize: "13px",
    lineHeight: 1.7,
  },

  messageSuccess: {
    background: "#f0fdf4",
    color: "#166534",
    border: "1px solid #bbf7d0",
  },

  messageError: {
    background: "#fff1f2",
    color: "#991b1b",
    border: "1px solid #fecaca",
  },

  companyList: {
    display: "grid",
    gap: "12px",
  },

  statusBadge: {
    padding: "6px 9px",
    borderRadius: "999px",
    fontSize: "11px",
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
    minHeight: "44px",
    marginTop: "14px",
    border: 0,
    borderRadius: "14px",
    padding: "10px 14px",
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

  infoRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    padding: "7px 0",
    fontSize: "13px",
  },

  infoLabel: {
    color: "#7b8798",
    flexShrink: 0,
  },

  infoValue: {
    fontWeight: 700,
    textAlign: "right",
    overflowWrap: "anywhere",
  },

  companyId: {
    marginTop: "12px",
    paddingTop: "10px",
    borderTop: "1px dashed #e4eaf2",
    color: "#9ca3af",
    fontSize: "10px",
    wordBreak: "break-all",
  },

  empty: {
    padding: "35px 14px",
    textAlign: "center",
    color: "#7b8798",
    fontSize: "14px",
    background: "#ffffff",
    border: "1px solid #e4eaf2",
    borderRadius: "20px",
  },

  centerBox: {
    width: "100%",
    maxWidth: "420px",
    boxSizing: "border-box",
    margin: "80px auto 0",
    background: "#ffffff",
    border: "1px solid #e4eaf2",
    borderRadius: "24px",
    padding: "28px 20px",
    textAlign: "center",
    boxShadow: "0 8px 28px rgba(48, 77, 116, 0.05)",
  },

  loadingIcon: {
    fontSize: "40px",
    marginBottom: "12px",
  },

  loadingTitle: {
    fontSize: "18px",
    fontWeight: 900,
  },

  loadingText: {
    marginTop: "8px",
    color: "#7b8798",
    fontSize: "13px",
    lineHeight: 1.7,
  },

  deniedIcon: {
    fontSize: "42px",
  },

  deniedTitle: {
    margin: "12px 0 8px",
    fontSize: "20px",
  },

  deniedText: {
    color: "#7b8798",
    fontSize: "13px",
  },

  errorBox: {
    marginTop: "16px",
    padding: "12px",
    borderRadius: "14px",
    background: "#fff1f2",
    color: "#991b1b",
    fontSize: "12px",
    lineHeight: 1.7,
  },

  homeButton: {
    marginTop: "18px",
    width: "100%",
    minHeight: "48px",
    border: 0,
    borderRadius: "14px",
    background: "var(--film-blue, #3478ed)",
    color: "#ffffff",
    fontWeight: 900,
    cursor: "pointer",
  },
};
