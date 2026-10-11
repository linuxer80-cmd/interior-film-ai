import { normalizeBrand } from "../app/utils/filmSample.mjs";

export function pickerBrand(value) {
  return normalizeBrand(value) === "YOUNGLIM"
    ? "영림 인테리어필름"
    : String(value || "").trim();
}

const categoryAliases = {
  wood: "wood",
  우드: "wood",
  solid: "solid",
  솔리드: "solid",
  stone: "stone",
  marble: "stone",
  스톤: "stone",
  스톤마블: "stone",
  스톤앤마블: "stone",
  metal: "metal",
  메탈: "metal",
  fabric: "fabric",
  패브릭: "fabric",
  페브릭: "fabric",
  leather: "leather",
  레더: "leather",
  etc: "etc",
  기타: "etc",
  highglossy: "etc",
  하이글로시: "etc",
};

const labels = {
  wood: "우드",
  solid: "솔리드",
  stone: "스톤&마블",
  metal: "메탈",
  fabric: "패브릭",
  leather: "레더",
  etc: "기타",
};

const filter = (category) =>
  category === "wood"
    ? "wood"
    : ["stone", "fabric", "leather"].includes(category)
    ? "tone"
    : "color";

const info = (category, label) => ({
  prefix: `DB:${label}`,
  label,
  category,
  filter: filter(category),
});

export function pickerProductLine(product, legacyLine) {
  const stored = String(product?.category_key || "")
    .trim()
    .toLowerCase()
    .replace(/[\s&_·-]/g, "");

  const category = categoryAliases[stored];
  const line = String(product?.pattern_line || "").trim();

  if (category) {
    return info(category, line || labels[category]);
  }

  if (normalizeBrand(product?.brand) === "YOUNGLIM") {
    // PX는 여러 분류에서 쓰이므로 코드만으로 확정하지 않습니다.
    const code = String(product?.product_code || "")
      .trim()
      .toUpperCase()
      .replace(/^F(?=P)/, "");

    const entries = [
      [/^PMS\d/, "metal", "메탈"],
      [/^PUL\d/, "leather", "레더"],
      [/^PSM\d/, "solid", "소프트매트"],
      [/^PS\d/, "solid", "솔리드"],
      [/^PW\d/, "wood", "우드"],
      [/^PG\d/, "etc", "하이글로시"],
    ];

    const entry = entries.find(([pattern]) =>
      pattern.test(code)
    );

    if (entry) {
      return info(entry[1], line || entry[2]);
    }

    const text = [
      line,
      product?.texture,
      product?.product_name,
    ]
      .filter(Boolean)
      .join(" ");

    const keywords = [
      [/스톤|마블|대리석|stone|marble/i, "stone"],
      [/패브릭|페브릭|fabric/i, "fabric"],
      [/레더|가죽|leather/i, "leather"],
      [/메탈|metal/i, "metal"],
      [/우드|wood/i, "wood"],
      [/솔리드|solid/i, "solid"],
    ];

    const match = keywords.find(([pattern]) =>
      pattern.test(text)
    );

    return match
      ? info(match[1], line || labels[match[1]])
      : info("etc", line || "분류 확인 필요");
  }

  return (
    legacyLine ||
    info("etc", line || "분류 확인 필요")
  );
}
