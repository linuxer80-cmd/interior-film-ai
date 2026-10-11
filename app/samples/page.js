"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import FilmColorPicker from "../FilmColorPicker";
import FilmSampleImage, {
  getFilmSampleUrl,
} from "../components/FilmSampleImage";
import { findImageSimilarFilms } from "../../lib/filmImageSimilarity.mjs";

export default function SamplesPage() {
  const [products, setProducts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({
    done: 0,
    total: 0,
  });
  const [home, setHome] = useState("/");

  const request = useRef(null);
  const dialog = useRef(null);
  const close = useRef(null);
  const opened = Boolean(preview);

  useEffect(() => {
    const slug = new URLSearchParams(
      window.location.search
    ).get("company");

    if (slug) {
      setHome(`/?company=${encodeURIComponent(slug)}`);
    }

    return () => {
      request.current?.abort();
      request.current = null;
    };
  }, []);

  function cancel() {
    request.current?.abort();
    request.current = null;
    setBusy(false);
  }

  function show(product) {
    cancel();
    setPreview(product);
    setResult(null);
    setNotice("");
    setProgress({ done: 0, total: 0 });

    if (dialog.current) {
      dialog.current.scrollTop = 0;
    }

    close.current?.focus();
  }

  function dismiss() {
    cancel();
    setPreview(null);
  }

  useEffect(() => {
    if (!opened) return;

    const overflow = document.body.style.overflow;
    const focus = document.activeElement;

    document.body.style.overflow = "hidden";
    close.current?.focus();

    function keydown(event) {
      if (event.key === "Escape") {
        event.preventDefault();

        request.current?.abort();
        request.current = null;

        setBusy(false);
        setPreview(null);
      }

      if (event.key !== "Tab") return;

      const nodes = dialog.current?.querySelectorAll(
        'button:not([disabled]), a[href]'
      );

      if (!nodes?.length) return;

      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const outside = !dialog.current.contains(
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

    document.addEventListener("keydown", keydown);

    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", keydown);

      if (
        focus instanceof HTMLElement &&
        focus.isConnected
      ) {
        focus.focus();
      }
    };
  }, [opened]);

  async function search() {
    cancel();

    const controller = new AbortController();
    request.current = controller;

    setBusy(true);
    setResult(null);
    setNotice("");
    setProgress({ done: 0, total: 0 });

    const current = () =>
      request.current === controller &&
      !controller.signal.aborted;

    try {
      const source =
        products.find(
          (product) => product.id === preview.id
        ) || preview;

      const found = await findImageSimilarFilms(
        source,
        products,
        getFilmSampleUrl,
        {
          signal: controller.signal,
          onProgress: (value) => {
            if (current()) {
              setProgress(value);
            }
          },
        }
      );

      if (!current()) return;

      setResult(found);

      if (!found.matches.length) {
        setNotice(
          found.total
            ? "분석된 제품 중 색상·무늬 기준을 충족하는 샘플을 찾지 못했습니다."
            : "비교할 다른 브랜드의 분석된 샘플이 없습니다."
        );
      }
    } catch (error) {
      if (
        current() &&
        error.name !== "AbortError"
      ) {
        setNotice(
          error.message || "검색에 실패했습니다."
        );
      }
    } finally {
      if (request.current === controller) {
        request.current = null;
        controller.abort();
        setBusy(false);
      }
    }
  }

  return (
    <main
      style={{
        maxWidth: 760,
        margin: "0 auto",
        padding: "20px 16px",
        color: "#111827",
      }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h1 style={{ fontSize: 23 }}>
          필름 샘플 보기
        </h1>
        <Link href={home}>홈으로</Link>
      </header>

      <FilmColorPicker
        sampleMode
        value={selected}
        onProductsLoaded={setProducts}
        onSelect={(product) => {
          setSelected(product);

          if (product) {
            show(product);
          }
        }}
        onGenerate={show}
      />

      <p
        style={{
          color: "#6b7280",
          fontSize: 13,
          lineHeight: 1.8,
        }}
      >
        제조사 → 패턴 대분류 → 패턴 → 수종·톤·컬러
        순서로 선택하세요. 샘플을 선택하면 크게 볼 수
        있습니다.
      </p>

      {preview && (
        <div
          className="overlay"
          onClick={(event) => {
            if (
              event.target === event.currentTarget
            ) {
              dismiss();
            }
          }}
        >
          <section
            ref={dialog}
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="preview-title"
          >
            <header className="dialog-head">
              <div>
                <small>{preview.brand}</small>
                <h2 id="preview-title">
                  {preview.product_code}
                </h2>
              </div>

              <button
                ref={close}
                onClick={dismiss}
              >
                닫기
              </button>
            </header>

            <div className="body">
              <FilmSampleImage
                product={preview}
                large
              />

              <h3>{preview.product_name}</h3>

              <p className="muted">
                {[
                  preview.pattern_line,
                  preview.wood_species,
                  preview.tone_family,
                  preview.color_family,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>

              <hr />

              <h3>
                다른 브랜드의 비슷한 필름
              </h3>

              <p className="muted">
                같은 대분류의 다른 브랜드 샘플 중
                분석이 완료된 전체 제품의 색상과 무늬를
                비교합니다. 브랜드별 최대 1개씩
                보여드립니다.
              </p>

              <button
                disabled={busy || !products.length}
                onClick={search}
              >
                {busy
                  ? "비교 중…"
                  : "비슷한 필름 찾기"}
              </button>

              {busy && (
                <button
                  onClick={() => {
                    cancel();
                    setNotice(
                      "검색을 취소했습니다."
                    );
                  }}
                >
                  검색 취소
                </button>
              )}

              {busy && (
                <p role="status">
                  {progress.total
                    ? `${progress.done} / ${progress.total}개 비교 중`
                    : "저장된 샘플 특징 불러오는 중…"}
                </p>
              )}

              {notice && (
                <p
                  role="status"
                  className="muted"
                >
                  {notice}
                </p>
              )}

              {result && (
                <p className="muted">
                  같은 대분류의 다른 브랜드{" "}
                  {result.eligibleTotal}개 중{" "}
                  {result.total}개 분석 정보 비교 ·
                  분석 준비 중 {result.missing}개
                </p>
              )}

              <div className="matches">
                {result?.matches.map(
                  ({ product }) => (
                    <button
                      key={
                        product.id ||
                        `${product.brand}:${product.product_code}`
                      }
                      onClick={() => show(product)}
                    >
                      <FilmSampleImage
                        product={product}
                      />
                      <small>
                        {product.brand}
                      </small>
                      <strong>
                        {product.product_code}
                      </strong>
                    </button>
                  )
                )}
              </div>

              <p className="muted">
                실제 색상과 질감은 실물 샘플로
                확인해 주세요.
              </p>
            </div>
          </section>
        </div>
      )}

      <style jsx>{`
        .overlay {
          position: fixed;
          inset: 0;
          z-index: 11000;
          background: #11182788;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 12px;
        }

        .dialog {
          width: 100%;
          max-width: 560px;
          max-height: 92dvh;
          overflow: auto;
          overscroll-behavior: contain;
          background: white;
          border-radius: 20px;
        }

        .dialog-head {
          position: sticky;
          top: 0;
          z-index: 2;
          background: white;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          border-bottom: 1px solid #eee;
        }

        h2 {
          margin: 5px 0 0;
          font-size: 24px;
        }

        small {
          color: #6b7280;
        }

        .body {
          padding: 20px;
        }

        button {
          border: 1px solid #d1d5db;
          border-radius: 12px;
          background: white;
          color: #111827;
          padding: 12px 16px;
          cursor: pointer;
          margin: 4px 6px 4px 0;
          font-weight: 700;
        }

        button:disabled {
          opacity: 0.5;
          cursor: default;
        }

        button:focus-visible {
          outline: 3px solid #60a5fa;
        }

        .muted {
          font-size: 13px;
          color: #6b7280;
          line-height: 1.8;
        }

        hr {
          border: 0;
          border-top: 1px solid #eee;
          margin: 24px 0;
        }

        .matches {
          display: grid;
          grid-template-columns:
            repeat(2, minmax(0, 1fr));
          gap: 10px;
        }

        .matches button {
          margin: 0;
          padding: 8px;
          min-width: 0;
          text-align: left;
        }

        .matches small,
        .matches strong {
          display: block;
          margin-top: 7px;
          overflow-wrap: anywhere;
        }
      `}</style>
    </main>
  );
}
