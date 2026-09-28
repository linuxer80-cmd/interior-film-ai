"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";

const PAGE_SIZE = 50;

function formatWon(value) {
  const numberValue = Number(value || 0);
  return `${numberValue.toLocaleString("ko-KR")}원`;
}

function getFlameLabel(value) {
  if (value === "flame_retardant") {
    return "방염";
  }

  if (value === "non_flame_retardant") {
    return "비방염";
  }

  return "미분류";
}

function getSampleImage(product) {
  const directUrl =
    product?.sample_image_url ||
    product?.image_url ||
    product?.photo_url ||
    "";

  if (directUrl) {
    return directUrl;
  }

  const originalPath =
    product?.sample_image_path ||
    product?.image_path ||
    "";

  if (!originalPath) {
    return "";
  }

  if (
    originalPath.startsWith("http://") ||
    originalPath.startsWith("https://")
  ) {
    return originalPath;
  }

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || "";

  if (!supabaseUrl) {
    return "";
  }

  let cleanPath = originalPath.replace(/^\/+/, "");

  if (cleanPath.startsWith("film-samples/")) {
    cleanPath = cleanPath.slice("film-samples/".length);
  }

  return (
    `${supabaseUrl}/storage/v1/object/public/` +
    `film-samples/${cleanPath}`
  );
}

export default function SuperAdminMaterialsPage() {
  const router = useRouter();

  const [authorized, setAuthorized] = useState(null);
  const [accessToken, setAccessToken] = useState("");

  const [brands, setBrands] = useState([]);
  const [selectedBrand, setSelectedBrand] =
    useState("현대보닥");

  const [products, setProducts] = useState([]);
  const [stats, setStats] = useState({
    total: 0,
    available: 0,
    unavailable: 0,
    inStock: 0,
    soldOut: 0,
    priceMissing: 0,
  });

  const [pagination, setPagination] = useState({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    totalPages: 1,
  });

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  const [saleFilter, setSaleFilter] = useState("all");
  const [stockFilter, setStockFilter] =
    useState("all");

  const [selectedIds, setSelectedIds] = useState([]);
  const [priceInputs, setPriceInputs] = useState({});

  const [bulkPrice, setBulkPrice] = useState("");
  const [bulkMinimumOrder, setBulkMinimumOrder] =
    useState("1");
  const [bulkOrderUnit, setBulkOrderUnit] =
    useState("1");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rowSavingId, setRowSavingId] =
    useState(null);

  const [message, setMessage] = useState("");
  const [messageType, setMessageType] =
    useState("success");

  const showMessage = useCallback((text, type = "success") => {
    setMessage(text);
    setMessageType(type);

    window.clearTimeout(
      window.__materialAdminMessageTimer,
    );

    window.__materialAdminMessageTimer =
      window.setTimeout(() => {
        setMessage("");
      }, 3500);
  }, []);

  const getCurrentAccessToken = useCallback(async () => {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error || !session?.access_token) {
      throw new Error("로그인이 필요합니다.");
    }

    setAccessToken(session.access_token);
    return session.access_token;
  }, []);

  const apiFetch = useCallback(
    async (url, options = {}) => {
      const token =
        accessToken || (await getCurrentAccessToken());

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

      if (response.status === 401) {
        setAuthorized(false);
        throw new Error("로그인이 필요합니다.");
      }

      if (response.status === 403) {
        setAuthorized(false);
        throw new Error(
          "슈퍼관리자 권한이 필요합니다.",
        );
      }

      if (!response.ok || result.ok === false) {
        throw new Error(
          result.error || "요청을 처리하지 못했습니다.",
        );
      }

      setAuthorized(true);
      return result;
    },
    [accessToken, getCurrentAccessToken],
  );

  const loadProducts = useCallback(
    async ({
      requestedPage = pagination.page,
      quiet = false,
    } = {}) => {
      try {
        if (!quiet) {
          setLoading(true);
        }

        const params = new URLSearchParams({
          brand: selectedBrand,
          search,
          saleFilter,
          stockFilter,
          page: String(requestedPage),
          limit: String(PAGE_SIZE),
        });

        const result = await apiFetch(
          `/api/super-admin/material-products?${params.toString()}`,
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
          },
        );

        setSelectedIds([]);

        const nextPriceInputs = {};

        nextProducts.forEach((product) => {
          nextPriceInputs[product.id] =
            product.dealer_price_per_m ?? "";
        });

        setPriceInputs(nextPriceInputs);
      } catch (error) {
        showMessage(
          error.message ||
            "제품을 불러오지 못했습니다.",
          "error",
        );
      } finally {
        setLoading(false);
      }
    },
    [
      apiFetch,
      pagination.page,
      saleFilter,
      search,
      selectedBrand,
      showMessage,
      stockFilter,
    ],
  );

  useEffect(() => {
    getCurrentAccessToken()
      .then(() => {
        setAuthorized(true);
      })
      .catch(() => {
        setAuthorized(false);
      });
  }, [getCurrentAccessToken]);

  useEffect(() => {
    if (authorized !== true) {
      return;
    }

    loadProducts({
      requestedPage: 1,
    });
  }, [
    authorized,
    selectedBrand,
    search,
    saleFilter,
    stockFilter,
  ]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
    }, 400);

    return () => {
      window.clearTimeout(timer);
    };
  }, [searchInput]);

  const allPageSelected = useMemo(() => {
    return (
      products.length > 0 &&
      products.every((product) =>
        selectedIds.includes(product.id),
      )
    );
  }, [products, selectedIds]);

  const selectedProducts = useMemo(() => {
    return products.filter((product) =>
      selectedIds.includes(product.id),
    );
  }, [products, selectedIds]);

  const selectedCount = selectedIds.length;

  function toggleProduct(productId) {
    setSelectedIds((current) => {
      if (current.includes(productId)) {
        return current.filter((id) => id !== productId);
      }

      return [...current, productId];
    });
  }

  function toggleCurrentPage() {
    if (allPageSelected) {
      const currentPageIds = products.map(
        (product) => product.id,
      );

      setSelectedIds((current) =>
        current.filter(
          (id) => !currentPageIds.includes(id),
        ),
      );

      return;
    }

    setSelectedIds((current) => [
      ...new Set([
        ...current,
        ...products.map((product) => product.id),
      ]),
    ]);
  }

  async function patchProducts(productIds, changes) {
    if (!productIds.length) {
      showMessage(
        "변경할 제품을 먼저 선택해주세요.",
        "error",
      );
      return false;
    }

    try {
      const result = await apiFetch(
        "/api/super-admin/material-products",
        {
          method: "PATCH",
          body: JSON.stringify({
            productIds,
            changes,
          }),
        },
      );

      showMessage(
        result.message || "저장했습니다.",
        "success",
      );

      await loadProducts({
        requestedPage: pagination.page,
        quiet: true,
      });

      return true;
    } catch (error) {
      showMessage(
        error.message || "저장하지 못했습니다.",
        "error",
      );

      return false;
    }
  }

  async function handleBulkChange(changes) {
    if (selectedIds.length === 0) {
      showMessage(
        "제품을 먼저 선택해주세요.",
        "error",
      );
      return;
    }

    setSaving(true);

    try {
      await patchProducts(selectedIds, changes);
    } finally {
      setSaving(false);
    }
  }

  async function handleBulkPriceSave() {
    const price = Number(bulkPrice);

    if (!Number.isFinite(price) || price < 0) {
      showMessage(
        "올바른 판매단가를 입력해주세요.",
        "error",
      );
      return;
    }

    await handleBulkChange({
      dealer_price_per_m: Math.round(price),
    });

    setBulkPrice("");
  }

  async function handleBulkOrderRuleSave() {
    const minimumOrder = Number(bulkMinimumOrder);
    const orderUnit = Number(bulkOrderUnit);

    if (
      !Number.isFinite(minimumOrder) ||
      minimumOrder <= 0
    ) {
      showMessage(
        "최소 주문량을 확인해주세요.",
        "error",
      );
      return;
    }

    if (
      !Number.isFinite(orderUnit) ||
      orderUnit <= 0
    ) {
      showMessage(
        "주문 단위를 확인해주세요.",
        "error",
      );
      return;
    }

    await handleBulkChange({
      minimum_order_m: minimumOrder,
      order_unit_m: orderUnit,
    });
  }

  async function handleRowPriceSave(product) {
    const price = Number(priceInputs[product.id]);

    if (!Number.isFinite(price) || price < 0) {
      showMessage(
        "올바른 판매단가를 입력해주세요.",
        "error",
      );
      return;
    }

    setRowSavingId(product.id);

    try {
      await patchProducts([product.id], {
        dealer_price_per_m: Math.round(price),
      });
    } finally {
      setRowSavingId(null);
    }
  }

  async function handleSaleToggle(product) {
    setRowSavingId(product.id);

    try {
      await patchProducts([product.id], {
        is_order_available:
          !product.is_order_available,
      });
    } finally {
      setRowSavingId(null);
    }
  }

  async function handleStockToggle(product) {
    setRowSavingId(product.id);

    try {
      await patchProducts([product.id], {
        stock_status:
          product.stock_status === "sold_out"
            ? "in_stock"
            : "sold_out",
      });
    } finally {
      setRowSavingId(null);
    }
  }

  function movePage(nextPage) {
    if (
      nextPage < 1 ||
      nextPage > pagination.totalPages ||
      nextPage === pagination.page
    ) {
      return;
    }

    loadProducts({
      requestedPage: nextPage,
    });

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  if (authorized === null) {
    return (
      <main style={styles.centerPage}>
        <div style={styles.loader} />
        <p style={styles.centerText}>
          권한을 확인하고 있습니다.
        </p>
      </main>
    );
  }

  if (authorized === false) {
    return (
      <main style={styles.centerPage}>
        <div style={styles.deniedCard}>
          <div style={styles.deniedIcon}>🔒</div>

          <h1 style={styles.deniedTitle}>
            접근할 수 없습니다
          </h1>

          <p style={styles.deniedText}>
            슈퍼관리자 계정으로 로그인해주세요.
          </p>

          <button
            type="button"
            style={styles.primaryButton}
            onClick={() => router.push("/login")}
          >
            로그인하기
          </button>
        </div>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <button
          type="button"
          style={styles.backButton}
          onClick={() => router.push("/super-admin")}
          aria-label="슈퍼관리자로 돌아가기"
        >
          ←
        </button>

        <div style={styles.headerText}>
          <div style={styles.headerBadge}>
            슈퍼관리자
          </div>

          <h1 style={styles.title}>자재 판매관리</h1>

          <p style={styles.subtitle}>
            판매할 필름과 업체 판매단가를 관리합니다.
          </p>
        </div>
      </header>

      {message ? (
        <div
          style={{
            ...styles.message,
            ...(messageType === "error"
              ? styles.errorMessage
              : styles.successMessage),
          }}
        >
          {message}
        </div>
      ) : null}

      <section style={styles.statsGrid}>
        <div style={styles.statCard}>
          <span style={styles.statLabel}>전체 제품</span>
          <strong style={styles.statNumber}>
            {Number(stats.total || 0).toLocaleString()}
          </strong>
        </div>

        <div style={styles.statCard}>
          <span style={styles.statLabel}>판매 가능</span>
          <strong
            style={{
              ...styles.statNumber,
              color: "#6d28d9",
            }}
          >
            {Number(
              stats.available || 0,
            ).toLocaleString()}
          </strong>
        </div>

        <div style={styles.statCard}>
          <span style={styles.statLabel}>판매 중지</span>
          <strong style={styles.statNumber}>
            {Number(
              stats.unavailable || 0,
            ).toLocaleString()}
          </strong>
        </div>

        <div style={styles.statCard}>
          <span style={styles.statLabel}>품절</span>
          <strong
            style={{
              ...styles.statNumber,
              color: "#dc2626",
            }}
          >
            {Number(
              stats.soldOut || 0,
            ).toLocaleString()}
          </strong>
        </div>
      </section>

      <section style={styles.controlCard}>
        <div style={styles.fieldGroup}>
          <label style={styles.label}>
            1. 제조사 선택
          </label>

          <div style={styles.brandGrid}>
            {(brands.length
              ? brands
              : ["현대보닥"]
            ).map((brand) => {
              const active = selectedBrand === brand;

              return (
                <button
                  key={brand}
                  type="button"
                  style={{
                    ...styles.brandButton,
                    ...(active
                      ? styles.brandButtonActive
                      : {}),
                  }}
                  onClick={() => {
                    setSelectedBrand(brand);
                    setSelectedIds([]);
                  }}
                >
                  {brand}
                </button>
              );
            })}
          </div>
        </div>

        <div style={styles.fieldGroup}>
          <label
            htmlFor="material-search"
            style={styles.label}
          >
            2. 제품 검색
          </label>

          <input
            id="material-search"
            type="search"
            value={searchInput}
            onChange={(event) =>
              setSearchInput(event.target.value)
            }
            placeholder="제품번호 또는 제품명 검색"
            style={styles.searchInput}
          />
        </div>

        <div style={styles.filterGrid}>
          <select
            value={saleFilter}
            onChange={(event) =>
              setSaleFilter(event.target.value)
            }
            style={styles.select}
          >
            <option value="all">전체 판매상태</option>
            <option value="available">판매 가능</option>
            <option value="unavailable">
              판매 중지
            </option>
          </select>

          <select
            value={stockFilter}
            onChange={(event) =>
              setStockFilter(event.target.value)
            }
            style={styles.select}
          >
            <option value="all">전체 재고상태</option>
            <option value="in_stock">재고 있음</option>
            <option value="sold_out">품절</option>
          </select>
        </div>
      </section>

      <section style={styles.bulkCard}>
        <div style={styles.bulkHeader}>
          <label style={styles.selectAllLabel}>
            <input
              type="checkbox"
              checked={allPageSelected}
              onChange={toggleCurrentPage}
              style={styles.checkbox}
            />

            <span>현재 페이지 전체 선택</span>
          </label>

          <strong style={styles.selectedCount}>
            {selectedCount}개 선택
          </strong>
        </div>

        <div style={styles.actionGrid}>
          <button
            type="button"
            disabled={saving || selectedCount === 0}
            style={{
              ...styles.actionButton,
              ...styles.saleButton,
              ...(saving || selectedCount === 0
                ? styles.disabledButton
                : {}),
            }}
            onClick={() =>
              handleBulkChange({
                is_order_available: true,
              })
            }
          >
            선택 제품 판매
          </button>

          <button
            type="button"
            disabled={saving || selectedCount === 0}
            style={{
              ...styles.actionButton,
              ...styles.stopButton,
              ...(saving || selectedCount === 0
                ? styles.disabledButton
                : {}),
            }}
            onClick={() =>
              handleBulkChange({
                is_order_available: false,
              })
            }
          >
            판매 중지
          </button>

          <button
            type="button"
            disabled={saving || selectedCount === 0}
            style={{
              ...styles.actionButton,
              ...(saving || selectedCount === 0
                ? styles.disabledButton
                : {}),
            }}
            onClick={() =>
              handleBulkChange({
                stock_status: "in_stock",
              })
            }
          >
            재고 있음
          </button>

          <button
            type="button"
            disabled={saving || selectedCount === 0}
            style={{
              ...styles.actionButton,
              ...(saving || selectedCount === 0
                ? styles.disabledButton
                : {}),
            }}
            onClick={() =>
              handleBulkChange({
                stock_status: "sold_out",
                is_order_available: false,
              })
            }
          >
            품절 처리
          </button>
        </div>

        <div style={styles.bulkSettingBox}>
          <div style={styles.bulkSettingTitle}>
            선택 제품 단가 일괄 변경
          </div>

          <div style={styles.inputButtonRow}>
            <input
              type="number"
              min="0"
              inputMode="numeric"
              value={bulkPrice}
              onChange={(event) =>
                setBulkPrice(event.target.value)
              }
              placeholder="원/m"
              style={styles.numberInput}
            />

            <button
              type="button"
              disabled={saving || selectedCount === 0}
              style={{
                ...styles.smallPrimaryButton,
                ...(saving || selectedCount === 0
                  ? styles.disabledButton
                  : {}),
              }}
              onClick={handleBulkPriceSave}
            >
              단가 적용
            </button>
          </div>
        </div>

        <div style={styles.bulkSettingBox}>
          <div style={styles.bulkSettingTitle}>
            선택 제품 주문조건 변경
          </div>

          <div style={styles.orderRuleGrid}>
            <label style={styles.smallField}>
              <span style={styles.smallLabel}>
                최소 주문
              </span>

              <div style={styles.unitInputWrap}>
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  inputMode="decimal"
                  value={bulkMinimumOrder}
                  onChange={(event) =>
                    setBulkMinimumOrder(
                      event.target.value,
                    )
                  }
                  style={styles.unitInput}
                />
                <span style={styles.inputUnit}>m</span>
              </div>
            </label>

            <label style={styles.smallField}>
              <span style={styles.smallLabel}>
                주문 단위
              </span>

              <div style={styles.unitInputWrap}>
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  inputMode="decimal"
                  value={bulkOrderUnit}
                  onChange={(event) =>
                    setBulkOrderUnit(event.target.value)
                  }
                  style={styles.unitInput}
                />
                <span style={styles.inputUnit}>m</span>
              </div>
            </label>
          </div>

          <button
            type="button"
            disabled={saving || selectedCount === 0}
            style={{
              ...styles.fullSecondaryButton,
              ...(saving || selectedCount === 0
                ? styles.disabledButton
                : {}),
            }}
            onClick={handleBulkOrderRuleSave}
          >
            주문조건 적용
          </button>
        </div>

        {selectedProducts.length > 0 ? (
          <div style={styles.selectedPreview}>
            선택 제품:{" "}
            {selectedProducts
              .slice(0, 5)
              .map((product) => product.product_code)
              .join(", ")}
            {selectedProducts.length > 5
              ? ` 외 ${selectedProducts.length - 5}개`
              : ""}
          </div>
        ) : null}
      </section>

      <section style={styles.listSection}>
        <div style={styles.listHeader}>
          <div>
            <h2 style={styles.listTitle}>
              {selectedBrand} 제품
            </h2>

            <p style={styles.listDescription}>
              총{" "}
              {Number(
                pagination.total || 0,
              ).toLocaleString()}
              개
            </p>
          </div>

          <button
            type="button"
            style={styles.refreshButton}
            onClick={() =>
              loadProducts({
                requestedPage: pagination.page,
              })
            }
          >
            새로고침
          </button>
        </div>

        {loading ? (
          <div style={styles.loadingCard}>
            <div style={styles.loader} />
            <p style={styles.centerText}>
              제품을 불러오고 있습니다.
            </p>
          </div>
        ) : products.length === 0 ? (
          <div style={styles.emptyCard}>
            조건에 맞는 제품이 없습니다.
          </div>
        ) : (
          <div style={styles.productList}>
            {products.map((product) => {
              const imageUrl = getSampleImage(product);
              const isRowSaving =
                rowSavingId === product.id;

              return (
                <article
                  key={product.id}
                  style={{
                    ...styles.productCard,
                    ...(selectedIds.includes(product.id)
                      ? styles.selectedProductCard
                      : {}),
                  }}
                >
                  <div style={styles.productTop}>
                    <label style={styles.productCheckLabel}>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(
                          product.id,
                        )}
                        onChange={() =>
                          toggleProduct(product.id)
                        }
                        style={styles.checkbox}
                      />

                      <span
                        style={{
                          ...styles.saleStatus,
                          ...(product.is_order_available
                            ? styles.saleStatusOn
                            : styles.saleStatusOff),
                        }}
                      >
                        {product.is_order_available
                          ? "판매 가능"
                          : "판매 중지"}
                      </span>
                    </label>

                    <span
                      style={{
                        ...styles.stockBadge,
                        ...(product.stock_status ===
                        "sold_out"
                          ? styles.soldOutBadge
                          : styles.inStockBadge),
                      }}
                    >
                      {product.stock_status === "sold_out"
                        ? "품절"
                        : "재고 있음"}
                    </span>
                  </div>

                  <div style={styles.productBody}>
                    <div style={styles.imageWrap}>
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt={`${product.product_code} 샘플`}
                          style={styles.productImage}
                          loading="lazy"
                        />
                      ) : (
                        <div style={styles.noImage}>
                          이미지 없음
                        </div>
                      )}
                    </div>

                    <div style={styles.productInfo}>
                      <strong style={styles.productCode}>
                        {product.product_code}
                      </strong>

                      <div style={styles.productName}>
                        {product.product_name ||
                          product.color_description ||
                          "제품명 없음"}
                      </div>

                      <div style={styles.productMeta}>
                        {getFlameLabel(
                          product.flame_type,
                        )}
                        {" · "}
                        {product.category ||
                          product.pattern_group ||
                          product.texture ||
                          "분류 없음"}
                      </div>

                      <div style={styles.productMeta}>
                        최소{" "}
                        {Number(
                          product.minimum_order_m || 1,
                        )}
                        m
                        {" · "}
                        {Number(product.order_unit_m || 1)}
                        m 단위
                      </div>
                    </div>
                  </div>

                  <div style={styles.priceBox}>
                    <div style={styles.priceHeader}>
                      <span style={styles.priceLabel}>
                        업체 판매단가
                      </span>

                      <span style={styles.vatText}>
                        {product.price_vat_included
                          ? "VAT 포함"
                          : "VAT 별도"}
                      </span>
                    </div>

                    <div style={styles.priceInputRow}>
                      <input
                        type="number"
                        min="0"
                        inputMode="numeric"
                        value={
                          priceInputs[product.id] ?? ""
                        }
                        onChange={(event) =>
                          setPriceInputs((current) => ({
                            ...current,
                            [product.id]:
                              event.target.value,
                          }))
                        }
                        style={styles.rowPriceInput}
                      />

                      <span style={styles.priceUnit}>
                        원/m
                      </span>

                      <button
                        type="button"
                        disabled={isRowSaving}
                        style={{
                          ...styles.rowSaveButton,
                          ...(isRowSaving
                            ? styles.disabledButton
                            : {}),
                        }}
                        onClick={() =>
                          handleRowPriceSave(product)
                        }
                      >
                        {isRowSaving ? "저장 중" : "단가 저장"}
                      </button>
                    </div>

                    <div style={styles.basePrice}>
                      최초 단가{" "}
                      {formatWon(
                        product.base_dealer_price_per_m,
                      )}
                      /m
                    </div>
                  </div>

                  <div style={styles.rowActions}>
                    <button
                      type="button"
                      disabled={isRowSaving}
                      style={{
                        ...styles.rowActionButton,
                        ...(product.is_order_available
                          ? styles.rowStopButton
                          : styles.rowSaleButton),
                        ...(isRowSaving
                          ? styles.disabledButton
                          : {}),
                      }}
                      onClick={() =>
                        handleSaleToggle(product)
                      }
                    >
                      {product.is_order_available
                        ? "판매 중지"
                        : "판매 시작"}
                    </button>

                    <button
                      type="button"
                      disabled={isRowSaving}
                      style={{
                        ...styles.rowActionButton,
                        ...(product.stock_status ===
                        "sold_out"
                          ? styles.rowStockButton
                          : styles.rowSoldOutButton),
                        ...(isRowSaving
                          ? styles.disabledButton
                          : {}),
                      }}
                      onClick={() =>
                        handleStockToggle(product)
                      }
                    >
                      {product.stock_status === "sold_out"
                        ? "재고 있음으로 변경"
                        : "품절 처리"}
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
            disabled={pagination.page <= 1 || loading}
            style={{
              ...styles.pageButton,
              ...(pagination.page <= 1 || loading
                ? styles.disabledButton
                : {}),
            }}
            onClick={() =>
              movePage(pagination.page - 1)
            }
          >
            이전
          </button>

          <div style={styles.pageInfo}>
            <strong>{pagination.page}</strong>
            <span> / {pagination.totalPages}</span>
          </div>

          <button
            type="button"
            disabled={
              pagination.page >=
                pagination.totalPages || loading
            }
            style={{
              ...styles.pageButton,
              ...(pagination.page >=
                pagination.totalPages || loading
                ? styles.disabledButton
                : {}),
            }}
            onClick={() =>
              movePage(pagination.page + 1)
            }
          >
            다음
          </button>
        </div>
      </section>

      <div style={styles.bottomSpace} />
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#f6f7fb",
    color: "#111827",
    padding: "20px 16px 40px",
  },

  centerPage: {
    minHeight: "100vh",
    background: "#f6f7fb",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px",
  },

  centerText: {
    margin: "12px 0 0",
    color: "#6b7280",
    fontSize: "14px",
  },

  loader: {
    width: "32px",
    height: "32px",
    border: "4px solid #e5e7eb",
    borderTopColor: "#6d28d9",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },

  deniedCard: {
    width: "100%",
    maxWidth: "420px",
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: "24px",
    padding: "32px 24px",
    textAlign: "center",
  },

  deniedIcon: {
    fontSize: "42px",
  },

  deniedTitle: {
    margin: "16px 0 8px",
    fontSize: "24px",
  },

  deniedText: {
    margin: "0 0 24px",
    color: "#6b7280",
  },

  header: {
    maxWidth: "760px",
    margin: "0 auto 20px",
    display: "flex",
    alignItems: "flex-start",
    gap: "12px",
  },

  backButton: {
    width: "44px",
    height: "44px",
    flexShrink: 0,
    border: "1px solid #d1d5db",
    borderRadius: "14px",
    background: "#ffffff",
    fontSize: "24px",
    fontWeight: 800,
    cursor: "pointer",
  },

  headerText: {
    minWidth: 0,
  },

  headerBadge: {
    display: "inline-flex",
    padding: "6px 10px",
    borderRadius: "999px",
    background: "#111827",
    color: "#ffffff",
    fontSize: "12px",
    fontWeight: 800,
  },

  title: {
    margin: "10px 0 4px",
    fontSize: "30px",
    lineHeight: 1.2,
  },

  subtitle: {
    margin: 0,
    color: "#6b7280",
    fontSize: "14px",
    lineHeight: 1.5,
  },

  message: {
    position: "sticky",
    top: "10px",
    zIndex: 50,
    maxWidth: "760px",
    margin: "0 auto 16px",
    padding: "14px 16px",
    borderRadius: "14px",
    fontSize: "14px",
    fontWeight: 800,
    boxShadow: "0 10px 24px rgba(0,0,0,0.12)",
  },

  successMessage: {
    background: "#ecfdf5",
    border: "1px solid #a7f3d0",
    color: "#047857",
  },

  errorMessage: {
    background: "#fef2f2",
    border: "1px solid #fecaca",
    color: "#b91c1c",
  },

  statsGrid: {
    maxWidth: "760px",
    margin: "0 auto 16px",
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "10px",
  },

  statCard: {
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: "18px",
    padding: "16px",
  },

  statLabel: {
    display: "block",
    color: "#6b7280",
    fontSize: "12px",
    fontWeight: 700,
  },

  statNumber: {
    display: "block",
    marginTop: "6px",
    fontSize: "24px",
  },

  controlCard: {
    maxWidth: "760px",
    margin: "0 auto 16px",
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: "22px",
    padding: "18px",
  },

  fieldGroup: {
    marginBottom: "18px",
  },

  label: {
    display: "block",
    marginBottom: "10px",
    fontSize: "15px",
    fontWeight: 900,
  },

  brandGrid: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
  },

  brandButton: {
    border: "1px solid #d1d5db",
    borderRadius: "999px",
    background: "#ffffff",
    color: "#374151",
    padding: "11px 15px",
    fontSize: "14px",
    fontWeight: 800,
    cursor: "pointer",
  },

  brandButtonActive: {
    borderColor: "#6d28d9",
    background: "#6d28d9",
    color: "#ffffff",
  },

  searchInput: {
    width: "100%",
    height: "48px",
    border: "1px solid #d1d5db",
    borderRadius: "14px",
    padding: "0 15px",
    fontSize: "16px",
    outline: "none",
    boxSizing: "border-box",
  },

  filterGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "10px",
  },

  select: {
    width: "100%",
    height: "46px",
    border: "1px solid #d1d5db",
    borderRadius: "13px",
    background: "#ffffff",
    padding: "0 10px",
    fontSize: "14px",
    fontWeight: 700,
  },

  bulkCard: {
    maxWidth: "760px",
    margin: "0 auto 16px",
    background: "#ffffff",
    border: "2px solid #ddd6fe",
    borderRadius: "22px",
    padding: "18px",
  },

  bulkHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    marginBottom: "14px",
  },

  selectAllLabel: {
    display: "flex",
    alignItems: "center",
    gap: "9px",
    fontSize: "14px",
    fontWeight: 800,
  },

  checkbox: {
    width: "21px",
    height: "21px",
    accentColor: "#6d28d9",
  },

  selectedCount: {
    color: "#6d28d9",
    fontSize: "14px",
  },

  actionGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "8px",
  },

  actionButton: {
    minHeight: "44px",
    border: "1px solid #d1d5db",
    borderRadius: "12px",
    background: "#ffffff",
    color: "#374151",
    fontWeight: 800,
    cursor: "pointer",
  },

  saleButton: {
    borderColor: "#6d28d9",
    background: "#6d28d9",
    color: "#ffffff",
  },

  stopButton: {
    borderColor: "#e5e7eb",
    background: "#f3f4f6",
  },

  bulkSettingBox: {
    marginTop: "14px",
    padding: "14px",
    background: "#f9fafb",
    borderRadius: "15px",
  },

  bulkSettingTitle: {
    marginBottom: "10px",
    fontSize: "13px",
    fontWeight: 900,
  },

  inputButtonRow: {
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: "8px",
  },

  numberInput: {
    width: "100%",
    height: "44px",
    border: "1px solid #d1d5db",
    borderRadius: "12px",
    padding: "0 12px",
    fontSize: "16px",
    boxSizing: "border-box",
  },

  smallPrimaryButton: {
    minWidth: "92px",
    border: "none",
    borderRadius: "12px",
    background: "#111827",
    color: "#ffffff",
    padding: "0 14px",
    fontWeight: 800,
    cursor: "pointer",
  },

  orderRuleGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "10px",
  },

  smallField: {
    display: "block",
  },

  smallLabel: {
    display: "block",
    marginBottom: "6px",
    color: "#6b7280",
    fontSize: "12px",
    fontWeight: 800,
  },

  unitInputWrap: {
    display: "flex",
    alignItems: "center",
    border: "1px solid #d1d5db",
    borderRadius: "12px",
    background: "#ffffff",
    overflow: "hidden",
  },

  unitInput: {
    width: "100%",
    height: "42px",
    border: "none",
    padding: "0 10px",
    fontSize: "15px",
    outline: "none",
  },

  inputUnit: {
    paddingRight: "12px",
    color: "#6b7280",
    fontWeight: 800,
  },

  fullSecondaryButton: {
    width: "100%",
    height: "44px",
    marginTop: "10px",
    border: "1px solid #6d28d9",
    borderRadius: "12px",
    background: "#ffffff",
    color: "#6d28d9",
    fontWeight: 900,
    cursor: "pointer",
  },

  selectedPreview: {
    marginTop: "12px",
    color: "#6b7280",
    fontSize: "12px",
    lineHeight: 1.5,
  },

  listSection: {
    maxWidth: "760px",
    margin: "0 auto",
  },

  listHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    marginBottom: "12px",
  },

  listTitle: {
    margin: 0,
    fontSize: "21px",
  },

  listDescription: {
    margin: "4px 0 0",
    color: "#6b7280",
    fontSize: "13px",
  },

  refreshButton: {
    border: "1px solid #d1d5db",
    borderRadius: "12px",
    background: "#ffffff",
    padding: "10px 13px",
    color: "#374151",
    fontWeight: 800,
    cursor: "pointer",
  },

  loadingCard: {
    minHeight: "220px",
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: "20px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
  },

  emptyCard: {
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: "20px",
    padding: "50px 20px",
    color: "#6b7280",
    textAlign: "center",
  },

  productList: {
    display: "grid",
    gap: "12px",
  },

  productCard: {
    background: "#ffffff",
    border: "2px solid transparent",
    borderRadius: "20px",
    padding: "15px",
    boxShadow: "0 3px 12px rgba(17,24,39,0.05)",
  },

  selectedProductCard: {
    borderColor: "#7c3aed",
    background: "#fdfcff",
  },

  productTop: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
    marginBottom: "13px",
  },

  productCheckLabel: {
    display: "flex",
    alignItems: "center",
    gap: "9px",
  },

  saleStatus: {
    padding: "6px 9px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: 900,
  },

  saleStatusOn: {
    background: "#ede9fe",
    color: "#6d28d9",
  },

  saleStatusOff: {
    background: "#f3f4f6",
    color: "#6b7280",
  },

  stockBadge: {
    padding: "6px 9px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: 900,
  },

  inStockBadge: {
    background: "#ecfdf5",
    color: "#047857",
  },

  soldOutBadge: {
    background: "#fef2f2",
    color: "#dc2626",
  },

  productBody: {
    display: "grid",
    gridTemplateColumns: "86px 1fr",
    gap: "13px",
    alignItems: "center",
  },

  imageWrap: {
    width: "86px",
    height: "86px",
    borderRadius: "14px",
    overflow: "hidden",
    background: "#f3f4f6",
  },

  productImage: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },

  noImage: {
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#9ca3af",
    fontSize: "11px",
    textAlign: "center",
  },

  productInfo: {
    minWidth: 0,
  },

  productCode: {
    display: "block",
    fontSize: "20px",
    wordBreak: "break-word",
  },

  productName: {
    marginTop: "4px",
    color: "#374151",
    fontSize: "14px",
    fontWeight: 700,
    lineHeight: 1.4,
  },

  productMeta: {
    marginTop: "5px",
    color: "#6b7280",
    fontSize: "12px",
    lineHeight: 1.4,
  },

  priceBox: {
    marginTop: "14px",
    padding: "13px",
    background: "#f9fafb",
    borderRadius: "14px",
  },

  priceHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: "10px",
    marginBottom: "8px",
  },

  priceLabel: {
    fontSize: "13px",
    fontWeight: 900,
  },

  vatText: {
    color: "#6b7280",
    fontSize: "12px",
    fontWeight: 700,
  },

  priceInputRow: {
    display: "grid",
    gridTemplateColumns: "1fr auto auto",
    alignItems: "center",
    gap: "7px",
  },

  rowPriceInput: {
    width: "100%",
    height: "42px",
    border: "1px solid #d1d5db",
    borderRadius: "11px",
    padding: "0 10px",
    fontSize: "16px",
    fontWeight: 800,
    boxSizing: "border-box",
  },

  priceUnit: {
    color: "#6b7280",
    fontSize: "12px",
    fontWeight: 800,
  },

  rowSaveButton: {
    height: "42px",
    border: "none",
    borderRadius: "11px",
    background: "#111827",
    color: "#ffffff",
    padding: "0 12px",
    fontWeight: 800,
    cursor: "pointer",
  },

  basePrice: {
    marginTop: "8px",
    color: "#9ca3af",
    fontSize: "11px",
  },

  rowActions: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "8px",
    marginTop: "12px",
  },

  rowActionButton: {
    minHeight: "43px",
    borderRadius: "12px",
    fontWeight: 900,
    cursor: "pointer",
  },

  rowSaleButton: {
    border: "1px solid #6d28d9",
    background: "#6d28d9",
    color: "#ffffff",
  },

  rowStopButton: {
    border: "1px solid #d1d5db",
    background: "#ffffff",
    color: "#374151",
  },

  rowStockButton: {
    border: "1px solid #059669",
    background: "#ecfdf5",
    color: "#047857",
  },

  rowSoldOutButton: {
    border: "1px solid #fecaca",
    background: "#fef2f2",
    color: "#b91c1c",
  },

  pagination: {
    display: "grid",
    gridTemplateColumns: "1fr auto 1fr",
    alignItems: "center",
    gap: "12px",
    marginTop: "18px",
  },

  pageButton: {
    height: "46px",
    border: "1px solid #d1d5db",
    borderRadius: "13px",
    background: "#ffffff",
    color: "#111827",
    fontWeight: 900,
    cursor: "pointer",
  },

  pageInfo: {
    minWidth: "70px",
    textAlign: "center",
    fontSize: "14px",
  },

  primaryButton: {
    width: "100%",
    height: "48px",
    border: "none",
    borderRadius: "14px",
    background: "#111827",
    color: "#ffffff",
    fontSize: "15px",
    fontWeight: 900,
    cursor: "pointer",
  },

  disabledButton: {
    opacity: 0.45,
    cursor: "not-allowed",
  },

  bottomSpace: {
    height: "40px",
  },
};
