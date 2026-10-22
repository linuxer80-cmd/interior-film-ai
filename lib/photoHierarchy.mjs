export const HIERARCHY_VERSION = 1;
export const SPACES = ['주거공간','상업공간','확인 필요'];
export const DAMAGES = ['확인 필요','파손 미관찰','파손 없음(관리자 확인)','경미','보통','심함'];
export const STAGES = {before:'시공 전',after:'시공 후',unknown:'미확인'};
export const TARGETS = {
 '문':['방문','욕실문','방화문','중문','발코니 출입문','세대 현관문','기타 문','확인 필요'],
 '싱크대':['일반 싱크대','냉장고장 결합형 싱크대','보조주방 싱크대','아일랜드','아일랜드 결합 주방','확인 필요'],
 '붙박이장':['침실 붙박이장','드레스룸 붙박이장','복도 붙박이장','실내 붙박이장','확인 필요'],
 '신발장':['일반 신발장','벤치 결합 신발장','현관 복합 수납장','확인 필요'],
 '냉장고장':['냉장고장','김치냉장고장','냉장고·수납장 결합형','확인 필요'],
 '팬트리장':['주방 팬트리장','복도 팬트리장','현관 팬트리장','확인 필요'],
 '기타 수납장':['거실장','TV장','책장','장식장','다용도실장','세탁실장','보일러 가림장','욕실 수납장','세면대 하부장','키큰 수납장','확인 필요'],
 '화장대':['독립 화장대','붙박이 화장대','수납장 결합 화장대','확인 필요'],
 '몰딩':['천장 몰딩','걸레받이','벽 장식 몰딩','독립 문선','확인 필요'],
 '벽체':['일반 벽면','아트월','웨인스코팅','가벽','장식 벽면','확인 필요'],
 '기둥·보':['기둥','천장 보','확인 필요'],
 '창호':['일반 창호','발코니 창호','실내창','주방 창호','쇼윈도 프레임','확인 필요'],
 '창 주변 마감':['창대','창 주변 마감판','커튼박스 주변 마감','확인 필요'],
 '천장':['평천장','우물천장','간접조명 박스','확인 필요'],
 '계단':['계단 측판','챌판','디딤판','손잡이·난간','확인 필요'],
 '가구':['책상','식탁','테이블','침대 프레임','벤치','파티션','기타 가구','확인 필요'],
 '카운터':['접수대','계산대','안내데스크','바 카운터','확인 필요'],
 '수납·진열장':['상품 진열장','쇼케이스','벽면 진열장','사무실 수납장','사물함','확인 필요'],
 '주방가구':['영업용 싱크대','작업대','주방 수납장','확인 필요'],
 '엘리베이터':['내부','내부 출입구','외부 출입구','확인 필요'],
 '기타':['기타 시공 대상','확인 필요'],
};
export const SHAPES = {
 '문':['평판형','음각·홈형','양각·몰딩형','유리 포함형','격자형','루버형','여닫이','미닫이','연동형','접이식'],
 '싱크대':['일자형','ㄱ자형','ㄷ자형','병렬형','아일랜드 결합형','평판형','프레임형','여닫이','서랍 포함'],
 '화장대':['독립형','매입형','수납장 결합형','평판형','장식 프레임형','상부 조명 박스','하부 다리 공간'],
};
export const COMPONENTS = {
 '문':['문·문틀 세트','문짝','문틀','격자살','문선'],
 '싱크대':['상부장','하부장','냉장고장','키큰장','아일랜드','노출 측판','하부 걸레받이','마감판'],
 '붙박이장':['본장 문짝','상부장','서랍장','주변 프레임','노출 측판','상부 마감판'],
 '신발장':['상부장','하부장','키큰장','벤치','노출 측판','마감판'],
 '냉장고장':['상부장','옆 수납장','주변 프레임','좌측 측판','우측 측판','마감판'],
 '팬트리장':['출입문','내부 수납장','외부 수납장','측판','선반'],
 '화장대':['거울 주변 마감','거울장','상판','서랍 전면','하부 지지판','측판','상부 박스','키큰 수납장'],
 '엘리베이터':['내부 문','외부 문','문 주변 프레임','벽 패널','천장'],
};
export const uuid = v => typeof v === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(v);
const clean = (v,max) => {if(typeof v!=='string'||v.length>max)throw Error('입력 길이와 형식을 확인해주세요.');return v.trim();};
const tags = v => {if(!Array.isArray(v)||v.length>30)throw Error('특징·구성 부위는 30개 이하로 입력해주세요.');return [...new Set(v.map(x=>clean(x,80)).filter(Boolean))];};
export function validateTargets(input,{reviewed=false}={}) {
 if(!Array.isArray(input)||input.length>20||(reviewed&&!input.length))throw Error('사진별 대상을 1~20개 입력해주세요.');
 const ids=new Set();return input.map(t=>{
  if(!t||!uuid(t.id)||ids.has(t.id))throw Error('대상 식별자가 중복되거나 잘못됐습니다.');ids.add(t.id);
  if(!SPACES.includes(t.space)||!Object.hasOwn(TARGETS,t.part)||!TARGETS[t.part].includes(t.kind)||!DAMAGES.includes(t.damage))throw Error('공간·대상·세부 종류·파손 분류를 확인해주세요.');
  const shapes=tags(t.shapes),components=tags(t.components);
  if(components.includes('문·문틀 세트')&&(components.includes('문짝')||components.includes('문틀')))throw Error('문·문틀 세트와 문짝·문틀 개별 항목은 중복 선택할 수 없습니다.');
  const price=t.price==null||t.price===''?null:t.price;
  if(price!==null&&(typeof price!=='number'||!Number.isSafeInteger(price)||price<0||price>1e12))throw Error('가격은 0 이상 1조원 이하의 정수로 입력해주세요.');
  return {id:t.id,space:t.space,part:t.part,kind:t.kind,shapes,damage:t.damage,components,price,priceNote:clean(t.priceNote??'',300),notes:clean(t.notes??'',1000)};
 });
}
export function newTarget(id) {return {id,space:'확인 필요',part:'문',kind:'확인 필요',shapes:[],damage:'확인 필요',components:[],price:null,priceNote:'',notes:''};}
export function aiTargets(input,createId) {
 if(!Array.isArray(input)||!input.length||input.length>20)throw Error('AI가 분류할 대상을 확인하지 못했습니다. 직접 입력해주세요.');
 return validateTargets(mergeKitchenTargets(input.map(t=>({...t,id:createId(),price:null,priceNote:'',damage:t.damage==='파손 없음(관리자 확인)'?'파손 미관찰':t.damage}))));
}

// A kitchen's refrigerator cabinet belongs to the main sink unit; standalone cases remain separate.
export function mergeKitchenTargets(targets) {
 const sink=targets.find(t=>t.part==='싱크대'&&!['아일랜드','아일랜드 결합 주방'].includes(t.kind));
 const cabinets=targets.filter(t=>t.part==='냉장고장');
 if(!sink||!cabinets.length)return targets;
 if(cabinets.some(t=>t.price!=null))throw Error('냉장고장에 별도 가격이 있습니다. 포함 가격을 확인한 뒤 합쳐주세요.');
 const unique=values=>[...new Set(values)].slice(0,30);
 const damageOrder=['파손 없음(관리자 확인)','파손 미관찰','경미','보통','심함'];
 const damages=[sink,...cabinets].map(t=>t.damage);
 const damage=damages.includes('확인 필요')?'확인 필요':damages.reduce((a,b)=>damageOrder.indexOf(a)>damageOrder.indexOf(b)?a:b);
 const merged={...sink,kind:'냉장고장 결합형 싱크대',damage,
  shapes:unique([...(sink.shapes||[]),'냉장고장 결합형',...cabinets.flatMap(t=>(t.shapes||[]).map(x=>'냉장고장 · '+x))]),
  components:unique([...(sink.components||[]),'냉장고장',...cabinets.flatMap(t=>(t.components||[]).map(x=>'냉장고장 · '+x))]),
  notes:[sink.notes||'','냉장고장은 싱크대 구성 부위에 포함. 별도 중복 견적 제외.',...cabinets.map(t=>t.notes||'')].filter(Boolean).join(' ').slice(0,1000)};
 return targets.filter(t=>t.part!=='냉장고장').map(t=>t===sink?merged:t);
}
