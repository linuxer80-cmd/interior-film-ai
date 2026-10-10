export const SHOWCASE_BUCKET = "company-showcase";

export function safeHttpUrl(value) {
  try {
    const url = new URL(String(value || ""));

    return (
      ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
    )
      ? url.href
      : "";
  } catch {
    return "";
  }
}

export function phoneHref(value) {
  const digits = String(value || "").replace(/[^0-9]/g, "");

  return digits.length >= 9 && digits.length <= 12
    ? `tel:${digits}`
    : "";
}

export function isShowcasePath(value, companyId) {
  return (
    typeof value === "string" &&
    Boolean(companyId) &&
    value.startsWith(`${companyId}/`) &&
    /^[a-zA-Z0-9/_\-.]+$/.test(value) &&
    !value.split("/").some(
      (part) => !part || part === "." || part === ".."
    )
  );
}

export function publishedCases(rows, companyId) {
  return (rows || [])
    .filter(
      (row) =>
        row.company_id === companyId &&
        row.is_published === true
    )
    .map((row) => ({
      id: row.id,
      title: row.title,
      category: row.category,
      region: row.region,
      description: row.description,
      film: row.film,

      before_paths: (row.before_paths || [])
        .filter((path) => isShowcasePath(path, companyId))
        .slice(0, 4),

      after_paths: (row.after_paths || [])
        .filter((path) => isShowcasePath(path, companyId))
        .slice(0, 4),
    }))
    .filter((row) => row.after_paths.length > 0)
    .slice(0, 24);
}
