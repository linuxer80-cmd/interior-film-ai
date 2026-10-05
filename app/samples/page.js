"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import FilmSampleImage from "../components/FilmSampleImage";
import { supabase } from "../../lib/supabase";
import { findSimilarFilms } from "../../lib/similarFilms.mjs";

const PAGE_SIZE = 16;

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
  ["OGW", "옵티컬 그레인 우드", "wood"],
  ["SPW", "스페셜우드", "wood"],
  ["LW", "롱우드", "wood"],
  ["ZX", "프리미엄우드", "wood"],
  ["PNT", "프리미엄페인티드우드", "solid"],
  ["PTW", "페인티드우드", "solid"],
  ["ZSW", "슈퍼화이트우드", "solid"],
  ["CP", "텍스쳐", "solid"],
  ["HS", "텍스쳐", "solid"],
  ["LM", "텍스쳐", "solid"],
  ["LS", "텍스쳐", "solid"],
  ["NS", "스톤앤마블", "stone"],
  ["PM", "프리미엄마블", "stone"],
  ["PNC", "프리미엄페인티드콘크리트", "stone"],
  ["UMI", "고광택메탈", "metal"],
  ["APZ", "골드", "metal"],
  ["RM", "리얼메탈", "metal"],
  ["VM", "벨벳메탈", "metal"],
  ["SF", "소프트패브릭", "fabric"],
  ["RF", "리얼패브릭", "fabric"],
  ["NF", "네츄럴패브릭", "fabric"],
  ["SL", "소프트레더", "leather"],
  ["ECF", "이지클린필름", "etc"],
  ["EXF", "외장용필름", "etc"],
  ["BLC", "모노블랑", "etc"],
  ["SMT", "슈퍼매트", "etc"],
  ["W", "우드", "wood"],
  ["S", "솔리드", "solid"],
];

function unique(values) {
  return [...new Set(
    values
      .filter((value) => value !== null && value !== undefined)
      .map((value) => String(value).trim())
      .filter(Boolean)
  )];
}

function getProductLine(product) {
  const brand = String(product?.brand || "").toLowerCase();
  if (!/현대|bodaq/.test(brand)) return null;

  const code = String(product?.product_code || "")
    .trim()
    .toUpperCase();

  return PRODUCT_LINES.find(([prefix]) => code.startsWith(prefix)) || null;
}

function getProductCategory(product) {
  return (
    String(product?.category_key || "").trim() ||
    getProductLine(product)?.[2] ||
    ""
  );
}

function getProductLineLabel(product) {
  return (
    String(product?.pattern_line || "").trim() ||
    getProductLine(product)?.[1] ||
    ""
  );
}

function getCategoryLabel(key) {
  return CATEGORIES.find((item) => item.key === key)?.label || key;
}

function getToneLabel(value) {
  return {
    라이트톤: "라이트",
    미디엄톤: "미디엄",
    딥톤: "딥",
    기타톤: "포인트",
  }[value] || value;
}

function getDescription(product) {
  return (
    product?.product_name ||
    product?.color_description ||
    product?.wood_species ||
    product?.color_family ||
    product?.tone_family ||
    ""
  );
}

function getKey(product) {
  return String(
    product?.id ||
    `${product?.brand || ""}:${product?.product_code || ""}`
  );
}

function getPageNumbers(page, totalPages) {
  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
  const end = Math.min(totalPages, start + 4);

  return Array.from(
    { length: end - start + 1 },
    (_, index) => start + index
  );
}

function ChipRow({ items, value, onChange, wrap = false }) {
  if (!items.length) return null;

  return (
    <div style={{
      display: "flex",
      flexWrap: wrap ? "wrap" : "nowrap",
      gap: 7,
      overflowX: wrap ? "visible" : "auto",
      paddingBottom: 4,
      scrollbarWidth: "none",
    }}>
      {items.map((item) => {
        const active = value === item.value;

        return (
          <button
            key={item.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(item.value)}
            style={{
              flex: "0 0 auto",
              minHeight: 40,
              padding: "8px 14px",
              borderRadius: 999,
              border: active
                ? "2px solid #111827"
                : "1px solid #d1d5db",
              background: active ? "#111827" : "#fff",
              color: active ? "#fff" : "#374151",
              fontSize: 13,
              fontWeight: 800,
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

export default function SamplesPage() {
  const [companySlug, setCompanySlug] = useState("");
  const [company, setCompany] = useState(null);
  const [companyLoading, setCompanyLoading] = useState(true);
  const [products, setProducts] = useState([]);
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const listRef = useRef(null);
  const modalOpen = Boolean(selected);

  useEffect(() => {
    let cancelled = false;

    async function loadCompany() {
      const params = new URLSearchParams(window.location.search);
      const slug = String(params.get("company") || "")
        .trim()
        .toLowerCase();

      setCompanySlug(slug);

      if (!slug) {
        setCompanyLoading(false);
        return;
      }

      try {
        const response = await fetch(
          `/api/public-company?slug=${encodeURIComponent(slug)}`,
          { cache: "no-store" }
        );
        const result = await response.json();

        if (!response.ok || !result?.success || !result?.company) {
          throw new Error(
            result?.error || "업체 정보를 불러오지 못했습니다."
          );
        }

        if (!cancelled) setCompany(result.company);
      } catch (error) {
        console.error("업체 정보 조회 오류:", error);
        if (!cancelled) setCompany(null);
      } finally {
        if (!cancelled) setCompanyLoading(false);
      }
    }

    loadCompany();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadProducts() {
      setLoading(true);
      setMessage("");

      const columns = [
        "id", "brand", "product_code", "product_name",
        "category_key", "pattern_line", "color_family",
        "color_description", "color_hex", "texture",
        "grade", "wood_species", "tone_family",
        "sample_image_path", "sort_order",
      ].join(",");

      try {
        const allRows = [];

        for (let from = 0; mounted; from += 1000) {
          const { data, error } = await supabase
            .from("film_products")
            .select(columns)
            .eq("is_active", true)
            .order("brand", { ascending: true })
            .order("sort_order", { ascending: true })
            .order("id", { ascending: true })
            .range(from, from + 999);

          if (error) throw error;

          const rows = data || [];
          allRows.push(...rows);
          if (rows.length < 1000) break;
        }

        if (!mounted) return;

        setProducts(allRows);

        const brandList = unique(
          allRows.map((product) => product.brand)
        );

        if (brandList.length === 1) setBrand(brandList[0]);
      } catch (error) {
        if (!mounted) return;
        setProducts([]);
        setMessage(
          `필름 샘플을 불러오지 못했습니다. ${error.message || ""}`
        );
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadProducts();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!modalOpen) return;

    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement;

    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setSelected(null);
        return;
      }

      if (event.key !== "Tab") return;

      const elements = dialogRef.current?.querySelectorAll(
        'button:not([disabled]), a[href], input, select, textarea, [tabindex="0"]'
      );

      if (!elements?.length) return;

      const first = elements[0];
      const last = elements[elements.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);

      if (previousFocus?.isConnected) previousFocus.focus?.();
    };
  }, [modalOpen]);

  const companyName =
    company?.company_name || company?.name || "기분좋은공간";

  const estimateHref = companySlug
    ? `/estimate/${encodeURIComponent(companySlug)}`
    : "/";

  const brands = useMemo(() => {
    const priority = [
      "현대보닥",
      "영림 인테리어필름",
      "LX하우시스 베니프",
    ];

    return unique(products.map((product) => product.brand)).sort(
      (a, b) => {
        const ai = priority.indexOf(a);
        const bi = priority.indexOf(b);
        const ar = ai < 0 ? priority.length : ai;
        const br = bi < 0 ? priority.length : bi;
        return ar - br || a.localeCompare(b, "ko");
      }
    );
  }, [products]);

  const availableCategories = useMemo(() => {
    const rows = products.filter((product) => product.brand === brand);

    return CATEGORIES.filter((item) =>
      rows.some((product) => getProductCategory(product) === item.key)
    );
  }, [brand, products]);

  const filteredProducts = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    if (keyword) {
      return products.filter((product) =>
        [
          product.brand, product.product_code, product.product_name,
          product.category_key, product.pattern_line,
          product.color_family, product.color_description,
          product.texture, product.grade, product.wood_species,
          product.tone_family,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(keyword)
      );
    }

    if (!brand || !category) return [];

    return products.filter(
      (product) =>
        product.brand === brand &&
        getProductCategory(product) === category
    );
  }, [products, brand, category, search]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredProducts.length / PAGE_SIZE)
  );

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pagedProducts = filteredProducts.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE
  );

  const recommendations = useMemo(() => {
    if (!selected) return [];

    return findSimilarFilms(
      { ...selected, category_key: getProductCategory(selected) },
      products.map((product) => ({
        ...product,
        category_key: getProductCategory(product),
      })),
      4
    );
  }, [selected, products]);

  const showResults =
    Boolean(search.trim()) || Boolean(brand && category);

  function chooseBrand(nextBrand) {
    setBrand(nextBrand);
    setCategory("");
    setSearch("");
    setPage(1);
    setSelected(null);
  }

  function chooseCategory(nextCategory) {
    setCategory(nextCategory);
    setSearch("");
    setPage(1);
    setSelected(null);
  }

  function movePage(nextPage) {
    if (nextPage < 1 || nextPage > totalPages) return;

    setPage(nextPage);
    listRef.current?.scrollIntoView({
      behavior: window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches ? "auto" : "smooth",
      block: "start",
    });
  }

  function openRecommended(product) {
    setSelected(product);
    dialogRef.current?.scrollTo({ top: 0, behavior: "auto" });
    closeRef.current?.focus();
  }

  return (
    <main className="samples-page">
      <nav className="top-nav">
        <Link href={estimateHref}>AI 견적</Link>
        <span>필름 샘플보기</span>
      </nav>

      <div className="company-badge">
        {companyLoading ? "업체 정보 확인 중..." : companyName}
      </div>

      <h1>인테리어필름 샘플</h1>
      <p className="intro">
        제조사와 대분류를 선택하면 등록된 필름 샘플을 확인할 수 있습니다.
      </p>

      <section className="filter-panel">
        <div className="search-box">
          <input
            type="search"
            aria-label="필름 검색"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="제품번호 검색 예: S115, CW111"
          />
          {search && (
            <button
              type="button"
              aria-label="검색어 지우기"
              onClick={() => {
                setSearch("");
                setPage(1);
              }}
            >
              ×
            </button>
          )}
        </div>

        {!search.trim() && (
          <>
            <div className="filter-title">1. 제조사 선택</div>
            <ChipRow
              items={brands.map((item) => ({ value: item, label: item }))}
              value={brand}
              onChange={chooseBrand}
              wrap
            />
            <div className="filter-title">2. 대분류 선택</div>
            <ChipRow
              items={availableCategories.map((item) => ({
                value: item.key,
                label: item.label,
              }))}
              value={category}
              onChange={chooseCategory}
            />
          </>
        )}
      </section>

      {loading && (
        <p className="empty" role="status">
          필름 샘플을 불러오는 중입니다.
        </p>
      )}

      {!loading && message && (
        <p className="error" role="alert">{message}</p>
      )}

      {!loading && !message && !showResults && (
        <div className="empty">
          제조사와 대분류를 선택하면
          <br />
          등록된 필름 샘플이 바로 표시됩니다.
        </div>
      )}

      {!loading && !message && showResults && (
        <section ref={listRef} className="sample-list">
          <div className="list-heading">
            <strong>
              {search.trim()
                ? `"${search.trim()}" 검색 결과`
                : `${brand} · ${getCategoryLabel(category)}`}
            </strong>
            <span>총 {filteredProducts.length}개</span>
          </div>

          {pagedProducts.length ? (
            <div className="sample-grid">
              {pagedProducts.map((product) => (
                <button
                  key={getKey(product)}
                  type="button"
                  className="sample-card"
                  onClick={() => setSelected(product)}
                  aria-label={`${product.brand} ${product.product_code} 상세 보기`}
                >
                  <FilmSampleImage product={product} />
                  <strong>{product.product_code}</strong>
                  <span>{getDescription(product) || "필름"}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="empty">조건에 맞는 샘플이 없습니다.</p>
          )}

          {totalPages > 1 && (
            <>
              <nav className="pagination" aria-label="샘플 페이지">
                <button
                  type="button"
                  disabled={page === 1}
                  onClick={() => movePage(page - 1)}
                  aria-label="이전 페이지"
                >
                  ‹
                </button>

                {getPageNumbers(page, totalPages).map((number) => (
                  <button
                    key={number}
                    type="button"
                    className={number === page ? "active" : ""}
                    aria-current={number === page ? "page" : undefined}
                    onClick={() => movePage(number)}
                  >
                    {number}
                  </button>
                ))}

                <button
                  type="button"
                  disabled={page === totalPages}
                  onClick={() => movePage(page + 1)}
                  aria-label="다음 페이지"
                >
                  ›
                </button>
              </nav>
              <p className="page-info">{page} / {totalPages} 페이지</p>
            </>
          )}
        </section>
      )}

      {selected && (
        <div
          className="modal-backdrop"
          onClick={() => setSelected(null)}
        >
          <div
            ref={dialogRef}
            className="sample-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sample-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="dialog-heading">
              <div>
                <span>{selected.brand}</span>
                <strong id="sample-dialog-title">
                  {selected.product_code}
                </strong>
              </div>
              <button
                ref={closeRef}
                type="button"
                aria-label="닫기"
                onClick={() => setSelected(null)}
              >
                ×
              </button>
            </div>

            <FilmSampleImage product={selected} large />

            <div className="product-heading">
              <strong>{selected.product_code}</strong>
              <p>{getDescription(selected)}</p>
            </div>

            <div className="product-info">
              <dl>
                <dt>제조사</dt>
                <dd>{selected.brand}</dd>
                <dt>대분류</dt>
                <dd>
                  {getCategoryLabel(getProductCategory(selected)) || "미등록"}
                </dd>

                {getProductLineLabel(selected) && (
                  <>
                    <dt>제품군</dt>
                    <dd>{getProductLineLabel(selected)}</dd>
                  </>
                )}

                {selected.wood_species && (
                  <>
                    <dt>수종</dt>
                    <dd>{selected.wood_species}</dd>
                  </>
                )}

                {selected.color_family && (
                  <>
                    <dt>컬러</dt>
                    <dd>{selected.color_family}</dd>
                  </>
                )}

                {selected.tone_family && (
                  <>
                    <dt>톤</dt>
                    <dd>{getToneLabel(selected.tone_family)}</dd>
                  </>
                )}
              </dl>

              {selected.color_description && (
                <p className="description">{selected.color_description}</p>
              )}
            </div>

            <section className="recommendations">
              <h2>다른 브랜드 유사 필름</h2>
              <p className="recommendation-intro">
                선택한 필름과 색상·패턴 정보가 비슷한 제품이에요.
              </p>

              {recommendations.length ? (
                <div className="recommendation-grid">
                  {recommendations.map(({ product, reasons }) => (
                    <button
                      key={getKey(product)}
                      type="button"
                      className="recommendation-card"
                      onClick={() => openRecommended(product)}
                      aria-label={`${product.brand} ${product.product_code} 상세 보기`}
                    >
                      <FilmSampleImage product={product} />
                      <span className="recommendation-brand">
                        {product.brand}
                      </span>
                      <strong>{product.product_code}</strong>
                      <span className="recommendation-reason">
                        {reasons.join(" · ")}
                      </span>
                      <span className="recommendation-action">
                        샘플 자세히 보기 →
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="recommendation-empty">
                  현재 등록된 다른 브랜드에서
                  <br />
                  유사 제품을 찾지 못했어요.
                </div>
              )}

              <p className="sample-notice">
                실제 색상과 질감은 실물 샘플로 확인해 주세요.
              </p>
            </section>

            <button
              type="button"
              className="close-button"
              onClick={() => setSelected(null)}
            >
              닫기
            </button>
          </div>
        </div>
      )}

      <style jsx>{`
        .samples-page {
          max-width: 720px;
          min-height: 100vh;
          margin: 0 auto;
          padding: 14px 14px 70px;
          box-sizing: border-box;
          background: #f8fafc;
          color: #111827;
        }
        .top-nav {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          margin-bottom: 20px;
        }
        .top-nav :global(a), .top-nav > span {
          padding: 11px 8px;
          border: 1px solid #d1d5db;
          border-radius: 11px;
          background: #fff;
          color: #374151;
          text-align: center;
          text-decoration: none;
          font-size: 14px;
          font-weight: 800;
        }
        .top-nav > span {
          border-color: #111827;
          background: #111827;
          color: #fff;
        }
        .company-badge {
          display: inline-block;
          padding: 6px 11px;
          border-radius: 999px;
          background: #111827;
          color: #fff;
          font-size: 11px;
          font-weight: 800;
        }
        h1 {
          margin: 13px 0 5px;
          font-size: 27px;
          line-height: 1.3;
          letter-spacing: -0.8px;
        }
        .intro {
          margin: 0;
          color: #6b7280;
          font-size: 13px;
          line-height: 1.6;
        }
        .filter-panel {
          margin-top: 16px;
          padding: 14px;
          border: 1px solid #e5e7eb;
          border-radius: 16px;
          background: #fff;
        }
        .search-box { position: relative; }
        .search-box input {
          width: 100%;
          box-sizing: border-box;
          padding: 12px 40px 12px 12px;
          border: 1px solid #d1d5db;
          border-radius: 11px;
          background: #fff;
          color: #111827;
          font-size: 16px;
        }
        .search-box button {
          position: absolute;
          right: 8px;
          top: 50%;
          width: 28px;
          height: 28px;
          transform: translateY(-50%);
          border: none;
          border-radius: 50%;
          background: #f3f4f6;
          color: #6b7280;
          cursor: pointer;
        }
        .filter-title {
          margin: 14px 0 7px;
          color: #6b7280;
          font-size: 12px;
          font-weight: 800;
        }
        .empty {
          padding: 30px 12px;
          color: #6b7280;
          text-align: center;
          font-size: 13px;
          line-height: 1.7;
        }
        .error {
          margin-top: 15px;
          padding: 14px;
          border-radius: 12px;
          background: #fef2f2;
          color: #b91c1c;
          font-size: 13px;
          line-height: 1.5;
        }
        .sample-list { scroll-margin-top: 12px; }
        .list-heading {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin: 18px 2px 10px;
        }
        .list-heading strong {
          min-width: 0;
          overflow: hidden;
          font-size: 16px;
          white-space: nowrap;
          text-overflow: ellipsis;
        }
        .list-heading span {
          flex-shrink: 0;
          color: #6b7280;
          font-size: 12px;
          font-weight: 700;
        }
        .sample-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 14px 8px;
        }
        .sample-card {
          min-width: 0;
          padding: 0;
          border: none;
          background: transparent;
          text-align: left;
          cursor: pointer;
        }
        .sample-card strong, .sample-card > span {
          display: block;
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
        }
        .sample-card strong {
          margin-top: 5px;
          color: #111827;
          font-size: 11px;
          line-height: 1.2;
        }
        .sample-card > span {
          margin-top: 2px;
          color: #6b7280;
          font-size: 9px;
          line-height: 1.25;
        }
        .pagination {
          display: flex;
          justify-content: center;
          gap: 6px;
          margin-top: 22px;
        }
        .pagination button {
          width: 36px;
          height: 36px;
          padding: 0;
          border: 1px solid #d1d5db;
          border-radius: 50%;
          background: #fff;
          color: #111827;
          font-size: 13px;
          font-weight: 800;
          cursor: pointer;
        }
        .pagination button.active {
          border-color: #111827;
          background: #111827;
          color: #fff;
        }
        .pagination button:disabled {
          color: #d1d5db;
          cursor: default;
        }
        .page-info {
          margin: 9px 0 0;
          color: #9ca3af;
          text-align: center;
          font-size: 10px;
        }
        .modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 18px;
          box-sizing: border-box;
          background: rgba(17,24,39,0.68);
        }
        .sample-dialog {
          width: 100%;
          max-width: 520px;
          max-height: 92dvh;
          overflow-y: auto;
          overscroll-behavior: contain;
          padding: 14px;
          box-sizing: border-box;
          border-radius: 19px;
          background: #fff;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        }
        .dialog-heading {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 10px;
        }
        .dialog-heading span {
          display: block;
          color: #6b7280;
          font-size: 11px;
          font-weight: 700;
        }
        .dialog-heading strong {
          display: block;
          margin-top: 2px;
          font-size: 19px;
        }
        .dialog-heading button {
          flex-shrink: 0;
          width: 38px;
          height: 38px;
          border: none;
          border-radius: 50%;
          background: #f3f4f6;
          color: #111827;
          font-size: 21px;
          cursor: pointer;
        }
        .product-heading { margin-top: 13px; }
        .product-heading strong {
          display: block;
          font-size: 22px;
          line-height: 1.25;
        }
        .product-heading p {
          margin: 3px 0 0;
          color: #6b7280;
          font-size: 15px;
          font-weight: 700;
        }
        .product-info {
          margin-top: 13px;
          padding-top: 12px;
          border-top: 1px solid #e5e7eb;
          color: #4b5563;
          font-size: 13px;
          line-height: 1.8;
        }
        .product-info dl {
          display: grid;
          grid-template-columns: 65px minmax(0,1fr);
          gap: 2px 8px;
          margin: 0;
        }
        .product-info dt { font-weight: 700; }
        .product-info dd { margin: 0; overflow-wrap: anywhere; }
        .description {
          margin: 8px 0 0;
          padding-top: 8px;
          border-top: 1px solid #f3f4f6;
          color: #6b7280;
        }
        .recommendations {
          margin-top: 18px;
          padding: 14px;
          border: 1px solid #e2ebf6;
          border-radius: 16px;
          background: #f5f9ff;
        }
        .recommendations h2 {
          margin: 0;
          color: #183451;
          font-size: 16px;
        }
        .recommendation-intro {
          margin: 6px 0 12px;
          color: #667085;
          font-size: 12px;
          line-height: 1.6;
        }
        .recommendation-grid {
          display: grid;
          grid-template-columns: repeat(2,minmax(0,1fr));
          gap: 10px;
        }
        .recommendation-card {
          min-width: 0;
          padding: 10px;
          border: 1px solid #dce6f2;
          border-radius: 12px;
          background: #fff;
          color: #183451;
          text-align: left;
          cursor: pointer;
        }
        .recommendation-card > span,
        .recommendation-card strong {
          display: block;
          overflow-wrap: anywhere;
        }
        .recommendation-brand {
          margin-top: 6px;
          color: #667085;
          font-size: 11px;
        }
        .recommendation-card strong {
          margin-top: 3px;
          font-size: 16px;
        }
        .recommendation-reason {
          margin-top: 4px;
          color: #667085;
          font-size: 11px;
          line-height: 1.5;
        }
        .recommendation-action {
          margin-top: 8px;
          color: #287bd0;
          font-size: 12px;
          font-weight: 700;
        }
        .recommendation-empty {
          padding: 18px 8px;
          border-radius: 10px;
          background: #fff;
          color: #667085;
          text-align: center;
          font-size: 13px;
          line-height: 1.7;
        }
        .sample-notice {
          margin: 10px 0 0;
          color: #667085;
          font-size: 11px;
          line-height: 1.6;
        }
        .close-button {
          width: 100%;
          margin-top: 15px;
          padding: 13px;
          border: none;
          border-radius: 11px;
          background: #111827;
          color: #fff;
          font-size: 14px;
          font-weight: 800;
          cursor: pointer;
        }
        button:focus-visible, input:focus-visible {
          outline: 3px solid #398be0;
          outline-offset: 2px;
        }
      `}</style>
    </main>
  );
      }
