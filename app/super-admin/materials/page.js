"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import ToolIllustration from "../../components/ui/ToolIllustration";

const PAGE_SIZE = 50;

function formatWon(value) {
  return `${Number(value || 0).toLocaleString("ko-KR")}원`;
}

function getFlameLabel(value) {
  if (value === "flame_retardant") return "방염";
  if (value === "non_flame_retardant") return "비방염";
  return "미분류";
}

function getSampleImage(product) {
  const direct =
    product?.sample_image_url ||
    product?.image_url ||
    product?.photo_url ||
    "";

  if (direct) return direct;

  const path =
    product?.sample_image_path || product?.image_path || "";

  if (!path) return "";
  if (/^https?:\/\//.test(path)) return path;

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  if (!base) return "";

  const clean = path
    .replace(/^\/+/, "")
    .replace(/^film-samples\//, "");

  return `${base}/storage/v1/object/public/film-samples/${clean}`;
}

export default function SuperAdminMaterialsPage() {
  const router = useRouter();
  const messageTimer = useRef(null);

  const [authorized, setAuthorized] = useState(null);
  const [brands, setBrands] = useState([]);
  const [selectedBrand, setSelectedBrand] = useState("현대보닥");
  const [products, setProducts] = useState([]);
  const [stats, setStats] = useState({});
  const [pagination, setPagination] = useState({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    totalPages: 1,
  });

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [saleFilter, setSaleFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState("all");

  const [selectedIds, setSelectedIds] = useState([]);
  const [priceInputs, setPriceInputs] = useState({});
  const [bulkPrice, setBulkPrice] = useState("");
  const [bulkMinimumOrder, setBulkMinimumOrder] = useState("1");
  const [bulkOrderUnit, setBulkOrderUnit] = useState("1");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rowSavingId, setRowSavingId] = useState(null);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");

  const showMessage = useCallback((text, type = "success") => {
    setMessage(text);
    setMessageType(type);
    window.clearTimeout(messageTimer.current);
    messageTimer.current = window.setTimeout(() => {
      setMessage("");
    }, 4500);
  }, []);

  useEffect(() => {
    return () => window.clearTimeout(messageTimer.current);
  }, []);

  const getCurrentAccessToken = useCallback(async () => {
    const { data, error } = await supabase.auth.getSession();

    if (error || !data?.session?.access_token) {
      throw new Error("로그인이 필요합니다.");
    }

    return data.session.access_token;
  }, []);

  const apiFetch = useCallback(
    async (url, options = {}) => {
      const token = await getCurrentAccessToken();

      const response = await fetch(url, {
        ...options,
        cache: "no-store",
        headers: {
          ...(options.body
            ? { "Content-Type": "application/json" }
            : {}),
          ...(options.headers || {}),
          Authorization: `Bearer ${token}`,
        },
      });

      const result = await response.json().catch(() => ({
        ok: false,
        error: "서버 응답을 확인하지 못했습니다.",
      }));

      if (response.status === 401 || response.status === 403) {
        setAuthorized(false);
        throw new Error(
          response.status === 401
            ? "로그인이 필요합니다."
            : "슈퍼관리자 권한이 필요합니다."
        );
      }

      if (!response.ok || result.ok === false) {
        throw new Error(result.error || "요청을 처리하지 못했습니다.");
      }

      return result;
    },
    [getCurrentAccessToken]
  );

  const loadProducts = useCallback(
    async ({ requestedPage = 1, quiet = false } = {}) => {
      if (!quiet) setLoading(true);

      try {
        const params = new URLSearchParams({
          brand: selectedBrand,
          search,
          saleFilter,
          stockFilter,
          page: String(requestedPage),
          limit: String(PAGE_SIZE),
        });

        const result = await apiFetch(
          `/api/super-admin/material-products?${params.toString()}`
        );

        const nextProducts = result.products || [];

        setProducts(nextProducts);
        setBrands(result.brands || []);
        setStats(result.stats || {});
        setPagination(
          result.pagination || {
            page: requestedPage,
            limit: PAGE_SIZE,
            total: 0,
            totalPages: 1,
          }
        );
        setSelectedIds([]);
        setPriceInputs(
          Object.fromEntries(
            nextProducts.map((product) => [
              product.id,
              product.dealer_price_per_m ?? "",
            ])
          )
        );
        setAuthorized(true);
      } catch (error) {
        showMessage(
          error.message || "제품을 불러오지 못했습니다.",
          "error"
        );
      } finally {
        setLoading(false);
      }
    },
    [
      apiFetch,
      selectedBrand,
      search,
      saleFilter,
      stockFilter,
      showMessage,
    ]
  );

  useEffect(() => {
    getCurrentAccessToken()
      .then(() => setAuthorized(true))
      .catch(() => setAuthorized(false));
  }, [getCurrentAccessToken]);

  useEffect(() => {
    if (authorized !== true) return;
    loadProducts({ requestedPage: 1 });
  }, [authorized, loadProducts]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
    }, 400);

    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const allPageSelected = useMemo(
    () =>
      products.length > 0 &&
      products.every((product) => selectedIds.includes(product.id)),
    [products, selectedIds]
  );

  const selectedProducts = useMemo(
    () => products.filter((product) => selectedIds.includes(product.id)),
    [products, selectedIds]
  );

  const busy = saving || rowSavingId !== null;
  const bulkDisabled = busy || selectedIds.length === 0;

  function toggleProduct(id) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    );
  }

  function toggleCurrentPage() {
    const ids = products.map((product) => product.id);

    setSelectedIds((current) =>
      allPageSelected
        ? current.filter((id) => !ids.includes(id))
        : [...new Set([...current, ...ids])]
    );
  }

  async function patchProducts(productIds, changes) {
    if (!productIds.length) {
      showMessage("변경할 제품을 먼저 선택해주세요.", "error");
      return false;
    }

    try {
      const result = await apiFetch(
        "/api/super-admin/material-products",
        {
          method: "PATCH",
          body: JSON.stringify({ productIds, changes }),
        }
      );

      showMessage(result.message || "저장했습니다.");

      await loadProducts({
        requestedPage: pagination.page,
        quiet: true,
      });

      return true;
    } catch (error) {
      showMessage(error.message || "저장하지 못했습니다.", "error");
      return false;
    }
  }

  async function handleBulkChange(changes) {
    if (busy) return false;

    if (!selectedIds.length) {
      showMessage("제품을 먼저 선택해주세요.", "error");
      return false;
    }

    setSaving(true);

    try {
      return await patchProducts(selectedIds, changes);
    } finally {
      setSaving(false);
    }
  }

  async function handleBulkPriceSave() {
    const price = Number(bulkPrice);

    if (!bulkPrice.trim() || !Number.isFinite(price) || price < 0) {
      showMessage("올바른 판매단가를 입력해주세요.", "error");
      return;
    }

    const success = await handleBulkChange({
      dealer_price_per_m: Math.round(price),
    });

    if (success) setBulkPrice("");
  }

  async function handleBulkOrderRuleSave() {
    const minimum = Number(bulkMinimumOrder);
    const unit = Number(bulkOrderUnit);

    if (!Number.isFinite(minimum) || minimum <= 0) {
      showMessage("최소 주문량을 확인해주세요.", "error");
      return;
    }

    if (!Number.isFinite(unit) || unit <= 0) {
      showMessage("주문 단위를 확인해주세요.", "error");
      return;
    }

    await handleBulkChange({
      minimum_order_m: minimum,
      order_unit_m: unit,
    });
  }

  async function handleRowChange(product, changes) {
    if (busy) return;

    setRowSavingId(product.id);

    try {
      await patchProducts([product.id], changes);
    } finally {
      setRowSavingId(null);
    }
  }

  function handleRowPriceSave(product) {
    const input = String(priceInputs[product.id] ?? "");
    const price = Number(input);

    if (!input.trim() || !Number.isFinite(price) || price < 0) {
      showMessage("올바른 판매단가를 입력해주세요.", "error");
      return;
    }

    handleRowChange(product, {
      dealer_price_per_m: Math.round(price),
    });
  }

  function movePage(page) {
    if (
      busy ||
      loading ||
      page < 1 ||
      page > pagination.totalPages ||
      page === pagination.page
    ) {
      return;
    }

    loadProducts({ requestedPage: page });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (authorized === null) {
    return (
      <main style={styles.centerPage}>
        <section style={styles.card}>
          <p style={styles.help}>권한을 확인하고 있습니다.</p>
        </section>
      </main>
    );
  }

  if (authorized === false) {
    return (
      <main style={styles.centerPage}>
        <section style={{ ...styles.card, textAlign: "center" }}>
          <div style={{ fontSize: 40 }}>🔒</div>
          <h1 style={styles.title}>접근할 수 없습니다</h1>
          <p style={styles.help}>
            슈퍼관리자 계정으로 로그인해주세요.
          </p>
          <button
            type="button"
            style={styles.primary}
            onClick={() => router.push("/login")}
          >
            로그인하기
          </button>
        </section>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <div style={styles.container}>
        <header style={styles.header}>
          <button
            type="button"
            style={styles.back}
            onClick={() => router.push("/super-admin")}
            aria-label="슈퍼관리자로 돌아가기"
          >
            ←
          </button>

          <div style={{ flex: 1, minWidth: 0 }}>
            <small style={styles.eyebrow}>필름장이 · 슈퍼관리자</small>
            <h1 style={styles.title}>자재 판매관리</h1>
            <p style={styles.help}>필름 판매단가와 재고를 관리하세요.</p>
          </div>

          <ToolIllustration kind="film" size={54} />
        </header>

        {message && (
          <div
            role="status"
            style={{
              ...styles.message,
              background: messageType === "error" ? "#fff1f2" : "#ecfdf5",
              color: messageType === "error" ? "#b91c1c" : "#047857",
            }}
          >
            {message}
          </div>
        )}

        <section style={styles.stats}>
          {[
            ["전체 제품", stats.total],
            ["판매 가능", stats.available],
            ["판매 중지", stats.unavailable],
            ["품절", stats.soldOut],
          ].map(([label, value]) => (
            <div key={label} style={styles.stat}>
              <span style={styles.help}>{label}</span>
              <strong style={styles.statNumber}>
                {Number(value || 0).toLocaleString("ko-KR")}
              </strong>
            </div>
          ))}
        </section>

        <section style={styles.card}>
          <h2 style={styles.sectionTitle}>필름 찾기</h2>

          <div style={styles.brands}>
            {(brands.length ? brands : ["현대보닥"]).map((brand) => (
              <button
                key={brand}
                type="button"
                disabled={busy}
                aria-pressed={selectedBrand === brand}
                onClick={() => {
                  setSelectedBrand(brand);
                  setSelectedIds([]);
                }}
                style={{
                  ...styles.button,
                  ...(selectedBrand === brand ? styles.selected : {}),
                }}
              >
                {brand}
              </button>
            ))}
          </div>

          <input
            type="search"
            aria-label="제품번호 또는 제품명 검색"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="제품번호 또는 제품명 검색"
            disabled={busy}
            style={{ ...styles.input, marginTop: 16 }}
          />

          <div style={{ ...styles.grid2, marginTop: 10 }}>
            <select
              aria-label="판매상태"
              value={saleFilter}
              disabled={busy}
              onChange={(event) => setSaleFilter(event.target.value)}
              style={styles.input}
            >
              <option value="all">전체 판매상태</option>
              <option value="available">판매 가능</option>
              <option value="unavailable">판매 중지</option>
            </select>

            <select
              aria-label="재고상태"
              value={stockFilter}
              disabled={busy}
              onChange={(event) => setStockFilter(event.target.value)}
              style={styles.input}
            >
              <option value="all">전체 재고상태</option>
              <option value="in_stock">재고 있음</option>
              <option value="sold_out">품절</option>
            </select>
          </div>
        </section>

        <details style={styles.card}>
          <summary style={styles.summary}>
            선택 제품 일괄 변경 · {selectedIds.length}개 선택
          </summary>

          <label style={{ ...styles.checkLabel, marginTop: 18 }}>
            <input
              type="checkbox"
              checked={allPageSelected}
              disabled={busy || loading}
              onChange={toggleCurrentPage}
              style={styles.checkbox}
            />
            현재 페이지 전체 선택
          </label>

          <div style={{ ...styles.grid2, marginTop: 14 }}>
            {[
              ["판매 시작", { is_order_available: true }],
              ["판매 중지", { is_order_available: false }],
              ["재고 있음", { stock_status: "in_stock" }],
              [
                "품절 처리",
                { stock_status: "sold_out", is_order_available: false },
              ],
            ].map(([label, changes]) => (
              <button
                key={label}
                type="button"
                disabled={bulkDisabled}
                style={{
                  ...styles.button,
                  ...(bulkDisabled ? styles.disabled : {}),
                }}
                onClick={() => handleBulkChange(changes)}
              >
                {label}
              </button>
            ))}
          </div>

          <div style={styles.setting}>
            <h3 style={styles.smallTitle}>판매단가 일괄 변경</h3>

            <div style={styles.inputRow}>
              <input
                type="number"
                min="0"
                inputMode="numeric"
                aria-label="일괄 판매단가 원/m"
                value={bulkPrice}
                disabled={busy}
                onChange={(event) => setBulkPrice(event.target.value)}
                placeholder="원/m"
                style={styles.input}
              />

              <button
                type="button"
                disabled={bulkDisabled}
                onClick={handleBulkPriceSave}
                style={{
                  ...styles.primary,
                  ...(bulkDisabled ? styles.disabled : {}),
                }}
              >
                단가 적용
              </button>
            </div>
          </div>

          <div style={styles.setting}>
            <h3 style={styles.smallTitle}>주문조건 변경</h3>

            <div style={styles.grid2}>
              <label style={styles.help}>
                최소 주문량(m)
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  inputMode="decimal"
                  value={bulkMinimumOrder}
                  disabled={busy}
                  onChange={(event) =>
                    setBulkMinimumOrder(event.target.value)
                  }
                  style={{ ...styles.input, marginTop: 6 }}
                />
              </label>

              <label style={styles.help}>
                주문 단위(m)
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  inputMode="decimal"
                  value={bulkOrderUnit}
                  disabled={busy}
                  onChange={(event) =>
                    setBulkOrderUnit(event.target.value)
                  }
                  style={{ ...styles.input, marginTop: 6 }}
                />
              </label>
            </div>

            <button
              type="button"
              disabled={bulkDisabled}
              onClick={handleBulkOrderRuleSave}
              style={{
                ...styles.button,
                width: "100%",
                marginTop: 10,
                ...(bulkDisabled ? styles.disabled : {}),
              }}
            >
              주문조건 적용
            </button>
          </div>

          {selectedProducts.length > 0 && (
            <p style={styles.help}>
              선택 제품:{" "}
              {selectedProducts
                .slice(0, 5)
                .map((product) => product.product_code)
                .join(", ")}
              {selectedProducts.length > 5
                ? ` 외 ${selectedProducts.length - 5}개`
                : ""}
            </p>
          )}
        </details>

        <section>
          <div style={styles.listHeader}>
            <div>
              <h2 style={styles.sectionTitle}>{selectedBrand} 제품</h2>
              <p style={styles.help}>
                총 {Number(pagination.total || 0).toLocaleString("ko-KR")}개
              </p>
            </div>

            <button
              type="button"
              disabled={busy || loading}
              style={styles.button}
              onClick={() =>
                loadProducts({ requestedPage: pagination.page })
              }
            >
              새로고침
            </button>
          </div>

          {loading ? (
            <div style={styles.empty}>제품을 불러오고 있습니다.</div>
          ) : products.length === 0 ? (
            <div style={styles.empty}>조건에 맞는 제품이 없습니다.</div>
          ) : (
            <div style={styles.productList}>
              {products.map((product) => {
                const selected = selectedIds.includes(product.id);
                const rowSaving = rowSavingId === product.id;
                const soldOut = product.stock_status === "sold_out";

                return (
                  <article
                    key={product.id}
                    style={{
                      ...styles.productCard,
                      ...(selected
                        ? { borderColor: "#3478ed", background: "#f5f9ff" }
                        : {}),
                    }}
                  >
                    <div style={styles.productTop}>
                      <label style={styles.checkLabel}>
                        <input
                          type="checkbox"
                          checked={selected}
                          disabled={busy}
                          onChange={() => toggleProduct(product.id)}
                          aria-label={`${product.product_code} 선택`}
                          style={styles.checkbox}
                        />

                        <span
                          style={{
                            ...styles.badge,
                            background: product.is_order_available
                              ? "#eaf3ff"
                              : "#f1f3f6",
                            color: product.is_order_available
                              ? "#3268bd"
                              : "#7b8798",
                          }}
                        >
                          {product.is_order_available
                            ? "판매 가능"
                            : "판매 중지"}
                        </span>
                      </label>

                      <span
                        style={{
                          ...styles.badge,
                          background: soldOut ? "#fff1f2" : "#ecfdf5",
                          color: soldOut ? "#b91c1c" : "#047857",
                        }}
                      >
                        {soldOut ? "품절" : "재고 있음"}
                      </span>
                    </div>

                    <div style={styles.productBody}>
                      <SampleImage product={product} />

                      <div style={{ minWidth: 0 }}>
                        <strong style={styles.productCode}>
                          {product.product_code}
                        </strong>

                        <div style={styles.productName}>
                          {product.product_name}
                        </div>

                        <div style={styles.help}>
                          {product.brand} · {getFlameLabel(product.flame_type)}
                        </div>

                        <div style={styles.help}>
                          최소 {Number(product.minimum_order_m || 1)}m ·{" "}
                          {Number(product.order_unit_m || 1)}m 단위
                        </div>
                      </div>
                    </div>

                    <div style={styles.setting}>
                      <div style={styles.priceHeader}>
                        <strong style={styles.smallTitle}>
                          업체 판매단가
                        </strong>
                        <span style={styles.help}>
                          {product.price_vat_included
                            ? "VAT 포함"
                            : "VAT 별도"}
                        </span>
                      </div>

                      <div style={styles.priceRow}>
                        <input
                          type="number"
                          min="0"
                          inputMode="numeric"
                          aria-label={`${product.product_code} 판매단가`}
                          value={priceInputs[product.id] ?? ""}
                          disabled={busy}
                          onChange={(event) =>
                            setPriceInputs((current) => ({
                              ...current,
                              [product.id]: event.target.value,
                            }))
                          }
                          style={styles.input}
                        />
                        <span style={styles.help}>원/m</span>

                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleRowPriceSave(product)}
                          style={{
                            ...styles.primary,
                            ...(busy ? styles.disabled : {}),
                          }}
                        >
                          {rowSaving ? "저장 중" : "저장"}
                        </button>
                      </div>

                      <p style={{ ...styles.help, fontSize: 11 }}>
                        최초 단가{" "}
                        {formatWon(product.base_dealer_price_per_m)}/m
                      </p>
                    </div>

                    <div style={{ ...styles.grid2, marginTop: 12 }}>
                      <button
                        type="button"
                        disabled={busy}
                        style={{
                          ...styles.button,
                          ...(busy ? styles.disabled : {}),
                        }}
                        onClick={() =>
                          handleRowChange(product, {
                            is_order_available:
                              !product.is_order_available,
                          })
                        }
                      >
                        {product.is_order_available
                          ? "판매 중지"
                          : "판매 시작"}
                      </button>

                      <button
                        type="button"
                        disabled={busy}
                        style={{
                          ...styles.button,
                          color: soldOut ? "#047857" : "#b91c1c",
                          ...(busy ? styles.disabled : {}),
                        }}
                        onClick={() =>
                          handleRowChange(product, {
                            stock_status: soldOut
                              ? "in_stock"
                              : "sold_out",
                          })
                        }
                      >
                        {soldOut ? "재고 있음으로 변경" : "품절 처리"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          <div style={styles.pagination}>
            <button
              type="button"
              disabled={pagination.page <= 1 || loading || busy}
              style={{
                ...styles.button,
                ...(pagination.page <= 1 || loading || busy
                  ? styles.disabled
                  : {}),
              }}
              onClick={() => movePage(pagination.page - 1)}
            >
              이전
            </button>

            <span style={styles.help}>
              <strong>{pagination.page}</strong> / {pagination.totalPages}
            </span>

            <button
              type="button"
              disabled={
                pagination.page >= pagination.totalPages || loading || busy
              }
              style={{
                ...styles.button,
                ...(pagination.page >= pagination.totalPages || loading || busy
                  ? styles.disabled
                  : {}),
              }}
              onClick={() => movePage(pagination.page + 1)}
            >
              다음
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}

function SampleImage({ product }) {
  const imageUrl = getSampleImage(product);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [imageUrl]);

  return (
    <div style={styles.imageWrap}>
      {imageUrl && !failed ? (
        <img
          src={imageUrl}
          alt={`${product.product_code} 샘플`}
          loading="lazy"
          onError={() => setFailed(true)}
          style={styles.productImage}
        />
      ) : (
        <div style={styles.noImage}>이미지 없음</div>
      )}
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "var(--film-bg, #f8f7f3)",
    color: "#243247",
    padding: "24px 16px 60px",
    boxSizing: "border-box",
  },
  container: {
    width: "100%",
    maxWidth: 760,
    margin: "0 auto",
  },
  centerPage: {
    minHeight: "100vh",
    background: "var(--film-bg, #f8f7f3)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    boxSizing: "border-box",
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
    border: "1px solid #dfe6ef",
    borderRadius: 14,
    background: "#ffffff",
    color: "#50617a",
    fontSize: 24,
    cursor: "pointer",
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
  card: {
    padding: 18,
    marginBottom: 16,
    border: "1px solid #e4eaf2",
    borderRadius: 22,
    background: "#ffffff",
    boxShadow: "0 6px 20px rgba(48,77,116,0.04)",
  },
  message: {
    position: "sticky",
    top: 10,
    zIndex: 50,
    padding: 14,
    borderRadius: 16,
    marginBottom: 16,
    fontSize: 13,
    lineHeight: 1.7,
  },
  stats: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 10,
    marginBottom: 16,
  },
  stat: {
    background: "#ffffff",
    border: "1px solid #e4eaf2",
    borderRadius: 18,
    padding: 16,
  },
  statNumber: {
    display: "block",
    marginTop: 6,
    fontSize: 25,
    color: "#3268bd",
  },
  sectionTitle: {
    margin: 0,
    fontSize: 19,
    letterSpacing: "-0.4px",
  },
  brands: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 16,
  },
  button: {
    minHeight: 44,
    padding: "10px 12px",
    border: "1px solid #dfe6ef",
    borderRadius: 14,
    background: "#ffffff",
    color: "#50617a",
    fontSize: 13,
    fontWeight: 800,
    cursor: "pointer",
  },
  primary: {
    minHeight: 44,
    padding: "10px 14px",
    border: "none",
    borderRadius: 14,
    background: "var(--film-blue, #3478ed)",
    color: "#ffffff",
    fontSize: 13,
    fontWeight: 800,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  selected: {
    background: "#eaf3ff",
    color: "#3268bd",
    borderColor: "#3478ed",
  },
  input: {
    width: "100%",
    minWidth: 0,
    height: 46,
    padding: "0 12px",
    border: "1px solid #dfe6ef",
    borderRadius: 13,
    background: "#ffffff",
    color: "#243247",
    fontSize: 16,
    boxSizing: "border-box",
  },
  grid2: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 10,
  },
  summary: {
    cursor: "pointer",
    fontSize: 15,
    fontWeight: 800,
    color: "#3268bd",
    lineHeight: 1.7,
  },
  checkLabel: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    fontWeight: 700,
  },
  checkbox: {
    width: 21,
    height: 21,
    flexShrink: 0,
    accentColor: "#3478ed",
  },
  setting: {
    marginTop: 14,
    padding: 14,
    background: "#f3f7fc",
    borderRadius: 16,
  },
  smallTitle: {
    margin: "0 0 10px",
    fontSize: 13,
    fontWeight: 800,
  },
  inputRow: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    gap: 8,
  },
  listHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    margin: "22px 0 14px",
  },
  empty: {
    padding: "40px 18px",
    background: "#ffffff",
    border: "1px solid #e4eaf2",
    borderRadius: 22,
    textAlign: "center",
    color: "#7b8798",
    fontSize: 14,
  },
  productList: {
    display: "grid",
    gap: 14,
  },
  productCard: {
    background: "#ffffff",
    border: "2px solid #edf1f6",
    borderRadius: 22,
    padding: 16,
    boxShadow: "0 6px 20px rgba(48,77,116,0.04)",
  },
  productTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
  },
  badge: {
    padding: "6px 9px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 800,
  },
  productBody: {
    display: "grid",
    gridTemplateColumns: "80px minmax(0, 1fr)",
    gap: 14,
    alignItems: "center",
  },
  imageWrap: {
    width: 80,
    height: 80,
    borderRadius: 16,
    overflow: "hidden",
    background: "#f1f3f6",
  },
  productImage: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  },
  noImage: {
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#9ca3af",
    fontSize: 11,
  },
  productCode: {
    display: "block",
    fontSize: 21,
    overflowWrap: "anywhere",
  },
  productName: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: 700,
    overflowWrap: "anywhere",
  },
  priceHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 8,
  },
  priceRow: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto auto",
    gap: 7,
    alignItems: "center",
  },
  pagination: {
    display: "grid",
    gridTemplateColumns: "1fr auto 1fr",
    gap: 14,
    alignItems: "center",
    textAlign: "center",
    marginTop: 20,
  },
  disabled: {
    opacity: 0.45,
    cursor: "not-allowed",
  },
};
