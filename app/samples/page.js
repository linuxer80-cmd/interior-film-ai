"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabase";

const PAGE_SIZE = 16;

const SUPABASE_URL = (
  process.env.NEXT_PUBLIC_SUPABASE_URL || ""
).replace(/\/$/, "");

/*
 * 소비자 샘플 페이지 대분류
 */
const CATEGORIES = [
  { key: "wood", label: "우드" },
  { key: "solid", label: "솔리드" },
  { key: "stone", label: "스톤&마블" },
  { key: "metal", label: "메탈" },
  { key: "fabric", label: "패브릭" },
  { key: "leather", label: "레더" },
  { key: "etc", label: "기타" },
];

/*
 * 현대보닥 제품번호 → 대분류
 *
 * 긴 prefix가 반드시 위에 있어야 합니다.
 * W, S 같은 짧은 prefix는 마지막에 둡니다.
 */
const PRODUCT_LINES = [
  {
    prefix: "OGW",
    label: "옵티컬 그레인 우드",
    category: "wood",
  },
  {
    prefix: "SPW",
    label: "스페셜우드",
    category: "wood",
  },
  {
    prefix: "LW",
    label: "롱우드",
    category: "wood",
  },
  {
    prefix: "ZX",
    label: "프리미엄우드",
    category: "wood",
  },

  {
    prefix: "PNT",
    label: "프리미엄페인티드우드",
    category: "solid",
  },
  {
    prefix: "PTW",
    label: "페인티드우드",
    category: "solid",
  },
  {
    prefix: "ZSW",
    label: "슈퍼화이트우드",
    category: "solid",
  },
  {
    prefix: "CP",
    label: "텍스쳐",
    category: "solid",
  },
  {
    prefix: "HS",
    label: "텍스쳐",
    category: "solid",
  },
  {
    prefix: "LM",
    label: "텍스쳐",
    category: "solid",
  },
  {
    prefix: "LS",
    label: "텍스쳐",
    category: "solid",
  },

  {
    prefix: "NS",
    label: "스톤앤마블",
    category: "stone",
  },
  {
    prefix: "PM",
    label: "프리미엄마블",
    category: "stone",
  },
  {
    prefix: "PNC",
    label: "프리미엄페인티드콘크리트",
    category: "stone",
  },

  {
    prefix: "UMI",
    label: "고광택메탈",
    category: "metal",
  },
  {
    prefix: "APZ",
    label: "골드",
    category: "metal",
  },
  {
    prefix: "RM",
    label: "리얼메탈",
    category: "metal",
  },
  {
    prefix: "VM",
    label: "벨벳메탈",
    category: "metal",
  },

  {
    prefix: "SF",
    label: "소프트패브릭",
    category: "fabric",
  },
  {
    prefix: "RF",
    label: "리얼패브릭",
    category: "fabric",
  },
  {
    prefix: "NF",
    label: "네츄럴패브릭",
    category: "fabric",
  },

  {
    prefix: "SL",
    label: "소프트레더",
    category: "leather",
  },

  {
    prefix: "ECF",
    label: "이지클린필름",
    category: "etc",
  },
  {
    prefix: "EXF",
    label: "외장용필름",
    category: "etc",
  },
  {
    prefix: "BLC",
    label: "모노블랑",
    category: "etc",
  },
  {
    prefix: "SMT",
    label: "슈퍼매트",
    category: "etc",
  },

  /*
   * 짧은 prefix는 반드시 마지막
   */
  {
    prefix: "W",
    label: "우드",
    category: "wood",
  },
  {
    prefix: "S",
    label: "솔리드",
    category: "solid",
  },
];

/*
 * 중복 제거
 */
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

/*
 * Supabase Storage 이미지 주소
 */
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

/*
 * 현대보닥 제품번호 prefix 분류
 */
function getProductLine(productCode) {
  const code = String(productCode || "")
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

/*
 * 제품의 대분류 찾기
 *
 * LX 등:
 * category_key 사용
 *
 * 기존 현대보닥:
 * 제품번호 prefix 사용
 */
function getProductCategory(product) {
  const storedCategory = String(
    product?.category_key || ""
  ).trim();

  if (storedCategory) {
    return storedCategory;
  }

  const line = getProductLine(
    product?.product_code
  );

  return line?.category || "";
}

/*
 * 제품 라인 이름
 * 상세 팝업에서만 사용
 */
function getProductLineLabel(product) {
  const storedLine = String(
    product?.pattern_line || ""
  ).trim();

  if (storedLine) {
    return storedLine;
  }

  const line = getProductLine(
    product?.product_code
  );

  return line?.label || "";
}

/*
 * 카테고리 한글명
 */
function getCategoryLabel(categoryKey) {
  return (
    CATEGORIES.find(
      (item) =>
        item.key === categoryKey
    )?.label || categoryKey
  );
}

/*
 * 톤 표시
 */
function getToneLabel(value) {
  const labels = {
    라이트톤: "라이트",
    미디엄톤: "미디엄",
    딥톤: "딥",
    기타톤: "포인트",
  };

  return labels[value] || value;
}

/*
 * 제품 카드 아래 설명
 */
function getProductDescription(product) {
  return (
    product?.product_name ||
    product?.color_description ||
    product?.wood_species ||
    product?.color_family ||
    product?.tone_family ||
    ""
  );
}

/*
 * 샘플 이미지
 */
function SampleImage({
  product,
  large = false,
}) {
  const imageUrl = getSampleUrl(
    product?.sample_image_path
  );

  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={
          product?.product_code ||
          "필름 샘플"
        }
        loading={large ? "eager" : "lazy"}
        decoding="async"
        style={{
          display: "block",
          width: "100%",
          aspectRatio: "1 / 1",
          objectFit: "cover",
          borderRadius: large
            ? "15px"
            : "9px",
          border:
            "1px solid #e5e7eb",
          background: "#f9fafb",
        }}
      />
    );
  }

  /*
   * 이미지가 없으면 color_hex 표시
   */
  return (
    <div
      style={{
        display: "block",
        width: "100%",
        aspectRatio: "1 / 1",
        borderRadius: large
          ? "15px"
          : "9px",
        border:
          "1px solid #e5e7eb",
        background:
          product?.color_hex ||
          "#f3f4f6",
      }}
    />
  );
}

/*
 * 가로 스크롤 선택 버튼
 */
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
        paddingBottom: "3px",
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

/*
 * 필터 제목
 */
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

/*
 * 페이지 번호 생성
 *
 * 현재 페이지 주변 최대 5개 표시
 */
function getPageNumbers(
  currentPage,
  totalPages
) {
  if (totalPages <= 5) {
    return Array.from(
      { length: totalPages },
      (_, index) => index + 1
    );
  }

  let start = Math.max(
    1,
    currentPage - 2
  );

  let end = Math.min(
    totalPages,
    start + 4
  );

  if (end - start < 4) {
    start = Math.max(
      1,
      end - 4
    );
  }

  return Array.from(
    {
      length:
        end - start + 1,
    },
    (_, index) =>
      start + index
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
    search,
    setSearch,
  ] = useState("");

  const [
    page,
    setPage,
  ] = useState(1);

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

  /*
   * Supabase에서 제품 불러오기
   *
   * 가격 컬럼은 아예 조회하지 않습니다.
   * 고객용 샘플 페이지에서 가격 노출 방지.
   */
  useEffect(() => {
    let mounted = true;

    async function loadProducts() {
      setLoading(true);
      setMessage("");

      const FETCH_SIZE = 1000;
      const selectColumns = [
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

        if (rows.length < FETCH_SIZE) {
          break;
        }

        from += FETCH_SIZE;
      }

      if (!mounted) {
        return;
      }

      if (error) {
        console.error("필름 샘플 조회 오류:", error);
        setProducts([]);
        setMessage(
          `필름 샘플을 불러오지 못했습니다. ${error.message || ""}`
        );
      } else {
        const rows = data || [];
        setProducts(rows);

        const brandList = unique(
          rows.map((item) => item.brand)
        );

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
   * 큰 이미지 팝업 열렸을 때
   * 뒤 화면 스크롤 방지
   */
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

  /*
   * 제조사 목록
   */
  const brands = useMemo(() => {
    const brandList = unique(
      products.map((item) => item.brand)
    );

    const PRIORITY_BRANDS = [
      "현대보닥",
      "영림 인테리어필름",
      "LX하우시스 베니프",
    ];

    return [...brandList].sort((a, b) => {
      const aIndex = PRIORITY_BRANDS.indexOf(a);
      const bIndex = PRIORITY_BRANDS.indexOf(b);
      const aPriority = aIndex === -1 ? PRIORITY_BRANDS.length : aIndex;
      const bPriority = bIndex === -1 ? PRIORITY_BRANDS.length : bIndex;

      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }

      return a.localeCompare(b, "ko");
    });
  }, [products]);

  /*
   * 선택한 제조사에 실제 존재하는
   * 대분류만 표시
   */
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
            (product) =>
              getProductCategory(
                product
              ) ===
              categoryItem.key
          )
      );
    }, [brand, products]);

  /*
   * 최종 샘플 목록
   *
   * 검색어가 있으면
   * 제조사/대분류 선택과 상관없이
   * 전체 DB에서 검색
   *
   * 검색어가 없으면
   * 선택한 제조사 + 대분류만 표시
   */
  const filteredProducts =
    useMemo(() => {
      const keyword =
        search
          .trim()
          .toLowerCase();

      if (keyword) {
        return products.filter(
          (product) => {
            const text = [
              product.brand,
              product.product_code,
              product.product_name,
              product.category_key,
              product.pattern_line,
              product.color_family,
              product.color_description,
              product.texture,
              product.grade,
              product.wood_species,
              product.tone_family,
            ]
              .filter(Boolean)
              .join(" ")
              .toLowerCase();

            return text.includes(
              keyword
            );
          }
        );
      }

      if (
        !brand ||
        !category
      ) {
        return [];
      }

      return products.filter(
        (product) =>
          product.brand ===
            brand &&
          getProductCategory(
            product
          ) === category
      );
    }, [
      products,
      brand,
      category,
      search,
    ]);

  /*
   * 전체 페이지 수
   */
  const totalPages =
    Math.max(
      1,
      Math.ceil(
        filteredProducts.length /
          PAGE_SIZE
      )
    );

  /*
   * 현재 페이지가 범위를 벗어나면
   * 마지막 페이지로 보정
   */
  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  /*
   * 현재 페이지 제품
   */
  const pagedProducts =
    useMemo(() => {
      const start =
        (page - 1) *
        PAGE_SIZE;

      return filteredProducts.slice(
        start,
        start + PAGE_SIZE
      );
    }, [
      filteredProducts,
      page,
    ]);

  const pageNumbers =
    getPageNumbers(
      page,
      totalPages
    );

  /*
   * 제조사 선택
   */
  function chooseBrand(
    nextBrand
  ) {
    setBrand(nextBrand);
    setCategory("");
    setSearch("");
    setPage(1);
    setSelected(null);
  }

  /*
   * 대분류 선택
   *
   * 선택 즉시 샘플 표시
   */
  function chooseCategory(
    nextCategory
  ) {
    setCategory(
      nextCategory
    );
    setSearch("");
    setPage(1);
    setSelected(null);
  }

  /*
   * 페이지 이동
   */
  function movePage(
    nextPage
  ) {
    if (
      nextPage < 1 ||
      nextPage >
        totalPages
    ) {
      return;
    }

    setPage(nextPage);

    /*
     * 페이지 변경 시
     * 샘플 목록 상단으로 이동
     */
    setTimeout(() => {
      const element =
        document.getElementById(
          "sample-list"
        );

      if (element) {
        element.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }
    }, 10);
  }

  /*
   * 검색
   */
  function handleSearch(
    value
  ) {
    setSearch(value);
    setPage(1);
  }

  const showResults =
    Boolean(
      search.trim()
    ) ||
    Boolean(
      brand &&
        category
    );

  const currentCategoryLabel =
    getCategoryLabel(
      category
    );

  return (
    <main
      style={{
        maxWidth: "720px",
        margin: "0 auto",
        minHeight: "100vh",
        padding:
          "14px 14px 70px",
        boxSizing:
          "border-box",
        background:
          "#f8fafc",
        color: "#111827",
      }}
    >
      {/* ===================================
          상단 메뉴
      =================================== */}

      <nav
        style={{
          display: "grid",
          gridTemplateColumns:
            "1fr 1fr",
          gap: "8px",
          marginBottom: "20px",
        }}
      >
        <Link
          href="/"
          style={{
            padding:
              "11px 8px",
            border:
              "1px solid #d1d5db",
            borderRadius:
              "11px",
            background:
              "#ffffff",
            color:
              "#374151",
            textAlign:
              "center",
            textDecoration:
              "none",
            fontSize:
              "14px",
            fontWeight:
              "800",
          }}
        >
          AI 견적
        </Link>

        <div
          style={{
            padding:
              "11px 8px",
            borderRadius:
              "11px",
            background:
              "#111827",
            color:
              "#ffffff",
            textAlign:
              "center",
            fontSize:
              "14px",
            fontWeight:
              "800",
          }}
        >
          필름 샘플보기
        </div>
      </nav>

      {/* ===================================
          제목
      =================================== */}

      <div
        style={{
          display:
            "inline-block",
          padding:
            "6px 11px",
          borderRadius:
            "999px",
          background:
            "#111827",
          color:
            "#ffffff",
          fontSize:
            "11px",
          fontWeight:
            "800",
        }}
      >
        기분좋은공간
      </div>

      <h1
        style={{
          margin:
            "13px 0 5px",
          fontSize:
            "27px",
          lineHeight: 1.3,
          letterSpacing:
            "-0.8px",
        }}
      >
        인테리어필름 샘플
      </h1>

      <p
        style={{
          margin: 0,
          color:
            "#6b7280",
          fontSize:
            "13px",
          lineHeight: 1.6,
        }}
      >
        제조사와 대분류를
        선택하면 등록된 필름
        샘플을 확인할 수 있습니다.
      </p>

      {/* ===================================
          검색 / 제조사 / 대분류
      =================================== */}

      <section
        style={{
          marginTop:
            "16px",
          padding:
            "14px",
          border:
            "1px solid #e5e7eb",
          borderRadius:
            "16px",
          background:
            "#ffffff",
        }}
      >
        {/* 검색 */}

        <div
          style={{
            position:
              "relative",
          }}
        >
          <span
            aria-hidden="true"
            style={{
              position:
                "absolute",
              left: "12px",
              top: "50%",
              transform:
                "translateY(-50%)",
              color:
                "#9ca3af",
              fontSize:
                "16px",
              pointerEvents:
                "none",
            }}
          >
            ⌕
          </span>

          <input
            type="search"
            value={search}
            onChange={(
              event
            ) =>
              handleSearch(
                event.target.value
              )
            }
            placeholder="제품번호 검색 예: S115, CW111"
            style={{
              width:
                "100%",
              boxSizing:
                "border-box",
              padding:
                "12px 38px 12px 36px",
              border:
                "1px solid #d1d5db",
              borderRadius:
                "11px",
              outline:
                "none",
              fontSize:
                "14px",
              color:
                "#111827",
              background:
                "#ffffff",
            }}
          />

          {search && (
            <button
              type="button"
              onClick={() =>
                handleSearch("")
              }
              aria-label="검색어 지우기"
              style={{
                position:
                  "absolute",
                right: "8px",
                top: "50%",
                transform:
                  "translateY(-50%)",
                width:
                  "28px",
                height:
                  "28px",
                border:
                  "none",
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

        {/* 검색 중에는 필터 숨김 */}

        {!search.trim() && (
          <>
            <FilterSection title="1. 제조사 선택">
              <ChipRow
                items={brands.map(
                  (item) => ({
                    value:
                      item,
                    label:
                      item,
                  })
                )}
                value={brand}
                onChange={
                  chooseBrand
                }
              />
            </FilterSection>

            <FilterSection title="2. 대분류 선택">
              <ChipRow
                items={availableCategories.map(
                  (item) => ({
                    value:
                      item.key,
                    label:
                      item.label,
                  })
                )}
                value={
                  category
                }
                onChange={
                  chooseCategory
                }
              />
            </FilterSection>
          </>
        )}
      </section>

      {/* ===================================
          로딩
      =================================== */}

      {loading && (
        <div
          style={{
            padding:
              "40px 0",
            textAlign:
              "center",
            color:
              "#6b7280",
            fontSize:
              "13px",
          }}
        >
          필름 샘플을
          불러오는 중입니다.
        </div>
      )}

      {/* ===================================
          오류
      =================================== */}

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
              lineHeight:
                1.5,
            }}
          >
            {message}
          </div>
        )}

      {/* ===================================
          선택 전 안내
      =================================== */}

      {!loading &&
        !message &&
        !showResults && (
          <div
            style={{
              marginTop:
                "15px",
              padding:
                "24px 14px",
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
              lineHeight:
                1.7,
            }}
          >
            제조사와 대분류를
            선택하면
            <br />
            등록된 필름 샘플이
            바로 표시됩니다.
          </div>
        )}

      {/* ===================================
          샘플 목록
      =================================== */}

      {!loading &&
        !message &&
        showResults && (
          <section
            id="sample-list"
            style={{
              scrollMarginTop:
                "12px",
            }}
          >
            {/* 결과 제목 */}

            <div
              style={{
                display:
                  "flex",
                alignItems:
                  "center",
                justifyContent:
                  "space-between",
                gap: "10px",
                margin:
                  "18px 2px 10px",
              }}
            >
              <strong
                style={{
                  minWidth: 0,
                  fontSize:
                    "16px",
                  color:
                    "#111827",
                  whiteSpace:
                    "nowrap",
                  overflow:
                    "hidden",
                  textOverflow:
                    "ellipsis",
                }}
              >
                {search.trim()
                  ? `"${search.trim()}" 검색 결과`
                  : `${brand} · ${currentCategoryLabel}`}
              </strong>

              <span
                style={{
                  flex:
                    "0 0 auto",
                  color:
                    "#6b7280",
                  fontSize:
                    "12px",
                  fontWeight:
                    "700",
                }}
              >
                총{" "}
                {
                  filteredProducts.length
                }
                개
              </span>
            </div>

            {/* 샘플 4열 */}

            {pagedProducts.length >
            0 ? (
              <div
                style={{
                  display:
                    "grid",
                  gridTemplateColumns:
                    "repeat(4, minmax(0, 1fr))",
                  gap:
                    "14px 8px",
                }}
              >
                {pagedProducts.map(
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
                        minWidth:
                          0,
                        padding:
                          0,
                        border:
                          "none",
                        background:
                          "transparent",
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
                            "5px",
                          color:
                            "#111827",
                          fontSize:
                            "11px",
                          lineHeight:
                            1.2,
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
                            "9px",
                          lineHeight:
                            1.25,
                          whiteSpace:
                            "nowrap",
                          overflow:
                            "hidden",
                          textOverflow:
                            "ellipsis",
                        }}
                      >
                        {getProductDescription(
                          product
                        ) ||
                          "필름"}
                      </span>
                    </button>
                  )
                )}
              </div>
            ) : (
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

            {/* ===================================
                페이지 이동
            =================================== */}

            {filteredProducts.length >
              PAGE_SIZE && (
              <div
                style={{
                  display:
                    "flex",
                  alignItems:
                    "center",
                  justifyContent:
                    "center",
                  gap: "6px",
                  marginTop:
                    "22px",
                  flexWrap:
                    "nowrap",
                }}
              >
                {/* 이전 */}

                <button
                  type="button"
                  disabled={
                    page === 1
                  }
                  onClick={() =>
                    movePage(
                      page - 1
                    )
                  }
                  aria-label="이전 페이지"
                  style={{
                    width:
                      "38px",
                    height:
                      "38px",
                    border:
                      "1px solid #d1d5db",
                    borderRadius:
                      "50%",
                    background:
                      "#ffffff",
                    color:
                      page === 1
                        ? "#d1d5db"
                        : "#111827",
                    fontSize:
                      "20px",
                    fontWeight:
                      "700",
                    cursor:
                      page === 1
                        ? "default"
                        : "pointer",
                  }}
                >
                  ‹
                </button>

                {/* 페이지 번호 */}

                {pageNumbers.map(
                  (
                    pageNumber
                  ) => {
                    const active =
                      pageNumber ===
                      page;

                    return (
                      <button
                        key={
                          pageNumber
                        }
                        type="button"
                        onClick={() =>
                          movePage(
                            pageNumber
                          )
                        }
                        style={{
                          width:
                            "38px",
                          height:
                            "38px",
                          border:
                            active
                              ? "none"
                              : "1px solid #d1d5db",
                          borderRadius:
                            "50%",
                          background:
                            active
                              ? "#111827"
                              : "#ffffff",
                          color:
                            active
                              ? "#ffffff"
                              : "#111827",
                          fontSize:
                            "13px",
                          fontWeight:
                            "800",
                          cursor:
                            "pointer",
                        }}
                      >
                        {
                          pageNumber
                        }
                      </button>
                    );
                  }
                )}

                {/* 다음 */}

                <button
                  type="button"
                  disabled={
                    page ===
                    totalPages
                  }
                  onClick={() =>
                    movePage(
                      page + 1
                    )
                  }
                  aria-label="다음 페이지"
                  style={{
                    width:
                      "38px",
                    height:
                      "38px",
                    border:
                      "1px solid #d1d5db",
                    borderRadius:
                      "50%",
                    background:
                      "#ffffff",
                    color:
                      page ===
                      totalPages
                        ? "#d1d5db"
                        : "#111827",
                    fontSize:
                      "20px",
                    fontWeight:
                      "700",
                    cursor:
                      page ===
                      totalPages
                        ? "default"
                        : "pointer",
                  }}
                >
                  ›
                </button>
              </div>
            )}

            {/* 페이지 정보 */}

            {filteredProducts.length >
              PAGE_SIZE && (
              <div
                style={{
                  marginTop:
                    "9px",
                  textAlign:
                    "center",
                  color:
                    "#9ca3af",
                  fontSize:
                    "10px",
                }}
              >
                {page} /{" "}
                {totalPages} 페이지
              </div>
            )}
          </section>
        )}

      {/* ===================================
          큰 샘플 이미지 팝업
      =================================== */}

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
            padding:
              "18px",
            boxSizing:
              "border-box",
            background:
              "rgba(17,24,39,0.68)",
            display:
              "flex",
            alignItems:
              "center",
            justifyContent:
              "center",
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="필름 샘플 크게 보기"
            onClick={(
              event
            ) =>
              event.stopPropagation()
            }
            style={{
              width:
                "100%",
              maxWidth:
                "520px",
              maxHeight:
                "92dvh",
              overflowY:
                "auto",
              padding:
                "14px",
              boxSizing:
                "border-box",
              borderRadius:
                "19px",
              background:
                "#ffffff",
              boxShadow:
                "0 20px 60px rgba(0,0,0,0.30)",
            }}
          >
            {/* 팝업 헤더 */}

            <div
              style={{
                display:
                  "flex",
                alignItems:
                  "center",
                justifyContent:
                  "space-between",
                marginBottom:
                  "10px",
              }}
            >
              <div
                style={{
                  minWidth:
                    0,
                }}
              >
                <div
                  style={{
                    color:
                      "#6b7280",
                    fontSize:
                      "11px",
                    fontWeight:
                      "700",
                  }}
                >
                  {
                    selected.brand
                  }
                </div>

                <strong
                  style={{
                    display:
                      "block",
                    marginTop:
                      "2px",
                    color:
                      "#111827",
                    fontSize:
                      "19px",
                  }}
                >
                  {
                    selected.product_code
                  }
                </strong>
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
                  width:
                    "38px",
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
                    "21px",
                  lineHeight:
                    1,
                  cursor:
                    "pointer",
                }}
              >
                ×
              </button>
            </div>

            {/* 큰 이미지 */}

            <SampleImage
              product={
                selected
              }
              large
            />

            {/* 제품번호 / 이름 */}

            <div
              style={{
                marginTop:
                  "13px",
              }}
            >
              <strong
                style={{
                  display:
                    "block",
                  color:
                    "#111827",
                  fontSize:
                    "22px",
                  lineHeight:
                    1.25,
                }}
              >
                {
                  selected.product_code
                }
              </strong>

              {getProductDescription(
                selected
              ) && (
                <div
                  style={{
                    marginTop:
                      "3px",
                    color:
                      "#6b7280",
                    fontSize:
                      "15px",
                    fontWeight:
                      "700",
                  }}
                >
                  {getProductDescription(
                    selected
                  )}
                </div>
              )}
            </div>

            {/* 제품 정보 */}

            <div
              style={{
                marginTop:
                  "13px",
                paddingTop:
                  "12px",
                borderTop:
                  "1px solid #e5e7eb",
                color:
                  "#4b5563",
                fontSize:
                  "13px",
                lineHeight:
                  1.8,
              }}
            >
              <div
                style={{
                  display:
                    "grid",
                  gridTemplateColumns:
                    "65px 1fr",
                  gap: "2px 8px",
                }}
              >
                <strong>
                  제조사
                </strong>

                <span>
                  {
                    selected.brand
                  }
                </span>

                <strong>
                  대분류
                </strong>

                <span>
                  {getCategoryLabel(
                    getProductCategory(
                      selected
                    )
                  )}
                </span>

                {getProductLineLabel(
                  selected
                ) && (
                  <>
                    <strong>
                      제품군
                    </strong>

                    <span>
                      {getProductLineLabel(
                        selected
                      )}
                    </span>
                  </>
                )}

                {selected.wood_species && (
                  <>
                    <strong>
                      수종
                    </strong>

                    <span>
                      {
                        selected.wood_species
                      }
                    </span>
                  </>
                )}

                {selected.color_family && (
                  <>
                    <strong>
                      컬러
                    </strong>

                    <span>
                      {
                        selected.color_family
                      }
                    </span>
                  </>
                )}

                {selected.tone_family && (
                  <>
                    <strong>
                      톤
                    </strong>

                    <span>
                      {getToneLabel(
                        selected.tone_family
                      )}
                    </span>
                  </>
                )}
              </div>

              {selected.color_description && (
                <div
                  style={{
                    marginTop:
                      "8px",
                    paddingTop:
                      "8px",
                    borderTop:
                      "1px solid #f3f4f6",
                    color:
                      "#6b7280",
                  }}
                >
                  {
                    selected.color_description
                  }
                </div>
              )}
            </div>

            {/* 닫기 */}

            <button
              type="button"
              onClick={() =>
                setSelected(null)
              }
              style={{
                width:
                  "100%",
                marginTop:
                  "15px",
                padding:
                  "13px",
                border:
                  "none",
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
