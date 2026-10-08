"use client";

import { useEffect, useState } from "react";
import { sampleUrls } from "../../utils/filmSample.mjs";

const cache = new Map();

async function lookup(key) {
  const existing = cache.get(key);

  if (
    existing &&
    Date.now() - existing.at < 300000
  ) {
    return existing.promise;
  }

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    15000
  );

  const promise = fetch(
    `/api/film-samples?${key}`,
    { signal: controller.signal }
  )
    .then(async (response) => {
      const result = await response.json();

      if (!response.ok) {
        throw Error(result.error || "이미지 조회 실패");
      }

      return result.path || "";
    })
    .catch((error) => {
      cache.delete(key);
      throw error;
    })
    .finally(() => clearTimeout(timer));

  if (cache.size >= 200) {
    cache.delete(cache.keys().next().value);
  }

  cache.set(key, {
    at: Date.now(),
    promise,
  });

  return promise;
}

export function filmLabel(material) {
  return (
    [
      material.brand,
      material.product_code ||
        material.code ||
        material.product_name ||
        material.name,
    ]
      .filter(Boolean)
      .join(" / ")
      .trim()
      .toUpperCase() || "필름"
  );
}

export default function FilmThumbnail({
  material,
  size = 42,
}) {
  const id = material?.film_product_id || "";
  const brand = material?.brand || "";
  const code =
    material?.product_code || material?.code || "";
  const path = material?.sample_image_path || "";

  const key = new URLSearchParams({
    ...(id ? { id } : {}),
    brand,
    code,
  }).toString();

  const [resolved, setResolved] = useState(null);
  const [failed, setFailed] = useState([]);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const base =
    process.env.NEXT_PUBLIC_SUPABASE_URL || "";

  const original = sampleUrls(path, base);

  const hasOriginal = original.some(
    (url) => !failed.includes(url)
  );

  const canLookup = Boolean(
    id || (brand && code)
  );

  const needsLookup = !hasOriginal && canLookup;

  useEffect(() => {
    if (!needsLookup) return;

    let active = true;
    setError(false);

    lookup(key)
      .then((value) => {
        if (active) {
          setResolved({ key, value });
        }
      })
      .catch(() => {
        if (active) setError(true);
      });

    return () => {
      active = false;
    };
  }, [key, needsLookup, attempt]);

  const paths = [
    ...new Set([
      ...original,
      ...sampleUrls(
        resolved?.key === key
          ? resolved.value
          : "",
        base
      ),
    ]),
  ];

  const url = paths.find(
    (value) => !failed.includes(value)
  );

  const loading =
    needsLookup &&
    resolved?.key !== key &&
    !error;

  const style = {
    width: size,
    height: size,
    borderRadius: 8,
    border: "1px solid #cbd5e1",
    flexShrink: 0,
  };

  if (url) {
    return (
      <img
        src={url}
        alt={`${filmLabel(material)} 샘플`}
        loading="lazy"
        width={size}
        height={size}
        style={{
          ...style,
          objectFit: "cover",
        }}
        onError={() =>
          setFailed((previous) => [
            ...new Set([...previous, url]),
          ])
        }
      />
    );
  }

  return (
    <span
      role="img"
      aria-label={`${filmLabel(material)} ${
        loading ? "사진 확인 중" : "사진 없음"
      }`}
      title={
        loading
          ? "제품 사진을 확인하고 있습니다"
          : "등록된 사진이 없거나 불러오지 못했습니다"
      }
      onClick={(event) => {
        if (loading) return;

        event.preventDefault();
        event.stopPropagation();

        cache.delete(key);
        setFailed([]);
        setResolved(null);
        setError(false);
        setAttempt((n) => n + 1);
      }}
      style={{
        ...style,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f1f5f9",
        color: "#64748b",
        fontSize: 10,
        textAlign: "center",
        cursor: "pointer",
      }}
    >
      {loading ? (
        "사진 확인 중"
      ) : (
        <>
          사진 미등록
          <br />
          또는 연결 오류
        </>
      )}
    </span>
  );
}
