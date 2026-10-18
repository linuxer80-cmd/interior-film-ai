export const SPACES = ["확인 필요", "주거", "상업", "공용"];
export const PARTS = ["확인 필요","방문","문틀","문·문틀","중문","방화문","싱크대","몰딩","우물천정","붙박이장","냉장고장","신발장","드레스룸문","화장대","걸레받이","코너기둥","벽체","창틀","카운터","진열장","엘리베이터 내부","엘리베이터 문","기타"];
export const PATTERNS = ["확인 필요","평판","세로 홈","가로 홈","가로·세로 홈","알판","곡면","기타"];
export const DAMAGES = ["확인 필요","정상 확인","구멍","깨짐","수분 팽창","필름 들뜸","표면 벗겨짐","복합 파손"];
export const SHAPES = {
  door: ["여닫이","슬라이딩","접이식","고정틀"],
  kitchen: ["일자","ㄱ자","ㄷ자","대면형","독립 아일랜드"],
  cabinet: ["여닫이","슬라이딩","오픈형","서랍형","문·서랍 혼합"],
  trim: ["직선 평형","굴곡형","곡선","사각","다각형","원형","단차 1단","단차 2단 이상"]
};
export function shapesFor(part) {
  return ["확인 필요", ...(/문/.test(part) ? SHAPES.door : part === "싱크대" ? SHAPES.kitchen : /장|화장대|카운터/.test(part) ? SHAPES.cabinet : SHAPES.trim), "기타"];
}
const yesNo = ["확인 필요","없음","있음"];
export const PROFILE_FIELDS = {
  space: SPACES, part: PARTS, shape: ["확인 필요",...new Set(Object.values(SHAPES).flat()),"기타"],
  pattern: PATTERNS, groove_count: ["확인 필요","없음","1","2","3","4개 이상"],
  glass: yesNo, slats: yesNo, damage: DAMAGES,
  coverage: ["확인 필요","문짝 앞면","문짝 앞뒤","문틀만","문짝·문틀","상부장","하부장","상하부장","전체","부분"],
};
export const profileSchema = { type:"object", additionalProperties:false,
  properties:Object.fromEntries(Object.entries(PROFILE_FIELDS).map(([key,values])=>[key,{type:"string",enum:values}])),
  required:Object.keys(PROFILE_FIELDS) };
export function normalizeProfile(value = {}) {
  return Object.fromEntries(Object.entries(PROFILE_FIELDS).map(([key,values])=>[key,values.includes(value?.[key]) ? value[key] : "확인 필요"]));
}
export const profilePrompt = `
case_profile은 공간 → 시공 부위 → 구조 → 표면 형태 → 손상 → 시공 범위 순서로 분류한다.
주거/상업은 사진에서 확실하지 않으면 확인 필요다. 문 하나만 보고 공간을 단정하지 않는다.
표면의 인쇄된 나뭇결/색상과 실제 파인 홈·알판·간살을 구별한다. 홈 개수는 보이는 개수만 센다.
유리와 간살은 별도로 판정한다. 파손은 구멍/깨짐/물에 불어 팽창/필름 들뜸/벗겨짐을 구별한다.
가림·시공 후 사진·해상도 때문에 원래 손상 여부를 확인할 수 없으면 정상 확인이 아닌 확인 필요다.
여러 손상이 확인되면 복합 파손이다. 사진만으로 시공할 앞뒤 범위나 실제 치수를 추측하지 않는다.
분류 항목: ${JSON.stringify(PROFILE_FIELDS)}
`;
export function profileText(value) {
  return Object.entries(normalizeProfile(value)).filter(([,v])=>v!=="확인 필요").map(([k,v])=>k+":"+v).join(" · ");
}
export function mergeProfiles(values) {
  const profiles=values.map(normalizeProfile);
  return Object.fromEntries(Object.keys(PROFILE_FIELDS).map(key=>{
    const known=[...new Set(profiles.map(p=>p[key]).filter(v=>v!=="확인 필요"))];
    return [key,known.length===1?known[0]:"확인 필요"];
  }));
}
// Unknown is never converted to normal. Conflicting explicit facts cannot price one another.
export function profileMatch(query, candidate) {
  const a=normalizeProfile(query), b=normalizeProfile(candidate);
  let score=0;
  for(const key of Object.keys(PROFILE_FIELDS)){
    if(a[key]==="확인 필요" || b[key]==="확인 필요")continue;
    if(a[key]!==b[key])return {compatible:false,score:0};
    score += key==="part"?16:key==="space"?8:2;
  }
  return {compatible:true,score};
}
