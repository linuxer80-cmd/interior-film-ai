"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { supabase } from "../../../lib/supabase";

export default function SuperAdminNotificationsPage() {
  const [loading, setLoading] =
    useState(true);

  const [authorized, setAuthorized] =
    useState(false);

  const [adminName, setAdminName] =
    useState("");

  const [userEmail, setUserEmail] =
    useState("");

  const [notifications, setNotifications] =
    useState([]);

  const [companies, setCompanies] =
    useState([]);

  const [message, setMessage] =
    useState("");

  const [filter, setFilter] =
    useState("all");

  const [processingId, setProcessingId] =
    useState(null);

  const [markingAll, setMarkingAll] =
    useState(false);

  /* =========================================================
     슈퍼관리자 확인
  ========================================================= */

  const checkSuperAdmin =
    useCallback(async () => {
      const {
        data: authData,
        error: authError,
      } =
        await supabase.auth.getUser();

      if (authError) {
        throw new Error(
          `로그인 확인 실패: ${authError.message}`,
        );
      }

      const user =
        authData?.user;

      if (!user?.id) {
        throw new Error(
          "로그인이 필요합니다.",
        );
      }

      setUserEmail(
        user.email || "",
      );

      const {
        data,
        error,
      } =
        await supabase.rpc(
          "get_super_admin_status",
        );

      if (error) {
        throw new Error(
          `슈퍼관리자 확인 실패: ${error.message}`,
        );
      }

      const status =
        Array.isArray(data)
          ? data[0]
          : data;

      if (
        !status?.is_super_admin
      ) {
        throw new Error(
          "슈퍼관리자 권한이 없습니다.",
        );
      }

      setAuthorized(true);

      setAdminName(
        status?.name ||
          "슈퍼관리자",
      );

      return true;
    }, []);

  /* =========================================================
     회사 목록
  ========================================================= */

  const loadCompanies =
    useCallback(async () => {
      const {
        data,
        error,
      } =
        await supabase.rpc(
          "super_admin_get_companies",
        );

      if (error) {
        throw new Error(
          `회사 목록 조회 실패: ${error.message}`,
        );
      }

      setCompanies(
        Array.isArray(data)
          ? data
          : [],
      );
    }, []);

  /* =========================================================
     알림 조회
  ========================================================= */

  const loadNotifications =
    useCallback(async () => {
      const {
        data,
        error,
      } =
        await supabase
          .from(
            "notifications",
          )
          .select(
            `
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
            `,
          )
          .eq(
            "recipient_type",
            "super_admin",
          )
          .order(
            "created_at",
            {
              ascending: false,
            },
          )
          .limit(200);

      if (error) {
        throw new Error(
          `알림 조회 실패: ${error.message}`,
        );
      }

      setNotifications(
        Array.isArray(data)
          ? data
          : [],
      );
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

        if (!alive) {
          return;
        }

        await Promise.all([
          loadCompanies(),
          loadNotifications(),
        ]);
      } catch (error) {
        console.error(
          "슈퍼관리자 알림 초기화:",
          error,
        );

        if (!alive) {
          return;
        }

        setAuthorized(false);

        setMessage(
          `❌ ${
            error?.message ||
            "알림센터를 불러오지 못했습니다."
          }`,
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
    loadNotifications,
  ]);

  /* =========================================================
     실시간 알림
  ========================================================= */

  useEffect(() => {
    if (!authorized) {
      return;
    }

    const channel =
      supabase
        .channel(
          "super-admin-notifications-realtime",
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table:
              "notifications",
            filter:
              "recipient_type=eq.super_admin",
          },
          () => {
            loadNotifications();
          },
        )
        .subscribe();

    return () => {
      supabase.removeChannel(
        channel,
      );
    };
  }, [
    authorized,
    loadNotifications,
  ]);

  /* =========================================================
     회사명 찾기
  ========================================================= */

  const companyMap =
    useMemo(() => {
      const map =
        new Map();

      for (
        const company
        of companies
      ) {
        if (company?.id) {
          map.set(
            company.id,
            company,
          );
        }
      }

      return map;
    }, [companies]);

  function getCompanyName(
    companyId,
  ) {
    if (!companyId) {
      return "전체 서비스";
    }

    const company =
      companyMap.get(
        companyId,
      );

    return (
      company?.company_name ||
      "업체 정보 없음"
    );
  }

  /* =========================================================
     읽지 않은 개수
  ========================================================= */

  const unreadCount =
    useMemo(
      () =>
        notifications.filter(
          (item) =>
            !item.is_read,
        ).length,
      [notifications],
    );

  /* =========================================================
     필터
  ========================================================= */

  const filteredNotifications =
    useMemo(() => {
      if (
        filter === "unread"
      ) {
        return notifications.filter(
          (item) =>
            !item.is_read,
        );
      }

      if (
        filter === "critical"
      ) {
        return notifications.filter(
          (item) =>
            item.priority ===
            "critical",
        );
      }

      return notifications;
    }, [
      notifications,
      filter,
    ]);

  /* =========================================================
     한 건 읽음 처리
  ========================================================= */

  async function markRead(
    notificationId,
  ) {
    if (!notificationId) {
      return;
    }

    const current =
      notifications.find(
        (item) =>
          item.id ===
          notificationId,
      );

    if (
      current?.is_read
    ) {
      return;
    }

    setProcessingId(
      notificationId,
    );

    setMessage("");

    try {
      const {
        error,
      } =
        await supabase.rpc(
          "mark_notification_read",
          {
            p_notification_id:
              notificationId,
          },
        );

      if (error) {
        throw error;
      }

      setNotifications(
        (items) =>
          items.map(
            (item) =>
              item.id ===
              notificationId
                ? {
                    ...item,
                    is_read: true,
                    read_at:
                      new Date().toISOString(),
                  }
                : item,
          ),
      );
    } catch (error) {
      console.error(
        "알림 읽음 처리:",
        error,
      );

      setMessage(
        `❌ 알림 읽음 처리 실패: ${
          error?.message ||
          "오류가 발생했습니다."
        }`,
      );
    } finally {
      setProcessingId(
        null,
      );
    }
  }

  /* =========================================================
     모두 읽음
  ========================================================= */

  async function markAllRead() {
    const unreadItems =
      notifications.filter(
        (item) =>
          !item.is_read,
      );

    if (
      unreadItems.length ===
      0
    ) {
      setMessage(
        "✅ 읽지 않은 알림이 없습니다.",
      );

      return;
    }

    setMarkingAll(true);
    setMessage("");

    try {
      for (
        const item
        of unreadItems
      ) {
        const {
          error,
        } =
          await supabase.rpc(
            "mark_notification_read",
            {
              p_notification_id:
                item.id,
            },
          );

        if (error) {
          throw error;
        }
      }

      const now =
        new Date().toISOString();

      setNotifications(
        (items) =>
          items.map(
            (item) => ({
              ...item,
              is_read: true,
              read_at:
                item.read_at ||
                now,
            }),
          ),
      );

      setMessage(
        `✅ ${unreadItems.length}개의 알림을 모두 읽음 처리했습니다.`,
      );
    } catch (error) {
      console.error(
        "모두 읽음 처리:",
        error,
      );

      setMessage(
        `❌ 모두 읽음 처리 실패: ${
          error?.message ||
          "오류가 발생했습니다."
        }`,
      );

      await loadNotifications();
    } finally {
      setMarkingAll(false);
    }
  }

  /* =========================================================
     알림 클릭
  ========================================================= */

  async function openNotification(
    item,
  ) {
    if (!item) {
      return;
    }

    if (!item.is_read) {
      await markRead(
        item.id,
      );
    }

    if (item.link) {
      window.location.href =
        item.link;

      return;
    }

    if (
      item.company_id
    ) {
      window.location.href =
        `/super-admin/company/${item.company_id}`;

      return;
    }
  }

  /* =========================================================
     새로고침
  ========================================================= */

  async function refresh() {
    setMessage("");

    try {
      await Promise.all([
        loadCompanies(),
        loadNotifications(),
      ]);

      setMessage(
        "✅ 알림을 새로고침했습니다.",
      );
    } catch (error) {
      setMessage(
        `❌ ${
          error?.message ||
          "새로고침 실패"
        }`,
      );
    }
  }

  /* =========================================================
     시간 표시
  ========================================================= */

  function formatDateTime(
    value,
  ) {
    if (!value) {
      return "-";
    }

    try {
      return new Date(
        value,
      ).toLocaleString(
        "ko-KR",
        {
          timeZone:
            "Asia/Seoul",

          year:
            "numeric",

          month:
            "2-digit",

          day:
            "2-digit",

          hour:
            "2-digit",

          minute:
            "2-digit",
        },
      );
    } catch {
      return value;
    }
  }

  /* =========================================================
     로딩
  ========================================================= */

  if (loading) {
    return (
      <main
        style={
          styles.page
        }
      >
        <div
          style={
            styles.centerBox
          }
        >
          <div
            style={
              styles.loadingIcon
            }
          >
            🔔
          </div>

          <div
            style={
              styles.loadingTitle
            }
          >
            알림센터 불러오는 중...
          </div>

          <div
            style={
              styles.loadingText
            }
          >
            슈퍼관리자 권한과
            알림 정보를 확인하고
            있습니다.
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
      <main
        style={
          styles.page
        }
      >
        <div
          style={
            styles.centerBox
          }
        >
          <div
            style={
              styles.deniedIcon
            }
          >
            🔒
          </div>

          <h2
            style={
              styles.deniedTitle
            }
          >
            접근할 수 없습니다
          </h2>

          <div
            style={
              styles.deniedText
            }
          >
            슈퍼관리자 전용
            페이지입니다.
          </div>

          {message && (
            <div
              style={
                styles.errorBox
              }
            >
              {message}
            </div>
          )}

          <button
            type="button"
            style={
              styles.homeButton
            }
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
    <main
      style={
        styles.page
      }
    >
      <div
        style={
          styles.container
        }
      >
        {/* 헤더 */}

        <div
          style={
            styles.header
          }
        >
          <div>
            <div
              style={
                styles.badge
              }
            >
              SUPER ADMIN
            </div>

            <h1
              style={
                styles.title
              }
            >
              🔔 알림센터
            </h1>

            <div
              style={
                styles.subtitle
              }
            >
              가입, 결제, 만료,
              사용량 및 시스템
              알림을 관리합니다.
            </div>
          </div>

          <button
            type="button"
            style={
              styles.backButton
            }
            onClick={() => {
              window.location.href =
                "/super-admin";
            }}
          >
            ← 업체 관리
          </button>
        </div>

        {/* 로그인 정보 */}

        <div
          style={
            styles.loginBox
          }
        >
          <div>
            <div
              style={
                styles.smallLabel
              }
            >
              슈퍼관리자
            </div>

            <div
              style={
                styles.adminName
              }
            >
              {adminName}
            </div>
          </div>

          <div
            style={
              styles.email
            }
          >
            {userEmail}
          </div>
        </div>

        {/* 알림 요약 */}

        <div
          style={
            styles.statsGrid
          }
        >
          <StatCard
            label="전체 알림"
            value={
              notifications.length
            }
          />

          <StatCard
            label="읽지 않음"
            value={
              unreadCount
            }
            important={
              unreadCount > 0
            }
          />

          <StatCard
            label="중요 알림"
            value={
              notifications.filter(
                (item) =>
                  item.priority ===
                  "critical",
              ).length
            }
            critical
          />
        </div>

        {/* 알림 목록 */}

        <section
          style={
            styles.section
          }
        >
          <div
            style={
              styles.sectionHeader
            }
          >
            <div>
              <h2
                style={
                  styles.sectionTitle
                }
              >
                알림
              </h2>

              <div
                style={
                  styles.sectionDescription
                }
              >
                읽지 않은 알림
                {unreadCount}개
              </div>
            </div>

            <div
              style={
                styles.headerButtons
              }
            >
              <button
                type="button"
                style={
                  styles.secondaryButton
                }
                onClick={
                  refresh
                }
              >
                새로고침
              </button>

              <button
                type="button"
                disabled={
                  markingAll ||
                  unreadCount ===
                    0
                }
                style={{
                  ...styles.readAllButton,

                  opacity:
                    markingAll ||
                    unreadCount ===
                      0
                      ? 0.5
                      : 1,
                }}
                onClick={
                  markAllRead
                }
              >
                {markingAll
                  ? "처리 중..."
                  : "모두 읽음"}
              </button>
            </div>
          </div>

          {/* 필터 */}

          <div
            style={
              styles.filterRow
            }
          >
            <FilterButton
              active={
                filter ===
                "all"
              }
              onClick={() =>
                setFilter(
                  "all",
                )
              }
            >
              전체
            </FilterButton>

            <FilterButton
              active={
                filter ===
                "unread"
              }
              onClick={() =>
                setFilter(
                  "unread",
                )
              }
            >
              읽지 않음
              {unreadCount >
                0 &&
                ` ${unreadCount}`}
            </FilterButton>

            <FilterButton
              active={
                filter ===
                "critical"
              }
              onClick={() =>
                setFilter(
                  "critical",
                )
              }
            >
              중요
            </FilterButton>
          </div>

          {/* 메시지 */}

          {message && (
            <div
              style={{
                ...styles.message,

                ...(message.startsWith(
                  "❌",
                )
                  ? styles.messageError
                  : styles.messageSuccess),
              }}
            >
              {message}
            </div>
          )}

          {/* 알림이 아직 없는 경우 */}

          {filteredNotifications.length ===
          0 ? (
            <div
              style={
                styles.empty
              }
            >
              <div
                style={
                  styles.emptyIcon
                }
              >
                🔔
              </div>

              <div
                style={
                  styles.emptyTitle
                }
              >
                {filter ===
                "unread"
                  ? "읽지 않은 알림이 없습니다."
                  : filter ===
                      "critical"
                    ? "중요 알림이 없습니다."
                    : "아직 알림이 없습니다."}
              </div>

              <div
                style={
                  styles.emptyText
                }
              >
                다음 단계에서
                신규 업체 가입,
                결제 및 만료 이벤트를
                연결합니다.
              </div>
            </div>
          ) : (
            <div
              style={
                styles.notificationList
              }
            >
              {filteredNotifications.map(
                (item) => (
                  <NotificationCard
                    key={
                      item.id
                    }
                    item={
                      item
                    }
                    companyName={getCompanyName(
                      item.company_id,
                    )}
                    processing={
                      processingId ===
                      item.id
                    }
                    formatDateTime={
                      formatDateTime
                    }
                    onRead={() =>
                      markRead(
                        item.id,
                      )
                    }
                    onOpen={() =>
                      openNotification(
                        item,
                      )
                    }
                  />
                ),
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

/* =========================================================
   통계 카드
========================================================= */

function StatCard({
  label,
  value,
  important = false,
  critical = false,
}) {
  return (
    <div
      style={{
        ...styles.statCard,

        ...(important
          ? styles.statCardImportant
          : {}),

        ...(critical
          ? styles.statCardCritical
          : {}),
      }}
    >
      <div
        style={
          styles.statLabel
        }
      >
        {label}
      </div>

      <div
        style={
          styles.statValue
        }
      >
        {value}
      </div>
    </div>
  );
}

/* =========================================================
   필터 버튼
========================================================= */

function FilterButton({
  active,
  onClick,
  children,
}) {
  return (
    <button
      type="button"
      onClick={
        onClick
      }
      style={{
        ...styles.filterButton,

        ...(active
          ? styles.filterButtonActive
          : {}),
      }}
    >
      {children}
    </button>
  );
}

/* =========================================================
   알림 카드
========================================================= */

function NotificationCard({
  item,
  companyName,
  processing,
  formatDateTime,
  onRead,
  onOpen,
}) {
  const priority =
    getPriorityInfo(
      item.priority,
    );

  return (
    <div
      style={{
        ...styles.notificationCard,

        ...(!item.is_read
          ? styles.notificationUnread
          : {}),

        ...(item.priority ===
        "critical"
          ? styles.notificationCritical
          : {}),
      }}
    >
      <div
        style={
          styles.notificationTop
        }
      >
        <div
          style={{
            ...styles.priorityIcon,

            background:
              priority.background,

            color:
              priority.color,
          }}
        >
          {priority.icon}
        </div>

        <div
          style={{
            flex: 1,
            minWidth: 0,
          }}
        >
          <div
            style={
              styles.notificationTitleRow
            }
          >
            <div
              style={
                styles.notificationTitle
              }
            >
              {item.title}
            </div>

            {!item.is_read && (
              <span
                style={
                  styles.unreadBadge
                }
              >
                NEW
              </span>
            )}
          </div>

          <div
            style={
              styles.companyNameText
            }
          >
            {companyName}
          </div>
        </div>
      </div>

      <div
        style={
          styles.notificationMessage
        }
      >
        {item.message}
      </div>

      <div
        style={
          styles.notificationMeta
        }
      >
        <span>
          {
            priority.label
          }
        </span>

        <span>
          {formatDateTime(
            item.created_at,
          )}
        </span>
      </div>

      <div
        style={
          styles.notificationActions
        }
      >
        {!item.is_read && (
          <button
            type="button"
            disabled={
              processing
            }
            style={{
              ...styles.readButton,

              opacity:
                processing
                  ? 0.5
                  : 1,
            }}
            onClick={
              onRead
            }
          >
            {processing
              ? "처리 중..."
              : "읽음 처리"}
          </button>
        )}

        <button
          type="button"
          style={
            styles.openButton
          }
          onClick={
            onOpen
          }
        >
          {item.link ||
          item.company_id
            ? "상세 보기 →"
            : "확인"}
        </button>
      </div>
    </div>
  );
}

/* =========================================================
   중요도 정보
========================================================= */

function getPriorityInfo(
  priority,
) {
  switch (priority) {
    case "critical":
      return {
        icon: "🚨",
        label: "중요",
        background:
          "#fee2e2",
        color:
          "#991b1b",
      };

    case "warning":
      return {
        icon: "⚠️",
        label: "주의",
        background:
          "#fef3c7",
        color:
          "#92400e",
      };

    case "success":
      return {
        icon: "✅",
        label: "완료",
        background:
          "#dcfce7",
        color:
          "#166534",
      };

    default:
      return {
        icon: "🔔",
        label: "안내",
        background:
          "#dbeafe",
        color:
          "#1d4ed8",
      };
  }
}

/* =========================================================
   스타일
========================================================= */

const styles = {
  page: {
    minHeight: "100vh",
    background: "#f3f4f6",
    color: "#111827",
    padding:
      "18px 14px 50px",
  },

  container: {
    width: "100%",
    maxWidth: "900px",
    margin: "0 auto",
  },

  header: {
    display: "flex",
    justifyContent:
      "space-between",
    alignItems:
      "flex-start",
    gap: "12px",
    marginBottom:
      "16px",
  },

  badge: {
    display:
      "inline-block",
    padding:
      "5px 8px",
    borderRadius:
      "999px",
    background:
      "#111827",
    color:
      "#ffffff",
    fontSize:
      "10px",
    fontWeight: 900,
    letterSpacing:
      "1px",
    marginBottom:
      "7px",
  },

  title: {
    margin: 0,
    fontSize:
      "26px",
    fontWeight: 900,
    letterSpacing:
      "-0.6px",
  },

  subtitle: {
    marginTop:
      "5px",
    color:
      "#6b7280",
    fontSize:
      "13px",
    lineHeight: 1.5,
  },

  backButton: {
    border:
      "1px solid #d1d5db",
    borderRadius:
      "10px",
    background:
      "#ffffff",
    padding:
      "10px 12px",
    fontWeight: 800,
    fontSize:
      "12px",
    cursor:
      "pointer",
    whiteSpace:
      "nowrap",
  },

  loginBox: {
    display:
      "flex",
    justifyContent:
      "space-between",
    alignItems:
      "center",
    gap: "12px",
    background:
      "#ffffff",
    borderRadius:
      "14px",
    padding:
      "14px",
    border:
      "1px solid #e5e7eb",
    marginBottom:
      "14px",
  },

  smallLabel: {
    fontSize:
      "11px",
    color:
      "#6b7280",
    marginBottom:
      "3px",
  },

  adminName: {
    fontSize:
      "15px",
    fontWeight: 900,
  },

  email: {
    fontSize:
      "12px",
    color:
      "#6b7280",
    textAlign:
      "right",
    wordBreak:
      "break-all",
  },

  statsGrid: {
    display:
      "grid",
    gridTemplateColumns:
      "repeat(3, minmax(0, 1fr))",
    gap: "8px",
    marginBottom:
      "14px",
  },

  statCard: {
    background:
      "#ffffff",
    border:
      "1px solid #e5e7eb",
    borderRadius:
      "14px",
    padding:
      "14px 10px",
    textAlign:
      "center",
  },

  statCardImportant: {
    border:
      "1px solid #f59e0b",
    background:
      "#fffbeb",
  },

  statCardCritical: {
    border:
      "1px solid #fecaca",
    background:
      "#fef2f2",
  },

  statLabel: {
    fontSize:
      "12px",
    color:
      "#6b7280",
    fontWeight: 700,
  },

  statValue: {
    marginTop:
      "5px",
    fontSize:
      "25px",
    fontWeight: 900,
  },

  section: {
    background:
      "#ffffff",
    borderRadius:
      "16px",
    padding:
      "15px",
    border:
      "1px solid #e5e7eb",
  },

  sectionHeader: {
    display:
      "flex",
    justifyContent:
      "space-between",
    alignItems:
      "flex-start",
    gap: "10px",
    marginBottom:
      "13px",
  },

  sectionTitle: {
    margin: 0,
    fontSize:
      "19px",
    fontWeight: 900,
  },

  sectionDescription: {
    marginTop:
      "4px",
    color:
      "#6b7280",
    fontSize:
      "12px",
    lineHeight: 1.5,
  },

  headerButtons: {
    display:
      "flex",
    gap: "6px",
    flexWrap:
      "wrap",
    justifyContent:
      "flex-end",
  },

  secondaryButton: {
    border:
      "1px solid #d1d5db",
    background:
      "#ffffff",
    borderRadius:
      "9px",
    padding:
      "8px 10px",
    fontSize:
      "12px",
    fontWeight: 800,
    cursor:
      "pointer",
    whiteSpace:
      "nowrap",
  },

  readAllButton: {
    border: 0,
    background:
      "#111827",
    color:
      "#ffffff",
    borderRadius:
      "9px",
    padding:
      "8px 10px",
    fontSize:
      "12px",
    fontWeight: 800,
    cursor:
      "pointer",
    whiteSpace:
      "nowrap",
  },

  filterRow: {
    display:
      "flex",
    gap: "7px",
    marginBottom:
      "12px",
    overflowX:
      "auto",
  },

  filterButton: {
    border:
      "1px solid #d1d5db",
    borderRadius:
      "999px",
    background:
      "#ffffff",
    color:
      "#374151",
    padding:
      "7px 11px",
    fontSize:
      "12px",
    fontWeight: 800,
    cursor:
      "pointer",
    whiteSpace:
      "nowrap",
  },

  filterButtonActive: {
    background:
      "#111827",
    color:
      "#ffffff",
    borderColor:
      "#111827",
  },

  message: {
    padding:
      "10px",
    borderRadius:
      "9px",
    marginBottom:
      "12px",
    fontSize:
      "13px",
    lineHeight: 1.5,
  },

  messageSuccess: {
    background:
      "#f0fdf4",
    color:
      "#166534",
    border:
      "1px solid #bbf7d0",
  },

  messageError: {
    background:
      "#fef2f2",
    color:
      "#991b1b",
    border:
      "1px solid #fecaca",
  },

  notificationList: {
    display:
      "grid",
    gap: "9px",
  },

  notificationCard: {
    border:
      "1px solid #e5e7eb",
    borderRadius:
      "13px",
    padding:
      "13px",
    background:
      "#ffffff",
  },

  notificationUnread: {
    border:
      "1px solid #93c5fd",
    background:
      "#f8fbff",
  },

  notificationCritical: {
    borderLeft:
      "4px solid #dc2626",
  },

  notificationTop: {
    display:
      "flex",
    alignItems:
      "flex-start",
    gap: "10px",
  },

  priorityIcon: {
    width:
      "38px",
    height:
      "38px",
    flex:
      "0 0 38px",
    borderRadius:
      "11px",
    display:
      "flex",
    alignItems:
      "center",
    justifyContent:
      "center",
    fontSize:
      "18px",
  },

  notificationTitleRow: {
    display:
      "flex",
    alignItems:
      "center",
    gap: "6px",
    flexWrap:
      "wrap",
  },

  notificationTitle: {
    fontSize:
      "15px",
    fontWeight: 900,
    lineHeight: 1.4,
  },

  unreadBadge: {
    borderRadius:
      "999px",
    background:
      "#2563eb",
    color:
      "#ffffff",
    padding:
      "2px 6px",
    fontSize:
      "9px",
    fontWeight: 900,
  },

  companyNameText: {
    marginTop:
      "2px",
    color:
      "#6b7280",
    fontSize:
      "11px",
    fontWeight: 700,
  },

  notificationMessage: {
    marginTop:
      "10px",
    color:
      "#374151",
    fontSize:
      "13px",
    lineHeight: 1.6,
    whiteSpace:
      "pre-wrap",
    wordBreak:
      "break-word",
  },

  notificationMeta: {
    display:
      "flex",
    justifyContent:
      "space-between",
    alignItems:
      "center",
    gap: "10px",
    marginTop:
      "10px",
    paddingTop:
      "9px",
    borderTop:
      "1px solid #f3f4f6",
    color:
      "#9ca3af",
    fontSize:
      "10px",
  },

  notificationActions: {
    display:
      "flex",
    gap: "7px",
    marginTop:
      "10px",
  },

  readButton: {
    flex: 1,
    minHeight:
      "38px",
    border:
      "1px solid #d1d5db",
    borderRadius:
      "9px",
    background:
      "#ffffff",
    color:
      "#374151",
    fontSize:
      "12px",
    fontWeight: 800,
    cursor:
      "pointer",
  },

  openButton: {
    flex: 1,
    minHeight:
      "38px",
    border: 0,
    borderRadius:
      "9px",
    background:
      "#111827",
    color:
      "#ffffff",
    fontSize:
      "12px",
    fontWeight: 900,
    cursor:
      "pointer",
  },

  empty: {
    padding:
      "45px 12px",
    textAlign:
      "center",
  },

  emptyIcon: {
    fontSize:
      "36px",
  },

  emptyTitle: {
    marginTop:
      "9px",
    fontSize:
      "15px",
    fontWeight: 900,
  },

  emptyText: {
    marginTop:
      "6px",
    color:
      "#9ca3af",
    fontSize:
      "12px",
    lineHeight: 1.6,
  },

  centerBox: {
    width:
      "100%",
    maxWidth:
      "420px",
    margin:
      "100px auto 0",
    background:
      "#ffffff",
    border:
      "1px solid #e5e7eb",
    borderRadius:
      "18px",
    padding:
      "28px 20px",
    textAlign:
      "center",
    boxSizing:
      "border-box",
  },

  loadingIcon: {
    fontSize:
      "40px",
    marginBottom:
      "10px",
  },

  loadingTitle: {
    fontSize:
      "18px",
    fontWeight: 900,
  },

  loadingText: {
    marginTop:
      "7px",
    color:
      "#6b7280",
    fontSize:
      "13px",
    lineHeight: 1.6,
  },

  deniedIcon: {
    fontSize:
      "42px",
  },

  deniedTitle: {
    margin:
      "12px 0 5px",
    fontSize:
      "20px",
  },

  deniedText: {
    color:
      "#6b7280",
    fontSize:
      "13px",
  },

  errorBox: {
    marginTop:
      "15px",
    padding:
      "10px",
    borderRadius:
      "9px",
    background:
      "#fef2f2",
    color:
      "#991b1b",
    fontSize:
      "12px",
    lineHeight: 1.5,
  },

  homeButton: {
    marginTop:
      "16px",
    width:
      "100%",
    minHeight:
      "44px",
    border: 0,
    borderRadius:
      "10px",
    background:
      "#111827",
    color:
      "#ffffff",
    fontWeight: 900,
    cursor:
      "pointer",
  },
};
