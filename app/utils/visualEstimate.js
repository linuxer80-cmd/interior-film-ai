// Text similarity retrieves candidates; only a successful image comparison can
// make a candidate eligible for pricing. Scores are not accuracy percentages.
export function selectVisuallyVerifiedCases(candidates, result) {
  if (typeof result?.query_usable !== "boolean" || !Array.isArray(result?.matches)) throw new Error("사진 비교 결과 형식이 올바르지 않습니다.");
  const ids = new Set(candidates.map((c) => c.work_item_id));
  const seen = new Set(), ranks = new Set();
  if (result.matches.length !== ids.size) throw new Error("사진 비교 결과가 불완전합니다.");
  for (const match of result.matches) {
    if (!ids.has(match.candidate_id) || seen.has(match.candidate_id) || !Number.isInteger(match.rank) || match.rank < 1 || match.rank > ids.size || ranks.has(match.rank)) throw new Error("사진 비교 결과의 대상이 일치하지 않습니다.");
    seen.add(match.candidate_id); ranks.add(match.rank);
  }
  if (!result.query_usable) return [];
  const byId = new Map(candidates.map((c) => [c.work_item_id, c]));
  return result.matches.filter((m) => m.target_match === "same" && m.scope_match === "same" &&
    m.structure_match === "close" && m.scale_match === "comparable" && m.confidence === "high" &&
    typeof m.reason === "string" && m.reason.trim() && Array.isArray(m.matching_features) && m.matching_features.filter((f) => typeof f === "string" && f.trim()).length >= 2)
    .sort((a, b) => a.rank - b.rank)
    .map((match) => ({
      ...byId.get(match.candidate_id), visual_verified: true, visual_rank: match.rank,
      match_reason: match.reason.slice(0, 240),
      matching_features: match.matching_features.filter((f) => typeof f === "string").slice(0, 4).map((f) => f.slice(0, 120)),
      differences: Array.isArray(match.differences) ? match.differences.filter((f) => typeof f === "string").slice(0, 3).map((f) => f.slice(0, 120)) : [],
    }));
}

export function calculateVisualEstimate(rows) {
  const seen = new Set();
  const cases = rows.filter((row) => {
    if (!row.visual_verified || !row.work_item_id || seen.has(row.work_item_id) || !Number.isFinite(Number(row.actual_cost)) || Number(row.actual_cost) <= 0) return false;
    seen.add(row.work_item_id); return true;
  });
  if (!cases.length) return null;
  const costs = cases.map((row) => Number(row.actual_cost));
  const minimum = Math.min(...costs), maximum = Math.max(...costs);
  return {
    min: minimum, max: maximum,
    average: Math.round(costs.reduce((sum, cost) => sum + cost, 0) / costs.length),
    count: costs.length, confidence: costs.length >= 3 && maximum / minimum <= 1.5 ? "보통" : "낮음",
    range_basis: "observed_cases", price_spread: maximum / minimum > 1.5 ? "wide" : "similar",
  };
}

export function visualSearchMessage(status) {
  return ({
    verified: "시공 대상·범위·구조를 사진으로 비교한 사례입니다.",
    no_verified_match: "사진으로 비교했지만 시공 범위와 구조가 충분히 비슷한 사례를 찾지 못했습니다. 상담으로 확인해주세요.",
    query_needs_review: "시공 대상 전체가 잘 보이지 않아 사진 비교를 확정하지 못했습니다. 정면 전체 사진을 추가해주세요.",
    visual_unavailable: "사진 비교를 완료하지 못해 금액을 계산하지 않았습니다. 잠시 후 다시 분석해주세요.",
    images_required: "사진 비교가 필요합니다. 페이지를 새로고침한 뒤 사진을 다시 분석해주세요.",
    no_candidates: "같은 시공 범위에 해당하는 등록 사진이 부족합니다. 상담으로 확인해주세요.",
  })[status] || "사진 비교가 필요합니다.";
}
