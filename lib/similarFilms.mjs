function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function parseRgb(hex) {
  const value = String(hex || "").trim();
  if (!/^#[\da-f]{6}$/i.test(value)) return null;

  return [1, 3, 5].map((start) =>
    parseInt(value.slice(start, start + 2), 16)
  );
}

export function findSimilarFilms(selected, products = [], limit = 4) {
  if (
    !selected ||
    !normalize(selected.brand) ||
    !normalize(selected.category_key)
  ) {
    return [];
  }

  const sourceColor = parseRgb(selected.color_hex);

  const matches = products
    .flatMap((product) => {
      if (
        !product ||
        !normalize(product.brand) ||
        normalize(product.brand) === normalize(selected.brand) ||
        normalize(product.category_key) !==
          normalize(selected.category_key) ||
        product.is_active === false
      ) {
        return [];
      }

      let score = 0;
      const reasons = [];

      const criteria = [
        ["color_family", 30, "같은 색상군"],
        ["wood_species", 25, "같은 수종"],
        ["texture", 20, "같은 질감"],
        ["tone_family", 15, "같은 톤"],
        ["pattern_line", 10, "같은 패턴"],
      ];

      for (const [field, weight, label] of criteria) {
        const source = normalize(selected[field]);
        const target = normalize(product[field]);

        if (source && source === target) {
          score += weight;
          reasons.push(label);
        }
      }

      const targetColor = parseRgb(product.color_hex);

      if (sourceColor && targetColor) {
        const distance = Math.hypot(
          ...sourceColor.map(
            (value, index) => value - targetColor[index]
          )
        );

        if (distance <= 65) {
          score += 25 * (1 - distance / 100);
          reasons.push("가까운 대표 색상");
        }
      }

      if (score < 25) return [];

      return [{
        product,
        score,
        reasons: reasons.slice(0, 2),
      }];
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        String(a.product.product_code).localeCompare(
          String(b.product.product_code)
        )
    );

  const seen = new Set();

  return matches
    .filter(({ product }) => {
      const key = [
        normalize(product.brand),
        normalize(product.product_code),
      ].join(":");

      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}
