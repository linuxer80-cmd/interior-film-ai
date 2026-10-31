// Compare bytes, never names or visual similarity: different doors may look alike.
export async function selectUniqueEstimatePhotos(files, existing, limit, cryptoImpl = globalThis.crypto) {
  const seen = new Set(existing.map(photo => photo.fingerprint).filter(Boolean));
  const selected = [];
  let duplicateCount = 0;
  for (const file of files) {
    let fingerprint = null;
    try {
      const digest = await cryptoImpl.subtle.digest('SHA-256', await file.arrayBuffer());
      fingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    } catch {
      // Older browsers can still upload; do not discard a photo on hash failure.
    }
    if (fingerprint && seen.has(fingerprint)) { duplicateCount++; continue; }
    if (selected.length >= limit) break;
    if (fingerprint) seen.add(fingerprint);
    selected.push({file, fingerprint});
  }
  return {selected, duplicateCount};
}
