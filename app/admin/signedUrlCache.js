const CACHE_PREFIX = "admin-signed-url:";
const EXPIRY_MARGIN_SECONDS = 60;

function getStorage() {
  if (typeof window === "undefined") return null;

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function getCachedSignedUrl(path) {
  if (!path) return null;

  const storage = getStorage();

  if (!storage) return null;

  const key = `${CACHE_PREFIX}${path}`;

  try {
    const rawValue = storage.getItem(key);

    if (!rawValue) return null;

    const cached = JSON.parse(rawValue);

    if (
      !cached?.url ||
      !cached?.expiresAt ||
      Date.now() >= Number(cached.expiresAt)
    ) {
      storage.removeItem(key);
      return null;
    }

    return cached.url;
  } catch {
    storage.removeItem(key);
    return null;
  }
}

export function setCachedSignedUrl(path, url, expiresInSeconds) {
  if (!path || !url) return;

  const storage = getStorage();

  if (!storage) return;

  const validSeconds = Math.max(
    1,
    Number(expiresInSeconds || 0) - EXPIRY_MARGIN_SECONDS,
  );

  try {
    storage.setItem(
      `${CACHE_PREFIX}${path}`,
      JSON.stringify({
        url,
        expiresAt: Date.now() + validSeconds * 1000,
      }),
    );
  } catch {
    // 브라우저 저장공간 사용이 불가능해도 사진 로딩은 계속 진행합니다.
  }
}
