"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabase";
import ToolIllustration from "../../components/ui/ToolIllustration";

const STATUS_OPTIONS = [
  ["all", "전체 주문"],
  ["paid", "결제 완료"],
  ["preparing", "상품 준비중"],
  ["shipped", "발송 완료"],
  ["delivered", "배송 완료"],
  ["cancel_requested", "취소 요청"],
  ["cancelled", "취소 완료"],
  ["payment_failed", "결제 실패"],
];

const STATUS_INFO = {
  payment_pending: ["결제 대기", "#a16207", "#fff7df"],
  paid: ["결제 완료", "#3268bd", "#eaf3ff"],
  preparing: ["상품 준비중", "#7c3aed", "#f5f3ff"],
  shipped: ["발송 완료", "#0891b2", "#ecfeff"],
  delivered: ["배송 완료", "#047857", "#ecfdf5"],
  cancel_requested: ["취소 요청", "#c2410c", "#fff7ed"],
  cancelled: ["취소 완료", "#7b8798", "#f1f3f6"],
  payment_failed: ["결제 실패", "#b91c1c", "#fff1f2"],
};

const DETAIL_MENUS = [
  ["items", "주문 자재"],
  ["shipping", "배송지"],
  ["payment", "결제"],
  ["status", "상태변경"],
];

function money(value) {
  return `${Number(value || 0).toLocaleString("ko-KR")}원`;
}

function meter(value) {
  return `${Number(value || 0).toLocaleString("ko-KR")}m`;
}

function dateTime(value) {
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

function getItemCode(item) {
  return item.product_code || item.material_code || item.code || "-";
}

function getItemName(item) {
  return (
    item.product_name ||
    item.material_name ||
    item.name ||
    getItemCode(item)
  );
}

function getItemQuantity(item) {
  return (
    item.quantity_m ??
    item.order_length_m ??
    item.meters ??
    item.quantity ??
    0
  );
}

function getItemUnitPrice(item) {
  return (
    item.unit_price ??
    item.unit_price_per_m ??
    item.price_per_m ??
    item.dealer_price_per_m ??
    0
  );
}

function getItemTotal(item) {
  const saved =
    item.total_amount ??
    item.line_total_amount ??
    item.subtotal_amount;

  return saved !== undefined && saved !== null
    ? Number(saved || 0)
    : Number(getItemQuantity(item)) * Number(getItemUnitPrice(item));
}

function StatusBadge({ status }) {
  const [label, color, background] = STATUS_INFO[status] || [
    status || "상태 미확인",
    "#7b8798",
    "#f1f3f6",
  ];

  return (
    <span style={{ ...styles.badge, color, background }}>
      {label}
    </span>
  );
}

export default function SuperAdminMaterialOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");
  const [expandedIds, setExpandedIds] = useState({});

  const apiFetch = useCallback(async (url, options = {}) => {
    const { data, error } = await supabase.auth.getSession();
    const token = data?.session?.access_token;

    if (error || !token) {
      throw new Error("로그인이 필요합니다.");
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        ...(options.body
          ? { "Content-Type": "application/json" }
          : {}),
        ...(options.headers || {}),
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    const rawText = await response.text();
    let result = {};

    if (rawText) {
      try {
        result = JSON.parse(rawText);
      } catch {
        throw new Error(
          `서버 응답을 읽을 수 없습니다. 상태코드: ${response.status}`
        );
      }
    }

    if (!response.ok || result.ok === false) {
      throw new Error(
        result.error ||
          result.message ||
          `요청 실패: ${response.status}`
      );
    }

    return result;
  }, []);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setMessage("");

    try {
      const params = new URLSearchParams();

      if (statusFilter !== "all") {
        params.set("status", statusFilter);
      }

      if (appliedSearch) {
        params.set("search", appliedSearch);
      }

      const query = params.toString();

      const result = await apiFetch(
        `/api/super-admin/material-orders${query ? `?${query}` : ""}`
      );

      setOrders(Array.isArray(result.orders) ? result.orders : []);

      const requestedId = new URLSearchParams(
        window.location.search
      ).get("orderId");

      if (requestedId) {
        setExpandedIds((current) => ({
          ...current,
          [requestedId]: true,
        }));

        window.setTimeout(() => {
          document
            .getElementById(`material-order-${requestedId}`)
            ?.scrollIntoView({
              behavior: "smooth",
              block: "start",
            });
        }, 300);
      }
    } catch (error) {
      setOrders([]);
      setMessageType("error");
      setMessage(error.message || "주문을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [apiFetch, appliedSearch, statusFilter]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const counts = useMemo(() => {
    const result = {
      total: orders.length,
      paid: 0,
      preparing: 0,
      shipped: 0,
      delivered: 0,
    };

    for (const order of orders) {
      if (Object.prototype.hasOwnProperty.call(result, order.status)) {
        result[order.status] += 1;
      }
    }

    return result;
  }, [orders]);

  function submitSearch(event) {
    event.preventDefault();

    if (updatingId) return;

    const next = searchInput.trim();

    if (next === appliedSearch) {
      loadOrders();
    } else {
      setAppliedSearch(next);
    }
  }

  function toggleOrder(id) {
    setExpandedIds((current) => ({
      ...current,
      [id]: !current[id],
    }));
  }

  async function changeStatus(order, nextStatus) {
    if (updatingId || loading || order.status === nextStatus) return;

    const label = STATUS_INFO[nextStatus]?.[0] || nextStatus;

    const confirmed = window.confirm(
      `${order.order_number || "이 주문"}을(를) '${label}' 상태로 변경할까요?`
    );

    if (!confirmed) return;

    setUpdatingId(order.id);
    setMessage("");

    try {
      const result = await apiFetch(
        "/api/super-admin/material-orders",
        {
          method: "PATCH",
          body: JSON.stringify({
            orderId: order.id,
            status: nextStatus,
          }),
        }
      );

      setOrders((current) =>
        current.map((item) =>
          item.id === order.id
            ? { ...item, ...result.order }
            : item
        )
      );

      setMessageType("success");
      setMessage(
        `${order.order_number || "주문"} 상태를 '${label}'로 변경했습니다.`
      );
    } catch (error) {
      setMessageType("error");
      setMessage(error.message || "상태 변경에 실패했습니다.");
    } finally {
      setUpdatingId("");
    }
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
            <small style={styles.eyebrow}>필름장이 · 슈퍼관리자</small>
            <h1 style={styles.title}>자재 주문관리</h1>
            <p style={styles.help}>결제된 주문과 발송 현황을 확인하세요.</p>
          </div>

          <ToolIllustration kind="film" size={52} />
        </header>

        <section style={styles.statsGrid} aria-label="조회 주문 요약">
          {[
            ["조회 주문", counts.total],
            ["결제 완료", counts.paid],
            ["준비중", counts.preparing],
            ["발송 완료", counts.shipped],
          ].map(([label, value]) => (
            <div key={label} style={styles.statCard}>
              <div style={styles.help}>{label}</div>
              <strong style={styles.statValue}>
                {value.toLocaleString("ko-KR")}
              </strong>
            </div>
          ))}
        </section>

        <section style={styles.card}>
          <form onSubmit={submitSearch}>
            <label htmlFor="order-search" style={styles.label}>
              주문 검색
            </label>

            <div style={styles.searchRow}>
              <input
                id="order-search"
                type="search"
                value={searchInput}
                disabled={Boolean(updatingId)}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="주문번호·받는 분·전화번호"
                style={styles.input}
              />

              <button
                type="submit"
                disabled={loading || Boolean(updatingId)}
                style={styles.primary}
              >
                검색
              </button>
            </div>
          </form>

          <label
            htmlFor="order-status"
            style={{ ...styles.label, marginTop: 16 }}
          >
            주문 상태
          </label>

          <select
            id="order-status"
            value={statusFilter}
            disabled={Boolean(updatingId)}
            onChange={(event) => setStatusFilter(event.target.value)}
            style={styles.input}
          >
            {STATUS_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </section>

        {message && (
          <div
            role="status"
            style={{
              ...styles.message,
              background:
                messageType === "error" ? "#fff1f2" : "#ecfdf5",
              color:
                messageType === "error" ? "#b91c1c" : "#047857",
            }}
          >
            {message}
          </div>
        )}

        {loading ? (
          <div style={styles.empty}>주문을 불러오는 중입니다.</div>
        ) : orders.length === 0 ? (
          <div style={styles.empty}>
            조건에 맞는 자재 주문이 없습니다.
          </div>
        ) : (
          <div style={styles.list}>
            {orders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                expanded={Boolean(expandedIds[order.id])}
                disabled={Boolean(updatingId)}
                updating={updatingId === order.id}
                onToggle={() => toggleOrder(order.id)}
                onStatusChange={(status) => changeStatus(order, status)}
              />
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={loadOrders}
          disabled={loading || Boolean(updatingId)}
          style={{
            ...styles.button,
            width: "100%",
            marginTop: 18,
            ...(loading || updatingId ? styles.disabled : {}),
          }}
        >
          주문 목록 새로고침
        </button>
      </div>
    </main>
  );
}

function OrderCard({
  order,
  expanded,
  disabled,
  updating,
  onToggle,
  onStatusChange,
}) {
  const [menu, setMenu] = useState("items");
  const address = order.shipping_address || {};
  const items = Array.isArray(order.items) ? order.items : [];
  const total = order.total_amount ?? order.final_amount ?? order.amount;

  return (
    <article
      id={`material-order-${order.id}`}
      style={styles.orderCard}
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={`order-details-${order.id}`}
        onClick={onToggle}
        style={styles.orderHeader}
      >
        <div style={styles.orderTop}>
          <div style={{ minWidth: 0 }}>
            <div style={styles.help}>{dateTime(order.created_at)}</div>
            <strong style={styles.orderNumber}>
              {order.order_number || "주문번호 없음"}
            </strong>
          </div>

          <StatusBadge status={order.status} />
        </div>

        <div style={styles.orderTotal}>
          <span style={styles.help}>상품 {items.length}종</span>
          <strong style={styles.amount}>{money(total)}</strong>
        </div>

        <div style={styles.expandLabel}>
          {expanded ? "주문 상세 닫기 ▲" : "주문 상세 보기 ▼"}
        </div>
      </button>

      {expanded && (
        <div
          id={`order-details-${order.id}`}
          style={styles.orderBody}
        >
          <nav aria-label="주문 상세 메뉴" style={styles.menus}>
            {DETAIL_MENUS.map(([id, label]) => (
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
              </button>
            ))}
          </nav>

          {menu === "items" && (
            <section style={styles.panel}>
              <h3 style={styles.sectionTitle}>주문 자재</h3>

              {items.length === 0 ? (
                <p style={styles.help}>등록된 주문 자재가 없습니다.</p>
              ) : (
                <div style={{ ...styles.list, marginTop: 14 }}>
                  {items.map((item, index) => (
                    <div
                      key={item.id || `${order.id}-${index}`}
                      style={styles.itemCard}
                    >
                      <div style={styles.orderTop}>
                        <div style={{ minWidth: 0 }}>
                          <strong style={styles.itemCode}>
                            {getItemCode(item)}
                          </strong>
                          <div style={styles.help}>
                            {getItemName(item)}
                          </div>
                        </div>

                        <strong style={styles.amount}>
                          {meter(getItemQuantity(item))}
                        </strong>
                      </div>

                      <div style={styles.help}>
                        단가 {money(getItemUnitPrice(item))}/m
                      </div>
                      <div style={styles.help}>
                        상품금액 {money(getItemTotal(item))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {menu === "shipping" && (
            <section style={styles.panel}>
              <h3 style={styles.sectionTitle}>배송지</h3>

              <div style={styles.address}>
                <strong>
                  {address.recipient_name ||
                    order.recipient_name ||
                    "받는 분 미등록"}
                </strong>

                <div>
                  {address.recipient_phone ||
                    order.recipient_phone ||
                    "전화번호 미등록"}
                </div>

                <div style={{ marginTop: 10 }}>
                  {(address.postal_code || order.postal_code) && (
                    <span>
                      [{address.postal_code || order.postal_code}]{" "}
                    </span>
                  )}

                  {address.address_line1 ||
                    order.address_line1 ||
                    "주소 미등록"}

                  {(address.address_line2 || order.address_line2) && (
                    <div>
                      {address.address_line2 || order.address_line2}
                    </div>
                  )}
                </div>

                {(address.delivery_note || order.delivery_note) && (
                  <div style={styles.deliveryNote}>
                    배송 요청:{" "}
                    {address.delivery_note || order.delivery_note}
                  </div>
                )}
              </div>
            </section>
          )}

          {menu === "payment" && (
            <section style={styles.panel}>
              <h3 style={styles.sectionTitle}>결제 정보</h3>

              <div style={{ marginTop: 14 }}>
                <InfoRow
                  label="결제 상태"
                  value={order.payment_status || "-"}
                />
                <InfoRow
                  label="공급가액"
                  value={money(
                    order.subtotal_amount ?? order.supply_amount
                  )}
                />
                <InfoRow label="부가세" value={money(order.vat_amount)} />
                <InfoRow label="배송비" value={money(order.shipping_fee)} />

                <div style={styles.orderTotal}>
                  <strong>총 결제금액</strong>
                  <strong style={styles.amount}>{money(total)}</strong>
                </div>
              </div>
            </section>
          )}

          {menu === "status" && (
            <section style={styles.panel}>
              <h3 style={styles.sectionTitle}>주문 상태 변경</h3>

              <div style={styles.statusGrid}>
                {[
                  ["paid", "결제 완료"],
                  ["preparing", "상품 준비중"],
                  ["shipped", "발송 완료"],
                  ["delivered", "배송 완료"],
                  ["cancelled", "주문 취소"],
                ].map(([value, label]) => {
                  const selected = order.status === value;

                  return (
                    <button
                      key={value}
                      type="button"
                      disabled={disabled || selected}
                      onClick={() => onStatusChange(value)}
                      style={{
                        ...styles.button,
                        ...(selected ? styles.selected : {}),
                        ...(disabled ? styles.disabled : {}),
                        ...(value === "cancelled" && !selected
                          ? { color: "#b91c1c" }
                          : {}),
                      }}
                    >
                      {label}
                      {selected && " ✓"}
                    </button>
                  );
                })}
              </div>

              {updating && (
                <p role="status" style={styles.help}>
                  상태를 변경하는 중입니다.
                </p>
              )}
            </section>
          )}
        </div>
      )}
    </article>
  );
}

function InfoRow({ label, value }) {
  return (
    <div style={styles.infoRow}>
      <span style={{ color: "#7b8798" }}>{label}</span>
      <strong style={{ textAlign: "right", overflowWrap: "anywhere" }}>
        {value}
      </strong>
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
    margin: "5px 0 0",
    color: "#7b8798",
    fontSize: 12,
    lineHeight: 1.7,
    overflowWrap: "anywhere",
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 10,
    marginBottom: 16,
  },
  statCard: {
    minWidth: 0,
    padding: 16,
    border: "1px solid #e4eaf2",
    borderRadius: 18,
    background: "#ffffff",
  },
  statValue: {
    display: "block",
    marginTop: 8,
    fontSize: 27,
    color: "#3268bd",
    overflowWrap: "anywhere",
  },
  card: {
    padding: 18,
    marginBottom: 16,
    border: "1px solid #e4eaf2",
    borderRadius: 22,
    background: "#ffffff",
  },
  label: {
    display: "block",
    marginBottom: 8,
    fontSize: 13,
    fontWeight: 800,
    color: "#50617a",
  },
  searchRow: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    gap: 8,
  },
  input: {
    width: "100%",
    minWidth: 0,
    minHeight: 48,
    boxSizing: "border-box",
    padding: "10px 12px",
    border: "1px solid #dfe6ef",
    borderRadius: 14,
    background: "#fbfcfe",
    color: "#243247",
    fontSize: 16,
  },
  primary: {
    minHeight: 44,
    padding: "10px 16px",
    border: "none",
    borderRadius: 14,
    background: "var(--film-blue, #3478ed)",
    color: "#ffffff",
    fontSize: 13,
    fontWeight: 800,
    cursor: "pointer",
  },
  button: {
    minHeight: 44,
    padding: "10px 12px",
    border: "1px solid #dfe6ef",
    borderRadius: 14,
    background: "#ffffff",
    color: "#50617a",
    fontSize: 12,
    fontWeight: 800,
    cursor: "pointer",
  },
  message: {
    padding: 14,
    marginBottom: 16,
    borderRadius: 14,
    fontSize: 13,
    lineHeight: 1.7,
    overflowWrap: "anywhere",
  },
  empty: {
    padding: "40px 18px",
    border: "1px solid #e4eaf2",
    borderRadius: 22,
    background: "#ffffff",
    color: "#7b8798",
    textAlign: "center",
    fontSize: 13,
  },
  list: {
    display: "grid",
    gap: 14,
  },
  orderCard: {
    border: "1px solid #e4eaf2",
    borderRadius: 22,
    background: "#ffffff",
    overflow: "hidden",
    boxShadow: "0 6px 20px rgba(48,77,116,0.04)",
    scrollMarginTop: 20,
  },
  orderHeader: {
    display: "block",
    width: "100%",
    boxSizing: "border-box",
    padding: 18,
    border: "none",
    background: "#ffffff",
    color: "#243247",
    textAlign: "left",
    cursor: "pointer",
  },
  orderTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: 10,
  },
  orderNumber: {
    display: "block",
    marginTop: 6,
    fontSize: 17,
    overflowWrap: "anywhere",
  },
  badge: {
    display: "inline-block",
    padding: "6px 9px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 800,
  },
  orderTotal: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
    paddingTop: 14,
    marginTop: 14,
    borderTop: "1px solid #e4eaf2",
    fontSize: 13,
  },
  amount: {
    color: "#3268bd",
    fontSize: 17,
    overflowWrap: "anywhere",
  },
  expandLabel: {
    marginTop: 14,
    color: "#7b8798",
    fontSize: 11,
    fontWeight: 700,
    textAlign: "center",
  },
  orderBody: {
    padding: "0 14px 16px",
  },
  menus: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 5,
    marginBottom: 14,
  },
  menuButton: {
    minHeight: 44,
    padding: "8px 2px",
    border: "1px solid #dfe6ef",
    borderRadius: 12,
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
  panel: {
    padding: 16,
    borderRadius: 18,
    background: "#f3f7fc",
  },
  sectionTitle: {
    margin: 0,
    fontSize: 16,
  },
  itemCard: {
    padding: 14,
    border: "1px solid #e4eaf2",
    borderRadius: 15,
    background: "#ffffff",
  },
  itemCode: {
    display: "block",
    fontSize: 17,
    overflowWrap: "anywhere",
  },
  address: {
    marginTop: 14,
    color: "#50617a",
    fontSize: 14,
    lineHeight: 1.9,
    overflowWrap: "anywhere",
  },
  deliveryNote: {
    padding: 12,
    marginTop: 14,
    borderRadius: 12,
    background: "#ffffff",
    fontSize: 12,
    whiteSpace: "pre-wrap",
  },
  infoRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    padding: "7px 0",
    fontSize: 13,
    lineHeight: 1.7,
  },
  statusGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 10,
    marginTop: 16,
  },
  disabled: {
    opacity: 0.5,
    cursor: "not-allowed",
  },
};
