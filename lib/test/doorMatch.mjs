export const VERSION = 'door-attributes-v1';
export const enums = {
  kind: ['room', 'fire', 'middle', 'not_door', 'unknown'],
  opening: ['hinged', 'sliding', 'folding', 'unknown'],
  surface: ['flat', 'grooved', 'raised_panel', 'unknown'],
  glass: ['none', 'partial', 'mostly', 'unknown'],
  frame: ['simple', 'ornate', 'unknown'],
  condition: ['sound', 'damaged', 'unknown'],
  completeness: ['full', 'partial', 'unknown'],
  confidence: ['high', 'low'],
};
export function validate(a) {
  if (!a || Object.entries(enums).some(([k,v]) => !v.includes(a[k])) ||
      !Number.isInteger(a.leaves) || a.leaves < 0 || a.leaves > 8 ||
      typeof a.description !== 'string' || a.description.length > 1500) throw new Error('사진 분석 결과를 확인하지 못했습니다.');
  return a;
}
export function eligible(a) {
  return a && ['room','fire','middle'].includes(a.kind) && a.confidence === 'high' &&
    a.completeness === 'full' && a.opening !== 'unknown' && a.leaves > 0;
}
export function matchDoors(query, rows, scope, quantity = 1) {
  if (!['leaf_one','leaf_both','leaf_frame'].includes(scope) || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) throw new Error('시공 범위와 수량을 확인해주세요.');
  if (!eligible(query)) return {matches:[], estimate:null, reason:'문 전체가 보이는 사진 한 장을 등록해주세요. 종류나 구조가 불명확하면 가격을 계산하지 않습니다.'};
  const weights = {surface:30, glass:25, frame:20, condition:10, leaves:15};
  const matches = rows.filter(r => r.version === VERSION && r.scope === scope && r.unit_price > 0 && eligible(r.analysis) &&
    r.analysis.kind === query.kind && r.analysis.opening === query.opening && r.analysis.leaves === query.leaves)
    .map(r => {
      let score = 0; const reasons = [];
      for (const [key,weight] of Object.entries(weights)) {
        if (query[key] !== 'unknown' && query[key] === r.analysis[key]) { score += weight; reasons.push(key); }
      }
      return {...r, score, reasons};
    }).filter(r => r.score >= 65).sort((a,b) => b.score-a.score || Number(Boolean(query.image_hash) && b.image_hash===query.image_hash)-Number(Boolean(query.image_hash) && a.image_hash===query.image_hash) || String(a.photo_id).localeCompare(String(b.photo_id))).slice(0,3);
  const best = matches[0];
  return {matches, estimate: best ? {unit:best.unit_price, total:best.unit_price*quantity, quantity, source:best.photo_id} : null,
    reason:best ? '가장 조건이 가까운 실제 사례의 1개 단가 × 요청 수량입니다. 크기·자재·보수 차이에 대한 보정 전 참고금액입니다.' : '조건이 충분히 맞는 사례가 없습니다. 10장 밖의 사례나 AI 추정가격으로 대체하지 않습니다.'};
}
