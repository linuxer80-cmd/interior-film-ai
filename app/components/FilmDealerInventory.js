"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { reportRequest } from "../utils/reportClient";
import FilmThumbnail from "../worker/cutting/FilmThumbnail";

const money = n => Number(n || 0).toLocaleString("ko-KR", { maximumFractionDigits: 2 });
const number = n => Number(Number(n || 0).toFixed(3));
const valid = (n, max) => String(n).trim() !== "" && Number.isFinite(Number(n)) && Number(n) >= 0 && Number(n) <= max;
const statuses = { available: "보관 중", on_site: "현장 반출", supplier_returned: "대리점 반납", used_up: "전량 사용" };
const actions = { receive: "입고", issue: "현장 반출", return: "현장 반입", supplier_return: "대리점 반납" };
const types = { non_fire: "비방염", fire: "방염", unspecified: "기존 단가 · 구분 미지정" };

const brandLabel = value => {
  const raw = String(value || "").trim();
  const key = raw.replace(/\s/g, "").toUpperCase();
  if (["영림", "영림인테리어필름"].includes(key)) return "영림";
  if (["LX", "LX하우시스베니프"].includes(key)) return "LX 베니프";
  return raw || "브랜드 미등록";
};

const emptyProduct = { brand: "", productCode: "", productName: "", unitPrice: "" };
const emptyDealer = { name: "", phone: "", brands: "" };

export default function FilmDealerInventory() {
  const [data, setData] = useState(null), [tab, setTab] = useState("stock");
  const [priceType, setPriceType] = useState("non_fire");
  const [dealerId, setDealerId] = useState(""), [dealer, setDealer] = useState(emptyDealer);
  const [selected, setSelected] = useState(null), [query, setQuery] = useState("");
  const [results, setResults] = useState([]), [searched, setSearched] = useState(false);
  const [newProduct, setNewProduct] = useState(emptyProduct), [registering, setRegistering] = useState(false);
  const [price, setPrice] = useState("");
  const [editingProduct, setEditingProduct] = useState(false);
  const [editingSource, setEditingSource] = useState(false);
  const lengthInputs = useRef([]), focusIndex = useRef(null);
  const [lengths, setLengths] = useState([""]);
  const [receiptPending, setReceiptPending] = useState(false);
  const receipt = useRef(null);
  const [location, setLocation] = useState("창고"), [memo, setMemo] = useState("");
  const [filter, setFilter] = useState("available"), [stockQuery, setStockQuery] = useState("");
  const [stockBrand, setStockBrand] = useState(""), [stockPage, setStockPage] = useState(1);
  const [returnId, setReturnId] = useState(""), [credit, setCredit] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const gate = useRef(false), epoch = useRef(0), searchEpoch = useRef(0), mounted = useRef(false), pending = useRef(null);
  const [draftKey, setDraftKey] = useState("");
  const [draftWarning, setDraftWarning] = useState("");
  const userRef = useRef(undefined), keyRef = useRef(""), draftRef = useRef(null);

  useLayoutEffect(() => {
    if (focusIndex.current !== null && tab === "receive" && selected && !editingProduct) {
      const input = lengthInputs.current[focusIndex.current];
      if (input) {
        input.focus();
        focusIndex.current = null;
      }
    }
  }, [lengths, selected, editingProduct, tab]);

  function persistDraft() {
    if (!keyRef.current || !draftRef.current) return;
    try {
      sessionStorage.setItem(keyRef.current, JSON.stringify({
        ...draftRef.current,
        receipt: receipt.current,
        pending: pending.current
      }));
    } catch {
      setDraftWarning("이 브라우저에서 임시저장이 차단되었습니다. 화면을 이동하기 전에 입고를 저장해주세요.");
    }
  }

  useLayoutEffect(() => {
    draftRef.current = {
      tab, priceType, dealerId, dealer, selected, query,
      price, lengths, location, memo, filter, stockQuery,
      returnId, credit, newProduct, registering
    };
    if (draftKey) persistDraft();
  }, [
    draftKey, tab, priceType, dealerId, dealer, selected, query,
    price, lengths, location, memo, filter, stockQuery,
    returnId, credit, receiptPending, newProduct, registering
  ]);

  async function refresh() {
    const version = ++epoch.current;
    try {
      const result = await reportRequest("/api/film-dealers");
      if (mounted.current && epoch.current === version) {
        setData(result);
        setError("");
      }
    } catch (e) {
      if (mounted.current && epoch.current === version) setError(e.message);
    }
  }

  useEffect(() => {
    mounted.current = true;

    async function connect(userId) {
      if (!mounted.current || userRef.current === userId) return;
      persistDraft();
      userRef.current = userId;
      const version = ++epoch.current;
      searchEpoch.current++;
      keyRef.current = "";
      setDraftKey("");
      receipt.current = null;
      pending.current = null;
      setReceiptPending(false);
      setData(null);
      setTab("stock");
      setDealerId("");
      setDealer(emptyDealer);
      setSelected(null);
      setQuery("");
      setResults([]);
      setSearched(false);
      setPriceType("non_fire");
      setPrice("");
      setLengths([""]);
      setLocation("창고");
      setMemo("");
      setReturnId("");
      setStockBrand("");
      setStockPage(1);
      setCredit("");
      setFilter("available");
      setStockQuery("");
      setMessage("");
      setError("");
      setDraftWarning("");
      setNewProduct(emptyProduct);
      setRegistering(false);

      if (!userId) {
        setError("다시 로그인해주세요.");
        return;
      }

      try {
        const { data: membership, error: membershipError } =
          await supabase.rpc("get_my_company");

        if (membershipError) throw membershipError;

        const company = Array.isArray(membership) ? membership[0] : membership;

        if (!company?.company_id || company.role !== "owner" || company.is_active === false) {
          throw Error("활성 관리자 계정의 회사 정보를 확인해주세요.");
        }

        const result = await reportRequest("/api/film-dealers");
        if (!mounted.current || version !== epoch.current) return;

        const key = `film-inventory-draft:v1:${userId}:${company.company_id}`;
        let draft = null;

        try {
          draft = JSON.parse(sessionStorage.getItem(key) || "null");
        } catch {
          setDraftWarning("이전 임시저장을 읽지 못했습니다.");
        }

        if (draft && typeof draft === "object") {
          setTab(["stock", "receive", "dealers"].includes(draft.tab) ? draft.tab : "receive");
          setPriceType(types[draft.priceType] ? draft.priceType : "non_fire");

          const dealerExists = result.dealers.some(d => d.id === draft.dealerId);
          setDealerId(dealerExists ? draft.dealerId : "");
          setDealer(draft.dealer || emptyDealer);
          setSelected(dealerExists ? draft.selected || null : null);
          setQuery(draft.query || "");
          setPrice(draft.price || "");

          setLengths(
            Array.isArray(draft.lengths) &&
            draft.lengths.length > 0 &&
            draft.lengths.length <= 50
              ? draft.lengths.map(String)
              : [""]
          );

          setLocation(draft.location ?? "창고");
          setMemo(draft.memo || "");
          setFilter(draft.filter || "available");
          setStockQuery(draft.stockQuery || "");
          setReturnId(draft.returnId || "");
          setCredit(draft.credit || "");
          setNewProduct(draft.newProduct || emptyProduct);
          setRegistering(!!draft.registering);
          setEditingProduct(!!draft.registering);
          pending.current = draft.pending || null;

          if (
            draft.receipt &&
            Array.isArray(draft.receipt.jobs) &&
            draft.receipt.jobs.length <= 50 &&
            Number.isInteger(draft.receipt.index) &&
            draft.receipt.index >= 0 &&
            draft.receipt.index <= draft.receipt.jobs.length
          ) {
            receipt.current = draft.receipt;
            setReceiptPending(true);
            setTab("receive");
            setMessage("진행 중이던 입고가 있습니다. 아래 버튼으로 결과를 확인하고 이어서 저장해주세요.");
          } else {
            setMessage("이전에 입력하던 내용을 복원했습니다.");
          }
        }

        keyRef.current = key;
        setDraftKey(key);
        setData(result);
      } catch (e) {
        if (mounted.current && version === epoch.current) {
          setError(e.message);
          userRef.current = undefined;
        }
      }
    }

    const { data: auth } = supabase.auth.onAuthStateChange((event, session) => {
      if (["INITIAL_SESSION", "SIGNED_IN", "SIGNED_OUT", "USER_UPDATED"].includes(event)) {
        const id = session?.user?.id || null;
        setTimeout(() => {
          if (mounted.current) connect(id);
        }, 0);
      }
    });

    supabase.auth.getSession().then(({ data: authData, error: authError }) => {
      if (!mounted.current) return;
      if (authError) setError(authError.message);
      else connect(authData.session?.user?.id || null);
    });

    const flush = () => persistDraft();
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flush);

    return () => {
      persistDraft();
      mounted.current = false;
      userRef.current = undefined;
      epoch.current++;
      searchEpoch.current++;
      auth.subscription.unsubscribe();
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", flush);
    };
  }, []);

  const prices = (data?.prices || []).filter(
    p => p.dealer_id === dealerId && p.price_type === priceType
  );
  const savedPrice = prices.find(p => p.product_id === selected?.id);
  const purchases = new Map((data?.purchases || []).map(p => [p.roll_id, p]));
  const allRolls = data?.stock?.rolls || [];
  const stored = allRolls.filter(r => r.status === "available");

  const inventoryValue = stored.reduce(
    (sum, r) => sum + Number(r.remaining) * Number(purchases.get(r.id)?.unit_price || 0),
    0
  );

  const unknown = stored.filter(r => !purchases.has(r.id)).length;
  const normalize = value => String(value || "").replace(/\s/g, "").toUpperCase();
  const q = normalize(stockQuery);
  const brands = [...new Set(allRolls.map(r => brandLabel(r.brand)))]
    .sort((a, b) => a.localeCompare(b, "ko"));

  const rolls = allRolls.filter(r =>
    (filter === "all" || r.status === filter) &&
    (!stockBrand || brandLabel(r.brand) === stockBrand) &&
    normalize(
      `${r.brand} ${brandLabel(r.brand)} ${r.product_code} ${r.supplier} ${r.location} ${r.site_name || ""} ${purchases.get(r.id)?.product_name || ""}`
    ).includes(q)
  );

  const grouped = new Map();

  rolls.forEach(r => {
    const purchase = purchases.get(r.id);
    const kind = purchase?.price_type || "unspecified";
    const key = JSON.stringify([r.brand, normalize(r.product_code), kind, r.status]);

    if (!grouped.has(key)) {
      grouped.set(key, {
        key,
        brand: r.brand,
        code: r.product_code,
        name: purchase?.product_name || "",
        kind,
        status: r.status,
        metres: 0,
        rolls: []
      });
    }

    const group = grouped.get(key);
    group.metres += Number(r.remaining);
    group.rolls.push(r);
  });

  const groups = [...grouped.values()].sort((a, b) =>
    brandLabel(a.brand).localeCompare(brandLabel(b.brand), "ko") ||
    String(a.code).localeCompare(String(b.code), "ko", { numeric: true }) ||
    a.key.localeCompare(b.key)
  );

  const pageCount = Math.max(1, Math.ceil(groups.length / 5));
  const currentPage = Math.min(stockPage, pageCount);
  const pageGroups = groups.slice((currentPage - 1) * 5, currentPage * 5);
  const filteredStored = rolls.filter(r => r.status === "available");

  function chooseDealer(value) {
    setRegistering(false);
    searchEpoch.current++;
    setDealerId(value);
    setSelected(null);
    setQuery("");
    setResults([]);
    setSearched(false);
    setPrice("");
  }

  function chooseProduct(p) {
    setRegistering(false);
    searchEpoch.current++;
    setResults([]);
    setSearched(false);
    setEditingProduct(false);
    setEditingSource(false);
    focusIndex.current = 0;
    setSelected(p);
    setPrice(String(prices.find(x => x.product_id === p.id)?.unit_price ?? ""));
  }

  async function search() {
    const version = ++searchEpoch.current;
    const authVersion = epoch.current;
    setError("");
    setSearched(false);

    try {
      const result = await reportRequest("/api/film-dealers", { action: "search", query });
      if (mounted.current && searchEpoch.current === version && epoch.current === authVersion) {
        setResults(result.products);
        setSearched(true);
      }
    } catch (e) {
      if (mounted.current && searchEpoch.current === version && epoch.current === authVersion) {
        setError(e.message);
      }
    }
  }

  async function save(action, fields) {
    if (gate.current) return;

    const body = { action, ...fields };
    const signature = JSON.stringify(body);

    if (pending.current?.signature !== signature) {
      pending.current = { signature, id: crypto.randomUUID() };
    }

    persistDraft();
    gate.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    const version = ++epoch.current;

    try {
      const result = await reportRequest("/api/film-dealers", {
        ...body,
        requestId: pending.current.id
      });

      if (!mounted.current || version !== epoch.current) return;

      setData(result);
      pending.current = null;
      persistDraft();
      setMessage("저장되었습니다.");

      if (action === "register_product" && result.registeredProduct) {
        chooseProduct(result.registeredProduct);
        setNewProduct(emptyProduct);
        setPrice(String(result.prices.find(p =>
          p.product_id === result.registeredProduct.id &&
          p.dealer_id === dealerId &&
          p.price_type === priceType
        )?.unit_price ?? ""));
        setMessage("제품과 공급가를 저장했습니다. 입고할 롤 길이를 입력해주세요.");
        setTab("receive");
      }

      if (action === "dealer") setDealer(emptyDealer);
      if (action === "receive") {
        setMemo("");
        setTab("stock");
      }
      if (action === "supplier_return") set
