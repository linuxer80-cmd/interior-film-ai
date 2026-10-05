export const PROFILE_VERSION = 3;

const normalize = (value) =>
  String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]/g, "");

export function brandKey(value) {
  const name = normalize(value);

  const brands = [
    ["3m", ["3m", "dinoc"]],
    ["lx", ["lx", "lg하우시스", "베니프"]],
    ["kcc", ["kcc", "비센티"]],
    ["samsung", ["삼성", "samsung"]],
    ["hansol", ["한솔", "hansol"]],
    ["hyundai", ["현대", "bodaq", "보닥"]],
    ["younglim", ["영림", "younglim"]],
    ["yerim", ["예림", "yerim"]],
  ];

  for (const [key, aliases] of brands) {
    if (aliases.some((alias) => name.includes(alias))) {
      return key;
    }
  }

  return name;
}

const distance = (a, b) =>
  Math.hypot(...a.map((value, index) => value - b[index]));

function abort(signal) {
  if (signal?.aborted) {
    throw new DOMException("취소됨", "AbortError");
  }
}

function lab(r, g, b) {
  const [R, G, B] = [r, g, b].map((value) => {
    const s = value / 255;

    return s <= 0.04045
      ? s / 12.92
      : ((s + 0.055) / 1.055) ** 2.4;
  });

  const f = (value) =>
    value > 0.008856
      ? Math.cbrt(value)
      : 7.787 * value + 16 / 116;

  const x = f(
    (R * 0.4124564 + G * 0.3575761 + B * 0.1804375) /
      0.95047
  );

  const y = f(
    R * 0.2126729 + G * 0.7151522 + B * 0.072175
  );

  const z = f(
    (R * 0.0193339 + G * 0.119192 + B * 0.9503041) /
      1.08883
  );

  return [
    116 * y - 16,
    500 * (x - y),
    200 * (y - z),
  ];
}

export function describePixels(data, size = 64) {
  if (size < 16 || data.length !== size * size * 4) {
    throw new Error("잘못된 이미지 크기");
  }

  const channels = [[], [], []];
  const lights = [];

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 250) {
      throw new Error("투명 이미지");
    }

    const color = lab(data[i], data[i + 1], data[i + 2]);

    color.forEach((value, channel) => {
      channels[channel].push(value);
    });

    lights.push(color[0]);
  }

  const quantiles = channels.map((values) => {
    values.sort((a, b) => a - b);

    return [0.1, 0.25, 0.5, 0.75, 0.9].map(
      (q) => values[Math.floor((values.length - 1) * q)]
    );
  });

  // 여러 간격의 명도 변화로 가는 결과 굵은 결을 구분합니다.
  const grain = [1, 4, 8].map((step) => {
    let x = 0;
    let y = 0;
    let count = 0;

    for (let row = 0; row < size - step; row++) {
      for (let col = 0; col < size - step; col++) {
        const index = row * size + col;

        x += Math.abs(lights[index] - lights[index + step]);
        y += Math.abs(
          lights[index] - lights[index + step * size]
        );

        count++;
      }
    }

    return [x / count, y / count];
  });

  const round = (value) =>
    Math.round(value * 1000) / 1000;

  return {
    median: quantiles.map((values) => round(values[2])),
    quantiles: quantiles.map((values) => values.map(round)),
    contrast: round(quantiles[0][4] - quantiles[0][0]),
    grain: grain.map((values) => values.map(round)),
  };
}

export function validProfile(profile) {
  const vector = (value, length) =>
    Array.isArray(value) &&
    value.length === length &&
    value.every(Number.isFinite);

  return Boolean(
    profile &&
      vector(profile.median, 3) &&
      Array.isArray(profile.quantiles) &&
      profile.quantiles.length === 3 &&
      profile.quantiles.every((value) => vector(value, 5)) &&
      Number.isFinite(profile.contrast) &&
      Array.isArray(profile.grain) &&
      profile.grain.length === 3 &&
      profile.grain.every((value) => vector(value, 2))
  );
}

export function compareProfiles(a, b) {
  if (!validProfile(a) || !validProfile(b)) {
    return null;
  }

  const color = distance(a.median, b.median);
  const light = Math.abs(a.median[0] - b.median[0]);

  let distribution = 0;

  for (let q = 0; q < 5; q++) {
    distribution += distance(
      a.quantiles.map((channel) => channel[q]),
      b.quantiles.map((channel) => channel[q])
    );
  }

  distribution /= 5;

  const contrast = Math.abs(a.contrast - b.contrast);

  // 샘플의 90도 회전은 허용하고 결의 강도와 간격을 비교합니다.
  const texture = (rotated) =>
    a.grain.reduce(
      (sum, pair, index) =>
        sum +
        pair.reduce(
          (subtotal, value, axis) =>
            subtotal +
            Math.abs(
              Math.log(
                (value + 0.6) /
                  (b.grain[index][rotated ? 1 - axis : axis] +
                    0.6)
              )
            ),
          0
        ),
      0
    ) / 6;

  const grain = Math.min(texture(false), texture(true));

  if (
    color > 8 ||
    light > 6 ||
    distribution > 9 ||
    contrast > 10 ||
    grain > 0.65
  ) {
    return null;
  }

  // 낮을수록 비슷합니다. 유사도 퍼센트는 아닙니다.
  return (
    color * 2 +
    distribution +
    contrast * 0.7 +
    grain * 12
  );
}

export function imageProfile(url, signal) {
  abort(signal);

  return new Promise((resolve, reject) => {
    const picture = new Image();
    picture.crossOrigin = "anonymous";

    let timer;
    let settled = false;

    const finish = (error, profile) => {
      if (settled) return;
      settled = true;

      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);

      picture.onload = null;
      picture.onerror = null;
      picture.src = "";

      if (error) {
        reject(error);
      } else {
        resolve(profile);
      }
    };

    const cancel = () =>
      finish(new DOMException("취소됨", "AbortError"));

    signal?.addEventListener("abort", cancel, {
      once: true,
    });

    timer = setTimeout(
      () => finish(new Error("이미지 응답 시간 초과")),
      15000
    );

    picture.onerror = () =>
      finish(
        new Error(
          "이미지를 읽지 못했습니다. 주소 또는 CORS 설정을 확인하세요."
        )
      );

    picture.onload = () => {
      try {
        const width = picture.naturalWidth;
        const height = picture.naturalHeight;

        if (Math.min(width, height) < 32) {
          throw new Error("샘플 이미지가 너무 작습니다.");
        }

        const canvas = document.createElement("canvas");
        canvas.width = 64;
        canvas.height = 64;

        const context = canvas.getContext("2d", {
          willReadFrequently: true,
        });

        if (!context) {
          throw new Error(
            "이미지 분석을 지원하지 않는 브라우저입니다."
          );
        }

        context.drawImage(
          picture,
          width * 0.1,
          height * 0.1,
          width * 0.8,
          height * 0.8,
          0,
          0,
          64,
          64
        );

        finish(
          null,
          describePixels(
            context.getImageData(0, 0, 64, 64).data
          )
        );
      } catch (error) {
        finish(error);
      }
    };

    picture.src = url;
  });
}

export async function readProfiles(db, signal) {
  const rows = [];

  for (let from = 0; ; from += 500) {
    abort(signal);

    let query = db
      .from("film_image_profiles")
      .select(
        "product_id,sample_image_path,source_updated_at,version,profile,film_products!inner(updated_at,is_active,sample_image_path,category_key)"
      )
      .eq("version", PROFILE_VERSION)
      .order("product_id")
      .range(from, from + 499);

    if (signal) {
      query = query.abortSignal(signal);
    }

    const { data, error } = await query;

    abort(signal);

    if (error) {
      throw new Error(
        "샘플 분석 정보를 불러오지 못했습니다. 잠시 후 다시 시도하세요."
      );
    }

    for (const row of data || []) {
      const product = row.film_products;

      if (
        product?.is_active &&
        product.sample_image_path === row.sample_image_path &&
        product.updated_at === row.source_updated_at &&
        validProfile(row.profile)
      ) {
        rows.push(row);
      }
    }

    if (!data || data.length < 500) {
      return rows;
    }
  }
}

export function rankIndexedFilms(selected, products, rows) {
  const byId = new Map(
    rows
      .filter(
        (row) =>
          row.version === PROFILE_VERSION &&
          validProfile(row.profile)
      )
      .map((row) => [row.product_id, row])
  );

  const current = (product) => {
    const row = byId.get(product.id);

    return row?.sample_image_path === product.sample_image_path
      ? row.profile
      : null;
  };

  const source = current(selected);

  if (!source) {
    throw new Error(
      "이 샘플은 이미지 분석 준비 중입니다. 슈퍼관리자에서 샘플 분석을 실행해 주세요."
    );
  }

  const categoryOf = (product) =>
    normalize(
      byId.get(product.id)?.film_products?.category_key ||
        product.category_key
    );

  const category = categoryOf(selected);

  if (!category) {
    throw new Error("제품의 대분류를 먼저 등록해 주세요.");
  }

  const seen = new Set();
  const matches = [];

  let eligibleTotal = 0;
  let total = 0;

  for (const product of products) {
    const brand = brandKey(product.brand);
    const key = `${brand}:${normalize(product.product_code)}`;

    if (
      !brand ||
      brand === brandKey(selected.brand) ||
      product.id === selected.id ||
      categoryOf(product) !== category ||
      product.is_active === false ||
      !product.sample_image_path ||
      product.sample_image_path === selected.sample_image_path ||
      seen.has(key)
    ) {
      continue;
    }

    seen.add(key);
    eligibleTotal++;

    const profile = current(product);

    if (!profile) continue;

    total++;

    const score = compareProfiles(source, profile);

    if (score !== null) {
      matches.push({ product, score });
    }
  }

  matches.sort(
    (a, b) =>
      a.score - b.score ||
      String(a.product.product_code).localeCompare(
        String(b.product.product_code)
      )
  );

  const brands = new Set();
  const paths = new Set();
  const distinct = [];

  for (const match of matches) {
    const brand = brandKey(match.product.brand);
    const path = match.product.sample_image_path;

    if (brands.has(brand) || paths.has(path)) {
      continue;
    }

    brands.add(brand);
    paths.add(path);
    distinct.push(match);

    if (distinct.length === 4) break;
  }

  return {
    matches: distinct,
    total,
    eligibleTotal,
    missing: eligibleTotal - total,
    failed: 0,
    limited: total < eligibleTotal,
  };
}

export async function findImageSimilarFilms(
  selected,
  products,
  getUrl,
  { signal, onProgress } = {}
) {
  abort(signal);

  const { supabase } = await import("./supabase");
  const profiles = await readProfiles(supabase, signal);

  abort(signal);

  const result = rankIndexedFilms(
    selected,
    products,
    profiles
  );

  onProgress?.({
    done: result.total,
    total: result.total,
  });

  return result;
}
