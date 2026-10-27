// Keep this reader local to the mounted inventory screen, never shared across users.
export function createFilmStockReader(request, { timeoutMs = 15000, maxAgeMs = 5000 } = {}) {
  const entries = new Map();
  return {
    read(siteId, materialId, { force = false } = {}) {
      const path = `/api/film-stock?siteId=${encodeURIComponent(siteId)}` +
        (materialId ? `&materialId=${encodeURIComponent(materialId)}` : "");
      const previous = entries.get(path);
      if (previous?.pending) return previous.pending;
      if (!force && previous?.value && Date.now() - previous.at < maxAgeMs) {
        return Promise.resolve(previous.value);
      }
      const controller = new AbortController();
      const entry = { controller };
      entries.set(path, entry);
      let timer;
      const timeout = new Promise((_, reject) => {
        entry.cancel = () => {
          controller.abort();
          reject(new Error("재고 조회가 지연되고 있습니다. 새로고침을 눌러 다시 확인해주세요."));
        };
        timer = setTimeout(entry.cancel, timeoutMs);
      });
      entry.pending = Promise.race([
        Promise.resolve().then(() => request(path, undefined, { signal: controller.signal })),
        timeout,
      ]).then(value => {
        if (entries.get(path) === entry) {
          entry.value = value;
          entry.at = Date.now();
        }
        return value;
      }).catch(error => {
        if (entries.get(path) === entry) entries.delete(path);
        throw error;
      }).finally(() => {
        clearTimeout(timer);
        entry.pending = null;
      });
      return entry.pending;
    },
    clear() {
      for (const entry of entries.values()) if (entry.pending) entry.cancel();
      entries.clear();
    },
  };
}
