// Share the same choices between AI classification and the bulk editor.
export const QUICK_REGISTER_CATEGORIES = Object.freeze([
  "싱크대", "문·문틀", "중문", "냉장고장", "붙박이장", "신발장", "현관문", "기타",
]);

export function resolveQuickRegisterCategory(value) {
  const category = typeof value === "string" ? value.trim() : "";
  return QUICK_REGISTER_CATEGORIES.includes(category) ? category : "기타";
}
