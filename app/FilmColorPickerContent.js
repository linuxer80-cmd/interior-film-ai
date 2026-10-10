"use client";

import { matchesFilmSearch } from "../lib/hyundaiFilmCode";
import {
  pickerBrand,
  pickerProductLine,
} from "../lib/filmPickerClassification.mjs";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import FilmSampleImage from "./components/FilmSampleImage";

const PAGE_SIZE = 12;

const pageButtonStyle = {
  minWidth: "36px",
  minHeight: "40px",
  padding: "7px 9px",
  border: "1px solid #d1d5db",
  borderRadius: "8px",
  background: "#fff",
  color: "#111827",
  fontSize: "13px",
  fontWeight: 700,
  cursor: "pointer",
};

function getSampleName(product) {
  let name = String(product?.product_name || "").trim();

  name = name
    .replace(/\s*\/\s*[A-Z]{1,8}[- ]?\d[A-Z0-9-]*\s*$/i, "")
    .trim();

  const brand = String(product?.brand || "").trim();

  const prefixes = [
    brand,
    "한솔",
    "현대",
    "영림",
    "예림",
    "삼성",
    "LX하우시스",
    "KCC글라스",
    "3M",
  ]
    .filter((prefix) => prefix && brand.includes(prefix))
    .sort((a, b) => b.length - a.length);

  for (const prefix of prefixes) {
    if (name.startsWith(`${prefix} `)) {
      name = name.slice(prefix.length).trim();
      break;
    }
  }

  return name === String(product?.product_code || "").trim()
    ? ""
    : name;
}

const PRODUCT_LINES = [
  { prefix: "OGW", label: "옵티컬 그레인 우드", category: "wood", filter: "wood" },
  { prefix: "SPW", label: "스페셜우드", category: "wood", filter: "wood" },
  { prefix: "LW", label: "롱우드", category: "wood", filter: "wood" },
  { prefix: "ZX", label: "프리미엄우드", category: "wood", filter: "wood" },
  { prefix: "PNT", label: "프리미엄페인티드우드", category: "solid", filter: "color" },
  { prefix: "PTW", label: "페인티드우드", category: "solid", filter: "color" },
  { prefix: "ZSW", label: "슈퍼화이트우드", category: "solid", filter: "color" },
  { prefix: "CP", label: "텍스쳐", category: "solid", filter: "color" },
  { prefix: "HS", label: "텍스쳐", category: "solid", filter: "color" },
  { prefix: "LM", label: "텍스쳐", category: "solid", filter: "color" },
  { prefix: "LS", label: "텍스쳐", category: "solid", filter: "color" },
  { prefix: "NS", label: "스톤앤마블", category: "stone", filter: "tone" },
  { prefix: "PM", label: "프리미엄마블", category: "stone", filter: "tone" },
  { prefix: "PNC", label: "프리미엄페인티드콘크리트", category: "stone", filter: "tone" },
  { prefix: "UMI", label: "고광택메탈", category: "metal", filter: "color" },
  { prefix: "APZ", label: "골드", category: "metal", filter: "color" },
  { prefix: "RM", label: "리얼메탈", category: "metal", filter: "color" },
  { prefix: "VM", label: "벨벳메탈", category: "metal", filter: "color" },
  { prefix: "SF", label: "소프트패브릭", category: "fabric", filter: "tone" },
  { prefix: "RF", label: "리얼패브릭", category: "fabric", filter: "tone" },
  { prefix: "NF", label: "네츄럴패브릭", category: "fabric", filter: "tone" },
  { prefix: "SL", label: "소프트레더", category: "leather", filter: "tone" },
  { prefix: "ECF", label: "이지클린필름", category: "etc", filter: "color" },
  { prefix: "EXF", label: "외장용필름", category: "etc", filter: "color" },
  { prefix: "BLC", label: "모노블랑", category: "etc", filter: "color" },
  { prefix: "SMT", label: "슈퍼매트", category: "etc", filter: "color" },
  { prefix: "W", label: "우드", category: "wood", filter: "wood" },
  { prefix: "S", label: "솔리드", category: "solid", filter: "color" },
];

const CATEGORIES = [
  { key: "wood", label: "우드" },
  { key: "solid", label: "솔리드" },
  { key: "stone", label: "스톤&마블" },
  { key: "metal", label: "메탈" },
  { key: "fabric", label: "패브릭" },
  { key: "leather", label: "레더" },
  { key: "etc", label: "기타" },
];

function unique(values) {
  return [
    ...new Set(
      values
        .filter((value) => value !== null && value !== undefined)
        .map((value) => String(value).trim())
        .filter(Boolean)
    ),
  ];
}

function getProductLine(productCode) {
  const code = String(productCode || "").trim().toUpperCase();
  if (!code) return null;
  return PRODUCT_LINES.find((line) => code.startsWith(line.prefix)) || null;
}

function getLineFilter(categoryKey) {
  if (categoryKey === "wood") return "wood";
  if (["stone", "fabric", "leather"].includes(categoryKey)) return "tone";
  return "color";
}

function getProductLineInfo(product) {
  return pickerProductLine(
    product,
    getProductLine(product?.product_code)
  );
}

function getToneLabel(value) {
  const labels = {
    라이트톤: "라이트",
    미디엄톤: "미디엄",
    딥톤: "딥",
    기타톤: "포인트",
  };
  return labels[value] || value;
}

function getProductKey(product) {
  if (product?.id !== null && product?.id !== undefined) {
    return String(product.id);
  }
  return `${String(product?.brand || "").trim()}::${String(
    product?.product_code || ""
  ).trim()}`;
}

function getSelectionCount(product, selectionStats) {
  return Number(selectionStats[getProductKey(product)] || 0);
}

function stablePopularitySort(items, getScore) {
  return items
    .map((item, index) => ({
      item,
      index,
      score: Number(getScore(item)) || 0,
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ item }) => item);
}

function formatPrice(value) {
  const price = Number(value);
  if (!Number.isFinite(price) || price <= 0) return "";
  return `${price.toLocaleString("ko-KR")}원`;
}

function ChipRow({ items = [], value, onChange, showAll = false }) {
  if (!items.length) return null;

  return (
    <div
      style={
        showAll
          ? {
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: "8px",
              width: "100%",
            }
          : {
              display: "flex",
              gap: "7px",
              overflowX: "auto",
              paddingBottom: "4px",
              WebkitOverflowScrolling: "touch",
              scrollbarWidth: "none",
            }
      }
    >
      {items.map((item) => {
        const active = value === item.value;
        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onChange(item.value)}
            style={{
              flex: showAll ? undefined : "0 0 auto",
              width: showAll ? "100%" : "auto",
              minWidth: 0,
              minHeight: "42px",
              padding: showAll ? "9px 8px" : "8px 13px",
              borderRadius: "999px",
              border: active ? "2px solid #111827" : "1px solid #d1d5db",
              background: active ? "#111827" : "#ffffff",
              color: active ? "#ffffff" : "#374151",
              fontSize: "13px",
              fontWeight: "700",
              lineHeight: 1.3,
              whiteSpace: showAll ? "normal" : "nowrap",
              wordBreak: "keep-all",
              textAlign: "center",
              cursor: "pointer",
            }}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function FilterSection({ title, children }) {
  return (
    <div style={{ marginBottom: "11px" }}>
      <div
        style={{
          marginBottom: "6px",
          fontSize: "11px",
          color: "#6b7280",
          fontWeight: "800",
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function FilmSample({ product, size = "100%" }) {
  return <FilmSampleImage product={product} size={size} />;
}

export default function FilmColorPicker({
  onSelect,
  onGenerate,
  sampleMode = false,
  onProductsLoaded,
  value = null,
}) {
  const [products, setProducts] = useState([]);
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");
  const [lineKey, setLineKey] = useState("");
  const [detail, setDetail] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(value || null);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [pickerOpen, setPickerOpen] = useState(sampleMode);
  const [selectionStats, setSelectionStats] = useState({});
  const [page, setPage] = useState(1);

  const scrollRef = useRef(null);
  const resultsRef = useRef(null);

  useEffect(() => {
    if (value !== undefined) setSelected(value || null);
  }, [value]);

  useEffect(() => {
    let mounted = true;

    async function loadProducts() {
      setLoading(true);
      setMessage("");

      const FETCH_SIZE = 1000;
      const selectColumns = [
        "id", "brand", "product_code", "product_name",
        "category_key", "pattern_line", "color_family",
        "color_description", "color_hex", "texture", "grade",
        "wood_species", "tone_family", "sample_image_path",
        "fire_price_per_meter", "non_fire_price_per_meter",
        "material_price_per_meter", "price_multiplier",
        "additional_cost", "sort_order",
      ].join(",");

      let data = [];
      let error = null;
      let from = 0;

      while (mounted) {
        const result = await supabase
          .from("film_products")
          .select(selectColumns)
          .eq("is_active", true)
          .order("brand", { ascending: true })
          .order("sort_order", { ascending: true })
          .order("id", { ascending: true })
          .range(from, from + FETCH_SIZE - 1);

        if (result.error) {
          error = result.error;
          break;
        }

        const rows = result.data || [];
        data = [...data, ...rows];
        if (rows.length < FETCH_SIZE) break;
        from += FETCH_SIZE;
      }

      if (!mounted) return;

      if (error) {
        console.error("필름 제품 조회 오류:", error);
        setProducts([]);
        setMessage(
          `필름 제품을 불러오지 못했습니다. ${error.message || ""}`
        );
      } else {
        const rows = (data || []).map((product) => ({
          ...product,
          wood_species: String(product.wood_species || "").trim(),
          tone_family: String(product.tone_family || "").trim(),
          color_family: String(product.color_family || "").trim(),
        }));

        setProducts(rows);

        onProductsLoaded?.(
          rows.map((product) => ({
            ...product,
            category_key:
              getProductLineInfo(product)?.category ||
              product.category_key ||
              "",
          }))
        );

        const brandList = unique(
          rows.map((item) => pickerBrand(item.brand))
        );

        if (brandList.length === 1) setBrand(brandList[0]);
      }

      setLoading(false);
    }

    loadProducts();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadSelectionStats() {
      try {
        const response = await fetch("/api/film-selection", {
          method: "GET",
          cache: "no-store",
        });

        if (!response.ok) return;

        const body = await response.json();
        const rows = Array.isArray(body)
          ? body
          : Array.isArray(body?.stats)
          ? body.stats
          : Array.isArray(body?.data)
          ? body.data
          : [];

        if (!mounted) return;

        const nextStats = {};

        rows.forEach((row) => {
          const key = String(row?.product_key || "").trim();
          if (key) {
            nextStats[key] = Number(row?.selection_count || 0);
          }
        });

        setSelectionStats(nextStats);
      } catch (error) {
        console.warn("필름 선택 통계 조회 오류:", error);
      }
    }

    loadSelectionStats();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!pickerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [pickerOpen]);

  const brands = useMemo(() => {
    const brandList = unique(
      products.map((item) => pickerBrand(item.brand))
    );

    return stablePopularitySort(brandList, (brandName) =>
      products
        .filter((product) => pickerBrand(product.brand) === brandName)
        .reduce(
          (sum, product) =>
            sum + getSelectionCount(product, selectionStats),
          0
        )
    );
  }, [products, selectionStats]);

  const availableCategories = useMemo(() => {
    if (!brand) return [];

    const brandProducts = products.filter(
      (product) => pickerBrand(product.brand) === brand
    );

    return CATEGORIES.filter((categoryItem) =>
      brandProducts.some(
        (product) =>
          getProductLineInfo(product)?.category === categoryItem.key
      )
    );
  }, [brand, products]);

  const availableLines = useMemo(() => {
    if (!brand || !category) return [];

    const brandProducts = products.filter(
      (product) => pickerBrand(product.brand) === brand
    );

    const lineMap = new Map();

    brandProducts.forEach((product) => {
      const line = getProductLineInfo(product);
      if (!line || line.category !== category) return;

      if (!lineMap.has(line.label)) {
        lineMap.set(line.label, {
          key: line.label,
          label: line.label,
          prefixes: [],
          filter: line.filter,
        });
      }

      const lineItem = lineMap.get(line.label);
      if (!lineItem.prefixes.includes(line.prefix)) {
        lineItem.prefixes.push(line.prefix);
      }
    });

    return stablePopularitySort(
      [...lineMap.values()],
      (lineItem) =>
        brandProducts
          .filter((product) =>
            lineItem.prefixes.includes(
              getProductLineInfo(product)?.prefix
            )
          )
          .reduce(
            (sum, product) =>
              sum + getSelectionCount(product, selectionStats),
            0
          )
    );
  }, [brand, category, products, selectionStats]);

  const selectedLine = useMemo(
    () =>
      availableLines.find((line) => line.key === lineKey) || null,
    [availableLines, lineKey]
  );

  const lineProducts = useMemo(() => {
    if (!brand || !category || !selectedLine) return [];

    return products.filter((product) => {
      if (pickerBrand(product.brand) !== brand) return false;

      const line = getProductLineInfo(product);
      if (!line || line.category !== category) return false;

      return selectedLine.prefixes.includes(line.prefix);
    });
  }, [brand, category, selectedLine, products]);

  const details = useMemo(() => {
    if (!selectedLine) return [];

    const field =
      selectedLine.filter === "wood"
        ? "wood_species"
        : selectedLine.filter === "tone"
        ? "tone_family"
        : "color_family";

    const detailList = unique(
      lineProducts.map((item) => item[field])
    );

    return stablePopularitySort(detailList, (detailName) =>
      lineProducts
        .filter((product) => product[field] === detailName)
        .reduce(
          (sum, product) =>
            sum + getSelectionCount(product, selectionStats),
          0
        )
    );
  }, [selectedLine, lineProducts, selectionStats]);

  const matches = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    const sourceProducts = keyword ? products : lineProducts;

    const filteredProducts = sourceProducts.filter((item) => {
      if (!keyword && detail && selectedLine) {
        if (
          selectedLine.filter === "wood" &&
          item.wood_species !== detail
        ) return false;

        if (
          selectedLine.filter === "tone" &&
          item.tone_family !== detail
        ) return false;

        if (
          selectedLine.filter === "color" &&
          item.color_family !== detail
        ) return false;
      }

      if (keyword) {
        return matchesFilmSearch(item, search, true);
      }

      return true;
    });

    return stablePopularitySort(
      filteredProducts,
      (product) => getSelectionCount(product, selectionStats)
    );
  }, [
    products,
    lineProducts,
    selectedLine,
    detail,
    search,
    selectionStats,
  ]);

  const totalPages = Math.max(
    1,
    Math.ceil(matches.length / PAGE_SIZE)
  );
  const currentPage = Math.min(page, totalPages);
  const firstPage = Math.max(
    1,
    Math.min(currentPage - 2, totalPages - 4)
  );
  const pageNumbers = Array.from(
    { length: Math.min(5, totalPages) },
    (_, index) => firstPage + index
  );

  const visibleProducts = sampleMode
    ? matches.slice(
        (currentPage - 1) * PAGE_SIZE,
        currentPage * PAGE_SIZE
      )
    : matches.slice(0, limit);

  function changePage(nextPage) {
    setPage(Math.max(1, Math.min(totalPages, nextPage)));

    requestAnimationFrame(() => {
      const container = scrollRef.current;
      const results = resultsRef.current;
      if (!container || !results) return;

      const top =
        results.getBoundingClientRect().top -
        container.getBoundingClientRect().top +
        container.scrollTop;

      container.scrollTo({
        top: Math.max(0, top),
        behavior: "auto",
      });

      results.focus({ preventScroll: true });
    });
  }

  const pagination =
    sampleMode && totalPages > 1 ? (
      <nav
        aria-label="샘플 페이지"
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "4px",
          margin: "12px 0",
        }}
      >
        <button
          type="button"
          disabled={currentPage === 1}
          onClick={() => changePage(currentPage - 1)}
          style={{
            ...pageButtonStyle,
            opacity: currentPage === 1 ? 0.4 : 1,
          }}
        >
          이전
        </button>

        {pageNumbers.map((number) => (
          <button
            key={number}
            type="button"
            aria-label={`${number}페이지`}
            aria-current={
              currentPage === number ? "page" : undefined
            }
            onClick={() => changePage(number)}
            style={{
              ...pageButtonStyle,
              background:
                currentPage === number ? "#111827" : "#fff",
              color:
                currentPage === number ? "#fff" : "#111827",
            }}
          >
            {number}
          </button>
        ))}

        <button
          type="button"
          disabled={currentPage === totalPages}
          onClick={() => changePage(currentPage + 1)}
          style={{
            ...pageButtonStyle,
            opacity: currentPage === totalPages ? 0.4 : 1,
          }}
        >
          다음
        </button>
      </nav>
    ) : null;

  const selectedPrice =
    Number(selected?.material_price_per_meter) ||
    Number(selected?.fire_price_per_meter) ||
    Number(selected?.non_fire_price_per_meter) ||
    0;

  function clearProduct() {
    setSelected(null);
    setSearch("");
    setLimit(PAGE_SIZE);
    setPage(1);
    onSelect?.(null);
  }

  function chooseBrand(nextBrand) {
    setBrand(nextBrand);
    setCategory("");
    setLineKey("");
    setDetail("");
    clearProduct();
  }

  function chooseCategory(nextCategory) {
    setCategory(nextCategory);
    setLineKey("");
    setDetail("");
    clearProduct();
  }

  function chooseLine(nextLine) {
    setLineKey(nextLine);
    setDetail("");
    clearProduct();
  }

  function chooseDetail(nextDetail) {
    setDetail(nextDetail);
    setSearch("");
    setLimit(PAGE_SIZE);
    setPage(1);
  }

  function chooseProduct(product) {
    setSelected(product);

    const productKey = getProductKey(product);

    setSelectionStats((current) => ({
      ...current,
      [productKey]: Number(current[productKey] || 0) + 1,
    }));

    fetch("/api/film-selection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productKey }),
    }).catch((error) => {
      console.warn("필름 선택 통계 저장 오류:", error);
    });

    onSelect?.(product);
    setPickerOpen(false);
  }

  function getProductInfo(product) {
    const line = getProductLineInfo(product);

    if (line?.filter === "wood") {
      return [product.wood_species, product.color_family]
        .filter(Boolean)
        .join(" · ");
    }

    if (line?.filter === "tone") {
      return [
        getToneLabel(product.tone_family),
        product.color_family,
      ]
        .filter(Boolean)
        .join(" · ");
    }

    return (
      product?.color_description ||
      product?.color_family ||
      product?.product_name ||
      ""
    );
  }

  function getDetailTitle() {
    if (!selectedLine) return "세부 선택";
    if (selectedLine.filter === "wood") return "수종";
    if (selectedLine.filter === "tone") return "톤";
    return "컬러";
  }

  const showResults =
    Boolean(search.trim()) || Boolean(selectedLine);

  return (
    <>
      <section
        style={{
          marginTop: "12px",
          padding: "13px",
          border: "1px solid #e5e7eb",
          borderRadius: "15px",
          background: "#ffffff",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "10px",
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontSize: "12px",
                color: "#6b7280",
                fontWeight: "700",
              }}
            >
              {sampleMode ? "필름 샘플" : "가상 시공 필름"}
            </div>

            {!selected ? (
              <>
                <div
                  style={{
                    marginTop: "3px",
                    fontSize: "16px",
                    fontWeight: "800",
                    color: "#111827",
                  }}
                >
                  원하는 필름을 선택하세요
                </div>
                <div
                  style={{
                    marginTop: "3px",
                    fontSize: "12px",
                    color: "#6b7280",
                  }}
                >
                  {sampleMode
                    ? "제조사부터 차례로 선택해 샘플을 확인하세요."
                    : "필름에 따라 예상 견적도 변경됩니다."}
                </div>
              </>
            ) : (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  marginTop: "5px",
                }}
              >
                <div style={{ flex: "0 0 52px" }}>
                  <FilmSample product={selected} size="52px" />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: "16px",
                      fontWeight: "800",
                      color: "#111827",
                    }}
                  >
                    {selected.product_code}
                  </div>
                  <div
                    style={{
                      marginTop: "2px",
                      fontSize: "12px",
                      color: "#4b5563",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {selected.brand}
                    {(sampleMode
                      ? getSampleName(selected)
                      : getProductInfo(selected))
                      ? ` · ${
                          sampleMode
                            ? getSampleName(selected)
                            : getProductInfo(selected)
                        }`
                      : ""}
                  </div>
                  {!sampleMode && selectedPrice > 0 && (
                    <div
                      style={{
                        marginTop: "2px",
                        fontSize: "11px",
                        color: "#6b7280",
                      }}
                    >
                      자재 기준 {formatPrice(selectedPrice)}/m
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            style={{
              flex: "0 0 auto",
              minWidth: "76px",
              padding: "11px 14px",
              border: selected ? "1px solid #d1d5db" : "none",
              borderRadius: "10px",
              background: selected ? "#ffffff" : "#111827",
              color: selected ? "#111827" : "#ffffff",
              fontWeight: "800",
              fontSize: "13px",
              cursor: "pointer",
            }}
          >
            {selected ? "변경" : "필름 선택"}
          </button>
        </div>

        {onGenerate && selected && (
          <button
            type="button"
            onClick={() => onGenerate(selected)}
            style={{
              width: "100%",
              marginTop: "11px",
              padding: "13px",
              border: "none",
              borderRadius: "10px",
              background: "#111827",
              color: "#ffffff",
              fontSize: "15px",
              fontWeight: "800",
              cursor: "pointer",
            }}
          >
            {sampleMode
              ? "샘플 크게 보기"
              : "이 필름으로 가상 시공하기"}
          </button>
        )}
      </section>

      {pickerOpen && (
        <div
          role="presentation"
          onClick={() => setPickerOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(17,24,39,0.48)",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="필름 선택"
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: "720px",
              height: "88dvh",
              maxHeight: "88dvh",
              background: "#ffffff",
              borderRadius: "22px 22px 0 0",
              boxShadow: "0 -12px 35px rgba(0,0,0,0.18)",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                paddingTop: "8px",
              }}
            >
              <div
                style={{
                  width: "42px",
                  height: "4px",
                  borderRadius: "999px",
                  background: "#d1d5db",
                }}
              />
            </div>

            <div
              style={{
                padding: "9px 14px 11px",
                borderBottom: "1px solid #e5e7eb",
                background: "#ffffff",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "10px",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: "18px",
                      fontWeight: "900",
                      color: "#111827",
                    }}
                  >
                    필름 선택
                  </div>
                  <div
                    style={{
                      marginTop: "2px",
                      color: "#6b7280",
                      fontSize: "11px",
                    }}
                  >
                    선택하면 자동으로 닫힙니다.
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setPickerOpen(false)}
                  aria-label="닫기"
                  style={{
                    width: "38px",
                    height: "38px",
                    border: "none",
                    borderRadius: "50%",
                    background: "#f3f4f6",
                    color: "#111827",
                    fontSize: "20px",
                    cursor: "pointer",
                  }}
                >
                  ×
                </button>
              </div>

              <div style={{ position: "relative" }}>
                <span
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    left: "12px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "#9ca3af",
                    fontSize: "15px",
                  }}
                >
                  ⌕
                </span>

                <input
                  type="search"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setLimit(PAGE_SIZE);
                    setPage(1);
                  }}
                  placeholder="제품번호·제품명 검색"
                  style={{
                    width: "100%",
                    marginTop: "10px",
                    padding: "11px 38px 11px 36px",
                    border: "1px solid #d1d5db",
                    borderRadius: "11px",
                    outline: "none",
                    fontSize: "14px",
                    color: "#111827",
                    background: "#ffffff",
                  }}
                />

                {search && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch("");
                      setLimit(PAGE_SIZE);
                      setPage(1);
                    }}
                    aria-label="검색어 지우기"
                    style={{
                      position: "absolute",
                      right: "8px",
                      top: "50%",
                      transform: "translateY(-35%)",
                      width: "28px",
                      height: "28px",
                      border: "none",
                      borderRadius: "50%",
                      background: "#f3f4f6",
                      color: "#6b7280",
                      cursor: "pointer",
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            </div>

            <div
              ref={scrollRef}
              style={{
                flex: "1 1 auto",
                minHeight: 0,
                overscrollBehaviorY: "contain",
                overflowY: "auto",
                padding: "12px 14px 24px",
                WebkitOverflowScrolling: "touch",
              }}
            >
              {loading && (
                <div
                  style={{
                    padding: "30px 0",
                    textAlign: "center",
                    color: "#6b7280",
                    fontSize: "13px",
                  }}
                >
                  필름 정보를 불러오는 중입니다.
                </div>
              )}

              {!loading && message && (
                <div
                  style={{
                    padding: "12px",
                    borderRadius: "10px",
                    background: "#fef2f2",
                    color: "#b91c1c",
                    fontSize: "13px",
                    lineHeight: 1.5,
                  }}
                >
                  {message}
                </div>
              )}

              {!loading && !message && !search.trim() && (
                <>
                  <FilterSection title="1. 제조사">
                    <ChipRow
                      showAll
                      items={brands.map((item) => ({
                        value: item,
                        label: item,
                      }))}
                      value={brand}
                      onChange={chooseBrand}
                    />
                  </FilterSection>

                  <FilterSection title="2. 패턴 대분류">
                    <ChipRow
                      items={availableCategories.map((item) => ({
                        value: item.key,
                        label: item.label,
                      }))}
                      value={category}
                      onChange={chooseCategory}
                    />
                  </FilterSection>

                  <FilterSection title="3. 패턴">
                    <ChipRow
                      items={availableLines.map((item) => ({
                        value: item.key,
                        label: item.label,
                      }))}
                      value={lineKey}
                      onChange={chooseLine}
                    />
                  </FilterSection>

                  <FilterSection title={`4. ${getDetailTitle()}`}>
                    <ChipRow
                      items={[
                        ...(selectedLine
                          ? [{ value: "", label: "전체" }]
                          : []),
                        ...details.map((item) => ({
                          value: item,
                          label:
                            selectedLine?.filter === "tone"
                              ? getToneLabel(item)
                              : item,
                        })),
                      ]}
                      value={detail}
                      onChange={chooseDetail}
                    />

                    {selectedLine && details.length === 0 && (
                      <p
                        style={{
                          margin: "8px 0",
                          color: "#6b7280",
                          fontSize: "12px",
                        }}
                      >
                        세부 분류가 없는 제품입니다.
                        아래에서 전체 샘플을 선택하세요.
                      </p>
                    )}
                  </FilterSection>
                </>
              )}

              {!loading &&
                !message &&
                !selectedLine &&
                !search.trim() && (
                  <div
                    style={{
                      marginTop: "16px",
                      padding: "18px 12px",
                      borderRadius: "12px",
                      background: "#f9fafb",
                      color: "#6b7280",
                      textAlign: "center",
                      fontSize: "13px",
                      lineHeight: 1.6,
                    }}
                  >
                    제품번호를 바로 검색하거나
                    <br />
                    제조사와 패턴을 선택하세요.
                  </div>
                )}

              {!loading && !message && showResults && (
                <>
                  <div
                    ref={resultsRef}
                    tabIndex={-1}
                    aria-label={`제품 목록, ${currentPage} / ${totalPages}페이지`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginTop: "5px",
                      marginBottom: "8px",
                    }}
                  >
                    <strong
                      style={{
                        fontSize: "13px",
                        color: "#111827",
                      }}
                    >
                      {search.trim() ? "검색 결과" : "제품"}
                    </strong>

                    <span
                      style={{
                        color: "#6b7280",
                        fontSize: "11px",
                      }}
                    >
                      {matches.length}개
                      {sampleMode && matches.length > 0
                        ? ` · ${currentPage} / ${totalPages}페이지`
                        : ""}
                    </span>
                  </div>

                  {pagination}

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(3, minmax(0, 1fr))",
                      gap: "7px",
                    }}
                  >
                    {visibleProducts.map((product) => {
                      const active = selected?.id === product.id;

                      return (
                        <button
                          key={
                            product.id ||
                            `${product.brand}-${product.product_code}`
                          }
                          type="button"
                          onClick={() => chooseProduct(product)}
                          style={{
                            minWidth: 0,
                            padding: "5px",
                            borderRadius: "10px",
                            border: active
                              ? "2px solid #111827"
                              : "1px solid #e5e7eb",
                            background: "#ffffff",
                            textAlign: "left",
                            cursor: "pointer",
                          }}
                        >
                          <FilmSample product={product} />

                          <strong
                            style={{
                              display: "block",
                              marginTop: "5px",
                              fontSize: "12px",
                              color: "#111827",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {product.product_code}
                          </strong>

                          <span
                            title={
                              sampleMode
                                ? product.product_name || ""
                                : undefined
                            }
                            style={{
                              display: sampleMode
                                ? "-webkit-box"
                                : "block",
                              marginTop: "3px",
                              color: "#6b7280",
                              fontSize: sampleMode ? "11px" : "9px",
                              lineHeight: 1.4,
                              minHeight: sampleMode
                                ? "2.8em"
                                : undefined,
                              whiteSpace: sampleMode
                                ? "normal"
                                : "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              overflowWrap: "anywhere",
                              WebkitLineClamp: sampleMode
                                ? 2
                                : undefined,
                              WebkitBoxOrient: sampleMode
                                ? "vertical"
                                : undefined,
                            }}
                          >
                            {(sampleMode
                              ? getSampleName(product)
                              : getProductInfo(product)) ||
                              getProductInfo(product) ||
                              "필름"}
                          </span>

                          {!sampleMode &&
                            Number(
                              product.material_price_per_meter ||
                                product.fire_price_per_meter ||
                                product.non_fire_price_per_meter
                            ) > 0 && (
                              <span
                                style={{
                                  display: "block",
                                  marginTop: "2px",
                                  color: "#7c3aed",
                                  fontSize: "9px",
                                  fontWeight: "800",
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }}
                              >
                                {formatPrice(
                                  product.material_price_per_meter ||
                                    product.fire_price_per_meter ||
                                    product.non_fire_price_per_meter
                                )}
                                /m
                              </span>
                            )}
                        </button>
                      );
                    })}
                  </div>

                  {!matches.length && (
                    <div
                      style={{
                        padding: "24px 0",
                        color: "#6b7280",
                        textAlign: "center",
                        fontSize: "13px",
                      }}
                    >
                      조건에 맞는 제품이 없습니다.
                    </div>
                  )}

                  {pagination}

                  {!sampleMode && limit < matches.length && (
                    <button
                      type="button"
                      onClick={() =>
                        setLimit((current) => current + PAGE_SIZE)
                      }
                      style={{
                        width: "100%",
                        marginTop: "10px",
                        padding: "12px",
                        border: "1px solid #d1d5db",
                        borderRadius: "10px",
                        background: "#ffffff",
                        color: "#111827",
                        fontSize: "13px",
                        fontWeight: "800",
                        cursor: "pointer",
                      }}
                    >
                      제품 더보기 (
                      {Math.max(matches.length - limit, 0)}개)
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
                    }
