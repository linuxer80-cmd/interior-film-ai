const CACHE_PREFIX = "admin-signed-url:";

export function getCachedSignedUrl(storagePath) {
  if (
    typeof window === "undefined" ||
    !storagePath
  ) {
    return null;
  }

  try {
    const key = `${CACHE_PREFIX}${storagePath}`;
    const saved = window.sessionStorage.getItem(key);

    if (!saved) {
      return null;
    }

    const parsed = JSON.parse(saved);

    if (
      !parsed?.url ||
      !parsed?.expiresAt ||
      parsed.expiresAt <= Date.now() + 30000
    ) {
      window.sessionStorage.removeItem(key);
      return null;
    }

    return parsed.url;
  } catch {
    return null;
  }
}

export function setCachedSignedUrl(
  storagePath,
  url,
  validSeconds,
) {
  if (
    typeof window === "undefined" ||
    !storagePath ||
    !url
  ) {
    return;
  }

  try {
    const safeSeconds = Math.max(
      60,
      Number(validSeconds || 1800) - 60,
    );

    const key = `${CACHE_PREFIX}${storagePath}`;

    window.sessionStorage.setItem(
      key,
      JSON.stringify({
        url,
        expiresAt: Date.now() + safeSeconds * 1000,
      }),
    );
  } catch {}
}

export function removeCachedSignedUrl(storagePath) {
  if (
    typeof window === "undefined" ||
    !storagePath
  ) {
    return;
  }

  try {
    window.sessionStorage.removeItem(
      `${CACHE_PREFIX}${storagePath}`,
    );
  } catch {}
}
