"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import FilmSampleImage, {
  getFilmSampleUrl,
} from "../components/FilmSampleImage";
import { supabase } from "../../lib/supabase";
import { findImageSimilarFilms } from "../../lib/filmImageSimilarity.mjs";

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
    product.id ||
      `${product.brand}:${product.product_code}`
  );

const categoryLabel = (key) =>
  CATEGORIES.find(([value]) => value === key)?.[1] || key;

function normalizeProduct(product) {
  let category = String(product.category_key || "").trim();

  if (!category && /현대|bodaq/i.test(product.brand || "")) {
    const code = String(product.product_code || "").toUpperCase();

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

    const companySlug =
      new URLSearchParams(window.location.search).get("company") ||
      "";

    setSlug(companySlug);

    if (companySlug) {
      fetch(
        `/api/public-company?slug=${encodeURIComponent(companySlug)}`
      )
        .then((response) => response.json())
        .then((data) => {
          if (active && data.success && data.company) {
            setCompany(
              data.company.company_name ||
                data.company.name ||
                "기분좋은공간"
            );
          }
        })
        .catch(() => {});
    }

    async function load() {
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

          rows.push(...(data || []));

          if (!data || data.length < 1000) break;
        }

        if (active) {
          setProducts(rows.map(normalizeProduct));
        }
      } catch (loadError) {
        if (active) {
          setError(loadError.message || "샘플 조회 실패");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    load();

    return () => {
      active = false;
      requestRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!modalOpen) return;

    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement;

    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    function keyboard(event) {
      if (event.key === "Escape") {
        requestRef.current?.abort();
        setSelected(null);
      }

      if (event.key !== "Tab") return;

      const nodes = dialogRef.current?.querySelectorAll(
        'button:not([disabled]), a[href], [tabindex="0"]'
      );

      if (!nodes?.length) return;

      const first = nodes[0];
      const last = nodes[nodes.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        document.activeElement === last
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
