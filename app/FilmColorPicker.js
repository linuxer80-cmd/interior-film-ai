"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

const PAGE_SIZE = 12;

/*
 * 제품 코드 → 제품 라인
 * 짧은 prefix는 반드시 마지막에 둡니다.
 */
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

  if (!code) {
    return null;
  }

  return PRODUCT_LINES.find((line) => code.startsWith(line.prefix)) || null;
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

function formatPrice(value) {
  const price = Number(value);

  if (!Number.isFinite(price) || price <= 0) {
    return "";
  }

  return `${price.toLocaleString("ko-KR")}원`;
}

function ChipRow({ items = [], value, onChange }) {
  if (!items.length) {
    return null;
  }

  return (
    <div
      style={{
        display: "flex",
        gap: "7px",
        overflowX: "auto",
        paddingBottom: "4px",
        WebkitOverflowScrolling: "touch",
        scrollbarWidth: "none",
      }}
    >
      {items.map((item) => {
        const active = value === item.value;

        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onChange(item.value)}
            style={{
              flex: "0 0 auto",
              minHeight: "38px",
              padding: "8px 13px",
              borderRadius: "999px",
              border: active
                ? "2px solid #111827"
                : "1px solid #d1d5db",
              background: active ? "#111827" : "#ffffff",
              color: active ? "#ffffff" : "#374151",
              fontSize: "13px",
              fontWeight: "700",
              whiteSpace: "nowrap",
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
  if (product?.sample_image_path) {
    return (
      <img
        src={product.sample_image_path}
        alt={product.product_code || "필름"}
        loading="lazy"
        decoding="async"
        style={{
          display: "block",
          width: size,
          height: size === "100%" ? "auto" : size,
          aspectRatio: "1 / 1",
          objectFit: "cover",
          borderRadius: "8px",
          border: "1px solid #e5e7eb",
          background: "#f9fafb",
        }}
      />
    );
  }

  return (
    <span
      style={{
        display: "block",
        width: size,
        height: size === "100%" ? "auto" : size,
        aspectRatio: "1 / 1",
        borderRadius: "8px",
        border: "1px solid #e5e7eb",
        background: product?.color_hex || "#ffffff",
      }}
    />
  );
}

export default function FilmColorPicker({
  onSelect,
  onGenerate,
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
  const [pickerOpen, setPickerOpen] = useState(false);

  /*
   * 부모에서 선택값이 변경되면 화면에도 반영합니다.
   */
  useEffect(() => {
    if (value !== undefined) {
      setSelected(value || null);
    }
  }, [value]);

  /*
   * Supabase에서 활성 필름 전체를 불러옵니다.
   * 가격 관련 필드는 삭제하지 않습니다.
   */
  useEffect(() => {
    let mounted = true;

    async function loadProducts() {
      setLoading(true);
      setMessage("");

      const { data, error } = await supabase
        .from("film_products")
        .select(
          [
            "id",
            "brand",
            "product_code",
            "product_name",
            "color_family",
            "color_description",
            "color_hex",
            "texture",
            "grade",
            "wood_species",
            "tone_family",
            "sample_image_path",
            "fire_price_per_meter",
            "non_fire_price_per_meter",
            "material_price_per_meter",
            "price_multiplier",
            "additional_cost",
            "sort_order",
          ].join(",")
        )
        .eq("is_active", true)
        .order("brand")
        .order("sort_order");

      if (!mounted) {
        return;
      }

      if (error) {
        console.error("필름 제품 조회 오류:", error);

        setProducts([]);
        setMessage(
          `필름 제품을 불러오지 못했습니다. ${error.message || ""}`
        );
      } else {
        const rows = data || [];
        setProducts(rows);

        const brandList = unique(rows.map((item) => item.brand));

        if (brandList.length === 1) {
          setBrand(brandList[0]);
        }
      }

      setLoading(false);
    }

    loadProducts();

    return () => {
      mounted = false;
    };
  }, []);

  /*
   * 선택창이 열려 있는 동안 뒤쪽 화면의 스크롤을 막습니다.
   */
  useEffect(() => {
    if (!pickerOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [pickerOpen]);

  const brands = useMemo(
    () => unique(products.map((item) => item.brand)),
    [products]
  );

  const availableCategories = useMemo(() => {
    if (!brand) {
      return [];
    }

    const brandProducts = products.filter(
      (product) => product.brand === brand
    );

    return CATEGORIES.filter((categoryItem) =>
      brandProducts.some((product) => {
        const line = getProductLine(product.product_code);
        return line?.category === categoryItem.key;
      })
    );
  }, [brand, products]);

  const availableLines = useMemo(() => {
    if (!brand || !category) {
      return [];
    }

    const brandProducts = products.filter(
      (product) => product.brand === brand
    );

    const lineMap = new Map();

    PRODUCT_LINES.filter((line) => line.category === category).forEach(
      (line) => {
        const exists = brandProducts.some((product) => {
          const found = getProductLine(product.product_code);
          return found?.prefix === line.prefix;
        });

        if (!exists) {
          return;
        }

        if (!lineMap.has(line.label)) {
          lineMap.set(line.label, {
            key: line.label,
            label: line.label,
            prefixes: [],
            filter: line.filter,
          });
        }

        lineMap.get(line.label).prefixes.push(line.prefix);
      }
    );

    return [...lineMap.values()];
  }, [brand, category, products]);

  const selectedLine = useMemo(
    () => availableLines.find((line) => line.key === lineKey) || null,
    [availableLines, lineKey]
  );

  const lineProducts = useMemo(() => {
    if (!brand || !category || !selectedLine) {
      return [];
    }

    return products.filter((product) => {
      if (product.brand !== brand) {
        return false;
      }

      const line = getProductLine(product.product_code);

      if (!line) {
        return false;
      }

      return selectedLine.prefixes.includes(line.prefix);
    });
  }, [brand, category, selectedLine, products]);

  const details = useMemo(() => {
    if (!selectedLine) {
      return [];
    }

    if (selectedLine.filter === "wood") {
      return unique(lineProducts.map((item) => item.wood_species));
    }

    if (selectedLine.filter === "tone") {
      const tones = unique(
        lineProducts.map((item) => item.tone_family)
      );

      const order = ["라이트톤", "미디엄톤", "딥톤", "기타톤"];

      return tones.sort((a, b) => {
        const aIndex = order.indexOf(a);
        const bIndex = order.indexOf(b);

        return (
          (aIndex === -1 ? 999 : aIndex) -
          (bIndex === -1 ? 999 : bIndex)
        );
      });
    }

    return unique(lineProducts.map((item) => item.color_family));
  }, [selectedLine, lineProducts]);

  /*
   * 제품번호 검색은 분류 선택 없이 468개 전체에서 바로 검색합니다.
   */
  const matches = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    const sourceProducts = keyword ? products : lineProducts;

    return sourceProducts.filter((item) => {
      if (!keyword && detail && selectedLine) {
        if (
          selectedLine.filter === "wood" &&
          item.wood_species !== detail
        ) {
          return false;
        }

        if (
          selectedLine.filter === "tone" &&
          item.tone_family !== detail
        ) {
          return false;
        }

        if (
          selectedLine.filter !== "wood" &&
          selectedLine.filter !== "tone" &&
          item.color_family !== detail
        ) {
          return false;
        }
      }

      if (!detail && !keyword) {
        return false;
      }

      if (!keyword) {
        return true;
      }

      return [
        item.product_code,
        item.product_name,
        item.brand,
        item.color_family,
        item.color_description,
        item.texture,
        item.grade,
        item.wood_species,
        item.tone_family,
      ]
        .filter(Boolean)
        .some((value) =>
          String(value).toLowerCase().includes(keyword)
        );
    });
  }, [
    products,
    lineProducts,
    detail,
    search,
    selectedLine,
  ]);

  function clearProduct() {
    setSelected(null);
    setSearch("");
    setLimit(PAGE_SIZE);

    if (onSelect) {
      onSelect(null);
    }
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
  }

  function chooseProduct(product) {
    /*
     * 가격 필드가 포함된 제품 전체 객체를 부모에 전달합니다.
     * 따라서 방염·비방염·부분시공 자재비 계산이 유지됩니다.
     */
    setSelected(product);

    if (onSelect) {
      onSelect(product);
    }

    setPickerOpen(false);
  }

  function getProductInfo(product) {
    const line = getProductLine(product?.product_code);

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
    if (!selectedLine) {
      return "세부 선택";
    }

    if (selectedLine.filter === "wood") {
      return "수종";
    }

    if (selectedLine.filter === "tone") {
      return "톤";
    }

    return "컬러";
  }

  const selectedPrice =
    selected?.material_price_per_meter ||
    selected?.non_fire_price_per_meter ||
    selected?.fire_price_per_meter ||
    0;

  const showResults =
    Boolean(search.trim()) ||
    Boolean(selectedLine && detail);

  return (
    <>
      {/* 평소 보이는 압축 카드 */}
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
              가상 시공 필름
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
                  필름에 따라 예상 견적도 변경됩니다.
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
                    {getProductInfo(selected)
                      ? ` · ${getProductInfo(selected)}`
                      : ""}
                  </div>

                  {selectedPrice > 0 && (
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
              border: selected
                ? "1px solid #d1d5db"
                : "none",
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
            이 필름으로 가상 시공하기
          </button>
        )}
      </section>

      {/* 모바일 필름 선택창 */}
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

            {/* 고정 헤더와 검색창 */}
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

              <div
                style={{
                  position: "relative",
                  marginTop: "9px",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    left: "12px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    fontSize: "15px",
                    pointerEvents: "none",
                  }}
                >
                  🔍
                </span>

                <input
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setLimit(PAGE_SIZE);
                  }}
                  placeholder="제품번호 또는 색상 검색"
                  autoComplete="off"
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "11px 38px 11px 38px",
                    border: "1px solid #d1d5db",
                    borderRadius: "11px",
                    background: "#f9fafb",
                    fontSize: "16px",
                    outline: "none",
                  }}
                />

                {search && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch("");
                      setLimit(PAGE_SIZE);
                    }}
                    aria-label="검색어 지우기"
                    style={{
                      position: "absolute",
                      right: "8px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      width: "28px",
                      height: "28px",
                      border: "none",
                      borderRadius: "50%",
                      background: "#e5e7eb",
                      color: "#4b5563",
                      cursor: "pointer",
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            </div>

            {/* 선택창 내용 */}
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "12px 14px 24px",
                WebkitOverflowScrolling: "touch",
              }}
            >
              {loading && (
                <div
                  style={{
                    padding: "28px 0",
                    textAlign: "center",
                    color: "#6b7280",
                    fontSize: "13px",
                  }}
                >
                  필름 제품을 불러오는 중입니다.
                </div>
              )}

              {message && (
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

              {!loading && !message && (
                <>
                  {!search.trim() && (
                    <>
                      {brands.length > 1 && (
                        <FilterSection title="제조사">
                          <ChipRow
                            items={brands.map((item) => ({
                              value: item,
                              label: item,
                            }))}
                            value={brand}
                            onChange={chooseBrand}
                          />
                        </FilterSection>
                      )}

                      {brand && (
                        <FilterSection title="종류">
                          <ChipRow
                            items={availableCategories.map((item) => ({
                              value: item.key,
                              label: item.label,
                            }))}
                            value={category}
                            onChange={chooseCategory}
                          />
                        </FilterSection>
                      )}

                      {brand && category && (
                        <FilterSection title="제품 라인">
                          <ChipRow
                            items={availableLines.map((item) => ({
                              value: item.key,
                              label: item.label,
                            }))}
                            value={lineKey}
                            onChange={chooseLine}
                          />
                        </FilterSection>
                      )}

                      {selectedLine && (
                        <FilterSection title={getDetailTitle()}>
                          <ChipRow
                            items={details.map((item) => ({
                              value: item,
                              label:
                                selectedLine.filter === "tone"
                                  ? getToneLabel(item)
                                  : item,
                            }))}
                            value={detail}
                            onChange={chooseDetail}
                          />
                        </FilterSection>
                      )}
                    </>
                  )}

                  {!selectedLine && !search.trim() && (
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
                      종류와 제품 라인을 선택하세요.
                    </div>
                  )}

                  {showResults && (
                    <>
                      <div
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
                        </span>
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "repeat(3, minmax(0, 1fr))",
                          gap: "7px",
                        }}
                      >
                        {matches.slice(0, limit).map((product) => {
                          const active = selected?.id === product.id;

                          return (
                            <button
                              key={product.id}
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
                                style={{
                                  display: "block",
                                  marginTop: "1px",
                                  color: "#6b7280",
                                  fontSize: "9px",
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }}
                              >
                                {getProductInfo(product) ||
                                  product.product_name ||
                                  "필름"}
                              </span>
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

                      {limit < matches.length && (
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
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
