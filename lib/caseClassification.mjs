export const SPACES = ["확인 필요", "주거", "상업", "공용"];
export const PARTS = ["확인 필요","방문","현관문","문틀","문·문틀","중문","방화문","싱크대","몰딩","우물천정","붙박이장","냉장고장","신발장","드레스룸문","화장대","걸레받이","코너기둥","벽체","창틀","카운터","진열장","엘리베이터 내부","엘리베이터 문","천장","아트월","가구","선반","계단","난간","기타"];
export const PATTERNS = ["확인 필요","평판","세로 홈","가로 홈","가로·세로 홈","알판","곡면","기타"];
export const DAMAGES = ["확인 필요","정상 확인","구멍","깨짐","수분 팽창","필름 들뜸","표면 벗겨짐","균열","긁힘","찍힘","접합부 벌어짐","복합 파손"];
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
  door_kind: ["확인 필요","방문","방화문","현관문","중문","드레스룸문","가구문","기타"],
  leaf_count: ["확인 필요","1짝","2짝","3짝","4짝 이상"],
  opening_detail: ["확인 필요","외여닫이","양여닫이","미닫이","2연동","3연동","접이식","피벗","고정"],
  panel_count: ["확인 필요","없음","1개","2개","3개","4개 이상"],
  panel_form: ["확인 필요","없음","돌출 알판","들어간 알판","복합"],
  glass_layout: ["확인 필요","없음","전체 유리","상부 유리","중앙 유리","세로 띠 유리","여러 칸 유리","기타"],
  slat_layout: ["확인 필요","없음","세로 간살","가로 간살","격자 간살","기타"],
  frame_shape: ["확인 필요","평형","굴곡형","장식 몰딩형","아치형","기타"],
  frame_visibility: ["확인 필요","전체 보임","일부 보임","보이지 않음"],
  hardware: ["확인 필요","없음","레버 손잡이","매립 손잡이","당김 손잡이","디지털 도어락","복합"],
  damage_location: ["확인 필요","없음","문짝 중앙","문짝 하단","문짝 가장자리","문틀","상단","중앙","하단","모서리","접합부","여러 부위"],
  damage_extent: ["확인 필요","없음","국소","여러 곳","넓은 범위"],
  cabinet_layout: ["확인 필요","상부장","하부장","상하부장","키큰장","아일랜드","혼합"],
  cabinet_front: ["확인 필요","문짝형","서랍형","오픈 선반","문·서랍 혼합","문·선반 혼합"],
  unit_count: ["확인 필요","1개","2개","3개","4~6개","7개 이상"],
  drawer_count: ["확인 필요","없음","1개","2개","3개","4개 이상"],
  handle_style: ["확인 필요","없음","돌출 손잡이","매립 손잡이","찬넬형","푸시형","혼합"],
  side_finish: ["확인 필요","측판 없음","한쪽 측판","양쪽 측판","여러 측판"],
  trim_profile: ["확인 필요","평형","계단형","곡면형","장식형","복합"],
  trim_position: ["확인 필요","천장 가장자리","바닥 가장자리","문 주변","벽 중간","가구 주변","복합"],
  ceiling_shape: ["확인 필요","평천장","사각 우물","다각형 우물","원형 우물","곡선 우물","복합"],
  step_count: ["확인 필요","없음","1단","2단","3단 이상"],
  surface_geometry: ["확인 필요","평면","볼록 곡면","오목 곡면","다각면","평면·곡면 혼합"],
  joint_layout: ["확인 필요","없음","세로 분할","가로 분할","격자 분할","불규칙 분할"],
  column_shape: ["확인 필요","사각","원형","반원","다각형","ㄱ자","기타"],
  window_structure: ["확인 필요","단창","이중창","고정창","여닫이창","미닫이창","복합"],
  counter_shape: ["확인 필요","일자","ㄱ자","ㄷ자","곡선","독립형"],
  obstacle: ["확인 필요","없음","배관","콘센트·스위치","설비 개구부","복합"],
  coverage: ["확인 필요","문짝 앞면","문짝 앞뒤","문틀만","문짝·문틀","상부장","하부장","상하부장","전체","부분","문짝만","측판 포함","몰딩만","벽면","천장면","기둥 전체","창틀만"],
};
export const profileSchema = { type:"object", additionalProperties:false,
  properties:Object.fromEntries(Object.entries(PROFILE_FIELDS).map(([key,values])=>[key,{type:"string",enum:values}])),
  required:Object.keys(PROFILE_FIELDS) };
export function normalizeProfile(value = {}) {
  const profile=Object.fromEntries(Object.entries(PROFILE_FIELDS).map(([key,values])=>[key,values.includes(value?.[key]) ? value[key] : "확인 필요"]));
  if (["방문","방화문","현관문","중문","드레스룸문"].includes(profile.part)) profile.door_kind=profile.part;
  for (const key of Object.keys(profile)) if (!fieldApplies(key,profile.part)) profile[key]="확인 필요";
  return profile;
}
export const profilePrompt = `
색상·명도·색조·브랜드 색번은 분류하거나 유사도 점수에 사용하지 않는다. 실제 홈·알판·입체 구조만 비교한다.
case_profile은 공간 → 시공 부위 → 구조 → 표면 형태 → 손상 → 시공 범위 순서로 분류한다.
방문·방화문·중문은 각각 서로 다른 문 종류이며 같은 분류로 합치지 않는다. 문틀이나 문·문틀인 경우에도 door_kind로 문 종류를 별도로 기록한다. 현관문이라는 이유나 금속처럼 보인다는 이유만으로 방화문이라고 단정하지 않는다. 확인되지 않으면 확인 필요로 둔다.
냉장고장과 중문은 패널 색상이나 세로 프레임으로 구분하지 않는다. 냉장고 도어 배열과 주변 가구 측판·상부장인지, 사람이 통과하는 개구부의 문틀·레일인지 구조 관계를 확인한다. 가전이 채워져 있어도 냉장고장일 수 있다. 가전 도어 자체와 시공할 가구 측판을 구분하고 불명확하면 확인 필요로 둔다.
주거/상업은 사진에서 확실하지 않으면 확인 필요다. 문 하나만 보고 공간을 단정하지 않는다.
표면의 인쇄된 나뭇결/색상과 실제 파인 홈·알판·간살을 구별한다. 홈 개수는 보이는 개수만 센다.
유리와 간살은 별도로 판정한다. 파손은 구멍/깨짐/물에 불어 팽창/필름 들뜸/벗겨짐을 구별한다.
가림·시공 후 사진·해상도 때문에 원래 손상 여부를 확인할 수 없으면 정상 확인이 아닌 확인 필요다.
여러 손상이 확인되면 복합 파손이다. 사진만으로 시공할 앞뒤 범위나 실제 치수를 추측하지 않는다.
문 종류·문틀·열림 방식은 문 계열에서만 채운다. 알판·유리·간살은 가구에도 적용한다.
싱크대·붙박이장·냉장고장·신발장·화장대·진열장·가구는 cabinet_layout/cabinet_front/서랍 수/손잡이/노출 측판을 구분한다. 장식 홈과 문짝 사이 이음선을 구별한다.
몰딩·걸레받이는 단면 형태와 설치 위치, 우물천정·천장은 외곽 형태와 단차 수, 벽체·아트월은 곡면 여부와 분할선을 기록한다.
코너기둥은 단면 형태, 창틀은 창 구조, 카운터는 배치 형태를 기록한다. 선반·계단·난간·엘리베이터는 보이는 구조와 표면 형태·분할·장애물을 기록한다.
unit_count는 같은 시공 대상 안의 보이는 구성 단위 수이며 사진 장수나 다른 대상의 수가 아니다. 가려진 수량과 실제 치수는 추정하지 않는다.
부위에 해당하지 않는 항목은 확인 필요다. 유리 자체와 빈 공간, 장식 테두리와 별도 알판, 그림자와 홈을 혼동하지 않는다.
leaf_count는 같은 개구부 한 세트의 문짝 수다. 다른 방의 문이나 같은 문을 찍은 여러 사진을 합산하지 않는다.
알판 개수와 돌출/들어간 형태, 유리 배치, 간살 방향을 각각 구별한다. 가려진 구조는 추정하지 않는다.
문틀이 안 보이면 frame_visibility는 보이지 않음, frame_shape는 확인 필요다.
손상 위치와 범위는 눈으로 확인되는 경우만 기록하며 보수 가능 여부나 비용은 추정하지 않는다.
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
    if(!fieldApplies(key,a.part) || !fieldApplies(key,b.part)) continue;
    if(a[key]==="확인 필요" || b[key]==="확인 필요")continue;
    if(a[key]!==b[key]) {
      if (["space","part","door_kind","coverage","damage","damage_location","damage_extent","leaf_count"].includes(key)) return {compatible:false,score:0};
      score -= 2;
      continue;
    }
    score += key==="part"?16:key==="space"?8:2;
  }
  return {compatible:true,score};
}

export function fieldApplies(key, part) {
  if (part === "확인 필요") return true;
  const door = /문/.test(part), cabinet = /장|화장대|가구|선반/.test(part);
  if (["door_kind","leaf_count","opening_detail","frame_shape","frame_visibility","hardware"].includes(key)) return door;
  if (["panel_count","panel_form","glass_layout","slat_layout"].includes(key)) return door || cabinet;
  if (["cabinet_layout","cabinet_front","drawer_count","handle_style","side_finish"].includes(key)) return cabinet || part==="싱크대";
  if (["trim_profile","trim_position"].includes(key)) return /몰딩|걸레받이/.test(part);
  if (key==="ceiling_shape") return /천장|천정/.test(part);
  if (key==="column_shape") return part==="코너기둥";
  if (key==="window_structure") return part==="창틀";
  if (key==="counter_shape") return part==="카운터";
  return true;
}
