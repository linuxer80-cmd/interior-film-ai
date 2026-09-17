export function formatWon(value) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "-";
  }

  return `${number.toLocaleString("ko-KR")}원`;
}

export function formatDate(value) {
  if (!value) return "-";

  try {
    return new Date(value).toLocaleString("ko-KR", {
      timeZone: "Asia/Seoul",
    });
  } catch {
    return value;
  }
}

export function sanitizeSearchKeyword(value) {
  return String(value || "")
    .replace(/[,()]/g, " ")
    .trim();
}

export function getUsagePhotoPaths(row) {
  const value = row?.photo_paths;

  if (Array.isArray(value)) {
    return [...new Set(value.filter(Boolean))];
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (!trimmed) {
      return [];
    }

    try {
      const parsed = JSON.parse(trimmed);

      if (Array.isArray(parsed)) {
        return [...new Set(parsed.filter(Boolean))];
      }
    } catch {}

    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      const inside = trimmed.slice(1
