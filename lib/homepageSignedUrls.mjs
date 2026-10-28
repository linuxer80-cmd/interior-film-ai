// Cache only short-lived signed image URLs. The caller must freshly check
// company and case publication before passing the eligible paths here.
export function createHomepageSignedUrls({ cache, sign, now = Date.now }) {
  const cachedSign = cache(async (scope, paths) => ({
    createdAt: now(),
    rows: await sign(scope, paths),
  }), ['public-homepage-photo-signatures-v1'], { revalidate: 120 });

  return async (scope, paths) => {
    const uniquePaths = [...new Set(paths)].sort();
    if (!uniquePaths.length) return [];
    let entry;
    try { entry = await cachedSign(scope, uniquePaths); } catch { return sign(scope, uniquePaths); }
    // Next's cache may serve stale data after a failed revalidation. Never
    // return links that could be close to the 30-minute expiry.
    if (!entry || !Number.isFinite(entry.createdAt) || now() - entry.createdAt >= 20 * 60 * 1000 || now() < entry.createdAt) {
      return sign(scope, uniquePaths);
    }
    return Array.isArray(entry.rows) ? entry.rows : [];
  };
}
