"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "../../../lib/supabase";

export default function SuperAdminBillingPage() {
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] =
    useState(false);

  const [adminName, setAdminName] =
    useState("");
  const [userEmail, setUserEmail] =
    useState("");

  const [overview, setOverview] =
    useState(null);

  const [message, setMessage] =
    useState("");

  const [paymentFilter, setPaymentFilter] =
    useState("all");

  const [search, setSearch] =
    useState("");

  /* =========================================================
     슈퍼관리자 확인
  ========================================================= */

  const checkSuperAdmin =
    useCallback(async () => {
      const {
        data: authData,
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) {
        throw new Error(
          `로그인 확인 실패: ${authError.message}`,
        );
      }

      const user = authData?.user;

      if (!user?.id) {
        throw new Error(
          "로그인이 필요합니다.",
        );
      }

      setUserEmail(user.email || "");

      const {
        data,
        error,
      } = await supabase.rpc(
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

      if (!status?.is_super_admin) {
        throw new Error(
          "슈퍼관리자 권한이 없습니다.",
        );
      }

      setAuthorized(true);

      setAdminName(
        status?.name || "슈퍼관리자",
      );

      return true;
    }, []);

  /* =========================================================
     결제 현황 조회
  ========================================================= */

  const loadBillingOverview =
    useCallback(async () => {
      const {
        data,
        error,
      } = await supabase.rpc(
        "super_admin_get_billing_overview",
      );

      if (error) {
        throw new Error(
          `결제 현황 조회 실패: ${error.message}`,
        );
      }

      setOverview(
        data && typeof data === "object"
          ? data
          : {
              summary: {},
              subscriptions: [],
              payments: [],
            },
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

        if (!alive) return;

        await loadBillingOverview();
      } catch (error) {
        console.error(
          "결제관리 초기화:",
          error,
        );

        if (!alive) return;

        setAuthorized(false);

        setMessage(
          `❌ ${
            error?.message ||
            "결제관리 페이지를 불러오지 못했습니다."
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
    loadBillingOverview,
  ]);

  /* =========================================================
     새로고침
  ========================================================= */

  async function handleRefresh() {
    setLoading(true);
    setMessage("");

    try {
      await loadBillingOverview();

      setMessage(
        "✅ 결제 정보를 새로고침했습니다.",
      );
    } catch (error) {
      console.error(
        "결제정보 새로고침:",
        error,
      );

      setMessage(
        `❌ ${
          error?.message ||
          "새로고침에 실패했습니다."
        }`,
      );
    } finally {
      setLoading(false);
    }
  }

  /* =========================================================
     데이터
  ========================================================= */

  const summary =
    overview?.summary || {};

  const subscriptions =
    Array.isArray(
      overview?.subscriptions,
    )
      ? overview.subscriptions
      : [];

  const payments =
    Array.isArray(
      overview?.payments,
    )
      ? overview.payments
      : [];

  /* =========================================================
     결제 검색 / 필터
  ========================================================= */

  const filteredPayments =
    useMemo(() => {
      const keyword =
        search
          .trim()
          .toLowerCase();

      return payments.filter(
        (payment) => {
          if (
            paymentFilter !== "all" &&
            payment.status !==
              paymentFilter
          ) {
            return false;
          }

          if (!keyword) {
            return true;
          }

          const text = [
            payment.company_name,
            payment.plan_code,
            payment.order_id,
            payment.payment_type,
            payment.status,
            payment.failure_code,
            payment.failure_message,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

          return text.includes(
            keyword,
          );
        },
      );
    }, [
      payments,
      paymentFilter,
      search,
    ]);

  /* =========================================================
     로딩
  ========================================================= */

  if (
    loading &&
    !overview
  ) {
    return (
      <main style={styles.page}>
        <div style={styles.centerBox}>
          <div style={styles.loadingIcon}>
            💳
          </div>

          <div style={styles.loadingTitle}>
            결제정보 확인 중...
          </div>

          <div style={styles.loadingText}>
            구독과 결제내역을
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
            슈퍼관리자 전용
            페이지입니다.
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
                "/super-admin";
            }}
          >
            슈퍼관리자로 이동
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
              💳 결제 관리
            </h1>

            <div style={styles.subtitle}>
              전체 업체의 구독 상태와
              결제 내역을 관리합니다.
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
            ← 돌아가기
          </button>
        </div>

        {/* 관리자 정보 */}

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

        {/* 새로고침 */}

        <div style={styles.actionRow}>
          <button
            type="button"
            style={styles.refreshButton}
            disabled={loading}
            onClick={handleRefresh}
          >
            {loading
              ? "불러오는 중..."
              : "🔄 새로고침"}
          </button>
        </div>

        {/* =====================================================
            요약
        ===================================================== */}

        <div style={styles.statsGrid}>
          <StatCard
            icon="✅"
            label="활성 구독"
            value={
              Number(
                summary.active_subscriptions,
              ) || 0
            }
          />

          <StatCard
            icon="⚠️"
            label="결제 지연"
            value={
              Number(
                summary.past_due_subscriptions,
              ) || 0
            }
            danger={
              Number(
                summary.past_due_subscriptions,
              ) > 0
            }
          />

          <StatCard
            icon="💰"
            label="이번 달 결제"
            value={`${formatMoney(
              summary.month_paid_amount,
            )}원`}
          />

          <StatCard
            icon="🧾"
            label="이번 달 성공"
            value={
              Number(
                summary.month_paid_count,
              ) || 0
            }
          />

          <StatCard
            icon="❌"
            label="이번 달 실패"
            value={
              Number(
                summary.month_failed_count,
              ) || 0
            }
            danger={
              Number(
                summary.month_failed_count,
              ) > 0
            }
          />
        </div>

        {/* =====================================================
            구독 현황
        ===================================================== */}

        <section style={styles.section}>
          <div style={styles.sectionHeader}>
            <div>
              <h2 style={styles.sectionTitle}>
                📅 구독 현황
              </h2>

              <div
                style={
                  styles.sectionDescription
                }
              >
                다음 자동결제일과
                업체별 구독 상태를
                확인합니다.
              </div>
            </div>

            <div style={styles.countBadge}>
              {subscriptions.length}개
            </div>
          </div>

          {subscriptions.length ===
          0 ? (
            <div style={styles.empty}>
              등록된 구독이 없습니다.
            </div>
          ) : (
            <div
              style={
                styles.subscriptionList
              }
            >
              {subscriptions.map(
                (subscription) => (
                  <SubscriptionCard
                    key={
                      subscription.subscription_id
                    }
                    subscription={
                      subscription
                    }
                  />
                ),
              )}
            </div>
          )}
        </section>

        {/* =====================================================
            최근 결제
        ===================================================== */}

        <section style={styles.section}>
          <div style={styles.sectionHeader}>
            <div>
              <h2 style={styles.sectionTitle}>
                💰 최근 결제내역
              </h2>

              <div
                style={
                  styles.sectionDescription
                }
              >
                최근 결제 100건을
                조회합니다.
              </div>
            </div>

            <div style={styles.countBadge}>
              {filteredPayments.length}건
            </div>
          </div>

          {/* 검색 */}

          <input
            type="search"
            value={search}
            onChange={(event) =>
              setSearch(
                event.target.value,
              )
            }
            placeholder="업체명, 주문번호, 요금제 검색"
            style={styles.searchInput}
          />

          {/* 필터 */}

          <div style={styles.filterRow}>
            <FilterButton
              active={
                paymentFilter === "all"
              }
              onClick={() =>
                setPaymentFilter("all")
              }
            >
              전체
            </FilterButton>

            <FilterButton
              active={
                paymentFilter === "paid"
              }
              onClick={() =>
                setPaymentFilter("paid")
              }
            >
              성공
            </FilterButton>

            <FilterButton
              active={
                paymentFilter ===
                "pending"
              }
              onClick={() =>
                setPaymentFilter(
                  "pending",
                )
              }
            >
              처리중
            </FilterButton>

            <FilterButton
              active={
                paymentFilter ===
                "failed"
              }
              onClick={() =>
                setPaymentFilter(
                  "failed",
                )
              }
            >
              실패
            </FilterButton>

            <FilterButton
              active={
                paymentFilter ===
                "canceled"
              }
              onClick={() =>
                setPaymentFilter(
                  "canceled",
                )
              }
            >
              취소
            </FilterButton>

            <FilterButton
              active={
                paymentFilter ===
                "refunded"
              }
              onClick={() =>
                setPaymentFilter(
                  "refunded",
                )
              }
            >
              환불
            </FilterButton>
          </div>

          {filteredPayments.length ===
          0 ? (
            <div style={styles.empty}>
              결제내역이 없습니다.
            </div>
          ) : (
            <div style={styles.paymentList}>
              {filteredPayments.map(
                (payment) => (
                  <PaymentCard
                    key={
                      payment.payment_id
                    }
                    payment={payment}
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
  icon,
  label,
  value,
  danger = false,
}) {
  return (
    <div
      style={{
        ...styles.statCard,
        ...(danger
          ? styles.statCardDanger
          : {}),
      }}
    >
      <div style={styles.statIcon}>
        {icon}
      </div>

      <div style={styles.statLabel}>
        {label}
      </div>

      <div
        style={{
          ...styles.statValue,

          ...(danger
            ? styles.statValueDanger
            : {}),
        }}
      >
        {value}
      </div>
    </div>
  );
}

/* =========================================================
   구독 카드
========================================================= */

function SubscriptionCard({
  subscription,
}) {
  const status =
    subscription?.status ||
    "unknown";

  const pastDue =
    status === "past_due";

  const canceled =
    status === "canceled";

  const inactiveCompany =
    subscription?.company_active ===
    false;

  return (
    <div
      style={{
        ...styles.subscriptionCard,

        ...(pastDue
          ? styles.subscriptionCardDanger
          : {}),
      }}
    >
      <div style={styles.cardTop}>
        <div style={{ minWidth: 0 }}>
          <div
            style={
              styles.companyNameRow
            }
          >
            <div
              style={
                styles.companyName
              }
            >
              {subscription.company_name ||
                "회사명 없음"}
            </div>

            <StatusBadge
              status={status}
            />

            {inactiveCompany && (
              <span
                style={
                  styles.companyInactiveBadge
                }
              >
                회사 정지
              </span>
            )}
          </div>

          <div style={styles.planName}>
            {String(
              subscription.plan_code ||
                "-",
            ).toUpperCase()}
          </div>
        </div>

        <div
          style={
            styles.subscriptionPrice
          }
        >
          {formatMoney(
            subscription.monthly_price_krw,
          )}
          원
          <span
            style={
              styles.subscriptionPriceUnit
            }
          >
            /월
          </span>
        </div>
      </div>

      <div style={styles.divider} />

      <InfoRow
        label="다음 자동결제"
        value={
          subscription.next_billing_at
            ? formatDateTime(
                subscription.next_billing_at,
              )
            : "-"
        }
        strong
        danger={pastDue}
      />

      <InfoRow
        label="현재 이용기간"
        value={
          subscription.current_period_start ||
          subscription.current_period_end
            ? `${formatDate(
                subscription.current_period_start,
              )} ~ ${formatDate(
                subscription.current_period_end,
              )}`
            : "-"
        }
      />

      <InfoRow
        label="구독 시작"
        value={
          subscription.started_at
            ? formatDateTime(
                subscription.started_at,
              )
            : "-"
        }
      />

      <InfoRow
        label="기간 종료 취소"
        value={
          subscription.cancel_at_period_end
            ? "예약됨"
            : "아니오"
        }
        danger={
          subscription.cancel_at_period_end
        }
      />

      {pastDue && (
        <div style={styles.warningBox}>
          ⚠️ 자동결제에 실패한
          구독입니다. 결제수단과 최근
          실패내역을 확인하세요.
        </div>
      )}

      {canceled && (
        <div style={styles.grayNotice}>
          이 구독은 취소 상태입니다.
        </div>
      )}
    </div>
  );
}

/* =========================================================
   결제 카드
========================================================= */

function PaymentCard({
  payment,
}) {
  const failed =
    payment?.status === "failed";

  const pending =
    payment?.status === "pending";

  return (
    <div
      style={{
        ...styles.paymentCard,

        ...(failed
          ? styles.paymentCardDanger
          : {}),

        ...(pending
          ? styles.paymentCardPending
          : {}),
      }}
    >
      <div style={styles.cardTop}>
        <div style={{ minWidth: 0 }}>
          <div
            style={
              styles.companyNameRow
            }
          >
            <div
              style={
                styles.companyName
              }
            >
              {payment.company_name ||
                "회사명 없음"}
            </div>

            <StatusBadge
              status={payment.status}
            />
          </div>

          <div
            style={
              styles.paymentType
            }
          >
            {getPaymentTypeLabel(
              payment.payment_type,
            )}
            {" · "}
            {String(
              payment.plan_code ||
                "-",
            ).toUpperCase()}
          </div>
        </div>

        <div
          style={
            styles.paymentAmount
          }
        >
          {formatMoney(
            payment.amount_krw,
          )}
          원
        </div>
      </div>

      <div style={styles.divider} />

      <InfoRow
        label="결제일"
        value={
          payment.paid_at
            ? formatDateTime(
                payment.paid_at,
              )
            : "-"
        }
      />

      <InfoRow
        label="요청일"
        value={
          payment.created_at
            ? formatDateTime(
                payment.created_at,
              )
            : "-"
        }
      />

      <InfoRow
        label="주문번호"
        value={
          payment.order_id || "-"
        }
      />

      {failed && (
        <div style={styles.failureBox}>
          <div
            style={
              styles.failureTitle
            }
          >
            결제 실패
          </div>

          {payment.failure_code && (
            <div
              style={
                styles.failureText
              }
            >
              코드:{" "}
              {payment.failure_code}
            </div>
          )}

          {payment.failure_message && (
            <div
              style={
                styles.failureText
              }
            >
              {payment.failure_message}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* =========================================================
   상태 배지
========================================================= */

function StatusBadge({
  status,
}) {
  const info =
    getStatusInfo(status);

  return (
    <span
      style={{
        ...styles.statusBadge,
        background:
          info.background,
        color:
          info.color,
      }}
    >
      {info.label}
    </span>
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
      onClick={onClick}
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
   정보 행
========================================================= */

function InfoRow({
  label,
  value,
  strong = false,
  danger = false,
}) {
  return (
    <div style={styles.infoRow}>
      <span style={styles.infoLabel}>
        {label}
      </span>

      <span
        style={{
          ...styles.infoValue,

          ...(strong
            ? styles.infoValueStrong
            : {}),

          ...(danger
            ? styles.infoValueDanger
            : {}),
        }}
      >
        {value}
      </span>
    </div>
  );
}

/* =========================================================
   표시 함수
========================================================= */

function formatMoney(value) {
  const number =
    Number(value) || 0;

  return number.toLocaleString(
    "ko-KR",
  );
}

function formatDate(value) {
  if (!value) {
    return "-";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return "-";
  }

  return date.toLocaleDateString(
    "ko-KR",
    {
      timeZone:
        "Asia/Seoul",
    },
  );
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return "-";
  }

  return date.toLocaleString(
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
      hour12:
        false,
    },
  );
}

function getPaymentTypeLabel(
  type,
) {
  switch (type) {
    case "subscription":
      return "최초 결제";

    case "renewal":
      return "정기 결제";

    case "upgrade":
      return "업그레이드";

    case "downgrade":
      return "다운그레이드";

    case "manual":
      return "수동 결제";

    default:
      return type || "-";
  }
}

function getStatusInfo(status) {
  switch (status) {
    case "active":
      return {
        label:
          "정상",
        background:
          "#dcfce7",
        color:
          "#166534",
      };

    case "paid":
      return {
        label:
          "결제완료",
        background:
          "#dcfce7",
        color:
          "#166534",
      };

    case "past_due":
      return {
        label:
          "결제지연",
        background:
          "#fee2e2",
        color:
          "#991b1b",
      };

    case "failed":
      return {
        label:
          "결제실패",
        background:
          "#fee2e2",
        color:
          "#991b1b",
      };

    case "pending":
      return {
        label:
          "처리중",
        background:
          "#fef3c7",
        color:
          "#92400e",
      };

    case "trial":
      return {
        label:
          "체험",
        background:
          "#dbeafe",
        color:
          "#1d4ed8",
      };

    case "paused":
      return {
        label:
          "일시정지",
        background:
          "#f3f4f6",
        color:
          "#4b5563",
      };

    case "canceled":
      return {
        label:
          "취소",
        background:
          "#f3f4f6",
        color:
          "#4b5563",
      };

    case "refunded":
      return {
        label:
          "환불",
        background:
          "#ede9fe",
        color:
          "#6d28d9",
      };

    default:
      return {
        label:
          status || "알 수 없음",
        background:
          "#f3f4f6",
        color:
          "#4b5563",
      };
  }
}

/* =========================================================
   스타일
========================================================= */

const styles = {
  page: {
    minHeight:
      "100vh",
    background:
      "#f3f4f6",
    color:
      "#111827",
    padding:
      "18px 14px 50px",
  },

  container: {
    width:
      "100%",
    maxWidth:
      "900px",
    margin:
      "0 auto",
  },

  header: {
    display:
      "flex",
    justifyContent:
      "space-between",
    alignItems:
      "flex-start",
    gap:
      "12px",
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
    fontWeight:
      900,
    letterSpacing:
      "1px",
    marginBottom:
      "7px",
  },

  title: {
    margin:
      0,
    fontSize:
      "26px",
    fontWeight:
      900,
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
    lineHeight:
      1.5,
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
    fontWeight:
      800,
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
    gap:
      "12px",
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
    fontWeight:
      900,
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

  actionRow: {
    display:
      "flex",
    justifyContent:
      "flex-end",
    marginBottom:
      "14px",
  },

  refreshButton: {
    border:
      "1px solid #d1d5db",
    background:
      "#ffffff",
    borderRadius:
      "10px",
    padding:
      "9px 12px",
    fontSize:
      "12px",
    fontWeight:
      900,
    cursor:
      "pointer",
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
    lineHeight:
      1.5,
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

  statsGrid: {
    display:
      "grid",
    gridTemplateColumns:
      "repeat(2, minmax(0, 1fr))",
    gap:
      "8px",
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

  statCardDanger: {
    background:
      "#fff7f7",
    border:
      "1px solid #fecaca",
  },

  statIcon: {
    fontSize:
      "20px",
    marginBottom:
      "4px",
  },

  statLabel: {
    fontSize:
      "11px",
    color:
      "#6b7280",
    fontWeight:
      700,
  },

  statValue: {
    marginTop:
      "5px",
    fontSize:
      "21px",
    fontWeight:
      900,
  },

  statValueDanger: {
    color:
      "#dc2626",
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
    marginBottom:
      "14px",
  },

  sectionHeader: {
    display:
      "flex",
    justifyContent:
      "space-between",
    alignItems:
      "flex-start",
    gap:
      "10px",
    marginBottom:
      "13px",
  },

  sectionTitle: {
    margin:
      0,
    fontSize:
      "19px",
    fontWeight:
      900,
  },

  sectionDescription: {
    marginTop:
      "4px",
    color:
      "#6b7280",
    fontSize:
      "12px",
    lineHeight:
      1.5,
  },

  countBadge: {
    flexShrink:
      0,
    background:
      "#f3f4f6",
    color:
      "#4b5563",
    padding:
      "5px 8px",
    borderRadius:
      "999px",
    fontSize:
      "11px",
    fontWeight:
      900,
  },

  subscriptionList: {
    display:
      "grid",
    gap:
      "10px",
  },

  subscriptionCard: {
    border:
      "1px solid #e5e7eb",
    borderRadius:
      "13px",
    padding:
      "13px",
    background:
      "#fafafa",
  },

  subscriptionCardDanger: {
    background:
      "#fff7f7",
    border:
      "1px solid #fecaca",
  },

  cardTop: {
    display:
      "flex",
    justifyContent:
      "space-between",
    alignItems:
      "flex-start",
    gap:
      "12px",
  },

  companyNameRow: {
    display:
      "flex",
    alignItems:
      "center",
    gap:
      "7px",
    flexWrap:
      "wrap",
  },

  companyName: {
    fontSize:
      "16px",
    fontWeight:
      900,
    wordBreak:
      "break-word",
  },

  planName: {
    marginTop:
      "4px",
    fontSize:
      "11px",
    color:
      "#6b7280",
    fontWeight:
      800,
  },

  statusBadge: {
    display:
      "inline-flex",
    alignItems:
      "center",
    justifyContent:
      "center",
    padding:
      "4px 7px",
    borderRadius:
      "999px",
    fontSize:
      "10px",
    fontWeight:
      900,
  },

  companyInactiveBadge: {
    display:
      "inline-flex",
    padding:
      "4px 7px",
    borderRadius:
      "999px",
    fontSize:
      "10px",
    fontWeight:
      900,
    background:
      "#f3f4f6",
    color:
      "#4b5563",
  },

  subscriptionPrice: {
    flexShrink:
      0,
    fontSize:
      "16px",
    fontWeight:
      900,
    textAlign:
      "right",
  },

  subscriptionPriceUnit: {
    marginLeft:
      "2px",
    color:
      "#9ca3af",
    fontSize:
      "10px",
    fontWeight:
      700,
  },

  divider: {
    height:
      "1px",
    background:
      "#e5e7eb",
    margin:
      "12px 0",
  },

  infoRow: {
    display:
      "flex",
    justifyContent:
      "space-between",
    alignItems:
      "flex-start",
    gap:
      "12px",
    padding:
      "4px 0",
    fontSize:
      "12px",
  },

  infoLabel: {
    flexShrink:
      0,
    color:
      "#6b7280",
  },

  infoValue: {
    fontWeight:
      700,
    textAlign:
      "right",
    wordBreak:
      "break-word",
  },

  infoValueStrong: {
    fontWeight:
      900,
  },

  infoValueDanger: {
    color:
      "#dc2626",
  },

  warningBox: {
    marginTop:
      "10px",
    padding:
      "10px",
    borderRadius:
      "9px",
    background:
      "#fef2f2",
    color:
      "#991b1b",
    border:
      "1px solid #fecaca",
    fontSize:
      "11px",
    lineHeight:
      1.5,
    fontWeight:
      700,
  },

  grayNotice: {
    marginTop:
      "10px",
    padding:
      "9px",
    borderRadius:
      "9px",
    background:
      "#f3f4f6",
    color:
      "#4b5563",
    fontSize:
      "11px",
  },

  searchInput: {
    width:
      "100%",
    boxSizing:
      "border-box",
    minHeight:
      "44px",
    border:
      "1px solid #d1d5db",
    borderRadius:
      "10px",
    padding:
      "0 12px",
    fontSize:
      "14px",
    outline:
      "none",
    marginBottom:
      "10px",
  },

  filterRow: {
    display:
      "flex",
    gap:
      "6px",
    overflowX:
      "auto",
    paddingBottom:
      "8px",
    marginBottom:
      "4px",
  },

  filterButton: {
    flexShrink:
      0,
    minHeight:
      "34px",
    padding:
      "0 11px",
    border:
      "1px solid #d1d5db",
    borderRadius:
      "999px",
    background:
      "#ffffff",
    color:
      "#4b5563",
    fontSize:
      "11px",
    fontWeight:
      900,
    cursor:
      "pointer",
  },

  filterButtonActive: {
    background:
      "#111827",
    borderColor:
      "#111827",
    color:
      "#ffffff",
  },

  paymentList: {
    display:
      "grid",
    gap:
      "10px",
  },

  paymentCard: {
    border:
      "1px solid #e5e7eb",
    borderRadius:
      "13px",
    padding:
      "13px",
    background:
      "#fafafa",
  },

  paymentCardDanger: {
    background:
      "#fff7f7",
    border:
      "1px solid #fecaca",
  },

  paymentCardPending: {
    background:
      "#fffbeb",
    border:
      "1px solid #fde68a",
  },

  paymentType: {
    marginTop:
      "4px",
    fontSize:
      "11px",
    color:
      "#6b7280",
    fontWeight:
      700,
  },

  paymentAmount: {
    flexShrink:
      0,
    fontSize:
      "17px",
    fontWeight:
      900,
  },

  failureBox: {
    marginTop:
      "10px",
    padding:
      "10px",
    borderRadius:
      "9px",
    background:
      "#fef2f2",
    border:
      "1px solid #fecaca",
  },

  failureTitle: {
    color:
      "#991b1b",
    fontSize:
      "12px",
    fontWeight:
      900,
    marginBottom:
      "4px",
  },

  failureText: {
    color:
      "#991b1b",
    fontSize:
      "11px",
    lineHeight:
      1.5,
    wordBreak:
      "break-word",
  },

  empty: {
    padding:
      "35px 10px",
    textAlign:
      "center",
    color:
      "#9ca3af",
    fontSize:
      "13px",
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
    fontWeight:
      900,
  },

  loadingText: {
    marginTop:
      "7px",
    color:
      "#6b7280",
    fontSize:
      "13px",
    lineHeight:
      1.6,
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
    lineHeight:
      1.5,
  },

  homeButton: {
    marginTop:
      "16px",
    width:
      "100%",
    minHeight:
      "44px",
    border:
      0,
    borderRadius:
      "10px",
    background:
      "#111827",
    color:
      "#ffffff",
    fontWeight:
      900,
    cursor:
      "pointer",
  },
};
