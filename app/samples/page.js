"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import FilmSampleImage, {
  getFilmSampleUrl,
} from "../components/FilmSampleImage";
import { supabase } from "../../lib/supabase";
import { findImageSimilarFilms } from "../../lib/filmImageSimilarity.mjs";

const PAGE_SIZE = 24;

const CATEGORIES = [
  ["wood", "우드"],
  ["solid", "솔리드"],
  ["stone", "스톤&마블"],
  ["metal", "메탈"],
  ["fabric", "패브릭"],
  ["leather", "레더"],
  ["etc", "기타"],
];

const PREFIXES = [
  ["OGW", "wood"],
  ["SPW", "wood"],
  ["LW", "wood"],
  ["ZX", "wood"],
  ["PNT", "solid"],
  ["PTW", "solid"],
  ["ZSW", "solid"],
  ["CP", "solid"],
  ["HS", "solid"],
  ["LM", "solid"],
  ["LS", "solid"],
  ["NS", "stone"],
  ["PM", "stone"],
  ["PNC", "stone"],
  ["UMI", "metal"],
  ["APZ", "metal"],
  ["RM", "metal"],
  ["VM", "metal"],
  ["SF", "fabric"],
  ["RF", "fabric"],
  ["NF", "fabric"],
  ["SL", "leather"],
  ["ECF", "etc"],
  ["EXF", "etc"],
  ["BLC", "etc"],
  ["SMT", "etc"],
  ["W", "wood"],
  ["S", "solid"],
];

const keyOf = (product) =>
  String(
    product.id ??
      `${product.brand}:${product.product_code}`
  );

const normalizeText = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "");

const categoryLabel = (key) =>
  CATEGORIES.find(([value]) => value === key)?.[1] ||
  key ||
  "미분류";

function normalizeProduct(product) {
  let category = String(product.category_key || "")
    .trim()
    .toLowerCase();

  const matchedCategory = CATEGORIES.find(
    ([key, label]) => category === key || category === label
  );

  if (matchedCategory) {
    category = matchedCategory[0];
  }

  if (!category && /현대|bodaq/i.test(product.brand || "")) {
    const code = String(product.product_code || "")
      .trim()
      .toUpperCase();

    category =
      PREFIXES.find(([prefix]) => code.startsWith(prefix))?.[1] ||
      "";
  }

  return {
    ...product,
    category_key: category,
  };
}

export default function SamplesPage() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  const [company, setCompany] = useState("기분좋은공간");
  const [slug, setSlug] = useState("");

  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const [selected, setSelected] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [progress, setProgress] = useState({
    done: 0,
    total: 0,
  });

  const requestRef = useRef(null);
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const listRef = useRef(null);

  const modalOpen = Boolean(selected);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    const companySlug =
      new URLSearchParams(window.location.search).get("company") ||
      "";

    setSlug(companySlug);

    if (companySlug) {
      fetch(
        `/api/public-company?slug=${encodeURIComponent(companySlug)}`,
        { signal: controller.signal }
      )
        .then((response) => {
          if (!response.ok) return null;
          return response.json();
        })
        .then((data) => {
          if (active && data?.success && data.company) {
            setCompany(
              data.company.company_name ||
                data.company.name ||
                "기분좋은공간"
            );
          }
        })
        .catch(() => {});
    }

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const rows = [];

        const columns = [
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

        for (let from = 0; active; from += 1000) {
          const { data, error: queryError } = await supabase
            .from("film_products")
            .select(columns)
            .eq("is_active", true)
            .order("brand")
            .order("sort_order")
            .order("id")
            .range(from, from + 999);

          if (queryError) throw queryError;
          if (!active) return;

          rows.push(...(data || []));

          if (!data || data.length < 1000) break;
        }

        if (active) {
          setProducts(rows.map(normalizeProduct));
        }
      } catch (loadError) {
        if (active) {
          setError(loadError?.message || "샘플 조회에 실패했습니다.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    load();

    return () => {
      active = false;
    };
  }, [reload]);

  useEffect(() => {
    return () => {
      const request = requestRef.current;
      requestRef.current = null;
      request?.abort();
    };
  }, []);

  function stopRequest() {
    const request = requestRef.current;
    requestRef.current = null;
    request?.abort();
    setBusy(false);
  }

  function closeModal() {
    stopRequest();
    setSelected(null);
    setResult(null);
    setNotice("");
  }

  function openProduct(product) {
    stopRequest();
    setSelected(product);
    setResult(null);
    setNotice("");
    setProgress({ done: 0, total: 0 });

    if (dialogRef.current) {
      dialogRef.current.scrollTop = 0;
    }

    closeRef.current?.focus();
  }

  useEffect(() => {
    if (!modalOpen) return;

    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement;

    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    function keyboard(event) {
      if (event.key === "Escape") {
        event.preventDefault();

        const request = requestRef.current;
        requestRef.current = null;
        request?.abort();

        setBusy(false);
        setSelected(null);
        setResult(null);
        setNotice("");
        return;
      }

      if (event.key !== "Tab") return;

      const nodes = dialogRef.current?.querySelectorAll(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), [tabindex="0"]'
      );

      if (!nodes?.length) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }

      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const outside = !dialogRef.current?.contains(
        document.activeElement
      );

      if (
        event.shiftKey &&
        (document.activeElement === first || outside)
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || outside)
      ) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", keyboard);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", keyboard);

      if (
        previousFocus instanceof HTMLElement &&
        previousFocus.isConnected
      ) {
        previousFocus.focus();
      }
    };
  }, [modalOpen]);

  const brands = useMemo(
    () =>
      [...new Set(products.map((product) => product.brand).filter(Boolean))]
        .sort((a, b) => String(a).localeCompare(String(b), "ko")),
    [products]
  );

  const filtered = useMemo(() => {
    const query = normalizeText(search);

    return products.filter((product) => {
      if (brand && product.brand !== brand) return false;
      if (category && product.category_key !== category) return false;
      if (!query) return true;

      const text = normalizeText(
        [
          product.brand,
          product.product_code,
          product.product_name,
          product.color_family,
          product.color_description,
          product.pattern_line,
          product.texture,
          product.wood_species,
          product.tone_family,
          categoryLabel(product.category_key),
        ].join(" ")
      );

      return text.includes(query);
    });
  }, [products, brand, category, search]);

  const totalPages = Math.max(
    1,
    Math.ceil(filtered.length / PAGE_SIZE)
  );

  const currentPage = Math.min(page, totalPages);

  const visibleProducts = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  const homeHref = slug
    ? `/?company=${encodeURIComponent(slug)}`
    : "/";

  function movePage(nextPage) {
    setPage(Math.max(1, Math.min(nextPage, totalPages)));
    listRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  function resetFilters() {
    setBrand("");
    setCategory("");
    setSearch("");
    setPage(1);
  }

  async function searchSimilar() {
    if (!selected) return;

    const previousRequest = requestRef.current;
    requestRef.current = null;
    previousRequest?.abort();

    const controller = new AbortController();
    requestRef.current = controller;

    setBusy(true);
    setResult(null);
    setNotice("");
    setProgress({ done: 0, total: 0 });

    const isCurrent = () =>
      requestRef.current === controller &&
      !controller.signal.aborted;

    try {
      const found = await findImageSimilarFilms(
        selected,
        products,
        getFilmSampleUrl,
        {
          signal: controller.signal,
          onProgress: (value) => {
            if (isCurrent()) setProgress(value);
          },
        }
      );

      if (!isCurrent()) return;

      setResult(found);

      if (found.total === 0) {
        setNotice(
          "같은 대분류에 비교할 수 있는 다른 브랜드의 샘플 이미지가 없습니다."
        );
      } else if (found.failed === found.total) {
        setNotice(
          "비교 대상 이미지를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."
        );
      } else if (found.matches.length === 0) {
        setNotice(
          "분석 가능한 샘플 중 비교 기준을 충족하는 제품을 찾지 못했습니다."
        );
      }
    } catch (searchError) {
      if (!isCurrent()) return;

      if (searchError?.name !== "AbortError") {
        setNotice(
          searchError?.message || "유사 샘플 검색에 실패했습니다."
        );
      }
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        controller.abort();
        setBusy(false);
      }
    }
  }

  function cancelSearch() {
    stopRequest();
    setNotice("검색을 취소했습니다. 다시 검색할 수 있습니다.");
  }

  return (
    <main className="samples-page">
      <div className="page-inner">
        <header className="page-header">
          <div>
            <p className="company-name">{company}</p>
            <h1>인테리어 필름 샘플</h1>
            <p className="muted">
              샘플을 눌러 크게 보고 다른 브랜드의 비슷한 필름도 찾아보세요.
            </p>
          </div>

          <Link href={homeHref} className="button">
            홈으로
          </Link>
        </header>

        <section className="filter-panel" aria-label="샘플 검색 조건">
          <div className="filter-row">
            <label>
              <span>브랜드</span>
              <select
                value={brand}
                onChange={(event) => {
                  setBrand(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">전체 브랜드</option>
                {brands.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>

            <label className="search-field">
              <span>제품 검색</span>
              <input
                type="search"
                value={search}
                placeholder="제품번호, 색상, 제품명 검색"
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
              />
            </label>

            <button
              type="button"
              className="button reset-button"
              onClick={resetFilters}
            >
              초기화
            </button>
          </div>

          <div className="category-list" aria-label="대분류">
            {[["", "전체"], ...CATEGORIES].map(([value, label]) => (
              <button
                key={value || "all"}
                type="button"
                className={`category-button ${
                  category === value ? "active" : ""
                }`}
                aria-pressed={category === value}
                onClick={() => {
                  setCategory(value);
                  setPage(1);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        <section ref={listRef} className="list-section">
          <div className="list-heading">
            <strong>
              {loading
                ? "샘플 불러오는 중"
                : `총 ${filtered.length.toLocaleString()}개`}
            </strong>
            {!loading && filtered.length > 0 && (
              <span className="muted">
                {currentPage} / {totalPages} 페이지
              </span>
            )}
          </div>

          {loading ? (
            <div className="empty-state" role="status">
              필름 샘플을 불러오고 있습니다.
            </div>
          ) : error ? (
            <div className="empty-state" role="alert">
              <p>샘플을 불러오지 못했습니다.</p>
              <p className="error-text">{error}</p>
              <button
                type="button"
                className="button"
                onClick={() => setReload((value) => value + 1)}
              >
                다시 불러오기
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">
              <p>조건에 맞는 샘플이 없습니다.</p>
              <button
                type="button"
                className="button"
                onClick={resetFilters}
              >
                전체 샘플 보기
              </button>
            </div>
          ) : (
            <>
              <div className="sample-grid">
                {visibleProducts.map((product) => (
                  <button
                    key={keyOf(product)}
                    type="button"
                    className="sample-card"
                    aria-label={`${product.brand || ""} ${
                      product.product_code || ""
                    } 샘플 크게 보기`}
                    onClick={() => openProduct(product)}
                  >
                    <FilmSampleImage product={product} />

                    <span className="card-brand">
                      {product.brand || "브랜드 미등록"}
                    </span>
                    <strong className="card-code">
                      {product.product_code || "제품번호 미등록"}
                    </strong>
                    {product.product_name && (
                      <span className="card-name">
                        {product.product_name}
                      </span>
                    )}
                    <span className="card-category">
                      {categoryLabel(product.category_key)}
                      {product.color_family
                        ? ` · ${product.color_family}`
                        : ""}
                    </span>
                  </button>
                ))}
              </div>

              {totalPages > 1 && (
                <nav className="pagination" aria-label="샘플 페이지">
                  <button
                    type="button"
                    className="button"
                    disabled={currentPage === 1}
                    onClick={() => movePage(currentPage - 1)}
                  >
                    이전
                  </button>

                  <span>
                    {currentPage} / {totalPages}
                  </span>

                  <button
                    type="button"
                    className="button"
                    disabled={currentPage === totalPages}
                    onClick={() => movePage(currentPage + 1)}
                  >
                    다음
                  </button>
                </nav>
              )}
            </>
          )}
        </section>

        <p className="sample-note">
          화면과 조명에 따라 실제 필름의 색상과 질감이 다르게 보일 수
          있습니다. 최종 선택 전 실물 샘플을 확인해 주세요.
        </p>
      </div>

      {selected && (
        <div
          className="modal-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeModal();
          }}
        >
          <section
            ref={dialogRef}
            className="sample-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sample-dialog-title"
            tabIndex={-1}
          >
            <header className="dialog-header">
              <div>
                <p className="company-name">{selected.brand}</p>
                <h2 id="sample-dialog-title">
                  {selected.product_code || "필름 샘플"}
                </h2>
              </div>

              <button
                ref={closeRef}
                type="button"
                className="button"
                onClick={closeModal}
                aria-label="샘플 상세 닫기"
              >
                닫기
              </button>
            </header>

            <div className="dialog-content">
              <FilmSampleImage product={selected} large />

              <div className="product-description">
                {selected.product_name && (
                  <h3>{selected.product_name}</h3>
                )}

                <div className="tag-list">
                  {[
                    categoryLabel(selected.category_key),
                    selected.pattern_line,
                    selected.color_family,
                    selected.wood_species,
                    selected.texture,
                    selected.grade,
                  ]
                    .filter(Boolean)
                    .filter((value, index, values) =>
                      values.indexOf(value) === index
                    )
                    .map((value) => (
                      <span key={value} className="tag">
                        {value}
                      </span>
                    ))}
                </div>

                {selected.color_description && (
                  <p className="muted">
                    {selected.color_description}
                  </p>
                )}
              </div>

              <section className="similar-section" aria-busy={busy}>
                <h3>다른 브랜드의 비슷한 필름</h3>
                <p className="muted">
                  같은 대분류의 샘플 이미지를 비교해 색상과 무늬가
                  가까운 제품을 최대 4개 보여드립니다.
                </p>

                <div className="search-actions">
                  <button
                    type="button"
                    className="button primary"
                    disabled={
                      busy ||
                      !getFilmSampleUrl(selected.sample_image_path) ||
                      !selected.category_key
                    }
                    onClick={searchSimilar}
                  >
                    {busy ? "샘플 비교 중…" : "비슷한 필름 찾기"}
                  </button>

                  {busy && (
                    <button
                      type="button"
                      className="button"
                      onClick={cancelSearch}
                    >
                      검색 취소
                    </button>
                  )}
                </div>

                {!getFilmSampleUrl(selected.sample_image_path) && (
                  <p className="muted">
                    샘플 이미지가 등록된 제품만 비교할 수 있습니다.
                  </p>
                )}

                {!selected.category_key && (
                  <p className="muted">
                    대분류가 등록된 제품만 비교할 수 있습니다.
                  </p>
                )}

                {busy && (
                  <div className="progress-box" role="status">
                    <p>
                      {progress.total > 0
                        ? `${progress.done} / ${progress.total}개 비교 중`
                        : "비교할 샘플을 준비하고 있습니다."}
                    </p>
                    {progress.total > 0 && (
                      <progress
                        value={progress.done}
                        max={progress.total}
                        aria-label="샘플 비교 진행률"
                      />
                    )}
                  </div>
                )}

                {notice && (
                  <p className="notice" role="status">
                    {notice}
                  </p>
                )}

                {result?.matches?.length > 0 && (
                  <div className="similar-grid">
                    {result.matches.map(({ product }) => (
                      <button
                        key={keyOf(product)}
                        type="button"
                        className="sample-card"
                        onClick={() => openProduct(product)}
                      >
                        <FilmSampleImage product={product} />
                        <span className="card-brand">
                          {product.brand}
                        </span>
                        <strong className="card-code">
                          {product.product_code}
                        </strong>
                        {product.product_name && (
                          <span className="card-name">
                            {product.product_name}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {result && result.failed > 0 && (
                  <p className="muted">
                    비교 대상 {result.total}개 중 이미지 분석에 실패한{" "}
                    {result.failed}개는 결과에서 제외했습니다.
                  </p>
                )}
              </section>

              <p className="sample-note">
                이미지 비교 결과는 참고용입니다. 실제 색상·질감과
                제품 사양은 실물 샘플로 확인해 주세요.
              </p>
            </div>
          </section>
        </div>
      )}

      <style jsx>{`
        .samples-page {
          min-height: 100vh;
          background: #f7f8fa;
          color: #172033;
          padding: 28px 16px 48px;
        }

        .page-inner {
          max-width: 1080px;
          margin: 0 auto;
        }

        .page-header,
        .dialog-header,
        .list-heading {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }

        .page-header {
          margin-bottom: 24px;
        }

        .company-name {
          margin: 0 0 6px;
          font-size: 13px;
          font-weight: 700;
          color: #64748b;
        }

        h1 {
          margin: 0;
          font-size: 28px;
          line-height: 1.3;
        }

        h2 {
          margin: 0;
          font-size: 24px;
        }

        h3 {
          margin: 0 0 10px;
          font-size: 17px;
        }

        .muted {
          color: #64748b;
          font-size: 13px;
          line-height: 1.7;
        }

        .button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          min-height: 42px;
          padding: 10px 16px;
          border: 1px solid #d8dee8;
          border-radius: 10px;
          background: #fff;
          color: #263449;
          font-size: 14px;
          font-weight: 600;
          text-decoration: none;
          white-space: nowrap;
          cursor: pointer;
        }

        .button:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }

        .primary {
          background: #172033;
          border-color: #172033;
          color: #fff;
        }

        .filter-panel {
          padding: 20px;
          background: #fff;
          border: 1px solid #e4e8ef;
          border-radius: 16px;
        }

        .filter-row {
          display: flex;
          align-items: flex-end;
          gap: 12px;
        }

        label {
          display: flex;
          flex-direction: column;
          gap: 8px;
          min-width: 150px;
          font-size: 13px;
          font-weight: 600;
        }

        .search-field {
          flex: 1;
        }

        input,
        select {
          box-sizing: border-box;
          width: 100%;
          min-height: 44px;
          padding: 10px 12px;
          border: 1px solid #d8dee8;
          border-radius: 10px;
          background: #fff;
          color: #172033;
          font-size: 16px;
        }

        .category-list,
        .tag-list,
        .search-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .category-list {
          margin-top: 16px;
        }

        .category-button {
          padding: 9px 14px;
          border: 1px solid #e0e5ed;
          border-radius: 999px;
          background: #fff;
          color: #526077;
          font-size: 13px;
          cursor: pointer;
        }

        .category-button.active {
          background: #172033;
          border-color: #172033;
          color: #fff;
        }

        .list-section {
          scroll-margin-top: 20px;
        }

        .list-heading {
          margin: 24px 0 14px;
          font-size: 14px;
        }

        .sample-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 14px;
        }

        .sample-card {
          display: flex;
          flex-direction: column;
          align-items: stretch;
          min-width: 0;
          padding: 12px;
          border: 1px solid #e1e6ed;
          border-radius: 14px;
          background: #fff;
          color: #172033;
          text-align: left;
          cursor: pointer;
        }

        .sample-card:hover {
          border-color: #8c9bb2;
        }

        .card-brand {
          margin-top: 12px;
          color: #64748b;
          font-size: 12px;
        }

        .card-code {
          margin-top: 4px;
          font-size: 16px;
          overflow-wrap: anywhere;
        }

        .card-name {
          margin-top: 4px;
          color: #475569;
          font-size: 12px;
          line-height: 1.5;
          overflow-wrap: anywhere;
        }

        .card-category {
          margin-top: 8px;
          color: #7b8798;
          font-size: 11px;
        }

        .empty-state {
          padding: 52px 20px;
          border: 1px dashed #d8dee8;
          border-radius: 14px;
          background: #fff;
          text-align: center;
          color: #64748b;
        }

        .error-text {
          color: #b42318;
          overflow-wrap: anywhere;
        }

        .pagination {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 20px;
          margin-top: 26px;
          font-size: 14px;
        }

        .sample-note {
          margin: 24px 0 0;
          color: #7b8798;
          font-size: 12px;
          line-height: 1.8;
        }

        .modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          background: rgba(15, 23, 42, 0.65);
        }

        .sample-dialog {
          width: 100%;
          max-width: 580px;
          max-height: 92dvh;
          overflow-y: auto;
          overscroll-behavior: contain;
          border-radius: 20px;
          background: #fff;
          box-shadow: 0 24px 80px rgba(0, 0, 0, 0.25);
        }

        .dialog-header {
          position: sticky;
          top: 0;
          z-index: 2;
          padding: 18px 22px;
          border-bottom: 1px solid #e8ecf1;
          background: #fff;
        }

        .dialog-content {
          padding: 22px;
        }

        .product-description {
          margin-top: 20px;
        }

        .tag {
          padding: 5px 9px;
          border-radius: 6px;
          background: #f0f3f7;
          color: #526077;
          font-size: 12px;
        }

        .similar-section {
          margin-top: 24px;
          padding-top: 22px;
          border-top: 1px solid #e8ecf1;
        }

        .search-actions {
          margin-top: 14px;
        }

        .progress-box {
          margin-top: 14px;
          color: #526077;
          font-size: 13px;
        }

        progress {
          width: 100%;
          height: 10px;
          accent-color: #172033;
        }

        .notice {
          padding: 12px;
          border-radius: 10px;
          background: #f1f5f9;
          color: #475569;
          font-size: 13px;
          line-height: 1.7;
        }

        .similar-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
          margin-top: 18px;
        }

        button:focus-visible,
        input:focus-visible,
        select:focus-visible {
          outline: 3px solid #60a5fa;
          outline-offset: 3px;
        }

        @media (max-width: 640px) {
          .samples-page {
            padding: 20px 12px 36px;
          }

          .page-header {
            align-items: flex-start;
            gap: 10px;
          }

          h1 {
            font-size: 22px;
          }

          .page-header .muted {
            font-size: 12px;
          }

          .filter-panel {
            padding: 14px;
          }

          .filter-row {
            flex-wrap: wrap;
          }

          .filter-row label {
            width: 100%;
            min-width: 0;
          }

          .search-field {
            flex-basis: 100%;
          }

          .reset-button {
            width: 100%;
          }

          .sample-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 10px;
          }

          .sample-card {
            padding: 10px;
          }

          .modal-backdrop {
            padding: 10px;
          }

          .sample-dialog {
            max-height: 94dvh;
            border-radius: 16px;
          }

          .dialog-header {
            padding: 14px 16px;
          }

          .dialog-content {
            padding: 16px;
          }
        }
      `}</style>
    </main>
  );
                  }
