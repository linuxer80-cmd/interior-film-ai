const cache = new Map();
const CACHE_KEY = "film-image-profiles-v2";
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;

let cacheLoaded = false;

const normalize = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");

const distance = (a, b) =>
  Math.hypot(...a.map((value, index) => value - b[index]));

const abortError = () => new DOMException("취소됨", "AbortError");

function loadCache() {
  if (cacheLoaded || typeof window === "undefined") return;
  cacheLoaded = true;

  try {
    const rows = JSON.parse(
      window.localStorage.getItem(CACHE_KEY) || "[]"
    );

    if (!Array.isArray(rows)) return;

    for (const [url, entry] of rows.slice(-2000)) {
      if (
        entry?.at > Date.now() - CACHE_TTL &&
        entry.profile?.median?.length === 3 &&
        entry.profile?.quantiles?.length === 3
      ) {
        cache.set(url, entry);
      }
    }
  } catch {
    // 저장 공간 접근이 제한돼도 검색은 계속합니다.
  }
}

function saveCache() {
  try {
    window.localStorage.setItem(
      CACHE_KEY,
      JSON.stringify([...cache])
    );
  } catch {
    // 저장 공간이 부족하면 메모리 캐시만 사용합니다.
  }
}

export function shortlistFilms(
  selected,
  products,
  getUrl,
  maxCandidates = 60
) {
  const seen = new Set();
  const sourceUrl = getUrl(selected.sample_image_path);

  const candidates = products.filter((product) => {
    const key = `${normalize(product.brand)}:${normalize(
      product.product_code
    )}`;
    const url = getUrl(product.sample_image_path);

    if (
      !normalize(product.brand) ||
      normalize(product.brand) === normalize(selected.brand) ||
      normalize(product.category_key) !== normalize(selected.category_key) ||
      product.is_active === false ||
      !url ||
      url === sourceUrl ||
      seen.has(key)
    ) {
      return false;
    }

    seen.add(key);
    return true;
  });

  const fields = [
    ["wood_species", 5],
    ["color_family", 4],
    ["tone_family", 3],
    ["pattern_line", 2],
    ["texture", 1],
  ];

  const ranked = candidates.map((product, index) => ({
    product,
    index,
    score: fields.reduce(
      (sum, [field, weight]) =>
        sum +
        (normalize(selected[field]) &&
        normalize(product[field]) === normalize(selected[field])
          ? weight
          : 0),
      0
    ),
  }));

  ranked.sort(
    (a, b) => b.score - a.score || a.index - b.index
  );

  return {
    products: ranked.slice(0, maxCandidates).map((item) => item.product),
    eligibleTotal: candidates.length,
  };
}

function rgbToLab(r, g, b) {
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
  const channels = [[], [], []];
  const lights = [];
  const tiles = Array.from(
    { length: 16 },
    () => [0, 0, 0, 0]
  );

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const index = (y * size + x) * 4;

      if (data[index + 3] < 250) {
        throw new Error("투명 이미지");
      }

      const color = rgbToLab(
        data[index],
        data[index + 1],
        data[index + 2]
      );

      color.forEach((value, channel) => {
        channels[channel].push(value);
      });

      lights.push(color[0]);

      const tile =
        tiles[
          Math.floor((y * 4) / size) * 4 +
          Math.floor((x * 4) / size)
        ];

      color.forEach((value, channel) => {
        tile[channel] += value;
      });

      tile[3]++;
    }
  }

  const quantiles = channels.map((values) => {
    values.sort((a, b) => a - b);

    return [0.1, 0.25, 0.5, 0.75, 0.9].map(
      (q) => values[Math.floor((values.length - 1) * q)]
    );
  });

  const median = quantiles.map((values) => values[2]);

  const mean = channels.map(
    (values) =>
      values.reduce((sum, value) => sum + value, 0) /
      values.length
  );

  const spatial = Math.max(
    ...tiles.map((tile) =>
      distance(
        tile.slice(0, 3).map((value) => value / tile[3]),
        mean
      )
    )
  );

  let horizontal = 0;
  let vertical = 0;

  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const index = y * size + x;

      horizontal += Math.abs(
        lights[index] - lights[index + 1]
      );
      vertical += Math.abs(
        lights[index] - lights[index + size]
      );
    }
  }

  const count = (size - 1) ** 2;
  horizontal /= count;
  vertical /= count;

  return {
    median,
    quantiles,
    spatial,
    contrast: quantiles[0][4] - quantiles[0][0],
    edge: (horizontal + vertical) / 2,
    direction:
      Math.abs(horizontal - vertical) /
      (horizontal + vertical + 0.1),
  };
}

function imageProfile(url, signal) {
  if (signal?.aborted) {
    return Promise.reject(abortError());
  }

  loadCache();

  const saved = cache.get(url);

  if (saved && saved.at > Date.now() - CACHE_TTL) {
    return Promise.resolve(saved.profile);
  }

  cache.delete(url);

  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";

    let timer;
    let settled = false;

    function finish(error, profile) {
      if (settled) return;
      settled = true;

      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);

      image.onload = null;
      image.onerror = null;
      image.src = "";

      if (error) {
        reject(error);
        return;
      }

      if (cache.size >= 2000) {
        cache.delete(cache.keys().next().value);
      }

      cache.set(url, {
        at: Date.now(),
        profile,
      });

      resolve(profile);
    }

    function cancel() {
      finish(abortError());
    }

    signal?.addEventListener("abort", cancel, {
      once: true,
    });

    timer = setTimeout(
      () => finish(new Error("이미지 시간 초과")),
      10000
    );

    image.onerror = () => {
      finish(new Error("이미지 읽기 실패"));
    };

    image.onload = () => {
      try {
        if (
          image.naturalWidth < 32 ||
          image.naturalHeight < 32
        ) {
          throw new Error("이미지가 너무 작습니다");
        }

        const canvas = document.createElement("canvas");
        canvas.width = 64;
        canvas.height = 64;

        const context = canvas.getContext("2d", {
          willReadFrequently: true,
        });

        if (!context) {
          throw new Error("이미지 분석 미지원");
        }

        const width = image.naturalWidth;
        const height = image.naturalHeight;

        // 가장자리 여백 영향을 줄이기 위해 중앙 80%를 비교합니다.
        context.drawImage(
          image,
          width * 0.1,
          height * 0.1,
          width * 0.8,
          height * 0.8,
          0,
          0,
          64,
          64
        );

        const pixels = context.getImageData(
          0,
          0,
          64,
          64
        ).data;

        finish(null, describePixels(pixels));
      } catch (error) {
        finish(error);
      }
    };

    image.src = url;
  });
}

export function compareProfiles(a, b) {
  // 색상 변화가 큰 이미지는 비교에서 제외합니다.
  if (a.spatial > 18 || b.spatial > 18) return null;

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
  const edge = Math.abs(
    Math.log((a.edge + 0.5) / (b.edge + 0.5))
  );
  const direction = Math.abs(a.direction - b.direction);

  if (
    color > 8 ||
    light > 6 ||
    distribution > 10 ||
    contrast > 12 ||
    edge > 1 ||
    direction > 0.45
  ) {
    return null;
  }

  // 낮을수록 비슷합니다. 유사도 퍼센트는 아닙니다.
  return (
    color * 2 +
    distribution +
    contrast * 0.5 +
    edge * 5 +
    direction * 5
  );
}

export async function findImageSimilarFilms(
  selected,
  products,
  getUrl,
  { signal, onProgress } = {}
) {
  const sourceUrl = getUrl(selected.sample_image_path);

  if (!sourceUrl) {
    throw new Error(
      "선택한 제품에 샘플 이미지가 없습니다."
    );
  }

  let source;

  try {
    source = await imageProfile(sourceUrl, signal);
  } catch (error) {
    if (error.name === "AbortError") throw error;

    throw new Error(
      "선택한 샘플 이미지를 분석하지 못했습니다. 이미지 주소와 접근 허용을 확인해 주세요."
    );
  }

  if (source.spatial > 18) {
    throw new Error(
      "이미지 안의 색상 변화가 커 비교를 보류했습니다. 필름만 보이는 샘플 이미지가 필요합니다."
    );
  }

  const category = normalize(selected.category_key);

  if (!category) {
    throw new Error(
      "제품의 대분류를 먼저 등록해 주세요."
    );
  }

  const shortlist = shortlistFilms(
    selected,
    products,
    getUrl
  );

  const candidates = shortlist.products;

  let next = 0;
  let done = 0;
  let failed = 0;
  const matches = [];

  onProgress?.({
    done,
    total: candidates.length,
  });

  async function worker() {
    while (next < candidates.length) {
      if (signal?.aborted) throw abortError();

      const product = candidates[next++];

      try {
        const profile = await imageProfile(
          getUrl(product.sample_image_path),
          signal
        );

        const score = compareProfiles(source, profile);

        if (score !== null) {
          matches.push({ product, score });
        }
      } catch (error) {
        if (error.name === "AbortError") throw error;
        failed++;
      }

      if (signal?.aborted) throw abortError();

      done++;

      onProgress?.({
        done,
        total: candidates.length,
      });
    }
  }

  // 최대 60개 후보를 3개씩 처리합니다.
  try {
    await Promise.all([
      worker(),
      worker(),
      worker(),
    ]);
  } finally {
    saveCache();
  }

  return {
    matches: matches
      .sort(
        (a, b) =>
          a.score - b.score ||
          String(a.product.product_code).localeCompare(
            String(b.product.product_code)
          )
      )
      .slice(0, 4),
    failed,
    eligibleTotal: shortlist.eligibleTotal,
    limited: shortlist.eligibleTotal > candidates.length,
    total: candidates.length,
  };
}
