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
      const inside = trimmed.slice(1, -1);

      if (!inside.trim()) {
        return [];
      }

      return [
        ...new Set(
          inside
            .split(",")
            .map((item) =>
              item
                .trim()
                .replace(/^"(.*)"$/, "$1")
            )
            .filter(Boolean)
        ),
      ];
    }

    return [trimmed];
  }

  return [];
}

export function getLeadPhotoPaths(lead) {
  const paths = [];

  if (Array.isArray(lead?.customer_photo_paths)) {
    for (const path of lead.customer_photo_paths) {
      if (path && !paths.includes(path)) {
        paths.push(path);
      }
    }
  }

  if (
    lead?.customer_photo_path &&
    !paths.includes(lead.customer_photo_path)
  ) {
    paths.push(lead.customer_photo_path);
  }

  return paths;
}
