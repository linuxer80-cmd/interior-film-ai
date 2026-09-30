import { resolveQuickRegisterCategory } from "./quickRegisterCategories.js";

export const parseBulkMoney = (value) => Number(String(value ?? "").replace(/,/g, "").trim());
const scope = (photo) => [photo.category, photo.subCategory?.trim() || photo.category];
export const bulkGroupKey = (photo) => JSON.stringify([photo.site, photo.objectId || photo.id, ...scope(photo)]);

export function buildBulkSites(photos) {
  const sites = new Map();
  for (const photo of photos) {
    if (!sites.has(photo.site)) sites.set(photo.site, { site: photo.site, items: [], groups: new Map() });
    const site = sites.get(photo.site);
    site.items.push(photo);
    const key = bulkGroupKey(photo);
    if (!site.groups.has(key)) {
      const [category, subCategory] = scope(photo);
      site.groups.set(key, { key, objectId: photo.objectId || photo.id, category, subCategory, photos: [] });
    }
    site.groups.get(key).photos.push(photo);
  }
  return [...sites.values()].map((site) => ({ ...site, groups: [...site.groups.values()] }));
}

// Amounts belong to the exact set of photos in a work item, never to a reused label.
export function retainBulkPrices(before, after, prices) {
  const signatures = (photos) => new Map(buildBulkSites(photos).flatMap((site) => site.groups.map((g) => [g.key, JSON.stringify(g.photos.map((p) => p.id).sort())])));
  const previous = signatures(before);
  return Object.fromEntries([...signatures(after)].filter(([key, ids]) => previous.get(key) === ids && Object.hasOwn(prices, key)).map(([key]) => [key, prices[key]]));
}

export function firstBulkError(photos, prices) {
  // Follow the visible order: price, then the photos inside that group.
  for (const site of buildBulkSites(photos)) {
    for (const group of site.groups) {
      const label = `현장 ${site.site} / ${group.category} ${group.subCategory}`;
      const value = parseBulkMoney(prices[group.key]);
      if (!Number.isFinite(value) || value <= 0) return { field: `price:${group.key}`, message: `${label}: 실제 시공금액을 0보다 큰 숫자로 입력해주세요.` };
      for (const photo of group.photos) {
        if (!photo.file || photo.fileError) return { field: `file:${photo.id}`, photoId: photo.id, message: `${photo.name}: 사진을 읽지 못했습니다. 이 사진을 다시 선택해주세요.` };
        if (!String(photo.site).trim()) return { field: `site:${photo.id}`, photoId: photo.id, message: `${photo.name}: 현장 번호를 입력해주세요.` };
        if (!["before", "after"].includes(photo.type)) return { field: `type:${photo.id}`, photoId: photo.id, message: `${photo.name}: 시공 전 또는 시공 후를 선택해주세요.` };
      }
    }
  }
  return null;
}

export function focusBulkField(element) {
  if (!element) return;
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    if (parent.tagName === "DETAILS") parent.open = true;
  }
  element.focus({ preventScroll: true });
  element.scrollIntoView({ block: "center", behavior: "auto" });
}

// Keep distinct objects from a site as references, with nearby dates/locations first.
export function chooseBulkReferences(classified, upcoming, limit = 4) {
  const candidates = [...new Map(classified.map((p) => [JSON.stringify([p.site, p.objectId]), p])).values()];
  const score = (photo) => Math.max(0, ...upcoming.map((next) => {
    let value = photo.takenAt?.slice(0, 10) && photo.takenAt.slice(0, 10) === next.takenAt?.slice(0, 10) ? 1 : 0;
    if ([photo.latitude, photo.longitude, next.latitude, next.longitude].every(Number.isFinite) &&
      Math.abs(photo.latitude - next.latitude) + Math.abs(photo.longitude - next.longitude) < 0.002) value += 2;
    return value;
  }));
  return candidates.reverse().sort((a, b) => score(b) - score(a)).slice(0, limit);
}

export function resolveBulkBatch(batch, references, results, allocateSite, allocateObject) {
  const count = batch.length + references.length;
  if (!Array.isArray(results) || results.length !== count || new Set(results.map((r) => r.index)).size !== count ||
    results.some((r) => !Number.isInteger(r.index) || r.index < 0 || r.index >= count)) {
    throw new Error("AI 분석 결과가 불완전합니다. 다시 분류해주세요.");
  }
  const byIndex = new Map(results.map((r) => [r.index, r]));
  const siteAliases = new Map();
  const objectAliases = new Map();
  const text = (value) => typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
  const trusted = (result) => text(result.object_key) && result.object_confidence === "high" && text(result.object_evidence);
  function alias(map, key, value) {
    if (!key) return;
    map.set(key, map.has(key) && map.get(key) !== value ? null : value);
  }
  references.forEach((photo, index) => {
    const result = byIndex.get(index);
    alias(siteAliases, text(result.site_key), photo.site);
    if (trusted(result)) alias(objectAliases, JSON.stringify([photo.site, text(result.object_key)]), photo.objectId || photo.id);
  });
  return batch.map((photo, index) => {
    const result = byIndex.get(index + references.length);
    const siteKey = text(result.site_key) || `missing-${photo.id}`;
    if (!siteAliases.has(siteKey)) siteAliases.set(siteKey, allocateSite());
    const site = siteAliases.get(siteKey) || allocateSite();
    const objectKey = JSON.stringify([site, text(result.object_key)]);
    const confident = Boolean(trusted(result)) && objectAliases.get(objectKey) !== null;
    if (confident && !objectAliases.has(objectKey)) objectAliases.set(objectKey, allocateObject());
    return {
      ...photo, site, objectId: confident ? objectAliases.get(objectKey) : allocateObject(),
      groupingReview: !confident, objectEvidence: text(result.object_evidence).slice(0, 250),
      category: resolveQuickRegisterCategory(result.category), subCategory: text(result.sub_category).slice(0, 80),
      type: ["before", "after"].includes(result.photo_type) ? result.photo_type : "unknown",
      confidence: ["high", "medium"].includes(result.confidence) ? result.confidence : "low",
      description: text(result.description).slice(0, 500),
      tags: Array.isArray(result.tags) ? result.tags.filter((tag) => typeof tag === "string").slice(0, 12) : [],
    };
  });
}
