"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabase";
import ToolIllustration from "../../components/ui/ToolIllustration";

const MENUS = [
  ["summary", "요약"],
  ["subscriptions", "구독"],
  ["payments", "결제내역"],
  ["refunds", "환불요청"],
];

const PAYMENT_FILTERS = [
  ["all", "전체"],
  ["paid", "성공"],
  ["pending", "처리중"],
  ["failed", "실패"],
  ["canceled", "취소"],
  ["refunded", "환불"],
];

function formatMoney(value) {
  return (Number(value) || 0).toLocaleString("ko-KR");
}

function formatDate(value, withTime = false) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return withTime
    ? date.toLocaleString("ko-KR", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : date.toLocaleDateString("ko-KR", {
        timeZone: "Asia/Seoul",
      });
}

function getPaymentTypeLabel(type) {
  return (
    {
      subscription: "최초 결제",
      renewal: "정기 결제",
      upgrade: "업그레이드",
      downgrade: "다운그레이드",
      manual: "수동 결제",
    }[type] ||
    type ||
    "-"
  );
}

function getStatusInfo(status) {
  const labels = {
    active: "정상",
    paid: "결제완료",
    past_due: "결제지연",
    failed: "결제실패",
    pending: "처리중",
    trial: "체험",
    paused: "일시정지",
    canceled: "취소",
    refunded: "환불",
  };

  if (["active", "paid"].includes(status)) {
    return {
      label: labels[status],
      background: "#ecfdf5",
      color: "#047857",
    };
  }

  if (["past_due", "failed"].includes(status)) {
    return {
      label: labels[status],
      background: "#fff1f2",
      color: "#b91c1c",
    };
  }

  if (status === "pending") {
    return {
      label: labels[status],
      background: "#fff7df",
      color: "#a16207",
    };
  }

  if (["trial", "refunded"].includes(status)) {
    return {
      label: labels[status],
      background: "#eaf3ff",
      color: "#3268bd",
    };
  }

  return {
    label: labels[status] || status || "알 수 없음",
    background: "#f1f3f6",
    color: "#7b8798",
  };
}

export default function SuperAdminBillingPage() {
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [adminName, setAdminName] = useState("");
  const [userEmail, setUserEmail] = useState("");

  const [overview, setOverview] = useState(null);
  const [refundRequests, setRefundRequests] = useState([]);
  const [refundBusy, setRefundBusy] = useState(false);
  const [message, setMessage] = useState("");

  const [menu, setMenu] = useState("summary");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [search, setSearch] = useState("");

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

  const loadBillingOverview = useCallback(async () => {
    const { data, error } = await supabase.rpc(
      "super_admin_get_billing_overview"
    );

    if (error) {
      throw new Error(`결제 현황 조회 실패: ${error.message}`);
    }

    setOverview(
      data && typeof data === "object"
        ? data
        : { summary: {}, subscriptions: [], payments: [] }
    );
  }, []);

  const loadRefundRequests = useCallback(async () => {
    const { data, error } = await supabase.auth.getSession();
    const token = data?.session?.access_token;

    if (error || !token) {
      throw new Error("로그인이 필요합니다.");
    }

    const response = await fetch("/api/billing/refunds", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        result.error || "환불 요청을 불러오지 못했습니다."
      );
    }

    setRefundRequests(
      Array.isArray(result.requests) ? result.requests : []
    );
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
          loadBillingOverview(),
          loadRefundRequests(),
        ]);
      } catch (error) {
        console.error("결제관리 초기화:", error);

        if (!alive) return;

        setMessage(
          `❌ ${
            error?.message ||
            "결제관리 페이지를 불러오지 못했습니다."
          }`
        );
      } finally {
        if (alive) setLoading(false);
      }
    }

    initialize();

    return () => {
      alive = false;
    };
  }, [
    checkSuperAdmin,
    loadBillingOverview,
    loadRefundRequests,
  ]);

  async function handleRefresh() {
    if (loading || refundBusy) return;

    setLoading(true);
    setMessage("");

    try {
      await Promise.all([
        loadBillingOverview(),
        loadRefundRequests(),
      ]);

      setMessage("✅ 결제 정보를 새로고침했습니다.");
    } catch (error) {
      setMessage(
        `❌ ${error?.message || "새로고침에 실패했습니다."}`
      );
    } finally {
      setLoading(false);
    }
  }

  async function processRefund(request) {
    if (refundBusy || loading || request.processed) return;

    const payment = request.payment;

    if (!payment?.id) {
      setMessage("❌ 카드 결제 정보를 확인할 수 없습니다.");
      return;
    }

    const answer = window.prompt(
      "토스페이먼츠에서 취소할 금액(원)을 입력하세요. 먼저 이용 내역과 환불 사유를 확인하세요.",
      String(payment.amount_krw)
    );

    if (answer === null) return;

    const amount = Number(answer);

    if (
      !Number.isInteger(amount) ||
      amount < 1 ||
      amount > Number(payment.amount_krw)
    ) {
      setMessage("❌ 환불 금액이 올바르지 않습니다.");
      return;
    }

    const confirmed = window.confirm(
      `${formatMoney(amount)}원을 원래 결제수단으로 취소하시겠습니까? 이 작업은 카드 결제를 취소합니다.`
    );

    if (!confirmed) return;

    setRefundBusy(true);
    setMessage("");

    try {
      const { data, error } = await supabase.auth.getSession();
      const token = data?.session?.access_token;

      if (error || !token) {
        throw new Error("로그인이 필요합니다.");
      }

      const response = await fetch("/api/billing/refunds", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "process",
          request_id: request.id,
          amount_krw: amount,
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          result.error || "PG 결제 취소에 실패했습니다."
        );
      }

      setMessage(
        `✅ ${formatMoney(amount)}원 결제 취소가 접수되었습니다.`
      );

      try {
        await Promise.all([
          loadRefundRequests(),
          loadBillingOverview(),
        ]);
      } catch (refreshError) {
        setMessage(
          `✅ 결제 취소가 접수되었습니다. 목록 갱신에 실패했으니 새로고침해주세요. ${
            refreshError?.message || ""
          }`
        );
      }
    } catch (error) {
      setMessage(`❌ ${error?.message || "환불 처리 실패"}`);
    } finally {
      setRefundBusy(false);
    }
  }

  const summary = overview?.summary || {};

  const subscriptions = Array.isArray(overview?.subscriptions)
    ? overview.subscriptions
    : [];

  const payments = Array.isArray(overview?.payments)
    ? overview.payments
    : [];

  const pendingRefundCount = refundRequests.filter(
    (item) => !item.processed
  ).length;

  const filteredPayments = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return payments.filter((payment) => {
      if (
        paymentFilter !== "all" &&
        payment.status !== paymentFilter
      ) {
        return false;
      }

      if (!keyword) return true;

      return [
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
        .toLowerCase()
        .includes(keyword);
    });
  }, [payments, paymentFilter, search]);

  if (loading && !authorized && !overview) {
    return (
      <main style={styles.page}>
        <section style={styles.centerCard}>
          <ToolIllustration kind="money" size={64} />
          <h1 style={styles.centerTitle}>결제정보 확인 중...</h1>
          <p style={styles.help}>
            구독과 결제내역을 불러오고 있습니다.
          </p>
        </section>
      </main>
    );
  }

  if (!authorized) {
    return (
      <main style={styles.page}>
        <section style={styles.centerCard}>
          <div style={{ fontSize: 40 }}>🔒</div>
          <h1 style={styles.centerTitle}>접근할 수 없습니다</h1>
          <p style={styles.help}>슈퍼관리자 전용 페이지입니다.</p>

          {message && (
            <div role="alert" style={styles.error}>
              {message}
            </div>
          )}

          <Link
            href="/super-admin"
            style={{
              ...styles.primary,
              display: "block",
              marginTop: 20,
              textDecoration: "none",
            }}
          >
            슈퍼관리자로 이동
          </Link>
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
            <h1 style={styles.title}>결제 관리</h1>
            <p style={styles.help}>업체 구독과 결제 현황</p>
          </div>

          <ToolIllustration kind="money" size={52} />
        </header>

        <nav aria-label="결제 관리 메뉴" style={styles.menus}>
          {MENUS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={menu === id}
              onClick={() => setMenu(id)}
              style={{
                ...styles.menuButton,
                ...(menu === id ? styles.selected : {}),
              }}
            >
              {label}
              {id === "refunds" && pendingRefundCount > 0 && (
                <span style={styles.count}>
                  {pendingRefundCount}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div style={styles.toolbar}>
          <button
            type="button"
            disabled={loading || refundBusy}
            onClick={handleRefresh}
            style={{
              ...styles.button,
              ...(loading || refundBusy ? styles.disabled : {}),
            }}
          >
            {loading ? "불러오는 중..." : "새로고침"}
          </button>
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

        {menu === "summary" && (
          <section aria-label="결제 요약">
            <div style={styles.statsGrid}>
              {[
                ["활성 구독", Number(summary.active_subscriptions) || 0],
                [
                  "결제 지연",
                  Number(summary.past_due_subscriptions) || 0,
                  true,
                ],
                [
                  "이번 달 결제",
                  `${formatMoney(summary.month_paid_amount)}원`,
                ],
                [
                  "이번 달 성공",
                  Number(summary.month_paid_count) || 0,
                ],
                [
                  "이번 달 실패",
                  Number(summary.month_failed_count) || 0,
                  true,
                ],
                ["미처리 환불 요청", pendingRefundCount],
              ].map(([label, value, danger]) => (
                <div key={label} style={styles.statCard}>
                  <div style={styles.help}>{label}</div>
                  <strong
                    style={{
                      ...styles.statValue,
                      color: danger ? "#b91c1c" : "#3268bd",
                    }}
                  >
                    {value}
                  </strong>
                </div>
              ))}
            </div>

            <p style={styles.help}>
              상세 내역은 위의 구독·결제내역·환불요청 메뉴에서
              확인하세요.
            </p>
          </section>
        )}

        {menu === "subscriptions" && (
          <section>
            <h2 style={styles.sectionTitle}>
              구독 현황 · {subscriptions.length}개
            </h2>

            <p style={{ ...styles.help, marginBottom: 16 }}>
              업체를 펼치면 이용기간과 자동 재결제 정보를 볼 수
              있습니다.
            </p>

            {subscriptions.length === 0 ? (
              <div style={styles.empty}>등록된 구독이 없습니다.</div>
            ) : (
              <div style={styles.list}>
                {subscriptions.map((subscription) => (
                  <SubscriptionCard
                    key={subscription.subscription_id}
                    subscription={subscription}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {menu === "payments" && (
          <section>
            <h2 style={styles.sectionTitle}>최근 결제내역</h2>
            <p style={{ ...styles.help, marginBottom: 16 }}>
              최근 결제 100건 · 검색 결과 {filteredPayments.length}건
            </p>

            <input
              type="search"
              aria-label="결제내역 검색"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="업체명, 주문번호, 요금제 검색"
              style={styles.input}
            />

            <nav aria-label="결제 상태 필터" style={styles.filters}>
              {PAYMENT_FILTERS.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={paymentFilter === id}
                  onClick={() => setPaymentFilter(id)}
                  style={{
                    ...styles.filterButton,
                    ...(paymentFilter === id ? styles.selected : {}),
                  }}
                >
                  {label}
                </button>
              ))}
            </nav>

            {filteredPayments.length === 0 ? (
              <div style={styles.empty}>결제내역이 없습니다.</div>
            ) : (
              <div style={styles.list}>
                {filteredPayments.map((payment) => (
                  <PaymentCard
                    key={payment.payment_id}
                    payment={payment}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {menu === "refunds" && (
          <section>
            <h2 style={styles.sectionTitle}>환불 요청</h2>

            <p style={{ ...styles.help, marginBottom: 16 }}>
              사유와 이용 내역을 확인한 뒤 원래 카드 결제를
              취소합니다. 구독 취소 예약은 별도로 확인해주세요.
            </p>

            {refundRequests.length === 0 ? (
              <div style={styles.empty}>접수된 요청이 없습니다.</div>
            ) : (
              <div style={styles.list}>
                {refundRequests.map((item) => (
                  <article key={item.id} style={styles.card}>
                    <div style={styles.cardTop}>
                      <strong>
                        {item.payment?.plan_code?.toUpperCase() ||
                          "결제"}
                      </strong>

                      <strong style={styles.amount}>
                        {formatMoney(item.payment?.amount_krw)}원
                      </strong>
                    </div>

                    <div style={styles.divider} />

                    <InfoRow
                      label="업체 ID"
                      value={item.company_id || "-"}
                    />
                    <InfoRow
                      label="신청일"
                      value={formatDate(item.created_at, true)}
                    />

                    <div style={styles.notice}>
                      <strong>신청 사유</strong>
                      <div style={{ marginTop: 6 }}>
                        {item.event_data?.reason || "-"}
                      </div>
                    </div>

                    {item.processed ? (
                      <div style={styles.successNotice}>
                        PG 취소 처리 완료
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={refundBusy || loading}
                        onClick={() => processRefund(item)}
                        style={{
                          ...styles.button,
                          width: "100%",
                          marginTop: 14,
                          color: "#b91c1c",
                          ...(refundBusy || loading
                            ? styles.disabled
                            : {}),
                        }}
                      >
                        {refundBusy ? "처리 중..." : "결제 취소 처리"}
                      </button>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        <footer style={styles.account}>
          {adminName} · {userEmail}
        </footer>
      </div>
    </main>
  );
}

function SubscriptionCard({ subscription }) {
  const status = subscription.status || "unknown";
  const pastDue = status === "past_due";
  const retryCount = Math.max(
    0,
    Number(subscription.payment_retry_count) || 0
  );
  const finalRetryFailed =
    pastDue &&
    retryCount >= 3 &&
    !subscription.next_payment_retry_at;

  return (
    <details
      style={{
        ...styles.card,
        ...(pastDue ? { borderColor: "#fecaca" } : {}),
      }}
    >
      <summary style={styles.cardSummary}>
        <div style={{ minWidth: 0 }}>
          <div style={styles.nameRow}>
            <strong style={styles.companyName}>
              {subscription.company_name || "회사명 없음"}
            </strong>
            <StatusBadge status={status} />
          </div>

          <div style={styles.help}>
            {String(subscription.plan_code || "-").toUpperCase()}
            {subscription.company_active === false && " · 회사 정지"}
          </div>
        </div>

        <strong style={styles.amount}>
          {formatMoney(subscription.monthly_price_krw)}원
          <small style={styles.unit}>/월</small>
        </strong>
      </summary>

      <div style={styles.divider} />

      <InfoRow
        label="다음 자동결제"
        value={formatDate(subscription.next_billing_at, true)}
        danger={pastDue}
      />
      <InfoRow
        label="현재 이용기간"
        value={`${formatDate(
          subscription.current_period_start
        )} ~ ${formatDate(subscription.current_period_end)}`}
      />
      <InfoRow
        label="구독 시작"
        value={formatDate(subscription.started_at, true)}
      />
      <InfoRow
        label="기간 종료 취소"
        value={subscription.cancel_at_period_end ? "예약됨" : "아니오"}
        danger={Boolean(subscription.cancel_at_period_end)}
      />

      <div style={styles.notice}>
        <strong>자동 재결제</strong>

        <InfoRow
          label="재결제 횟수"
          value={`${retryCount} / 3`}
          danger={pastDue && retryCount > 0}
        />
        <InfoRow
          label="최근 재결제"
          value={formatDate(subscription.last_payment_retry_at, true)}
        />
        <InfoRow
          label="다음 재결제"
          value={formatDate(subscription.next_payment_retry_at, true)}
          danger={pastDue}
        />
      </div>

      {pastDue && (
        <div style={styles.error}>
          {finalRetryFailed
            ? "자동 재결제 최종 실패: 3회 재시도가 모두 실패했습니다. 결제수단 확인 또는 고객 안내가 필요합니다."
            : "자동결제에 실패한 구독입니다. 결제수단과 최근 실패내역을 확인하세요."}
        </div>
      )}

      {status === "canceled" && (
        <p style={styles.help}>이 구독은 취소 상태입니다.</p>
      )}
    </details>
  );
}

function PaymentCard({ payment }) {
  const failed = payment.status === "failed";

  return (
    <details
      style={{
        ...styles.card,
        ...(failed ? { borderColor: "#fecaca" } : {}),
      }}
    >
      <summary style={styles.cardSummary}>
        <div style={{ minWidth: 0 }}>
          <div style={styles.nameRow}>
            <strong style={styles.companyName}>
              {payment.company_name || "회사명 없음"}
            </strong>
            <StatusBadge status={payment.status} />
          </div>

          <div style={styles.help}>
            {getPaymentTypeLabel(payment.payment_type)} ·{" "}
            {String(payment.plan_code || "-").toUpperCase()}
          </div>
        </div>

        <strong style={styles.amount}>
          {formatMoney(payment.amount_krw)}원
        </strong>
      </summary>

      <div style={styles.divider} />

      <InfoRow
        label="결제일"
        value={formatDate(payment.paid_at, true)}
      />
      <InfoRow
        label="요청일"
        value={formatDate(payment.created_at, true)}
      />
      <InfoRow label="주문번호" value={payment.order_id || "-"} />

      {failed && (
        <div style={styles.error}>
          <strong>결제 실패</strong>

          {payment.failure_code && (
            <div style={{ marginTop: 6 }}>
              코드: {payment.failure_code}
            </div>
          )}

          {payment.failure_message && (
            <div style={{ marginTop: 6 }}>
              {payment.failure_message}
            </div>
          )}
        </div>
      )}
    </details>
  );
}

function StatusBadge({ status }) {
  const info = getStatusInfo(status);

  return (
    <span
      style={{
        ...styles.badge,
        background: info.background,
        color: info.color,
      }}
    >
      {info.label}
    </span>
  );
}

function InfoRow({ label, value, danger = false }) {
  return (
    <div style={styles.infoRow}>
      <span style={styles.infoLabel}>{label}</span>
      <span
        style={{
          ...styles.infoValue,
          ...(danger ? { color: "#b91c1c" } : {}),
        }}
      >
        {value}
      </span>
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
    fontSize: 26,
    letterSpacing: "-0.7px",
  },
  help: {
    margin: "6px 0 0",
    color: "#7b8798",
    fontSize: 12,
    lineHeight: 1.7,
  },
  menus: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 6,
    marginBottom: 16,
  },
  menuButton: {
    minHeight: 50,
    padding: "10px 4px",
    border: "1px solid #dfe6ef",
    borderRadius: 15,
    background: "#ffffff",
    color: "#50617a",
    fontSize: 12,
    fontWeight: 800,
    cursor: "pointer",
  },
  selected: {
    background: "#eaf3ff",
    color: "#3268bd",
    borderColor: "#3478ed",
  },
  count: {
    display: "inline-block",
    marginLeft: 4,
    padding: "2px 5px",
    borderRadius: 999,
    background: "#fff1f2",
    color: "#b91c1c",
    fontSize: 10,
  },
  toolbar: {
    display: "flex",
    justifyContent: "flex-end",
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
    padding: "14px",
    border: "none",
    borderRadius: 14,
    background: "var(--film-blue, #3478ed)",
    color: "#ffffff",
    fontSize: 13,
    fontWeight: 800,
    textAlign: "center",
  },
  disabled: {
    opacity: 0.5,
    cursor: "not-allowed",
  },
  message: {
    padding: 14,
    marginBottom: 16,
    borderRadius: 14,
    fontSize: 13,
    lineHeight: 1.7,
    overflowWrap: "anywhere",
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 12,
  },
  statCard: {
    minWidth: 0,
    padding: 18,
    border: "1px solid #e4eaf2",
    borderRadius: 20,
    background: "#ffffff",
    boxShadow: "0 6px 20px rgba(48,77,116,0.04)",
  },
  statValue: {
    display: "block",
    marginTop: 10,
    fontSize: 24,
    fontWeight: 900,
    overflowWrap: "anywhere",
  },
  sectionTitle: {
    margin: "0 0 6px",
    fontSize: 19,
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
    listStyle: "none",
  },
  cardTop: {
    display: "flex",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 12,
  },
  nameRow: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  companyName: {
    fontSize: 16,
    overflowWrap: "anywhere",
  },
  amount: {
    fontSize: 18,
    color: "#3268bd",
    overflowWrap: "anywhere",
  },
  unit: {
    marginLeft: 3,
    color: "#9ca3af",
    fontSize: 10,
  },
  badge: {
    display: "inline-block",
    padding: "5px 8px",
    borderRadius: 999,
    fontSize: 10,
    fontWeight: 800,
  },
  divider: {
    height: 1,
    background: "#eef2f7",
    margin: "16px 0 10px",
  },
  infoRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    padding: "7px 0",
    fontSize: 12,
    lineHeight: 1.7,
  },
  infoLabel: {
    flexShrink: 0,
    color: "#7b8798",
  },
  infoValue: {
    fontWeight: 700,
    textAlign: "right",
    overflowWrap: "anywhere",
  },
  notice: {
    marginTop: 14,
    padding: 14,
    borderRadius: 16,
    background: "#f3f7fc",
    color: "#50617a",
    fontSize: 12,
    lineHeight: 1.8,
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
  },
  successNotice: {
    marginTop: 14,
    padding: 13,
    borderRadius: 14,
    background: "#ecfdf5",
    color: "#047857",
    fontSize: 12,
    fontWeight: 800,
  },
  error: {
    marginTop: 14,
    padding: 13,
    borderRadius: 14,
    background: "#fff1f2",
    color: "#b91c1c",
    fontSize: 12,
    lineHeight: 1.8,
    overflowWrap: "anywhere",
  },
  input: {
    width: "100%",
    minHeight: 48,
    boxSizing: "border-box",
    padding: "10px 14px",
    border: "1px solid #dfe6ef",
    borderRadius: 14,
    background: "#ffffff",
    color: "#243247",
    fontSize: 16,
  },
  filters: {
    display: "flex",
    gap: 8,
    overflowX: "auto",
    margin: "12px 0 16px",
    paddingBottom: 4,
  },
  filterButton: {
    flexShrink: 0,
    minHeight: 44,
    padding: "10px 14px",
    border: "1px solid #dfe6ef",
    borderRadius: 999,
    background: "#ffffff",
    color: "#50617a",
    fontSize: 12,
    fontWeight: 800,
    cursor: "pointer",
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
    margin: "16px 0 8px",
    fontSize: 20,
  },
};
