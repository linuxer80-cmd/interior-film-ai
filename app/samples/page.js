"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";

const PAGE_SIZE = 24;

const SUPABASE_URL = (
  process.env.NEXT_PUBLIC_SUPABASE_URL || ""
).replace(/\/$/, "");

const CATEGORIES = [
  { key: "wood", label: "우드" },
  { key: "solid", label: "솔리드" },
  { key: "stone", label: "스톤&마블" },
  { key: "metal", label: "메탈" },
  { key: "fabric", label: "패브릭" },
  { key: "leather", label: "레더" },
  { key: "etc", label: "기타" },
];

const PRODUCT_LINES = [
  {
    prefix: "OGW",
    label: "옵티컬 그레인 우드",
    category: "wood",
    filter: "wood",
  },
  {
    prefix: "SPW",
    label: "스페셜우드",
    category: "wood",
    filter: "wood",
  },
  {
    prefix: "LW",
    label: "롱우드",
    category: "wood",
    filter: "wood",
  },
  {
    prefix: "ZX",
    label: "프리미엄우드",
    category: "wood",
    filter: "wood",
  },

  {
    prefix: "PNT",
    label: "프리미엄페인티드우드",
    category: "solid",
    filter: "color",
  },
  {
    prefix: "PTW",
    label: "페인티드우드",
    category: "solid",
    filter: "color",
  },
  {
    prefix: "ZSW",
    label: "슈퍼화이트우드",
    category: "solid",
    filter: "color",
  },
  {
    prefix: "CP",
    label: "텍스쳐",
    category: "solid",
    filter: "color",
  },
  {
    prefix: "HS",
    label: "텍스쳐",
    category: "solid",
    filter: "color",
  },
  {
    prefix: "LM",
    label: "텍스쳐",
    category: "solid",
    filter: "color",
  },
  {
    prefix: "LS",
    label: "텍스쳐",
    category: "solid",
    filter: "color",
  },

  {
    prefix: "NS",
    label: "스톤앤마블",
    category: "stone",
    filter: "tone",
  },
  {
    prefix: "PM",
    label: "프리미엄마블",
    category: "stone",
    filter: "tone",
  },
  {
    prefix: "PNC",
    label: "프리미엄페인티드콘크리트",
    category: "stone",
    filter: "tone",
  },

  {
    prefix: "UMI",
    label: "고광택메탈",
    category: "metal",
    filter: "color",
  },
  {
    prefix: "APZ",
    label: "골드",
    category: "metal",
    filter: "color",
  },
  {
    prefix: "RM",
    label: "리얼메탈",
    category: "metal",
    filter: "color",
  },
  {
    prefix: "VM",
    label: "벨벳메탈",
    category: "metal",
    filter: "color",
  },

  {
    prefix: "SF",
    label: "소프트패브릭",
    category: "fabric",
    filter: "tone",
  },
  {
    prefix: "RF",
    label: "리얼패브릭",
    category: "fabric",
    filter: "tone",
  },
  {
    prefix: "NF",
    label: "네츄럴패브릭",
    category: "fabric",
    filter: "tone",
  },

  {
    prefix: "SL",
    label: "소프트레더",
    category: "leather",
    filter: "tone",
  },

  {
    prefix: "ECF",
    label: "이지클린필름",
    category: "etc",
    filter: "color",
  },
  {
    prefix: "EXF",
    label: "외장용필름",
    category: "etc",
    filter: "color",
  },
  {
    prefix: "BLC",
    label: "모노블랑",
    category: "etc",
    filter: "color",
  },
  {
    prefix: "SMT",
    label: "슈퍼매트",
    category: "etc",
    filter: "color",
  },

  {
    prefix: "W",
    label: "우드",
    category: "wood",
    filter: "wood",
  },
  {
    prefix: "S",
    label: "솔리드",
    category: "solid",
    filter: "color",
  },
];

function unique(values) {
  return [
    ...new Set(
      values
        .filter(
          (value) =>
            value !== null &&
            value !== undefined
        )
        .map((value) =>
          String(value).trim()
        )
        .filter(Boolean)
    ),
  ];
}

function getSampleUrl(path) {
  const value = String(path || "").trim();

  if (!value) {
    return "";
  }

  if (
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("data:") ||
    value.startsWith("/")
  ) {
    return value;
  }

  if (SUPABASE_URL) {
    return `${SUPABASE_URL}/storage/v1/object/public/${value}`;
  }

  return value;
}

function getProductLine(productCode) {
  const code = String(
    productCode || ""
  )
    .trim()
    .toUpperCase();

  if (!code) {
    return null;
  }

  return (
    PRODUCT_LINES.find((line) =>
      code.startsWith(line.prefix)
    ) || null
  );
}

function getLineFilter(categoryKey) {
  if (categoryKey === "wood") {
    return "wood";
  }

  if (
    categoryKey === "stone" ||
    categoryKey === "fabric" ||
    categoryKey === "leather"
  ) {
    return "tone";
  }

  return "color";
}

function getProductLineInfo(product) {
  const storedLine = String(
    product?.pattern_line || ""
  ).trim();

  const storedCategory = String(
    product?.category_key || ""
  ).trim();

  if (
    storedLine &&
    storedCategory
  ) {
    return {
      prefix: `DB:${storedLine}`,
      label: storedLine,
      category: storedCategory,
      filter: getLineFilter(
        storedCategory
      ),
    };
  }

  return getProductLine(
    product?.product_code
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

function ChipRow({
  items = [],
  value,
  onChange,
}) {
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
        WebkitOverflowScrolling:
          "touch",
        scrollbarWidth: "none",
      }}
    >
      {items.map((item) => {
        const active =
          value === item.value;

        return (
          <button
            key={item.value}
            type="button"
            onClick={() =>
              onChange(item.value)
            }
            style={{
              flex: "0 0 auto",
              minHeight: "40px",
              padding: "8px 14px",
              borderRadius: "999px",
              border: active
                ? "2px solid #111827"
                : "1px solid #d1d5db",
              background: active
                ? "#111827"
                : "#ffffff",
              color: active
                ? "#ffffff"
                : "#374151",
              fontSize: "13px",
              fontWeight: "800",
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

function FilterSection({
  title,
  children,
}) {
  return (
    <div
      style={{
        marginTop: "14px",
      }}
    >
      <div
        style={{
          marginBottom: "7px",
          fontSize: "12px",
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

function SampleImage({
  product,
  large = false,
}) {
  const url = getSampleUrl(
    product?.sample_image_path
  );

  if (url) {
    return (
      <img
        src={url}
        alt={
          product?.product_code ||
          "필름 샘플"
        }
        loading="lazy"
        decoding="async"
        style={{
          display: "block",
          width: "100%",
          aspectRatio: "1 / 1",
          objectFit: "cover",
          borderRadius: large
            ? "14px"
            : "11px",
          border:
            "1px solid #e5e7eb",
          background: "#f9fafb",
        }}
      />
    );
  }

  return (
    <div
      style={{
        width: "100%",
        aspectRatio: "1 / 1",
        borderRadius: large
          ? "14px"
          : "11px",
        border:
          "1px solid #e5e7eb",
        background:
          product?.color_hex ||
          "#f3f4f6",
      }}
    />
  );
}

export default function SamplesPage() {
  const [
    products,
    setProducts,
  ] = useState([]);

  const [
    brand,
    setBrand,
  ] = useState("");

  const [
    category,
    setCategory,
  ] = useState("");

  const [
    lineKey,
    setLineKey,
  ] = useState("");

  const [
    detail,
    setDetail,
  ] = useState("");

  const [
    search,
    setSearch,
  ] = useState("");

  const [
    limit,
    setLimit,
  ] = useState(PAGE_SIZE);

  const [
    selected,
    setSelected,
  ] = useState(null);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    message,
    setMessage,
  ] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadProducts() {
      setLoading(true);
      setMessage("");

      const {
        data,
        error,
      } = await supabase
        .from("film_products")
        .select(
          [
            "id",
            "brand",
            "product_code",
            "product_name",
            "category_key",
            "pattern_line",
            "color_family",
            "color_description",
            "color_hex",
            "texture",
            "grade",
            "wood_species",
            "tone_family",
            "sample_image_path",
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
        console.error(
          "샘플 조회 오류:",
          error
        );

        setProducts([]);

        setMessage(
          `샘플을 불러오지 못했습니다. ${
            error.message || ""
          }`
        );
      } else {
        const rows =
          data || [];

        setProducts(rows);

        const brandList =
          unique(
            rows.map(
              (item) =>
                item.brand
            )
          );

        if (
          brandList.length === 1
        ) {
          setBrand(
            brandList[0]
          );
        }
      }

      setLoading(false);
    }

    loadProducts();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!selected) {
      return;
    }

    const previousOverflow =
      document.body.style
        .overflow;

    document.body.style.overflow =
      "hidden";

    return () => {
      document.body.style.overflow =
        previousOverflow;
    };
  }, [selected]);

  const brands = useMemo(() => {
    return unique(
      products.map(
        (item) => item.brand
      )
    );
  }, [products]);

  const availableCategories =
    useMemo(() => {
      if (!brand) {
        return [];
      }

      const brandProducts =
        products.filter(
          (product) =>
            product.brand ===
            brand
        );

      return CATEGORIES.filter(
        (categoryItem) =>
          brandProducts.some(
            (product) => {
              const line =
                getProductLineInfo(
                  product
                );

              return (
                line?.category ===
                categoryItem.key
              );
            }
          )
      );
    }, [brand, products]);

  const availableLines =
    useMemo(() => {
      if (
        !brand ||
        !category
      ) {
        return [];
      }

      const brandProducts =
        products.filter(
          (product) =>
            product.brand ===
            brand
        );

      const lineMap =
        new Map();

      brandProducts.forEach(
        (product) => {
          const line =
            getProductLineInfo(
              product
            );

          if (
            !line ||
            line.category !==
              category
          ) {
            return;
          }

          if (
            !lineMap.has(
              line.label
            )
          ) {
            lineMap.set(
              line.label,
              {
                key: line.label,
                label:
                  line.label,
                prefixes: [],
                filter:
                  line.filter,
              }
            );
          }

          const lineItem =
            lineMap.get(
              line.label
            );

          if (
            !lineItem.prefixes.includes(
              line.prefix
            )
          ) {
            lineItem.prefixes.push(
              line.prefix
            );
          }
        }
      );

      return [
        ...lineMap.values(),
      ];
    }, [
      brand,
      category,
      products,
    ]);

  const selectedLine =
    useMemo(() => {
      return (
        availableLines.find(
          (line) =>
            line.key ===
            lineKey
        ) || null
      );
    }, [
      availableLines,
      lineKey,
    ]);

  const lineProducts =
    useMemo(() => {
      if (
        !brand ||
        !category ||
        !selectedLine
      ) {
        return [];
      }

      return products.filter(
        (product) => {
          if (
            product.brand !==
            brand
          ) {
            return false;
          }

          const line =
            getProductLineInfo(
              product
            );

          if (!line) {
            return false;
          }

          return selectedLine.prefixes.includes(
            line.prefix
          );
        }
      );
    }, [
      brand,
      category,
      selectedLine,
      products,
    ]);

  const details =
    useMemo(() => {
      if (!selectedLine) {
        return [];
      }

      const field =
        selectedLine.filter ===
        "wood"
          ? "wood_species"
          : selectedLine.filter ===
            "tone"
          ? "tone_family"
          : "color_family";

      return unique(
        lineProducts.map(
          (item) =>
            item[field]
        )
      );
    }, [
      selectedLine,
      lineProducts,
    ]);

  const matches =
    useMemo(() => {
      const keyword =
        search
          .trim()
          .toLowerCase();

      const sourceProducts =
        keyword
          ? products
          : lineProducts;

      return sourceProducts.filter(
        (item) => {
          if (
            !keyword &&
            detail &&
            selectedLine
          ) {
            if (
              selectedLine.filter ===
                "wood" &&
              item.wood_species !==
                detail
            ) {
              return false;
            }

            if (
              selectedLine.filter ===
                "tone" &&
              item.tone_family !==
                detail
            ) {
              return false;
            }

            if (
              selectedLine.filter ===
                "color" &&
              item.color_family !==
                detail
            ) {
              return false;
            }
          }

          if (keyword) {
            const text = [
              item.brand,
              item.product_code,
              item.product_name,
              item.pattern_line,
              item.color_family,
              item.color_description,
              item.texture,
              item.grade,
              item.wood_species,
              item.tone_family,
            ]
              .filter(Boolean)
              .join(" ")
              .toLowerCase();

            return text.includes(
              keyword
            );
          }

          return true;
        }
      );
    }, [
      products,
      lineProducts,
      selectedLine,
      detail,
      search,
    ]);

  const visibleProducts =
    matches.slice(
      0,
      limit
    );

  const showResults =
    Boolean(
      search.trim()
    ) ||
    Boolean(
      selectedLine &&
        detail
    );

  function chooseBrand(
    nextBrand
  ) {
    setBrand(nextBrand);
    setCategory("");
    setLineKey("");
    setDetail("");
    setSearch("");
    setLimit(PAGE_SIZE);
  }

  function chooseCategory(
    nextCategory
  ) {
    setCategory(
      nextCategory
    );
    setLineKey("");
    setDetail("");
    setSearch("");
    setLimit(PAGE_SIZE);
  }

  function chooseLine(
    nextLine
  ) {
    setLineKey(nextLine);
    setDetail("");
    setSearch("");
    setLimit(PAGE_SIZE);
  }

  function chooseDetail(
    nextDetail
  ) {
    setDetail(nextDetail);
    setSearch("");
    setLimit(PAGE_SIZE);
  }

  function getProductInfo(
    product
  ) {
    const line =
      getProductLineInfo(
        product
      );

    if (
      line?.filter ===
      "wood"
    ) {
      return [
        product.wood_species,
        product.color_family,
      ]
        .filter(Boolean)
        .join(" · ");
    }

    if (
      line?.filter ===
      "tone"
    ) {
      return [
        getToneLabel(
          product.tone_family
        ),
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

    if (
      selectedLine.filter ===
      "wood"
    ) {
      return "수종";
    }

    if (
      selectedLine.filter ===
      "tone"
    ) {
      return "톤";
    }

    return "컬러";
  }

  return (
    <main
      style={{
        maxWidth: "720px",
        margin: "0 auto",
        minHeight: "100vh",
        padding:
          "16px 14px 70px",
        boxSizing:
          "border-box",
        background: "#f8fafc",
        color: "#111827",
      }}
    >
      {/* 상단 메뉴 */}
      <nav
        style={{
          display: "grid",
          gridTemplateColumns:
            "1fr 1fr",
          gap: "8px",
          marginBottom: "22px",
        }}
      >
        <Link
          href="/"
          style={{
            padding: "11px",
            border:
              "1px solid #d1d5db",
            borderRadius:
              "11px",
            background:
              "#ffffff",
            color: "#374151",
            textAlign:
              "center",
            textDecoration:
              "none",
            fontSize: "14px",
            fontWeight: "800",
          }}
        >
          AI 견적
        </Link>

        <div
          style={{
            padding: "11px",
            borderRadius:
              "11px",
            background:
              "#111827",
            color: "#ffffff",
            textAlign:
              "center",
            fontSize: "14px",
            fontWeight: "800",
          }}
        >
          필름 샘플보기
        </div>
      </nav>

      {/* 제목 */}
      <div
        style={{
          display:
            "inline-block",
          padding: "6px 11px",
          borderRadius:
            "999px",
          background:
            "#111827",
          color: "#ffffff",
          fontSize: "11px",
          fontWeight: "800",
        }}
      >
        기분좋은공간
      </div>

      <h1
        style={{
          margin:
            "13px 0 5px",
          fontSize: "27px",
          lineHeight: 1.3,
        }}
      >
        인테리어필름 샘플
      </h1>

      <p
        style={{
          margin: 0,
          color: "#6b7280",
          fontSize: "13px",
          lineHeight: 1.6,
        }}
      >
        제조사와 패턴을
        선택해서 실제 등록된
        필름 샘플을 확인하세요.
      </p>

      {/* 필터 */}
      <section
        style={{
          marginTop: "17px",
          padding: "14px",
          border:
            "1px solid #e5e7eb",
          borderRadius:
            "16px",
          background:
            "#ffffff",
        }}
      >
        <div
          style={{
            position:
              "relative",
          }}
        >
          <span
            style={{
              position:
                "absolute",
              left: "12px",
              top: "50%",
              transform:
                "translateY(-50%)",
              color: "#9ca3af",
              fontSize: "16px",
            }}
          >
            ⌕
          </span>

          <input
            type="search"
            value={search}
            onChange={(
              event
            ) => {
              setSearch(
                event.target.value
              );
              setLimit(
                PAGE_SIZE
              );
            }}
            placeholder="제품번호 검색 예: S115, CW111"
            style={{
              width: "100%",
              boxSizing:
                "border-box",
              padding:
                "12px 38px 12px 36px",
              border:
                "1px solid #d1d5db",
              borderRadius:
                "11px",
              outline: "none",
              fontSize: "14px",
              color: "#111827",
              background:
                "#ffffff",
            }}
          />

          {search && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setLimit(
                  PAGE_SIZE
                );
              }}
              style={{
                position:
                  "absolute",
                right: "8px",
                top: "50%",
                transform:
                  "translateY(-50%)",
                width: "28px",
                height: "28px",
                border: "none",
                borderRadius:
                  "50%",
                background:
                  "#f3f4f6",
                color:
                  "#6b7280",
                cursor:
                  "pointer",
              }}
            >
              ×
            </button>
          )}
        </div>

        {!search.trim() && (
          <>
            <FilterSection title="1. 제조사">
              <ChipRow
                items={brands.map(
                  (item) => ({
                    value: item,
                    label: item,
                  })
                )}
                value={brand}
                onChange={
                  chooseBrand
                }
              />
            </FilterSection>

            <FilterSection title="2. 대분류">
              <ChipRow
                items={availableCategories.map(
                  (item) => ({
                    value:
                      item.key,
                    label:
                      item.label,
                  })
                )}
                value={category}
                onChange={
                  chooseCategory
                }
              />
            </FilterSection>

            {category && (
              <FilterSection title="3. 패턴">
                <ChipRow
                  items={availableLines.map(
                    (item) => ({
                      value:
                        item.key,
                      label:
                        item.label,
                    })
                  )}
                  value={lineKey}
                  onChange={
                    chooseLine
                  }
                />
              </FilterSection>
            )}

            {selectedLine && (
              <FilterSection
                title={`4. ${getDetailTitle()}`}
              >
                <ChipRow
                  items={details.map(
                    (item) => ({
                      value: item,
                      label:
                        selectedLine?.filter ===
                        "tone"
                          ? getToneLabel(
                              item
                            )
                          : item,
                    })
                  )}
                  value={detail}
                  onChange={
                    chooseDetail
                  }
                />
              </FilterSection>
            )}
          </>
        )}
      </section>

      {/* 로딩 */}
      {loading && (
        <div
          style={{
            padding:
              "40px 0",
            textAlign:
              "center",
            color: "#6b7280",
            fontSize: "13px",
          }}
        >
          필름 샘플을
          불러오는 중입니다.
        </div>
      )}

      {/* 오류 */}
      {!loading &&
        message && (
          <div
            style={{
              marginTop:
                "15px",
              padding:
                "14px",
              borderRadius:
                "12px",
              background:
                "#fef2f2",
              color:
                "#b91c1c",
              fontSize:
                "13px",
            }}
          >
            {message}
          </div>
        )}

      {/* 선택 안내 */}
      {!loading &&
        !message &&
        !showResults && (
          <div
            style={{
              marginTop:
                "15px",
              padding:
                "25px 14px",
              border:
                "1px solid #e5e7eb",
              borderRadius:
                "14px",
              background:
                "#ffffff",
              color:
                "#6b7280",
              textAlign:
                "center",
              fontSize:
                "13px",
              lineHeight: 1.7,
            }}
          >
            제조사 → 대분류 →
            패턴 → 컬러/수종을
            선택하면
            <br />
            등록된 샘플이
            표시됩니다.
          </div>
        )}

      {/* 결과 */}
      {!loading &&
        !message &&
        showResults && (
          <>
            <div
              style={{
                display:
                  "flex",
                alignItems:
                  "center",
                justifyContent:
                  "space-between",
                margin:
                  "18px 2px 9px",
              }}
            >
              <strong
                style={{
                  fontSize:
                    "15px",
                }}
              >
                {search.trim()
                  ? "검색 결과"
                  : "필름 샘플"}
              </strong>

              <span
                style={{
                  color:
                    "#6b7280",
                  fontSize:
                    "12px",
                }}
              >
                {matches.length}개
              </span>
            </div>

            <div
              style={{
                display:
                  "grid",
                gridTemplateColumns:
                  "repeat(2, minmax(0, 1fr))",
                gap: "10px",
              }}
            >
              {visibleProducts.map(
                (product) => (
                  <button
                    key={
                      product.id ||
                      `${product.brand}-${product.product_code}`
                    }
                    type="button"
                    onClick={() =>
                      setSelected(
                        product
                      )
                    }
                    style={{
                      minWidth: 0,
                      padding:
                        "7px",
                      border:
                        "1px solid #e5e7eb",
                      borderRadius:
                        "14px",
                      background:
                        "#ffffff",
                      textAlign:
                        "left",
                      cursor:
                        "pointer",
                    }}
                  >
                    <SampleImage
                      product={
                        product
                      }
                    />

                    <strong
                      style={{
                        display:
                          "block",
                        marginTop:
                          "7px",
                        color:
                          "#111827",
                        fontSize:
                          "14px",
                        whiteSpace:
                          "nowrap",
                        overflow:
                          "hidden",
                        textOverflow:
                          "ellipsis",
                      }}
                    >
                      {
                        product.product_code
                      }
                    </strong>

                    <span
                      style={{
                        display:
                          "block",
                        marginTop:
                          "2px",
                        color:
                          "#6b7280",
                        fontSize:
                          "10px",
                        whiteSpace:
                          "nowrap",
                        overflow:
                          "hidden",
                        textOverflow:
                          "ellipsis",
                      }}
                    >
                      {getProductInfo(
                        product
                      ) ||
                        product.product_name ||
                        "인테리어필름"}
                    </span>
                  </button>
                )
              )}
            </div>

            {!matches.length && (
              <div
                style={{
                  padding:
                    "35px 0",
                  textAlign:
                    "center",
                  color:
                    "#6b7280",
                  fontSize:
                    "13px",
                }}
              >
                조건에 맞는
                샘플이 없습니다.
              </div>
            )}

            {limit <
              matches.length && (
              <button
                type="button"
                onClick={() =>
                  setLimit(
                    (current) =>
                      current +
                      PAGE_SIZE
                  )
                }
                style={{
                  width:
                    "100%",
                  marginTop:
                    "12px",
                  padding:
                    "13px",
                  border:
                    "1px solid #d1d5db",
                  borderRadius:
                    "11px",
                  background:
                    "#ffffff",
                  color:
                    "#111827",
                  fontSize:
                    "13px",
                  fontWeight:
                    "800",
                  cursor:
                    "pointer",
                }}
              >
                샘플 더보기 (
                {Math.max(
                  matches.length -
                    limit,
                  0
                )}
                개)
              </button>
            )}
          </>
        )}

      {/* 샘플 확대 */}
      {selected && (
        <div
          role="presentation"
          onClick={() =>
            setSelected(null)
          }
          style={{
            position:
              "fixed",
            inset: 0,
            zIndex: 9999,
            padding: "18px",
            background:
              "rgba(17,24,39,0.65)",
            display: "flex",
            alignItems:
              "center",
            justifyContent:
              "center",
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            onClick={(
              event
            ) =>
              event.stopPropagation()
            }
            style={{
              width: "100%",
              maxWidth:
                "520px",
              maxHeight:
                "90dvh",
              overflowY:
                "auto",
              padding: "14px",
              borderRadius:
                "18px",
              background:
                "#ffffff",
              boxShadow:
                "0 20px 50px rgba(0,0,0,0.25)",
            }}
          >
            <div
              style={{
                display:
                  "flex",
                alignItems:
                  "center",
                justifyContent:
                  "space-between",
                gap: "10px",
                marginBottom:
                  "10px",
              }}
            >
              <div>
                <strong
                  style={{
                    display:
                      "block",
                    fontSize:
                      "20px",
                    color:
                      "#111827",
                  }}
                >
                  {
                    selected.product_code
                  }
                </strong>

                <span
                  style={{
                    display:
                      "block",
                    marginTop:
                      "2px",
                    color:
                      "#6b7280",
                    fontSize:
                      "12px",
                  }}
                >
                  {selected.brand}
                </span>
              </div>

              <button
                type="button"
                onClick={() =>
                  setSelected(null)
                }
                aria-label="닫기"
                style={{
                  flex:
                    "0 0 auto",
                  width: "38px",
                  height:
                    "38px",
                  border:
                    "none",
                  borderRadius:
                    "50%",
                  background:
                    "#f3f4f6",
                  color:
                    "#111827",
                  fontSize:
                    "20px",
                  cursor:
                    "pointer",
                }}
              >
                ×
              </button>
            </div>

            <SampleImage
              product={selected}
              large
            />

            <div
              style={{
                marginTop:
                  "12px",
                padding:
                  "2px 2px 4px",
                color:
                  "#374151",
                fontSize:
                  "14px",
                lineHeight: 1.7,
              }}
            >
              {selected.product_name && (
                <div>
                  {
                    selected.product_name
                  }
                </div>
              )}

              {selected.pattern_line && (
                <div>
                  패턴:{" "}
                  {
                    selected.pattern_line
                  }
                </div>
              )}

              {selected.wood_species && (
                <div>
                  수종:{" "}
                  {
                    selected.wood_species
                  }
                </div>
              )}

              {selected.color_family && (
                <div>
                  컬러:{" "}
                  {
                    selected.color_family
                  }
                </div>
              )}

              {selected.tone_family && (
                <div>
                  톤:{" "}
                  {getToneLabel(
                    selected.tone_family
                  )}
                </div>
              )}

              {selected.color_description && (
                <div>
                  {
                    selected.color_description
                  }
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() =>
                setSelected(null)
              }
              style={{
                width: "100%",
                marginTop:
                  "10px",
                padding:
                  "13px",
                border: "none",
                borderRadius:
                  "11px",
                background:
                  "#111827",
                color:
                  "#ffffff",
                fontSize:
                  "14px",
                fontWeight:
                  "800",
                cursor:
                  "pointer",
              }}
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </main>
  );
              }
