"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import FilmSampleImage from "./components/FilmSampleImage";
import FilmColorPickerContent from "./FilmColorPickerContent";
import { findSimilarFilms } from "../lib/similarFilms.mjs";

let catalogPromise = null;

function loadCatalog() {
  if (!catalogPromise) {
    catalogPromise = (async () => {
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
        "fire_price_per_meter",
        "non_fire_price_per_meter",
        "material_price_per_meter",
        "price_multiplier",
        "additional_cost",
        "sort_order",
      ].join(",");

      const products = [];

      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
          .from("film_products")
          .select(columns)
          .eq("is_active", true)
          .order("id")
          .range(from, from + 999);

        if (error) throw error;

        products.push(...(data || []));

        if (!data || data.length < 1000) {
          return products;
        }
      }
    })().catch((error) => {
      catalogPromise = null;
      throw error;
    });
  }

  return catalogPromise;
}

export default function FilmColorPicker(props) {
  const [products, setProducts] = useState([]);
  const [selected, setSelected] = useState(props.value || null);
  const [catalogStatus, setCatalogStatus] = useState("loading");
  const [retry, setRetry] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(null);

  const frameRef = useRef(null);
  const hasSelection = Boolean(selected);

  useEffect(() => {
    setSelected(props.value || null);
  }, [props.value]);

  useEffect(() => {
    if (!hasSelection) return;

    let active = true;
    setCatalogStatus("loading");

    loadCatalog()
      .then((rows) => {
        if (!active) return;

        setProducts(rows);
        setCatalogStatus("ready");
      })
      .catch(() => {
        if (active) setCatalogStatus("error");
      });

    return () => {
      active = false;
    };
  }, [hasSelection, retry]);

  useEffect(() => {
    const update = () => {
      setViewportHeight(
        window.visualViewport?.height || window.innerHeight
      );
    };

    update();

    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);

    return () => {
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);

      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  const recommendations = findSimilarFilms(selected, products);

  function selectProduct(product) {
    setSelected(product);
    props.onSelect?.(product);
  }

  function handleSelection(event) {
    const button = event.target.closest("button");
    const dialog = button?.closest('[role="dialog"]');

    if (!dialog || button.style.borderRadius !== "999px") {
      return;
    }

    const row = button.parentElement;
    const section = row?.parentElement;
    const scroller = dialog.lastElementChild;

    if (!row || !section || !scroller) return;

    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
    }

    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;

        if (!button.isConnected || !dialog.isConnected) return;

        const behavior = window.matchMedia(
          "(prefers-reduced-motion: reduce)"
        ).matches
          ? "auto"
          : "smooth";

        if (row.scrollWidth > row.clientWidth) {
          const rowBox = row.getBoundingClientRect();
          const buttonBox = button.getBoundingClientRect();

          row.scrollTo({
            left:
              row.scrollLeft +
              buttonBox.left -
              rowBox.left -
              (row.clientWidth - buttonBox.width) / 2,
            behavior,
          });
        }

        const next = section.nextElementSibling;
        if (!next) return;

        const scrollerBox = scroller.getBoundingClientRect();
        const nextBox = next.getBoundingClientRect();

        scroller.scrollTo({
          top: Math.max(
            0,
            scroller.scrollTop +
              nextBox.top -
              scrollerBox.top -
              12
          ),
          behavior,
        });
      });
    });
  }

  return (
    <div
      className="film-scroll-fix"
      onClickCapture={handleSelection}
      style={
        viewportHeight
          ? { "--film-visible-height": `${viewportHeight}px` }
          : undefined
      }
    >
      <FilmColorPickerContent
        {...props}
        value={selected}
        onSelect={selectProduct}
      />

      {selected && (
        <section
          className="similar-films"
          aria-label="다른 브랜드 유사 필름"
        >
          <h3>다른 브랜드 유사 필름</h3>
          <p>색상·패턴 정보를 기준으로 골랐어요.</p>

          {catalogStatus === "loading" ? (
            <p role="status">유사 필름을 찾고 있어요…</p>
          ) : catalogStatus === "error" ? (
            <p>
              추천을 불러오지 못했어요.{" "}
              <button
                type="button"
                className="retry-button"
                onClick={() => setRetry((value) => value + 1)}
              >
                다시 시도
              </button>
            </p>
          ) : recommendations.length ? (
            <div className="similar-grid">
              {recommendations.map(({ product, reasons }) => (
                <button
                  type="button"
                  key={`${product.brand}:${product.product_code}`}
                  onClick={() => selectProduct(product)}
                  aria-label={`${product.brand} ${product.product_code} 선택`}
                >
                  <FilmSampleImage
                    product={product}
                    size="100%"
                  />

                  <span className="similar-brand">
                    {product.brand}
                  </span>

                  <strong>{product.product_code}</strong>

                  <span className="similar-reason">
                    {reasons.join(" · ")}
                  </span>

                  <span className="similar-action">
                    이 필름 선택 →
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p>
              현재 등록된 다른 브랜드에서 유사 제품을
              찾지 못했어요.
            </p>
          )}

          <small>
            실제 색상과 질감은 실물 샘플로 확인해 주세요.
          </small>
        </section>
      )}

      <style jsx>{`
        .similar-films {
          margin: 16px 0;
          padding: 18px;
          border: 1px solid #e5eaf0;
          border-radius: 20px;
          background: #f8fbff;
          color: #183451;
        }

        h3 {
          margin: 0 0 6px;
          font-size: 17px;
        }

        p,
        small {
          color: #6b7785;
          font-size: 12px;
          line-height: 1.6;
        }

        p {
          margin: 0 0 14px;
        }

        small {
          display: block;
          margin-top: 12px;
        }

        .similar-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }

        .similar-grid button {
          min-width: 0;
          padding: 10px;
          border: 1px solid #dde5ef;
          border-radius: 14px;
          background: white;
          text-align: left;
          cursor: pointer;
          font: inherit;
          color: inherit;
        }

        .similar-grid button:focus-visible,
        .retry-button:focus-visible {
          outline: 3px solid #398be0;
          outline-offset: 2px;
        }

        .similar-grid span,
        .similar-grid strong {
          display: block;
          overflow-wrap: anywhere;
        }

        .similar-brand {
          margin-top: 8px;
          font-size: 11px;
          color: #6b7785;
        }

        strong {
          margin: 3px 0;
          font-size: 16px;
        }

        .similar-reason {
          font-size: 11px;
          color: #6b7785;
          line-height: 1.5;
        }

        .similar-action {
          margin-top: 9px;
          font-size: 12px;
          font-weight: 700;
          color: #287bd0;
        }

        .retry-button {
          padding: 6px 10px;
          border: 1px solid #cbdcf0;
          border-radius: 8px;
          background: white;
          color: #287bd0;
          cursor: pointer;
        }
      `}</style>

      <style jsx global>{`
        .film-scroll-fix [role="dialog"] {
          box-sizing: border-box;
          max-height: min(
            88dvh,
            calc(var(--film-visible-height, 100dvh) - 12px)
          ) !important;
        }

        .film-scroll-fix [role="dialog"] > div:not(:last-child) {
          flex-shrink: 0;
        }

        .film-scroll-fix [role="dialog"] > div:last-child {
          min-height: 0;
          overflow-y: auto !important;
          overscroll-behavior-y: contain;
          padding-bottom: calc(
            32px + env(safe-area-inset-bottom, 0px)
          ) !important;
          scroll-padding-top: 12px;
        }

        .film-scroll-fix [role="dialog"] input {
          box-sizing: border-box;
          max-width: 100%;
          font-size: 16px !important;
        }

        .film-scroll-fix [role="dialog"] button {
          touch-action: manipulation;
        }
      `}</style>
    </div>
  );
}
