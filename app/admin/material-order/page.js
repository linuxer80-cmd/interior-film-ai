"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";

const PAGE_SIZE = 40;

function formatWon(value) {
  return `${Number(value || 0).toLocaleString(
    "ko-KR",
  )}원`;
}

function getSampleImage(product) {
  const directUrl =
    product?.sample_image_url ||
    product?.image_url ||
    "";

  if (directUrl) {
    return directUrl;
  }

  let path =
    product?.sample_image_path ||
    product?.image_path ||
    "";

  if (!path) {
    return "";
  }

  if (
    path.startsWith("http://") ||
    path.startsWith("https://")
  ) {
    return path;
  }

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || "";

  path = path.replace(/^\/+/, "");

  if (path.startsWith("film-samples/")) {
    path = path.slice("film-samples/".length);
  }

  return (
    `${supabaseUrl}/storage/v1/object/public/` +
    `film-samples/${path}`
  );
}

function calculateAmounts(product, quantityM) {
  const unitPrice = Number(
    product?.dealer_price_per_m || 0,
  );

  const quantity = Number(quantityM || 0);

  if (product?.price_vat_included === true) {
    const total = Math.round(unitPrice * quantity);
    const supply = Math.round(total / 1.1);

    return {
      supply,
      vat: total - supply,
      total,
    };
  }

  const supply = Math.round(unitPrice * quantity);
  const vat = Math.round(supply * 0.1);

  return {
    supply,
    vat,
    total: supply + vat,
  };
}

function emptyAddressForm() {
  return {
    address_name: "기본 배송지",
    recipient_name: "",
    recipient_phone: "",
    postal_code: "",
    address_line1: "",
    address_line2: "",
    delivery_note: "",
    is_default: true,
  };
}

export default function MaterialOrderPage() {
  const router = useRouter();

  const [accessToken, setAccessToken] = useState("");
  const [authorized, setAuthorized] = useState(null);

  const [products, setProducts] = useState([]);
  const [brands, setBrands] = useState([]);
  const [selectedBrand, setSelectedBrand] =
    useState("");

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  const [pagination, setPagination] = useState({
    page: 1,
    total: 0,
    totalPages: 1,
  });

  const [cart, setCart] = useState([]);

  const [addresses, setAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] =
    useState("");

  const [showAddressForm, setShowAddressForm] =
    useState(false);

  const [addressForm, setAddressForm] = useState(
    emptyAddressForm(),
  );

  const [deliveryNote, setDeliveryNote] =
    useState("");

  const [loadingProducts, setLoadingProducts] =
    useState(true);

  const [loadingAddresses, setLoadingAddresses] =
    useState(true);

  const [savingAddress, setSavingAddress] =
    useState(false);

  const [ordering, setOrdering] = useState(false);

  const [message, setMessage] = useState("");
  const [messageType, setMessageType] =
    useState("success");

  const showMessage = useCallback(
    (text, type = "success") => {
      setMessage(text);
      setMessageType(type);

      window.clearTimeout(
        window.__materialOrderMessageTimer,
      );

      window.__materialOrderMessageTimer =
        window.setTimeout(() => {
          setMessage("");
        }, 4000);
    },
    [],
  );

  const getToken = useCallback(async () => {
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
        accessToken || (await getToken());

      const response = await fetch(url, {
        ...options,
        cache: "no-store",
        headers: {
          ...(options.body
            ? {
                "Content-Type":
                  "application/json",
              }
            : {}),

          ...(options.headers || {}),

          Authorization: `Bearer ${token}`,
        },
      });

      const result = await response
        .json()
        .catch(() => ({
          ok: false,
          error:
            "서버 응답을 확인하지 못했습니다.",
        }));

      if (response.status === 401) {
        setAuthorized(false);
      }

      if (!response.ok || result.ok === false) {
        const error = new Error(
          result.error ||
            "요청을 처리하지 못했습니다.",
        );

        error.code = result.code;
        error.result = result;

        throw error;
      }

      setAuthorized(true);
      return result;
    },
    [accessToken, getToken],
  );

  const loadProducts = useCallback(
    async (page = 1) => {
      try {
        setLoadingProducts(true);

        const params = new URLSearchParams({
          brand: selectedBrand,
          search,
          page: String(page),
          limit: String(PAGE_SIZE),
        });

        const result = await apiFetch(
          `/api/admin/material-products?${params.toString()}`,
        );

        setProducts(result.products || []);
        setBrands(result.brands || []);

        setPagination(
          result.pagination || {
            page,
            total: 0,
            totalPages: 1,
          },
        );
      } catch (error) {
        showMessage(
          error.message ||
            "판매 제품을 불러오지 못했습니다.",
          "error",
        );
      } finally {
        setLoadingProducts(false);
      }
    },
    [
      apiFetch,
      search,
      selectedBrand,
      showMessage,
    ],
  );

  const loadAddresses = useCallback(async () => {
    try {
      setLoadingAddresses(true);

      const result = await apiFetch(
        "/api/admin/material-addresses",
      );

      const nextAddresses =
        result.addresses || [];

      setAddresses(nextAddresses);

      const selectedStillExists =
        nextAddresses.some(
          (address) =>
            address.id === selectedAddressId,
        );

      if (!selectedStillExists) {
        const defaultAddress =
          nextAddresses.find(
            (address) => address.is_default,
          ) || nextAddresses[0];

        setSelectedAddressId(
          defaultAddress?.id || "",
        );
      }

      if (nextAddresses.length === 0) {
        setShowAddressForm(true);
      }
    } catch (error) {
      showMessage(
        error.message ||
          "배송지를 불러오지 못했습니다.",
        "error",
      );
    } finally {
      setLoadingAddresses(false);
    }
  }, [
    apiFetch,
    selectedAddressId,
    showMessage,
  ]);

  useEffect(() => {
    getToken()
      .then(() => {
        setAuthorized(true);
      })
      .catch(() => {
        setAuthorized(false);
      });
  }, [getToken]);

  useEffect(() => {
    if (authorized !== true) {
      return;
    }

    loadProducts(1);
    loadAddresses();
  }, [authorized]);

  useEffect(() => {
    if (authorized !== true) {
      return;
    }

    loadProducts(1);
  }, [selectedBrand, search]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
    }, 400);

    return () => {
      window.clearTimeout(timer);
    };
  }, [searchInput]);

  const cartTotals = useMemo(() => {
    return cart.reduce(
      (result, item) => {
        const amounts = calculateAmounts(
          item.product,
          item.quantityM,
        );

        result.supply += amounts.supply;
        result.vat += amounts.vat;
        result.total += amounts.total;
        result.quantity += Number(
          item.quantityM || 0,
        );

        return result;
      },
      {
        supply: 0,
        vat: 0,
        total: 0,
        quantity: 0,
      },
    );
  }, [cart]);

  const selectedAddress = useMemo(() => {
    return addresses.find(
      (address) =>
        address.id === selectedAddressId,
    );
  }, [addresses, selectedAddressId]);

  function addToCart(product) {
    const exists = cart.some(
      (item) => item.product.id === product.id,
    );

    if (exists) {
      showMessage(
        "이미 장바구니에 담긴 제품입니다.",
        "error",
      );
      return;
    }

    const minimumOrder = Number(
      product.minimum_order_m || 1,
    );

    setCart((current) => [
      ...current,
      {
        product,
        quantityM: minimumOrder,
      },
    ]);

    showMessage(
      `${product.product_code} 제품을 담았습니다.`,
    );
  }

  function removeFromCart(productId) {
    setCart((current) =>
      current.filter(
        (item) => item.product.id !== productId,
      ),
    );
  }

  function updateQuantity(productId, nextValue) {
    const quantity = Number(nextValue);

    setCart((current) =>
      current.map((item) => {
        if (item.product.id !== productId) {
          return item;
        }

        return {
          ...item,
          quantityM:
            Number.isFinite(quantity) && quantity >= 0
              ? quantity
              : 0,
        };
      }),
    );
  }

  function changeAddressField(field, value) {
    setAddressForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function saveAddress(event) {
    event.preventDefault();

    if (!addressForm.recipient_name.trim()) {
      showMessage(
        "받는 분 이름을 입력해주세요.",
        "error",
      );
      return;
    }

    if (!addressForm.recipient_phone.trim()) {
      showMessage(
        "연락처를 입력해주세요.",
        "error",
      );
      return;
    }

    if (!addressForm.address_line1.trim()) {
      showMessage(
        "배송 주소를 입력해주세요.",
        "error",
      );
      return;
    }

    setSavingAddress(true);

    try {
      const result = await apiFetch(
        "/api/admin/material-addresses",
        {
          method: "POST",
          body: JSON.stringify(addressForm),
        },
      );

      showMessage(
        result.message ||
          "배송지를 등록했습니다.",
      );

      setAddressForm(emptyAddressForm());
      setShowAddressForm(false);

      await loadAddresses();

      if (result.address?.id) {
        setSelectedAddressId(
          result.address.id,
        );
      }
    } catch (error) {
      showMessage(
        error.message ||
          "배송지를 등록하지 못했습니다.",
        "error",
      );
    } finally {
      setSavingAddress(false);
    }
  }

  function validateCart() {
    if (cart.length === 0) {
      throw new Error(
        "주문할 제품을 담아주세요.",
      );
    }

    cart.forEach((item) => {
      const quantity = Number(item.quantityM);
      const minimum = Number(
        item.product.minimum_order_m || 1,
      );

      const unit = Number(
        item.product.order_unit_m || 1,
      );

      if (
        !Number.isFinite(quantity) ||
        quantity < minimum
      ) {
        throw new Error(
          `${item.product.product_code}의 ` +
            `최소 주문량은 ${minimum}m입니다.`,
        );
      }

      const difference = quantity - minimum;

      const remainder =
        ((difference % unit) + unit) % unit;

      if (
        remainder > 0.001 &&
        Math.abs(remainder - unit) > 0.001
      ) {
        throw new Error(
          `${item.product.product_code}는 ` +
            `${unit}m 단위로 주문할 수 있습니다.`,
        );
      }
    });

    if (!selectedAddressId) {
      throw new Error(
        "배송지를 선택해주세요.",
      );
    }
  }

  async function submitOrder() {
    try {
      validateCart();
    } catch (error) {
      showMessage(error.message, "error");
      return;
    }

    const confirmed = window.confirm(
      [
        "등록된 카드로 결제하시겠습니까?",
        "",
        `제품: ${cart.length}개`,
        `총 주문량: ${cartTotals.quantity}m`,
        `공급가액: ${formatWon(
          cartTotals.supply,
        )}`,
        `부가세: ${formatWon(cartTotals.vat)}`,
        `최종 결제금액: ${formatWon(
          cartTotals.total,
        )}`,
        "",
        `배송지: ${
          selectedAddress?.address_line1 || ""
        }`,
      ].join("\n"),
    );

    if (!confirmed) {
      return;
    }

    setOrdering(true);

    try {
      const result = await apiFetch(
        "/api/admin/material-orders",
        {
          method: "POST",

          body: JSON.stringify({
            addressId: selectedAddressId,

            deliveryNote:
              deliveryNote.trim(),

            items: cart.map((item) => ({
              productId: item.product.id,
              quantityM: Number(item.quantityM),
            })),
          }),
        },
      );

      setCart([]);
      setDeliveryNote("");

      showMessage(
        result.message ||
          "자재 주문이 접수됐습니다.",
      );

      window.alert(
        [
          "자재 주문이 완료됐습니다.",
          "",
          `주문번호: ${
            result.order?.orderNumber || ""
          }`,
          `결제금액: ${formatWon(
            result.order?.totalAmount,
          )}`,
        ].join("\n"),
      );
    } catch (error) {
      if (
        error.code ===
        "BILLING_CARD_NOT_FOUND"
      ) {
        const goBilling = window.confirm(
          `${error.message}\n\n결제관리로 이동하시겠습니까?`,
        );

        if (goBilling) {
          router.push("/admin/billing");
        }

        return;
      }

      showMessage(
        error.message ||
          "주문 결제에 실패했습니다.",
        "error",
      );
    } finally {
      setOrdering(false);
    }
  }

  if (authorized === null) {
    return (
      <main className="center-page">
        <div className="spinner" />
        <p>로그인 정보를 확인하고 있습니다.</p>

        <style jsx>{`
          .center-page {
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            background: #f7f8fb;
            color: #6b7280;
          }

          .spinner {
            width: 34px;
            height: 34px;
            border: 4px solid #e5e7eb;
            border-top-color: #6d28d9;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
          }

          @keyframes spin {
            to {
              transform: rotate(360deg);
            }
          }
        `}</style>
      </main>
    );
  }

  if (authorized === false) {
    return (
      <main className="center-page">
        <section className="login-card">
          <div className="lock">🔒</div>
          <h1>로그인이 필요합니다</h1>
          <p>
            관리자 계정으로 로그인한 후
            이용해주세요.
          </p>

          <button
            type="button"
            onClick={() => router.push("/login")}
          >
            로그인하기
          </button>
        </section>

        <style jsx>{`
          .center-page {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px;
            background: #f7f8fb;
          }

          .login-card {
            width: 100%;
            max-width: 420px;
            padding: 32px 24px;
            background: white;
            border: 1px solid #e5e7eb;
            border-radius: 24px;
            text-align: center;
          }

          .lock {
            font-size: 42px;
          }

          h1 {
            margin: 16px 0 8px;
          }

          p {
            color: #6b7280;
          }

          button {
            width: 100%;
            height: 48px;
            margin-top: 16px;
            border: 0;
            border-radius: 14px;
            background: #111827;
            color: white;
            font-weight: 900;
          }
        `}</style>
      </main>
    );
  }

  return (
    <main className="page">
      <header className="header">
        <button
          type="button"
          className="back-button"
          onClick={() => router.push("/admin")}
        >
          ←
        </button>

        <div>
          <span className="badge">자재 주문</span>
          <h1>인테리어필름 주문</h1>
          <p>
            판매 가능한 필름을 선택하고 등록된
            카드로 결제합니다.
          </p>
        </div>
      </header>

      {message ? (
        <div
          className={`message ${messageType}`}
        >
          {message}
        </div>
      ) : null}

      <section className="panel">
        <h2>1. 필름 선택</h2>

        <input
          className="search"
          type="search"
          value={searchInput}
          onChange={(event) =>
            setSearchInput(event.target.value)
          }
          placeholder="제품번호 또는 제품명 검색"
        />

        <div className="brand-list">
          <button
            type="button"
            className={
              selectedBrand === "" ? "active" : ""
            }
            onClick={() => setSelectedBrand("")}
          >
            전체
          </button>

          {brands.map((brand) => (
            <button
              key={brand}
              type="button"
              className={
                selectedBrand === brand
                  ? "active"
                  : ""
              }
              onClick={() =>
                setSelectedBrand(brand)
              }
            >
              {brand}
            </button>
          ))}
        </div>

        {loadingProducts ? (
          <div className="loading">
            판매 제품을 불러오는 중입니다.
          </div>
        ) : products.length === 0 ? (
          <div className="empty">
            현재 조건에 맞는 판매 제품이 없습니다.
          </div>
        ) : (
          <div className="product-grid">
            {products.map((product) => {
              const imageUrl =
                getSampleImage(product);

              const inCart = cart.some(
                (item) =>
                  item.product.id === product.id,
              );

              return (
                <article
                  key={product.id}
                  className="product-card"
                >
                  <div className="product-image">
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt={`${product.product_code} 샘플`}
                        loading="lazy"
                      />
                    ) : (
                      <span>이미지 없음</span>
                    )}
                  </div>

                  <div className="product-info">
                    <strong>
                      {product.product_code}
                    </strong>

                    <p>
                      {product.product_name ||
                        product.color_description ||
                        "제품명 없음"}
                    </p>

                    <small>
                      {product.flame_type ===
                      "flame_retardant"
                        ? "방염"
                        : "비방염"}
                    </small>

                    <div className="product-price">
                      {formatWon(
                        product.dealer_price_per_m,
                      )}
                      /m
                      <span>
                        {product.price_vat_included
                          ? "VAT 포함"
                          : "VAT 별도"}
                      </span>
                    </div>

                    <button
                      type="button"
                      disabled={inCart}
                      onClick={() =>
                        addToCart(product)
                      }
                    >
                      {inCart
                        ? "장바구니에 담김"
                        : "장바구니 담기"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <div className="pagination">
          <button
            type="button"
            disabled={pagination.page <= 1}
            onClick={() =>
              loadProducts(
                pagination.page - 1,
              )
            }
          >
            이전
          </button>

          <span>
            {pagination.page} /{" "}
            {pagination.totalPages}
          </span>

          <button
            type="button"
            disabled={
              pagination.page >=
              pagination.totalPages
            }
            onClick={() =>
              loadProducts(
                pagination.page + 1,
              )
            }
          >
            다음
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="section-title">
          <h2>2. 주문 수량</h2>
          <strong>{cart.length}개 제품</strong>
        </div>

        {cart.length === 0 ? (
          <div className="empty">
            주문할 필름을 장바구니에 담아주세요.
          </div>
        ) : (
          <div className="cart-list">
            {cart.map((item) => {
              const amounts = calculateAmounts(
                item.product,
                item.quantityM,
              );

              return (
                <article
                  key={item.product.id}
                  className="cart-item"
                >
                  <div className="cart-top">
                    <div>
                      <strong>
                        {item.product.product_code}
                      </strong>

                      <p>
                        {formatWon(
                          item.product
                            .dealer_price_per_m,
                        )}
                        /m
                      </p>
                    </div>

                    <button
                      type="button"
                      className="remove"
                      onClick={() =>
                        removeFromCart(
                          item.product.id,
                        )
                      }
                    >
                      삭제
                    </button>
                  </div>

                  <div className="quantity-row">
                    <label>
                      주문 길이
                      <small>
                        최소{" "}
                        {Number(
                          item.product
                            .minimum_order_m || 1,
                        )}
                        m ·{" "}
                        {Number(
                          item.product
                            .order_unit_m || 1,
                        )}
                        m 단위
                      </small>
                    </label>

                    <div className="quantity-input">
                      <input
                        type="number"
                        min={
                          item.product
                            .minimum_order_m || 1
                        }
                        step={
                          item.product.order_unit_m ||
                          1
                        }
                        value={item.quantityM}
                        onChange={(event) =>
                          updateQuantity(
                            item.product.id,
                            event.target.value,
                          )
                        }
                      />
                      <span>m</span>
                    </div>
                  </div>

                  <div className="item-total">
                    <span>상품 결제금액</span>
                    <strong>
                      {formatWon(amounts.total)}
                    </strong>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <div className="total-box">
          <div>
            <span>총 주문량</span>
            <strong>
              {cartTotals.quantity.toLocaleString(
                "ko-KR",
              )}
              m
            </strong>
          </div>

          <div>
            <span>공급가액</span>
            <strong>
              {formatWon(cartTotals.supply)}
            </strong>
          </div>

          <div>
            <span>부가세</span>
            <strong>
              {formatWon(cartTotals.vat)}
            </strong>
          </div>

          <div className="grand-total">
            <span>최종 결제금액</span>
            <strong>
              {formatWon(cartTotals.total)}
            </strong>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="section-title">
          <h2>3. 배송지</h2>

          <button
            type="button"
            className="outline-button"
            onClick={() =>
              setShowAddressForm(
                (current) => !current,
              )
            }
          >
            {showAddressForm
              ? "입력 닫기"
              : "새 배송지"}
          </button>
        </div>

        {loadingAddresses ? (
          <div className="loading">
            배송지를 불러오는 중입니다.
          </div>
        ) : addresses.length > 0 ? (
          <div className="address-list">
            {addresses.map((address) => (
              <label
                key={address.id}
                className={`address-card ${
                  selectedAddressId === address.id
                    ? "selected"
                    : ""
                }`}
              >
                <input
                  type="radio"
                  name="shipping-address"
                  checked={
                    selectedAddressId === address.id
                  }
                  onChange={() =>
                    setSelectedAddressId(
                      address.id,
                    )
                  }
                />

                <div>
                  <strong>
                    {address.address_name}
                    {address.is_default
                      ? " · 기본"
                      : ""}
                  </strong>

                  <p>
                    {address.recipient_name} ·{" "}
                    {address.recipient_phone}
                  </p>

                  <p>
                    {address.postal_code
                      ? `(${address.postal_code}) `
                      : ""}
                    {address.address_line1}{" "}
                    {address.address_line2 || ""}
                  </p>
                </div>
              </label>
            ))}
          </div>
        ) : null}

        {showAddressForm ? (
          <form
            className="address-form"
            onSubmit={saveAddress}
          >
            <input
              value={addressForm.address_name}
              onChange={(event) =>
                changeAddressField(
                  "address_name",
                  event.target.value,
                )
              }
              placeholder="배송지 이름"
            />

            <div className="two-column">
              <input
                value={
                  addressForm.recipient_name
                }
                onChange={(event) =>
                  changeAddressField(
                    "recipient_name",
                    event.target.value,
                  )
                }
                placeholder="받는 분"
              />

              <input
                value={
                  addressForm.recipient_phone
                }
                onChange={(event) =>
                  changeAddressField(
                    "recipient_phone",
                    event.target.value,
                  )
                }
                inputMode="tel"
                placeholder="연락처"
              />
            </div>

            <input
              value={addressForm.postal_code}
              onChange={(event) =>
                changeAddressField(
                  "postal_code",
                  event.target.value,
                )
              }
              inputMode="numeric"
              placeholder="우편번호"
            />

            <input
              value={addressForm.address_line1}
              onChange={(event) =>
                changeAddressField(
                  "address_line1",
                  event.target.value,
                )
              }
              placeholder="기본 주소"
            />

            <input
              value={addressForm.address_line2}
              onChange={(event) =>
                changeAddressField(
                  "address_line2",
                  event.target.value,
                )
              }
              placeholder="상세 주소"
            />

            <textarea
              value={addressForm.delivery_note}
              onChange={(event) =>
                changeAddressField(
                  "delivery_note",
                  event.target.value,
                )
              }
              placeholder="기본 배송 요청사항"
            />

            <label className="default-check">
              <input
                type="checkbox"
                checked={addressForm.is_default}
                onChange={(event) =>
                  changeAddressField(
                    "is_default",
                    event.target.checked,
                  )
                }
              />
              기본 배송지로 저장
            </label>

            <button
              type="submit"
              className="save-address"
              disabled={savingAddress}
            >
              {savingAddress
                ? "저장 중..."
                : "배송지 저장"}
            </button>
          </form>
        ) : null}

        <label className="delivery-note">
          <span>이번 주문 배송 요청사항</span>

          <textarea
            value={deliveryNote}
            onChange={(event) =>
              setDeliveryNote(event.target.value)
            }
            placeholder="예: 현장 도착 전 연락해주세요."
          />
        </label>
      </section>

      <section className="payment-panel">
        <div>
          <span>등록카드 결제금액</span>
          <strong>
            {formatWon(cartTotals.total)}
          </strong>
        </div>

        <p>
          주문 버튼을 누르면 결제 전 최종 확인창이
          표시됩니다.
        </p>

        <button
          type="button"
          disabled={
            ordering ||
            cart.length === 0 ||
            !selectedAddressId
          }
          onClick={submitOrder}
        >
          {ordering
            ? "결제 처리 중..."
            : `${formatWon(
                cartTotals.total,
              )} 결제하고 주문하기`}
        </button>
      </section>

      <div className="bottom-space" />

      <style jsx>{`
        * {
          box-sizing: border-box;
        }

        .page {
          min-height: 100vh;
          padding: 20px 16px 40px;
          background: #f7f8fb;
          color: #111827;
        }

        .header,
        .panel,
        .payment-panel,
        .message {
          max-width: 760px;
          margin-left: auto;
          margin-right: auto;
        }

        .header {
          display: flex;
          gap: 12px;
          margin-bottom: 18px;
        }

        .back-button {
          width: 44px;
          height: 44px;
          flex-shrink: 0;
          border: 1px solid #d1d5db;
          border-radius: 14px;
          background: white;
          font-size: 24px;
          font-weight: 900;
        }

        .badge {
          display: inline-flex;
          padding: 6px 10px;
          border-radius: 999px;
          background: #111827;
          color: white;
          font-size: 12px;
          font-weight: 900;
        }

        h1 {
          margin: 10px 0 5px;
          font-size: 30px;
        }

        .header p {
          margin: 0;
          color: #6b7280;
          font-size: 14px;
          line-height: 1.5;
        }

        .message {
          position: sticky;
          top: 10px;
          z-index: 50;
          margin-bottom: 14px;
          padding: 14px 16px;
          border-radius: 14px;
          font-size: 14px;
          font-weight: 900;
          box-shadow: 0 10px 24px
            rgba(0, 0, 0, 0.12);
        }

        .message.success {
          border: 1px solid #a7f3d0;
          background: #ecfdf5;
          color: #047857;
        }

        .message.error {
          border: 1px solid #fecaca;
          background: #fef2f2;
          color: #b91c1c;
        }

        .panel {
          margin-bottom: 16px;
          padding: 18px;
          border: 1px solid #e5e7eb;
          border-radius: 22px;
          background: white;
        }

        h2 {
          margin: 0 0 15px;
          font-size: 21px;
        }

        .search {
          width: 100%;
          height: 50px;
          padding: 0 15px;
          border: 1px solid #d1d5db;
          border-radius: 14px;
          font-size: 16px;
        }

        .brand-list {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin: 13px 0;
        }

        .brand-list button {
          padding: 10px 14px;
          border: 1px solid #d1d5db;
          border-radius: 999px;
          background: white;
          color: #374151;
          font-weight: 800;
        }

        .brand-list button.active {
          border-color: #6d28d9;
          background: #6d28d9;
          color: white;
        }

        .loading,
        .empty {
          padding: 34px 12px;
          border-radius: 15px;
          background: #f9fafb;
          color: #6b7280;
          text-align: center;
          font-size: 14px;
        }

        .product-grid {
          display: grid;
          grid-template-columns:
            repeat(2, minmax(0, 1fr));
          gap: 10px;
        }

        .product-card {
          min-width: 0;
          overflow: hidden;
          border: 1px solid #e5e7eb;
          border-radius: 17px;
          background: white;
        }

        .product-image {
          width: 100%;
          aspect-ratio: 1 / 0.82;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          background: #f3f4f6;
          color: #9ca3af;
          font-size: 11px;
        }

        .product-image img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .product-info {
          padding: 12px;
        }

        .product-info > strong {
          display: block;
          font-size: 18px;
        }

        .product-info p {
          min-height: 38px;
          margin: 5px 0;
          color: #4b5563;
          font-size: 13px;
          line-height: 1.4;
        }

        .product-info small {
          color: #6b7280;
        }

        .product-price {
          margin-top: 9px;
          color: #6d28d9;
          font-size: 15px;
          font-weight: 900;
        }

        .product-price span {
          display: block;
          margin-top: 2px;
          color: #9ca3af;
          font-size: 10px;
        }

        .product-info button {
          width: 100%;
          min-height: 42px;
          margin-top: 10px;
          border: 0;
          border-radius: 11px;
          background: #111827;
          color: white;
          font-weight: 900;
        }

        button:disabled {
          opacity: 0.42;
        }

        .pagination {
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          align-items: center;
          gap: 12px;
          margin-top: 15px;
        }

        .pagination button {
          height: 44px;
          border: 1px solid #d1d5db;
          border-radius: 12px;
          background: white;
          font-weight: 900;
        }

        .pagination span {
          min-width: 65px;
          text-align: center;
        }

        .section-title {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        .section-title strong {
          color: #6d28d9;
          font-size: 14px;
        }

        .outline-button {
          padding: 9px 12px;
          border: 1px solid #6d28d9;
          border-radius: 11px;
          background: white;
          color: #6d28d9;
          font-weight: 900;
        }

        .cart-list,
        .address-list {
          display: grid;
          gap: 10px;
        }

        .cart-item {
          padding: 14px;
          border: 1px solid #e5e7eb;
          border-radius: 16px;
        }

        .cart-top {
          display: flex;
          justify-content: space-between;
          gap: 12px;
        }

        .cart-top strong {
          font-size: 18px;
        }

        .cart-top p {
          margin: 4px 0 0;
          color: #6b7280;
          font-size: 12px;
        }

        .remove {
          border: 0;
          background: transparent;
          color: #dc2626;
          font-weight: 900;
        }

        .quantity-row {
          display: flex;
          align-items: end;
          justify-content: space-between;
          gap: 12px;
          margin-top: 14px;
        }

        .quantity-row label {
          font-size: 13px;
          font-weight: 900;
        }

        .quantity-row small {
          display: block;
          margin-top: 4px;
          color: #9ca3af;
          font-weight: 500;
        }

        .quantity-input {
          display: flex;
          align-items: center;
          width: 130px;
          border: 1px solid #d1d5db;
          border-radius: 12px;
          overflow: hidden;
        }

        .quantity-input input {
          width: 100%;
          height: 43px;
          padding: 0 10px;
          border: 0;
          outline: 0;
          font-size: 16px;
          font-weight: 900;
        }

        .quantity-input span {
          padding-right: 12px;
          color: #6b7280;
          font-weight: 800;
        }

        .item-total {
          display: flex;
          justify-content: space-between;
          margin-top: 13px;
          padding-top: 12px;
          border-top: 1px solid #f0f1f3;
          font-size: 13px;
        }

        .total-box {
          margin-top: 15px;
          padding: 15px;
          border-radius: 16px;
          background: #f9fafb;
        }

        .total-box > div {
          display: flex;
          justify-content: space-between;
          margin-bottom: 9px;
          color: #6b7280;
          font-size: 13px;
        }

        .total-box > div strong {
          color: #374151;
        }

        .total-box .grand-total {
          margin: 12px 0 0;
          padding-top: 13px;
          border-top: 1px solid #d1d5db;
          color: #111827;
          font-size: 16px;
          font-weight: 900;
        }

        .grand-total strong {
          color: #6d28d9 !important;
          font-size: 21px;
        }

        .address-card {
          display: grid;
          grid-template-columns: auto 1fr;
          gap: 11px;
          padding: 14px;
          border: 2px solid #e5e7eb;
          border-radius: 16px;
        }

        .address-card.selected {
          border-color: #6d28d9;
          background: #faf7ff;
        }

        .address-card input {
          width: 20px;
          height: 20px;
          accent-color: #6d28d9;
        }

        .address-card p {
          margin: 5px 0 0;
          color: #6b7280;
          font-size: 13px;
          line-height: 1.45;
        }

        .address-form {
          display: grid;
          gap: 10px;
          margin-top: 15px;
          padding: 15px;
          border-radius: 16px;
          background: #f9fafb;
        }

        .address-form input,
        .address-form textarea,
        .delivery-note textarea {
          width: 100%;
          min-height: 46px;
          padding: 12px;
          border: 1px solid #d1d5db;
          border-radius: 12px;
          background: white;
          font-size: 15px;
          font-family: inherit;
        }

        .address-form textarea,
        .delivery-note textarea {
          min-height: 82px;
          resize: vertical;
        }

        .two-column {
          display: grid;
          grid-template-columns:
            repeat(2, minmax(0, 1fr));
          gap: 9px;
        }

        .default-check {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          font-weight: 800;
        }

        .default-check input {
          width: 20px;
          min-height: 20px;
        }

        .save-address {
          height: 46px;
          border: 0;
          border-radius: 12px;
          background: #111827;
          color: white;
          font-weight: 900;
        }

        .delivery-note {
          display: block;
          margin-top: 15px;
        }

        .delivery-note span {
          display: block;
          margin-bottom: 8px;
          font-size: 14px;
          font-weight: 900;
        }

        .payment-panel {
          position: sticky;
          bottom: 10px;
          z-index: 30;
          padding: 17px;
          border: 1px solid #ddd6fe;
          border-radius: 20px;
          background: rgba(255, 255, 255, 0.97);
          box-shadow: 0 12px 35px
            rgba(17, 24, 39, 0.16);
          backdrop-filter: blur(10px);
        }

        .payment-panel > div {
          display: flex;
          justify-content: space-between;
          gap: 10px;
        }

        .payment-panel span {
          color: #6b7280;
          font-size: 13px;
          font-weight: 800;
        }

        .payment-panel strong {
          color: #6d28d9;
          font-size: 23px;
        }

        .payment-panel p {
          margin: 8px 0 12px;
          color: #9ca3af;
          font-size: 11px;
        }

        .payment-panel button {
          width: 100%;
          min-height: 54px;
          border: 0;
          border-radius: 14px;
          background: #111827;
          color: white;
          font-size: 16px;
          font-weight: 900;
        }

        .bottom-space {
          height: 70px;
        }

        @media (min-width: 700px) {
          .product-grid {
            grid-template-columns:
              repeat(3, minmax(0, 1fr));
          }
        }
      `}</style>
    </main>
  );
        }
