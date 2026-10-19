"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import MaterialFilmPicker from "../../components/MaterialFilmPicker";
import MaterialDeliveryFields from "../../components/MaterialDeliveryFields";
import {deliveryMethods,deliveryInput} from "../../../lib/materialPilot.mjs";
import MaterialPilot, { pilotFetch } from "../../components/MaterialPilot";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";

import { orderFlameLabel, orderVariantKey, orderPriceType } from "../../../lib/materialOrderVariants.mjs";

const PAGE_SIZE = 40;

function formatWon(value) {
  return `${Number(value || 0).toLocaleString(
    "ko-KR",
  )}원`;
}

function emptyAddress() {
  return {
    address_name: "기본 배송지",
    recipient_name: "",
    recipient_phone: "",
    postal_code: "",
    address_line1: "",
    address_line2: "",
    delivery_note: "",
    is_default: false,
  };
}

function getImageUrl(product) {
  const direct =
    product?.sample_image_url ||
    product?.image_url ||
    "";

  if (direct) return direct;

  let path =
    product?.sample_image_path ||
    product?.image_path ||
    "";

  if (!path) return "";

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
  const price = Number(
    product?.dealer_price_per_m || 0,
  );

  const quantity = Number(quantityM || 0);

  if (product?.price_vat_included === true) {
    const total = Math.round(price * quantity);
    const supply = Math.round(total / 1.1);

    return {
      supply,
      vat: total - supply,
      total,
    };
  }

  const supply = Math.round(price * quantity);
  const vat = Math.round(supply * 0.1);

  return {
    supply,
    vat,
    total: supply + vat,
  };
}

export default function MaterialOrderPage() {
  const [allowed, setAllowed] = useState(null);
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(async ({ data }) => {
      const token = data?.session?.access_token;
      if (!token) return false;
      const response = await fetch("/api/admin/material-order-access", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const result = await response.json();
      return response.ok && result.allowed === true;
    }).then(value => { if (!cancelled) setAllowed(!!value); }).catch(() => { if (!cancelled) setAllowed(false); });
    return () => { cancelled = true; };
  }, []);
  if (allowed === null) return <main style={{ padding: 24 }}>테스트 권한 확인 중...</main>;
  if (allowed) return <MaterialOrderForm />;
  return (
    <main style={{ maxWidth: 600, margin: "40px auto", padding: 24, lineHeight: 1.7 }}>
      <h1>자재 주문 · 테스트 중</h1>
      <p>주문 기능을 점검하고 있습니다. 현재 자재 주문과 결제는 이용할 수 없습니다.</p>
      <a href="/admin" data-ui-link="action">관리자 홈으로 돌아가기</a>
    </main>
  );
}

// 주문 기능 점검 완료 후 다시 연결합니다.
function MaterialOrderForm() {
  const router = useRouter();

  const [authorized, setAuthorized] =
    useState(null);

  const [accessToken, setAccessToken] =
    useState("");

  const [products, setProducts] = useState([]);
  const [brands, setBrands] = useState([]);

  const [brand, setBrand] = useState("");
  const [searchInput, setSearchInput] =
    useState("");
  const [search, setSearch] = useState("");

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] =
    useState(1);

  const [cart, setCart] = useState([]);
  const [quantities, setQuantities] = useState({});
  const [delivery,setDelivery]=useState({method:"parcel",recipient_name:"",recipient_phone:"",address_line1:"",address_line2:"",feeAccepted:false});
  const [picker,setPicker]=useState({product_code:""});
  const [screen, setScreen] = useState("products");
  useEffect(()=>{if(new URLSearchParams(window.location.search).has("order"))setScreen("orders");},[]);
  const [detail, setDetail] = useState(null);
  const [variantSource, setVariantSource] = useState(null);
  const [variants, setVariants] = useState([]);
  const [variantLoading, setVariantLoading] = useState(false);
  const [variantError, setVariantError] = useState("");
  function openProduct(product) {
    setVariants([]); setVariantError(""); setVariantLoading(true);
    setVariantSource(product.id); setDetail(product);
  }
  const [sites, setSites] = useState([]);
  const [siteError, setSiteError] = useState("");
  const [deliveryMode, setDeliveryMode] = useState("saved");

  function navigate(next) { setScreen(next); setDetail(null); window.scrollTo({ top: 0, behavior: "smooth" }); }
  async function loadSiteAddresses() {
    setDeliveryMode("site"); setSelectedAddressId(""); setShowAddressForm(true); setAddressForm(emptyAddress());
    try {
      const { data: rows, error: companyError } = await supabase.rpc("get_my_company");
      if (companyError) throw companyError;
      const company = Array.isArray(rows) ? rows[0] : rows;
      if (!company?.company_id) throw Error("업체를 확인해주세요.");
      const { data, error } = await supabase.from("sites").select("id,site_name,address").eq("company_id", company.company_id).order("schedule_start", { ascending: false, nullsFirst: false });
      if (error) throw error;
      setSites(data || []); setSiteError("");
    } catch { setSiteError("현장을 불러오지 못했습니다. 새 주소로 직접 입력해주세요."); }
  }
  function showOrders() { navigate("orders"); }
  const pendingOrder = useRef(null);
  const orderLock = useRef(false);

  const [addresses, setAddresses] =
    useState([]);

  const [selectedAddressId, setSelectedAddressId] =
    useState("");

  const [addressForm, setAddressForm] =
    useState(emptyAddress());

  const [showAddressForm, setShowAddressForm] =
    useState(false);

  const [addressStatus, setAddressStatus] =
    useState("");

  const [deliveryNote, setDeliveryNote] =
    useState("");

  const [loadingProducts, setLoadingProducts] =
    useState(false);

  const [loadingAddresses, setLoadingAddresses] =
    useState(false);

  const [savingAddress, setSavingAddress] =
    useState(false);

  const [ordering, setOrdering] =
    useState(false);

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
        }, 4500);
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

      let response;

      try {
        response = await fetch(url, {
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
      } catch (networkError) {
        throw new Error(
          "서버에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.",
        );
      }

      const responseText = await response.text();

      let result;

      try {
        result = responseText
          ? JSON.parse(responseText)
          : {};
      } catch {
        throw new Error(
          `서버 응답 오류 (${response.status})`,
        );
      }

      if (response.status === 401) {
        setAuthorized(false);
      }

      if (!response.ok || result.ok === false) {
        const error = new Error(
          result.error ||
            result.detail ||
            `요청 실패 (${response.status})`,
        );

        error.code = result.code;
        error.status = response.status;
        error.detail = result.detail;
        throw error;
      }

      setAuthorized(true);
      return result;
    },
    [accessToken, getToken],
  );

  useEffect(() => {
    if (!variantSource || !detail) return;
    let active=true;
    apiFetch("/api/admin/material-products?variantOf="+encodeURIComponent(variantSource))
      .then(result=>{
        if(!active) return;
        const rows=result.products || [];
        setVariants(rows);
        if(!rows.length) setVariantError("현재 주문 가능한 판매 옵션이 없습니다.");
        else setDetail(current=>rows.find(row=>orderVariantKey(row)===orderVariantKey(current||{})) || rows[0]);
      })
      .catch(error=>{if(active) setVariantError(error.message);})
      .finally(()=>{if(active) setVariantLoading(false);});
    return ()=>{active=false;};
  }, [variantSource, Boolean(detail), apiFetch]);

  const loadProducts = useCallback(
    async (requestedPage = 1) => {
      try {
        setLoadingProducts(true);

        const params = new URLSearchParams({
          brand,
          search,
          page: String(requestedPage),
          limit: String(PAGE_SIZE),
        });

        const result = await apiFetch(
          `/api/admin/material-products?${params.toString()}`,
        );

        setProducts(result.products || []);
        setBrands(result.brands || []);
        setPage(result.pagination?.page || 1);
        setTotalPages(
          result.pagination?.totalPages || 1,
        );
      } catch (error) {
        showMessage(error.message, "error");
      } finally {
        setLoadingProducts(false);
      }
    },
    [apiFetch, brand, search, showMessage],
  );

  const loadAddresses = useCallback(
    async (preferredId = "") => {
      try {
        setLoadingAddresses(true);

        const result = await apiFetch(
          "/api/admin/material-addresses",
        );

        const nextAddresses =
          result.addresses || [];

        setAddresses(nextAddresses);

        const preferred = nextAddresses.find(
          (item) => item.id === preferredId,
        );

        const defaultAddress =
          nextAddresses.find(
            (item) => item.is_default,
          );

        const current = nextAddresses.find(
          (item) =>
            item.id === selectedAddressId,
        );

        const nextSelected =
          preferred ||
          current ||
          defaultAddress ||
          nextAddresses[0];

        setSelectedAddressId(
          nextSelected?.id || "",
        );

        if (nextAddresses.length === 0) {
          setShowAddressForm(true);
        }

        return nextAddresses;
      } finally {
        setLoadingAddresses(false);
      }
    },
    [apiFetch, selectedAddressId],
  );

  useEffect(() => {
    getToken()
      .then(() => setAuthorized(true))
      .catch(() => setAuthorized(false));
  }, [getToken]);

  useEffect(() => {
    if (authorized !== true) return;

    loadProducts(1);

    loadAddresses().catch((error) => {
      setAddressStatus(
        `배송지 조회 실패: ${error.message}`,
      );
    });
  }, [authorized]);

  useEffect(() => {
    if (authorized !== true) return;
    loadProducts(1);
  }, [brand, search]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
    }, 400);

    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const cartTotals = useMemo(() => {
    return cart.reduce(
      (total, item) => {
        const amounts = calculateAmounts(
          item.product,
          item.quantityM,
        );

        total.supply += amounts.supply;
        total.vat += amounts.vat;
        total.total += amounts.total;
        total.quantity += Number(
          item.quantityM || 0,
        );

        return total;
      },
      {
        supply: 0,
        vat: 0,
        total: 0,
        quantity: 0,
      },
    );
  }, [cart]);

  const selectedAddress = useMemo(
    () =>
      addresses.find(
        (item) =>
          item.id === selectedAddressId,
      ),
    [addresses, selectedAddressId],
  );

  function quantityError(product, value) {
    const quantity = Number(value);
    const minimum = Number(product.minimum_order_m || 1);
    const unit = Number(product.order_unit_m || 1);
    if (!Number.isFinite(quantity) || quantity < minimum) return `최소 ${minimum}m를 입력해주세요.`;
    const steps = (quantity - minimum) / unit;
    if (Math.abs(steps - Math.round(steps)) > 0.000001) return `${unit}m 단위로 입력해주세요.`;
    return "";
  }

  function addCart(product) {
    const value = quantities[orderVariantKey(product)] ?? String(product.minimum_order_m || 1);
    const error = quantityError(product, value);
    if (error) { showMessage(error, "error"); return; }
    setCart(current => [...current.filter(item => orderVariantKey(item.product) !== orderVariantKey(product)), { product, quantityM: Number(value) }]);
    showMessage(`${product.product_code} · ${value}m를 담았습니다.`);
    setDetail(null);
  }

  function removeCart(productId) {
    setCart((current) =>
      current.filter(
        (item) => orderVariantKey(item.product) !== productId,
      ),
    );
  }

  function updateQuantity(productId, value) {
    setCart((current) =>
      current.map((item) =>
        orderVariantKey(item.product) === productId
          ? {
              ...item,
              quantityM: value,
            }
          : item,
      ),
    );
  }

  function updateAddressField(field, value) {
    setAddressForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function saveAddress() {
    if (savingAddress) return;

    const payload = {
      address_name:
        addressForm.address_name.trim() ||
        "배송지",
      recipient_name:
        addressForm.recipient_name.trim(),
      recipient_phone:
        addressForm.recipient_phone.trim(),
      postal_code:
        (addressForm.postal_code || "").trim(),
      address_line1:
        addressForm.address_line1.trim(),
      address_line2:
        (addressForm.address_line2 || "").trim(),
      delivery_note:
        (addressForm.delivery_note || "").trim(),
      is_default: addressForm.is_default,
    };

    if (!payload.recipient_name) {
      setAddressStatus(
        "받는 분 이름을 입력해주세요.",
      );
      window.alert(
        "받는 분 이름을 입력해주세요.",
      );
      return;
    }

    if (!payload.recipient_phone) {
      setAddressStatus(
        "받는 분 연락처를 입력해주세요.",
      );
      window.alert(
        "받는 분 연락처를 입력해주세요.",
      );
      return;
    }

    if (!payload.address_line1) {
      setAddressStatus(
        "배송 주소를 입력해주세요.",
      );
      window.alert(
        "배송 주소를 입력해주세요.",
      );
      return;
    }

    setSavingAddress(true);
    setAddressStatus("배송지를 저장하고 있습니다...");

    try {
      const result = await apiFetch(
        "/api/admin/material-addresses",
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
      );

      if (!result.address?.id) {
        throw new Error(
          "서버에서 저장된 배송지 ID를 받지 못했습니다.",
        );
      }

      const savedAddress = result.address;

      setAddresses((current) => [
        savedAddress,
        ...current.filter(
          (item) =>
            item.id !== savedAddress.id,
        ),
      ]);

      setSelectedAddressId(savedAddress.id);
      setShowAddressForm(false);
      setAddressForm(emptyAddress());

      await loadAddresses(savedAddress.id);

      setAddressStatus(
        "✅ 배송지가 저장되고 선택됐습니다.",
      );

      showMessage(
        "배송지가 저장되고 선택됐습니다.",
      );

      window.alert(
        "배송지가 정상적으로 저장됐습니다.",
      );
    } catch (error) {
      const errorMessage =
        error.detail ||
        error.message ||
        "배송지를 저장하지 못했습니다.";

      setAddressStatus(
        `❌ 저장 실패: ${errorMessage}`,
      );

      showMessage(errorMessage, "error");

      window.alert(
        `배송지 저장 실패\n\n${errorMessage}`,
      );
    } finally {
      setSavingAddress(false);
    }
  }

  function validateOrder() {
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
          `${item.product.product_code}의 최소 주문량은 ${minimum}m입니다.`,
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
          `${item.product.product_code}는 ${unit}m 단위로 주문할 수 있습니다.`,
        );
      }
    });
  }

  async function submitOrder() {
    if (orderLock.current) return;
    try { validateOrder(); deliveryInput(delivery); if(cart.some(i=>orderFlameLabel(i.product.flame_type)==="방염 구분 미등록"))throw Error("방염 구분을 확인해주세요."); } catch(error) { window.alert(error.message); return; }
    if (!window.confirm(`테스트 주문을 접수할까요?\n${cart.length}개 제품 · ${cartTotals.quantity}m · ${formatWon(cartTotals.total)}\n대리점 준비 완료 후 테스트 결제를 진행합니다. 실제 청구는 없습니다.`)) return;
    const values = {action:"create",shipping:delivery,addressId:selectedAddressId,deliveryNote:deliveryNote.trim(),expectedTotal:cartTotals.total,items:cart.map(item=>({productId:item.product.id,priceType:item.product.price_type||orderPriceType(item.product.flame_type),quantityM:Number(item.quantityM)}))};
    const signature = JSON.stringify(values);
    if (pendingOrder.current?.signature !== signature) pendingOrder.current = {signature,body:{...values,requestId:crypto.randomUUID()}};
    orderLock.current = true; setOrdering(true);
    try {
      await pilotFetch("buyer",pendingOrder.current.body);
      pendingOrder.current=null;setCart([]);setDeliveryNote("");navigate("orders");
    } catch(error) {
      if(error.status && error.status < 500 && error.status !== 409) pendingOrder.current=null;
      window.alert(error.message);
    } finally { orderLock.current=false;setOrdering(false); }
  }
    if (authorized === null) {
    return (
      <main className="center">
        로그인 정보를 확인하고 있습니다.
      </main>
    );
  }

  if (authorized === false) {
    return (
      <main className="center">
        <section className="login-card">
          <h1>로그인이 필요합니다</h1>
          <button
            type="button"
            onClick={() =>
              router.push("/login")
            }
          >
            로그인하기
          </button>
        </section>

        <style jsx>{`
          .center {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px;
            background: #f8f6f2;
          }

          .login-card {
            width: 100%;
            max-width: 400px;
            padding: 25px;
            border-radius: 20px;
            background: white;
            text-align: center;
          }

          button {
            width: 100%;
            height: 48px;
            border: 0;
            border-radius: 13px;
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
      <div role="status" style={{padding:"16px",marginBottom:"16px",background:"#fff7ed",border:"1px solid #fdba74",borderRadius:"14px",color:"#9a3412",lineHeight:1.6}}><strong>🧪 필름장이 전용 주문 테스트</strong><div>필름 선택 화면에서 테스트 주문 → 대리점 출고 → 테스트 입고를 확인합니다. 실제 결제와 운영 재고에는 반영되지 않습니다.</div></div>
      <header className="header">
        <button
          type="button"
          className="back"
          onClick={() =>
            router.push("/admin")
          }
        >
          ←
        </button>

        <div>
          <span className="badge">
            자재 주문
          </span>
          <h1>자재 주문하기</h1>
          <p>
            필요한 필름을 선택해 대리점에 주문하세요.
          </p>
        </div>
        <button className="outline" type="button" onClick={() => navigate("cart")}>장바구니 {cart.length}</button>
      </header>
      <nav className="shop-nav" aria-label="자재 주문 메뉴">
        <button type="button" aria-current={screen === "products" ? "page" : undefined} onClick={() => navigate("products")}>상품</button>
        <button type="button" aria-current={screen === "cart" ? "page" : undefined} onClick={() => navigate("cart")}>장바구니 ({cart.length})</button>
        <button type="button" aria-current={screen === "orders" ? "page" : undefined} onClick={showOrders}>주문내역</button>
      </nav>

      {message ? (
        <div
          className={`message ${messageType}`}
        >
          {message}
        </div>
      ) : null}

      <section className="panel" hidden={screen !== "products" || !!detail}>
        <h2>필름 선택</h2>
        <MaterialFilmPicker value={picker} onChange={async value=>{
          setPicker(value);
          if(!value.film_product_id)return;
          setSearchInput(value.product_code);setBrand(value.brand);
          try{
            const result=await apiFetch("/api/admin/material-products?variantOf="+encodeURIComponent(value.film_product_id));
            const rows=result.products||[];
            if(!rows.length)throw Error("판매 등록된 자재가 없습니다.");
            setVariants(rows);setVariantError("");setVariantLoading(true);setVariantSource(rows[0].id);setDetail(rows[0]);
          }catch(e){window.alert(e.message);}
        }}/>

        <input
          className="search"
          type="search"
          value={searchInput}
          onChange={(event) =>
            setSearchInput(event.target.value)
          }
          placeholder="제품번호 또는 제품명 검색"
        />

        <div className="brands">
          <button
            type="button"
            className={
              brand === "" ? "active" : ""
            }
            onClick={() => setBrand("")}
          >
            전체
          </button>

          {brands.map((item) => (
            <button
              key={item}
              type="button"
              className={
                brand === item ? "active" : ""
              }
              onClick={() => setBrand(item)}
            >
              {item}
            </button>
          ))}
        </div>

        {loadingProducts ? (
          <div className="empty">
            제품을 불러오는 중입니다.
          </div>
        ) : products.length === 0 ? (
          <div className="empty">
            판매 가능한 제품이 없습니다.
          </div>
        ) : (
          <div className="products">
            {products.map((product) => {
              const imageUrl =
                getImageUrl(product);

              const added = cart.some(
                (item) =>
                  item.product.id === product.id,
              );

              return (
                <article
                  key={product.id}
                  className="product"
                >
                  <div className="image">
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt={product.product_code}
                      />
                    ) : (
                      <span>이미지 없음</span>
                    )}
                  </div>

                  <div className="product-info">
                    <small>{product.brand}</small>
                    <strong>
                      {product.product_code}
                    </strong>

                    <p>
                      {product.product_name ||
                        product.color_description ||
                        "제품명 없음"}
                    </p>

                    <div className="price">
                      {formatWon(
                        product.dealer_price_per_m,
                      )}
                      /m
                    </div>

                    <small>
                      {product.price_vat_included
                        ? "VAT 포함"
                        : "VAT 별도"}
                    </small>

                    <button type="button" onClick={() => openProduct(product)}>옵션·길이 선택</button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <div className="pagination">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() =>
              loadProducts(page - 1)
            }
          >
            이전
          </button>

          <span>
            {page} / {totalPages}
          </span>

          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() =>
              loadProducts(page + 1)
            }
          >
            다음
          </button>
        </div>
      </section>

      <section className="panel" hidden={screen !== "cart"}>
        <div className="title-row">
          <h2>장바구니</h2>
          <strong>{cart.length}개</strong>
        </div>

        {cart.length === 0 ? (
          <div className="empty">
            주문할 필름을 담아주세요.
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
                  key={orderVariantKey(item.product)}
                  className="cart"
                >
                  <div className="cart-head">
                    <div>
                      <strong>
                        {item.product.brand} {item.product.product_code}
                      </strong>
                      <p>{orderFlameLabel(item.product.flame_type)}</p>
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
                      onClick={() =>
                        removeCart(
                          orderVariantKey(item.product),
                        )
                      }
                    >
                      삭제
                    </button>
                  </div>

                  <div className="quantity">
                    <span>
                      최소{" "}
                      {item.product
                        .minimum_order_m || 1}
                      m ·{" "}
                      {item.product
                        .order_unit_m || 1}
                      m 단위
                    </span>

                    <label>
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
                            orderVariantKey(item.product),
                            event.target.value,
                          )
                        }
                      />
                      m
                    </label>
                  </div>

                  {quantityError(item.product, item.quantityM) && <p role="alert" style={{ color: "#b91c1c" }}>{quantityError(item.product, item.quantityM)}</p>}
                  <div className="item-total">
                    <span>결제금액</span>
                    <strong>
                      {formatWon(amounts.total)}
                    </strong>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <div className="totals">
          <div>
            <span>총 주문량</span>
            <strong>
              {cartTotals.quantity}m
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

          <div className="final">
            <span>최종 결제금액</span>
            <strong>
              {formatWon(cartTotals.total)}
            </strong>
          </div>
        </div>
      </section>

      {screen === "cart" && <div className="shop-action"><button type="button" className="primary" disabled={!cart.length || cart.some(item => quantityError(item.product, item.quantityM))} onClick={() => navigate("checkout")}>배송지 선택 →</button></div>}
      <section className="panel" hidden={screen !== "checkout"}>
        <MaterialDeliveryFields value={delivery} onChange={setDelivery}/>
        {selectedAddress&&<button type="button" onClick={()=>setDelivery(d=>({...d,...selectedAddress}))}>아래 선택한 배송지 정보 가져오기</button>}
        <div className="title-row">
          <h2>받을 주소 선택</h2>

          <button
            type="button"
            className="outline"
            onClick={() => {
              setShowAddressForm(
                (current) => !current,
              );
              setAddressStatus("");
            }}
          >
            {showAddressForm
              ? "입력 닫기"
              : "현장·다른 주소 추가"}
          </button>
        </div>

        <div className="delivery-tabs">
          <button type="button" aria-pressed={deliveryMode === "saved"} onClick={() => { setDeliveryMode("saved"); setShowAddressForm(false); }}>기본·저장 배송지</button>
          <button type="button" aria-pressed={deliveryMode === "site"} onClick={loadSiteAddresses}>현장으로 받기</button>
          <button type="button" aria-pressed={deliveryMode === "new"} onClick={() => { setDeliveryMode("new"); setSelectedAddressId(""); setAddressForm(emptyAddress()); setShowAddressForm(true); }}>새 주소</button>
        </div>
        {deliveryMode === "site" && <label className="site-select">현장 선택<select defaultValue="" onChange={event => {
          const site = sites.find(item => item.id === event.target.value);
          if (site) setAddressForm({ ...emptyAddress(), address_name: site.site_name || "현장", address_line1: site.address || "" });
        }}><option value="">현장을 선택해주세요</option>{sites.map(site => <option key={site.id} value={site.id}>{site.site_name}</option>)}</select>{siteError && <p role="alert">{siteError}</p>}</label>}
        <p>기본 배송지 또는 현장 주소를 선택해주세요. 다른 주소를 추가해도 기본 배송지는 바뀌지 않습니다.</p>
        {selectedAddress && !showAddressForm && <button type="button" className="outline" onClick={() => {
          setAddressForm({ ...emptyAddress(), ...selectedAddress, address_name: `${selectedAddress.address_name || "배송지"} (변경)`, is_default: false });
          setShowAddressForm(true); setAddressStatus("");
        }}>선택 주소 변경해서 받기</button>}
        {loadingAddresses ? (
          <div className="empty">
            배송지를 불러오는 중입니다.
          </div>
        ) : (
          <div className="address-list">
            {addresses.map((address) => (
              <label
                key={address.id}
                className={`address ${
                  selectedAddressId === address.id
                    ? "selected"
                    : ""
                }`}
              >
                <input
                  type="radio"
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
                    {address.address_line1}{" "}
                    {address.address_line2 || ""}
                  </p>
                </div>
              </label>
            ))}
          </div>
        )}

        {showAddressForm ? (
          <div className="address-form">
            <input
              value={addressForm.address_name}
              onChange={(event) =>
                updateAddressField(
                  "address_name",
                  event.target.value,
                )
              }
              placeholder="배송지 이름 (예: 철산대림 현장)"
            />

            <div className="two">
              <input
                value={
                  addressForm.recipient_name
                }
                onChange={(event) =>
                  updateAddressField(
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
                  updateAddressField(
                    "recipient_phone",
                    event.target.value,
                  )
                }
                placeholder="연락처"
                inputMode="tel"
              />
            </div>

            <input
              value={addressForm.postal_code}
              onChange={(event) =>
                updateAddressField(
                  "postal_code",
                  event.target.value,
                )
              }
              placeholder="우편번호"
            />

            <input
              value={addressForm.address_line1}
              onChange={(event) =>
                updateAddressField(
                  "address_line1",
                  event.target.value,
                )
              }
              placeholder="기본 주소"
            />

            <input
              value={addressForm.address_line2}
              onChange={(event) =>
                updateAddressField(
                  "address_line2",
                  event.target.value,
                )
              }
              placeholder="상세 주소"
            />

            <textarea
              value={addressForm.delivery_note}
              onChange={(event) =>
                updateAddressField(
                  "delivery_note",
                  event.target.value,
                )
              }
              placeholder="기본 배송 요청사항"
            />

            <label className="default">
              <input
                type="checkbox"
                checked={addressForm.is_default}
                onChange={(event) =>
                  updateAddressField(
                    "is_default",
                    event.target.checked,
                  )
                }
              />
              기본 배송지로 저장
            </label>

            <button
              type="button"
              className="save-address"
              disabled={savingAddress}
              onClick={saveAddress}
            >
              {savingAddress
                ? "배송지 저장 중..."
                : "배송지 저장"}
            </button>

            {addressStatus ? (
              <div
                className={`address-status ${
                  addressStatus.startsWith("❌")
                    ? "fail"
                    : ""
                }`}
              >
                {addressStatus}
              </div>
            ) : null}
          </div>
        ) : null}

        <label className="delivery">
          <span>이번 주문 배송 요청사항</span>

          <textarea
            value={deliveryNote}
            onChange={(event) =>
              setDeliveryNote(
                event.target.value,
              )
            }
            placeholder="현장 도착 전 연락해주세요."
          />
        </label>
      </section>

      <section className="payment" hidden={screen !== "checkout"}>
        <h2>4. 주문 내용 확인</h2>
        <p>제품 {cart.length}종 · 총 {cartTotals.quantity}m</p>
        {cart.map(i=><p key={orderVariantKey(i.product)}><strong>{i.product.brand} · {i.product.product_code}</strong> · {orderFlameLabel(i.product.flame_type)} · {i.quantityM}m</p>)}
        <p>받는 방법: {deliveryMethods[delivery.method]}<br/>{delivery.recipient_name} · {delivery.recipient_phone}<br/>{delivery.method!=="pickup"&&delivery.address_line1}</p>
        <p>대리점이 준비 수량을 확인한 뒤 결제를 요청합니다. 퀵·화물 운임은 별도 본인 부담입니다.</p>

        <div>
          <span>테스트 주문금액</span>
          <strong>
            {formatWon(cartTotals.total)}
          </strong>
        </div>

        <button
          type="button"
          disabled={ordering || !cart.length}
          onClick={submitOrder}
        >
          {ordering ? "접수 중…" : "테스트 주문 접수"}
        </button>
      </section>

      {detail && <section className="panel detail">
        <button type="button" className="outline" onClick={() => setDetail(null)}>‹ 상품 목록</button>
        {getImageUrl(detail) && <img className="detail-image" src={getImageUrl(detail)} alt={`${detail.brand || ""} ${detail.product_code}`} />}
        <h2>{detail.brand} {detail.product_code}</h2><p>{detail.product_name}</p>
        <strong className="price">{formatWon(detail.dealer_price_per_m)}/m</strong>
        <p>{detail.price_vat_included ? "부가세 포함" : "부가세 별도"}</p>
        <label>방염 옵션<select disabled={variantLoading || !!variantError || !variants.length} value={orderVariantKey(detail)} onChange={event => { const variant = variants.find(item => orderVariantKey(item) === event.target.value); if (variant) setDetail(variant); }}>
          {(variants.length ? variants : [detail]).map(item => <option key={orderVariantKey(item)} value={orderVariantKey(item)}>{orderFlameLabel(item.flame_type)} · {formatWon(item.dealer_price_per_m)}/m · 부가세 {item.price_vat_included?"포함":"별도"}</option>)}
        </select></label>
        {variantLoading ? <p role="status">방염·비방염 판매 옵션 확인 중...</p> : variantError ? <p role="alert">{variantError}</p> : <p className="help">{variants.length===1 ? "현재 판매 등록된 옵션은 위 옵션 한 가지입니다." : "판매 등록된 방염·비방염 옵션을 선택해주세요."}</p>}
        <label className="product-quantity">주문 길이 (m)<input type="number" inputMode="decimal" min={detail.minimum_order_m || 1} step={detail.order_unit_m || 1} value={quantities[orderVariantKey(detail)] ?? String(detail.minimum_order_m || 1)} onChange={event => setQuantities(current => ({ ...current, [orderVariantKey(detail)]: event.target.value }))} /></label>
        <div className="length-buttons"><button type="button" aria-label="주문 길이 줄이기" onClick={() => setQuantities(current => ({ ...current, [orderVariantKey(detail)]: String(Math.max(Number(detail.minimum_order_m || 1), Math.round((Number(current[orderVariantKey(detail)] || detail.minimum_order_m || 1) - Number(detail.order_unit_m || 1)) * 1000) / 1000)) }))}>−</button><button type="button" aria-label="주문 길이 늘리기" onClick={() => setQuantities(current => ({ ...current, [orderVariantKey(detail)]: String(Math.round((Number(current[orderVariantKey(detail)] || detail.minimum_order_m || 1) + Number(detail.order_unit_m || 1)) * 1000) / 1000) }))}>＋</button></div>
        <p>최소 {detail.minimum_order_m || 1}m · {detail.order_unit_m || 1}m 단위</p>
        <p role="status">{quantityError(detail, quantities[orderVariantKey(detail)] ?? detail.minimum_order_m ?? 1)}</p>
        <div className="totals">상품금액 <strong>{formatWon(calculateAmounts(detail, quantities[orderVariantKey(detail)] ?? detail.minimum_order_m ?? 1).total)}</strong></div>
        <button className="primary" type="button" disabled={variantLoading || !!variantError || !variants.length || !!quantityError(detail, quantities[orderVariantKey(detail)] ?? detail.minimum_order_m ?? 1)} onClick={() => addCart(detail)}>장바구니 담기</button>
      </section>}
      {screen === "orders" && <MaterialPilot mode="buyer" />}
      <style jsx>{`
        [hidden] { display: none !important; }
        .shop-nav, .shop-action { max-width: 760px; margin: 0 auto 18px; display: flex; gap: 8px; }
        .shop-nav button, .delivery-tabs button { flex: 1; padding: 14px 8px; border: 1px solid #e5e7eb; border-radius: 12px; background: white; color: #243648; font-weight: 700; }
        .shop-nav [aria-current="page"], .delivery-tabs [aria-pressed="true"] { border-color: #f36a20; color: #d84e0a; background: #fff6ef; }
        .delivery-tabs { display: flex; gap: 8px; margin: 16px 0; }
        .primary { width: 100%; padding: 16px; border: none; border-radius: 12px; background: #f36a20; color: white; font-size: 17px; font-weight: 800; margin-top: 16px; }
        select { width: 100%; padding: 14px; border: 1px solid #d1d5db; border-radius: 10px; background: white; font-size: 16px; margin: 8px 0; }
        .detail-image { width: 100%; max-height: 420px; object-fit: contain; border-radius: 16px; margin: 18px 0; background: #f4f1eb; }
        .length-buttons { display: flex; gap: 8px; margin-top: 8px; }
        .length-buttons button { flex: 1; padding: 10px; background: #fff6ef; border: 1px solid #efc9ae; border-radius: 10px; font-size: 20px; }
        .help { color: #6b7280; font-size: 13px; }
        * {
          box-sizing: border-box;
        }

        .page {
          min-height: 100vh;
          padding: 18px 15px 100px;
          background: #f8f6f2;
          color: #111827;
        }

        .header,
        .panel,
        .payment,
        .message {
          max-width: 760px;
          margin-left: auto;
          margin-right: auto;
        }

        .header {
          display: flex;
          gap: 12px;
          margin-bottom: 16px;
        }

        .back {
          width: 44px;
          height: 44px;
          flex-shrink: 0;
          border: 1px solid #d1d5db;
          border-radius: 14px;
          background: white;
          font-size: 24px;
        }

        .badge {
          padding: 6px 10px;
          border-radius: 999px;
          background: #111827;
          color: white;
          font-size: 12px;
          font-weight: 900;
        }

        h1 {
          margin: 10px 0 5px;
          font-size: 29px;
        }

        h2 {
          margin: 0 0 14px;
          font-size: 21px;
        }

        .header p {
          margin: 0;
          color: #6b7280;
        }

        .message {
          position: sticky;
          top: 8px;
          z-index: 30;
          margin-bottom: 12px;
          padding: 13px;
          border-radius: 13px;
          font-weight: 900;
        }

        .message.success {
          background: #ecfdf5;
          color: #047857;
        }

        .message.error {
          background: #fef2f2;
          color: #b91c1c;
        }

        .panel {
          margin-bottom: 15px;
          padding: 17px;
          border: 1px solid #e5e7eb;
          border-radius: 21px;
          background: white;
        }

        .search,
        .address-form > input,
        .address-form textarea,
        .delivery textarea,
        .two input {
          width: 100%;
          min-height: 47px;
          padding: 11px 13px;
          border: 1px solid #d1d5db;
          border-radius: 12px;
          font: inherit;
        }

        .brands {
          display: flex;
          flex-wrap: wrap;
          gap: 7px;
          margin: 12px 0;
        }

        .brands button {
          padding: 9px 13px;
          border: 1px solid #d1d5db;
          border-radius: 999px;
          background: white;
          font-weight: 800;
        }

        .brands .active {
          border-color: #e95e17;
          background: #e95e17;
          color: white;
        }

        .empty {
          padding: 30px 10px;
          border-radius: 14px;
          background: #f9fafb;
          color: #6b7280;
          text-align: center;
        }

        .products {
          display: grid;
          grid-template-columns:
            repeat(2, minmax(0, 1fr));
          gap: 9px;
        }

        .product {
          overflow: hidden;
          border: 1px solid #e5e7eb;
          border-radius: 16px;
        }

        .image {
          aspect-ratio: 1 / 0.8;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          background: #f3f4f6;
          color: #9ca3af;
          font-size: 11px;
        }

        .image img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .product-info {
          padding: 11px;
        }

        .product-info > strong {
          font-size: 18px;
        }

        .product-info p {
          min-height: 35px;
          margin: 4px 0;
          color: #4b5563;
          font-size: 12px;
        }

        .price {
          color: #e95e17;
          font-weight: 900;
        }

        .product-info small {
          display: block;
          color: #9ca3af;
        }

        .product-info button {
          width: 100%;
          height: 40px;
          margin-top: 8px;
          border: 0;
          border-radius: 10px;
          background: #111827;
          color: white;
          font-weight: 900;
        }

        button:disabled {
          opacity: 0.4;
        }

        .pagination {
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          align-items: center;
          gap: 10px;
          margin-top: 13px;
        }

        .pagination button {
          height: 43px;
          border: 1px solid #d1d5db;
          border-radius: 11px;
          background: white;
          font-weight: 900;
        }

        .title-row,
        .cart-head,
        .item-total,
        .totals > div,
        .payment > div {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        .title-row strong {
          color: #e95e17;
        }

        .outline {
          padding: 8px 11px;
          border: 1px solid #e95e17;
          border-radius: 10px;
          background: white;
          color: #e95e17;
          font-weight: 900;
        }

        .cart-list,
        .address-list,
        .address-form {
          display: grid;
          gap: 9px;
        }

        .cart {
          padding: 13px;
          border: 1px solid #e5e7eb;
          border-radius: 15px;
        }

        .cart-head p {
          margin: 3px 0 0;
          color: #6b7280;
          font-size: 12px;
        }

        .cart-head button {
          border: 0;
          background: transparent;
          color: #dc2626;
          font-weight: 900;
        }

        .quantity {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-top: 12px;
          color: #6b7280;
          font-size: 11px;
        }

        .quantity label {
          display: flex;
          align-items: center;
          gap: 5px;
        }

        .quantity input {
          width: 85px;
          height: 41px;
          border: 1px solid #d1d5db;
          border-radius: 10px;
          padding: 0 8px;
          font-size: 16px;
          font-weight: 900;
        }

        .item-total {
          margin-top: 11px;
          padding-top: 11px;
          border-top: 1px solid #f0f1f3;
          font-size: 13px;
        }

        .totals {
          margin-top: 13px;
          padding: 14px;
          border-radius: 14px;
          background: #f9fafb;
        }

        .totals > div {
          margin-bottom: 8px;
          color: #6b7280;
          font-size: 13px;
        }

        .totals .final {
          margin: 10px 0 0;
          padding-top: 11px;
          border-top: 1px solid #d1d5db;
          color: #111827;
          font-size: 16px;
        }

        .final strong {
          color: #e95e17;
          font-size: 20px;
        }

        .address {
          display: grid;
          grid-template-columns: auto 1fr;
          gap: 10px;
          padding: 13px;
          border: 2px solid #e5e7eb;
          border-radius: 14px;
        }

        .address.selected {
          border-color: #e95e17;
          background: #faf7ff;
        }

        .address input {
          width: 20px;
          height: 20px;
          accent-color: #e95e17;
        }

        .address p {
          margin: 4px 0 0;
          color: #6b7280;
          font-size: 12px;
        }

        .address-form {
          margin-top: 13px;
          padding: 14px;
          border-radius: 15px;
          background: #f9fafb;
        }

        .two {
          display: grid;
          grid-template-columns:
            repeat(2, minmax(0, 1fr));
          gap: 8px;
        }

        .default {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          font-weight: 800;
        }

        .default input {
          width: 20px;
          height: 20px;
        }

        .save-address {
          min-height: 48px;
          border: 0;
          border-radius: 12px;
          background: #111827;
          color: white;
          font-weight: 900;
        }

        .address-status {
          padding: 11px;
          border-radius: 11px;
          background: #ecfdf5;
          color: #047857;
          font-size: 13px;
          font-weight: 900;
        }

        .address-status.fail {
          background: #fef2f2;
          color: #b91c1c;
        }

        .delivery {
          display: block;
          margin-top: 14px;
        }

        .delivery span {
          display: block;
          margin-bottom: 7px;
          font-size: 13px;
          font-weight: 900;
        }

        .delivery textarea {
          min-height: 75px;
        }

        .payment {
          position: static;
          margin-top: 20px;
          z-index: 20;
          padding: 16px;
          border: 1px solid #ddd6fe;
          border-radius: 18px;
          background: rgba(
            255,
            255,
            255,
            0.97
          );
          box-shadow: 0 12px 30px
            rgba(17, 24, 39, 0.16);
        }

        .product-quantity { display: grid; gap: 8px; margin-top: 16px; font-weight: 700; }
        .product-quantity input { width: 100%; min-width: 0; min-height: 48px; padding: 10px; font-size: 18px; border: 1px solid #cbd5e1; border-radius: 10px; }
        .product-quantity small { font-size: 12px; font-weight: 400; }
        .payment strong {
          color: #e95e17;
          font-size: 21px;
        }

        .payment button {
          width: 100%;
          min-height: 52px;
          margin-top: 11px;
          border: 0;
          border-radius: 13px;
          background: #111827;
          color: white;
          font-size: 15px;
          font-weight: 900;
        }

        @media (min-width: 700px) {
          .products {
            grid-template-columns:
              repeat(3, minmax(0, 1fr));
          }
        }
      `}</style>
    </main>
  );
                }


