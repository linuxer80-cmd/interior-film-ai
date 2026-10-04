"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabase";
import ToolIllustration from "../../components/ui/ToolIllustration";

function formatDateTime(value) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getPriorityInfo(priority) {
  switch (priority) {
    case "critical":
      return {
        icon: "🚨",
        label: "중요",
        background: "#fff1f2",
        color: "#b91c1c",
      };
    case "warning":
      return {
        icon: "⚠️",
        label: "주의",
        background: "#fff7df",
        color: "#a16207",
      };
    case "success":
      return {
        icon: "✅",
        label: "완료",
        background: "#ecfdf5",
        color: "#047857",
      };
    default:
      return {
        icon: "🔔",
        label: "안내",
        background: "#eaf3ff",
        color: "#3268bd",
      };
  }
}

export default function SuperAdminNotificationsPage() {
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [adminName, setAdminName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [notifications, setNotifications] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("all");
  const [processingId, setProcessingId] = useState(null);
  const [markingAll, setMarkingAll] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

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

    const { data, error } = await supabase.rpc(
      "get_super_admin_status"
    );

    if (error) {
      throw new Error(`슈퍼관리자 확인 실패: ${error.message}`);
    }

    const status = Array.isArray(data) ? data[0] : data;

    if (!status?.is_super_admin) {
      throw new Error("슈퍼관리자 권한이 없습니다.");
    }

    setAuthorized(true);
    setAdminName(status?.name || "슈퍼관리자");
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

  const loadNotifications = useCallback(async () => {
    const { data, error } = await supabase
      .from("notifications")
      .select(`
        id,
        company_id,
        recipient_type,
        recipient_user_id,
        recipient_worker_id,
        type,
        priority,
        title,
        message,
        link,
        reference_type,
        reference_id,
        dedupe_key,
        is_read,
        read_at,
        push_sent,
        push_sent_at,
        push_error,
        created_at
      `)
      .eq("recipient_type", "super_admin")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      throw new Error(`알림 조회 실패: ${error.message}`);
    }

    setNotifications(Array.isArray(data) ? data : []);
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
          loadNotifications(),
        ]);
      } catch (error) {
        console.error("슈퍼관리자 알림 초기화:", error);

        if (!alive) return;

        setAuthorized(false);
        setMessage(
          `❌ ${error?.message || "알림센터를 불러오지 못했습니다."}`
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
  }, [checkSuperAdmin, loadCompanies, loadNotifications]);

  useEffect(() => {
    if (!authorized) return;

    const channel = supabase
      .channel("super-admin-notifications-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: "recipient_type=eq.super_admin",
        },
        () => {
          loadNotifications().catch((error) => {
            console.error("실시간 알림 조회:", error);
            setMessage(
              `❌ ${error?.message || "알림을 갱신하지 못했습니다."}`
            );
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [authorized, loadNotifications]);

  const companyMap = useMemo(
    () => new Map(companies.map((company) => [company.id, company])),
    [companies]
  );

  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.is_read).length,
    [notifications]
  );

  const criticalCount = useMemo(
    () =>
      notifications.filter((item) => item.priority === "critical")
        .length,
    [notifications]
  );

  const filteredNotifications = useMemo(() => {
    if (filter === "unread") {
      return notifications.filter((item) => !item.is_read);
    }

    if (filter === "critical") {
      return notifications.filter(
        (item) => item.priority === "critical"
      );
    }

    return notifications;
  }, [notifications, filter]);

  const busy = processingId !== null || markingAll || refreshing;

  function getCompanyName(companyId) {
    if (!companyId) return "전체 서비스";

    return (
      companyMap.get(companyId)?.company_name || "업체 정보 없음"
    );
  }

  async function markRead(notificationId) {
    if (!notificationId) return false;

    const current = notifications.find(
      (item) => item.id === notificationId
    );

    if (current?.is_read) return true;

    setProcessingId(notificationId);
    setMessage("");

    try {
      const { error } = await supabase.rpc(
        "mark_notification_read",
        { p_notification_id: notificationId }
      );

      if (error) throw error;

      const now = new Date().toISOString();

      setNotifications((items) =>
        items.map((item) =>
          item.id === notificationId
            ? { ...item, is_read: true, read_at: now }
            : item
        )
      );

      return true;
    } catch (error) {
      console.error("알림 읽음 처리:", error);
      setMessage(
        `❌ 알림 읽음 처리 실패: ${
          error?.message || "오류가 발생했습니다."
        }`
      );

      return false;
    } finally {
      setProcessingId(null);
    }
  }

  async function markAllRead() {
    if (busy) return;

    const unreadItems = notifications.filter((item) => !item.is_read);

    if (!unreadItems.length) {
      setMessage("✅ 읽지 않은 알림이 없습니다.");
      return;
    }

    setMarkingAll(true);
    setMessage("");

    try {
      for (const item of unreadItems) {
        const { error } = await supabase.rpc(
          "mark_notification_read",
          { p_notification_id: item.id }
        );

        if (error) throw error;
      }

      const readIds = new Set(unreadItems.map((item) => item.id));
      const now = new Date().toISOString();

      setNotifications((items) =>
        items.map((item) =>
          readIds.has(item.id)
            ? {
                ...item,
                is_read: true,
                read_at: item.read_at || now,
              }
            : item
        )
      );

      setMessage(
        `✅ ${unreadItems.length}개의 알림을 읽음 처리했습니다.`
      );
    } catch (error) {
      console.error("모두 읽음 처리:", error);
      setMessage(
        `❌ 모두 읽음 처리 실패: ${
          error?.message || "오류가 발생했습니다."
        }`
      );

      try {
        await loadNotifications();
      } catch (reloadError) {
        console.error("알림 다시 조회:", reloadError);
      }
    } finally {
      setMarkingAll(false);
    }
  }

  async function openNotification(item) {
    if (!item || busy) return;

    if (!item.is_read) {
      const success = await markRead(item.id);
      if (!success) return;
    }

    if (item.link) {
      window.location.href = item.link;
    } else if (item.company_id) {
      window.location.href =
        `/super-admin/company/${item.company_id}`;
    }
  }

  async function refresh() {
    if (busy) return;

    setRefreshing(true);
    setMessage("");

    try {
      await Promise.all([
        loadCompanies(),
        loadNotifications(),
      ]);

      setMessage("✅ 알림을 새로고침했습니다.");
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
          <div style={{ fontSize: 40 }}>
            {loading ? "🔔" : "🔒"}
          </div>

          <h1 style={styles.centerTitle}>
            {loading
              ? "알림센터를 불러오는 중..."
              : "접근할 수 없습니다"}
          </h1>

          <p style={styles.help}>
            {loading
              ? "관리자 권한과 알림 정보를 확인하고 있습니다."
              : "슈퍼관리자 전용 페이지입니다."}
          </p>

          {!loading && message && (
            <div role="alert" style={styles.error}>
              {message}
            </div>
          )}

          {!loading && (
            <Link
              href="/admin"
              style={{
                ...styles.primary,
                display: "block",
                marginTop: 20,
                textDecoration: "none",
              }}
            >
              관리자 페이지로 이동
            </Link>
          )}
        </section>
      </main>
    );
  }

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
            <small style={styles.eyebrow}>
              필름장이 · 슈퍼관리자
            </small>

            <h1 style={styles.title}>알림센터</h1>

            <p style={styles.help}>
              가입·결제·자재 주문과 서비스 알림
            </p>
          </div>

          <ToolIllustration kind="report" size={52} />
        </header>

        <section style={styles.statsGrid} aria-label="알림 요약">
          {[
            ["전체", notifications.length],
            ["읽지 않음", unreadCount],
            ["중요", criticalCount],
          ].map(([label, value]) => (
            <div key={label} style={styles.statCard}>
              <div style={styles.help}>{label}</div>
              <strong
                style={{
                  ...styles.statValue,
                  color: label === "중요" ? "#b91c1c" : "#3268bd",
                }}
              >
                {value.toLocaleString("ko-KR")}
              </strong>
            </div>
          ))}
        </section>

        <div style={styles.toolbar}>
          <button
            type="button"
            disabled={busy}
            onClick={refresh}
            style={{
              ...styles.button,
              ...(busy ? styles.disabled : {}),
            }}
          >
            {refreshing ? "불러오는 중..." : "새로고침"}
          </button>

          <button
            type="button"
            disabled={busy || unreadCount === 0}
            onClick={markAllRead}
            style={{
              ...styles.primary,
              ...(busy || unreadCount === 0 ? styles.disabled : {}),
            }}
          >
            {markingAll ? "처리 중..." : "모두 읽음"}
          </button>
        </div>

        <nav aria-label="알림 필터" style={styles.filters}>
          {[
            ["all", "전체"],
            ["unread", `읽지 않음 ${unreadCount}`],
            ["critical", "중요"],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
              style={{
                ...styles.filterButton,
                ...(filter === id ? styles.selected : {}),
              }}
            >
              {label}
            </button>
          ))}
        </nav>

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

        <p style={{ ...styles.help, marginBottom: 12 }}>
          최근 알림 최대 200건을 표시합니다.
        </p>

        {filteredNotifications.length === 0 ? (
          <section style={styles.empty}>
            <div style={{ fontSize: 36 }}>🔔</div>

            <h2 style={styles.emptyTitle}>
              {filter === "unread"
                ? "읽지 않은 알림이 없어요"
                : filter === "critical"
                  ? "중요 알림이 없어요"
                  : "아직 알림이 없어요"}
            </h2>

            <p style={styles.help}>
              새로운 알림이 도착하면 여기에 표시됩니다.
            </p>
          </section>
        ) : (
          <div style={styles.notificationList}>
            {filteredNotifications.map((item) => (
              <NotificationCard
                key={item.id}
                item={item}
                companyName={getCompanyName(item.company_id)}
                processing={processingId === item.id}
                disabled={busy}
                onRead={() => markRead(item.id)}
                onOpen={() => openNotification(item)}
              />
            ))}
          </div>
        )}

        <footer style={styles.account}>
          {adminName} · {userEmail}
        </footer>
      </div>
    </main>
  );
}

function NotificationCard({
  item,
  companyName,
  processing,
  disabled,
  onRead,
  onOpen,
}) {
  const priority = getPriorityInfo(item.priority);

  return (
    <article
      style={{
        ...styles.notificationCard,
        ...(!item.is_read
          ? { borderColor: "#b7d3fa", background: "#f8fbff" }
          : {}),
        ...(item.priority === "critical"
          ? { borderLeft: "4px solid #e15b64" }
          : {}),
      }}
    >
      <div style={styles.notificationTop}>
        <div
          aria-hidden="true"
          style={{
            ...styles.priorityIcon,
            background: priority.background,
            color: priority.color,
          }}
        >
          {priority.icon}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={styles.titleRow}>
            <h2 style={styles.notificationTitle}>
              {item.title || "알림"}
            </h2>

            {!item.is_read && (
              <span style={styles.newBadge}>새 알림</span>
            )}
          </div>

          <div style={styles.help}>{companyName}</div>
        </div>
      </div>

      <p style={styles.notificationMessage}>{item.message}</p>

      <div style={styles.meta}>
        <span>{priority.label}</span>
        <span>{formatDateTime(item.created_at)}</span>
      </div>

      <div style={styles.actions}>
        {!item.is_read && (
          <button
            type="button"
            disabled={disabled}
            onClick={onRead}
            style={{
              ...styles.button,
              flex: 1,
              ...(disabled ? styles.disabled : {}),
            }}
          >
            {processing ? "처리 중..." : "읽음 처리"}
          </button>
        )}

        <button
          type="button"
          disabled={disabled}
          onClick={onOpen}
          style={{
            ...styles.primary,
            flex: 1,
            ...(disabled ? styles.disabled : {}),
          }}
        >
          {item.link || item.company_id ? "상세 보기 →" : "확인"}
        </button>
      </div>
    </article>
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

  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 10,
    marginBottom: 18,
  },

  statCard: {
    minWidth: 0,
    padding: "16px 8px",
    border: "1px solid #e4eaf2",
    borderRadius: 18,
    background: "#ffffff",
    textAlign: "center",
  },

  statValue: {
    display: "block",
    marginTop: 8,
    fontSize: 27,
    fontWeight: 900,
    overflowWrap: "anywhere",
  },

  toolbar: {
    display: "flex",
    justifyContent: "flex-end",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },

  button: {
    minHeight: 44,
    padding: "10px 14px",
    border: "1px solid #dfe6ef",
    borderRadius: 14,
    background: "#ffffff",
    color: "#50617a",
    fontSize: 12,
    fontWeight: 800,
    cursor: "pointer",
  },

  primary: {
    minHeight: 44,
    boxSizing: "border-box",
    padding: "12px 14px",
    border: "none",
    borderRadius: 14,
    background: "var(--film-blue, #3478ed)",
    color: "#ffffff",
    fontSize: 12,
    fontWeight: 800,
    cursor: "pointer",
    textAlign: "center",
  },

  filters: {
    display: "flex",
    gap: 8,
    overflowX: "auto",
    paddingBottom: 4,
    marginBottom: 14,
  },

  filterButton: {
    minHeight: 44,
    padding: "10px 14px",
    border: "1px solid #dfe6ef",
    borderRadius: 999,
    background: "#ffffff",
    color: "#50617a",
    fontSize: 12,
    fontWeight: 800,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },

  selected: {
    background: "#eaf3ff",
    color: "#3268bd",
    borderColor: "#3478ed",
  },

  message: {
    padding: 14,
    marginBottom: 16,
    borderRadius: 14,
    fontSize: 13,
    lineHeight: 1.7,
    overflowWrap: "anywhere",
  },

  notificationList: {
    display: "grid",
    gap: 14,
  },

  notificationCard: {
    padding: 18,
    border: "1px solid #e4eaf2",
    borderRadius: 22,
    background: "#ffffff",
    boxShadow: "0 6px 20px rgba(48,77,116,0.04)",
  },

  notificationTop: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
  },

  priorityIcon: {
    width: 42,
    height: 42,
    flexShrink: 0,
    borderRadius: 14,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 20,
  },

  titleRow: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },

  notificationTitle: {
    margin: 0,
    fontSize: 16,
    lineHeight: 1.5,
    overflowWrap: "anywhere",
  },

  newBadge: {
    padding: "3px 7px",
    borderRadius: 999,
    background: "#3478ed",
    color: "#ffffff",
    fontSize: 9,
    fontWeight: 800,
  },

  notificationMessage: {
    margin: "14px 0",
    color: "#50617a",
    fontSize: 13,
    lineHeight: 1.8,
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
  },

  meta: {
    display: "flex",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
    paddingTop: 12,
    borderTop: "1px solid #eef2f7",
    color: "#9ca3af",
    fontSize: 11,
    lineHeight: 1.6,
  },

  actions: {
    display: "flex",
    gap: 8,
    marginTop: 14,
  },

  disabled: {
    opacity: 0.5,
    cursor: "not-allowed",
  },

  empty: {
    padding: "42px 18px",
    border: "1px solid #e4eaf2",
    borderRadius: 22,
    background: "#ffffff",
    textAlign: "center",
  },

  emptyTitle: {
    margin: "16px 0 8px",
    fontSize: 17,
  },

  account: {
    marginTop: 24,
    color: "#9ca3af",
    fontSize: 11,
    textAlign: "center",
    overflowWrap: "anywhere",
  },

  centerCard: {
    width: "100%",
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
    margin: "14px 0 8px",
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
