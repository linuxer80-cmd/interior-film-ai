import { PARTS, PROFILE_FIELDS, shapesFor, normalizeProfile, profileText } from './caseClassification.mjs';
export const KITCHEN_COMPONENTS = ['냉장고장','팬트리','수납장','렌지장','아일랜드장'];
export const KITCHEN_ONLY = '상하부장만 있는 싱크대';
const manualKeys = ['kitchen_configuration','kitchen_target','kitchen_layout','cabinet_detail','refrigerator_bays','front_count'];
export function normalizeManualProfile(value={}) {
  const result=normalizeProfile(value);
  for(const k of ['part','space'])if(typeof value[k]==='string'&&value[k].trim())result[k]=value[k].trim().slice(0,100);
  for(const k of manualKeys) if(typeof value[k]==='string') result[k]=value[k].slice(0,300);
  return result;
}
export function kitchenConfiguration(values) {
  if(values.includes(KITCHEN_ONLY)) return KITCHEN_ONLY;
  return KITCHEN_COMPONENTS.filter(v=>values.includes(v)).join(' + ');
}
function kitchenTargets(configuration='') {
  return ['전체 구성','상하부장','상부장','하부장',...KITCHEN_COMPONENTS.filter(v=>configuration.includes(v)),'측판·마감판','확인 필요'];
}
export function nextFolder(profile, depth) {
  const door = /문/.test(profile.part || '');
  const kitchen = profile.part==='싱크대';
  const cabinet = /장|싱크대|화장대|가구/.test(profile.part || '');
  const field=(key,label)=>[key,label,PROFILE_FIELDS[key]];
  const surface=[field('pattern','표면 모양'),
    ...(/홈/.test(profile.pattern || '') ? [field('groove_count','홈 개수')] : []),
    ...(profile.pattern === '알판' ? [field('panel_form','알판 형태'),field('panel_count','알판 개수')] : [])];
  const target=profile.kitchen_target;
  const steps = [
    ['part','대분류 · 시공 부위',PARTS.filter(x=>x!=='확인 필요')],
    ...(kitchen ? [
      ['kitchen_configuration','주방 전체 구성',[KITCHEN_ONLY,...KITCHEN_COMPONENTS,'확인 필요'],'multiple'],
      ['kitchen_target','그중 분류할 시공 부위',kitchenTargets(profile.kitchen_configuration)],
      ['kitchen_layout','주방 배치',['일자','ㄱ자','ㄷ자','대면형','독립 아일랜드','복합','확인 필요']],
      ...(target==='냉장고장' ? [['refrigerator_bays','냉장고 자리 수',['1칸','2칸','3칸 이상','확인 필요']],['cabinet_detail','냉장고장 세부 구성',['상부장 + 측판','상부장 + 측판 + 옆 수납장','측판만','상부장만','도어로 가린 구조','기타','확인 필요']]] :
        target==='팬트리' ? [['cabinet_detail','팬트리 형태',['키큰 수납장','오픈 선반형','별도 공간 출입문','기타','확인 필요']]] :
        target==='렌지장'||target==='수납장' ? [['cabinet_detail','수납장 구성',['문짝형','문짝 + 서랍','문짝 + 가전 오픈칸','문짝 + 서랍 + 가전 오픈칸','오픈 선반형','기타','확인 필요']]] :
        target==='아일랜드장' ? [['cabinet_detail','아일랜드 구성',['수납형','측판·전면 마감형','수납 + 식탁형','기타','확인 필요']]] : [field('cabinet_layout','상하부장 구성')]),
      field('cabinet_front','전면 구성'),...surface,
      ['front_count','같은 대상의 문짝 수',['없음','1짝','2짝','3짝','4짝','5짝','6짝','7짝','8짝','9짝','10짝','11~15짝','16짝 이상','확인 필요']],
      field('drawer_count','서랍 수'),field('handle_style','손잡이 방식'),field('side_finish','노출 측판'),
    ] : [
      ...(profile.part === '문·문틀' || profile.part === '문틀' ? [field('door_kind','문 종류')] : []),
      ['shape','구조',shapesFor(profile.part)],...surface,
      ...(cabinet ? [field('cabinet_layout','장 구성'),field('cabinet_front','전면 구조'),field('unit_count','구성 수'),field('drawer_count','서랍 수'),field('handle_style','손잡이 방식'),field('side_finish','노출 측판')] : []),
      ...(door ? [field('glass','유리'),...(profile.glass==='있음'?[field('glass_layout','유리 배치')]:[]),field('slats','간살'),...(profile.slats==='있음'?[field('slat_layout','간살 방향')]:[]),field('leaf_count','문짝 수'),field('opening_detail','개폐 방식'),field('frame_shape','문틀 형태')] : []),
      ...(/몰딩|걸레받이/.test(profile.part||'')?[field('trim_position','설치 위치'),field('trim_profile','단면 모양')]:[]),
      ...(/천장|천정/.test(profile.part||'')?[field('ceiling_shape','천장 형태'),field('step_count','단차 수')]:[]),
      ...(profile.part==='창틀'?[field('window_structure','창 구조')]:[]),
      ...(profile.part==='코너기둥'?[field('column_shape','기둥 단면')]:[]),
      ...(/벽체|아트월|엘리베이터|카운터/.test(profile.part||'')?[field('surface_geometry','표면 형태'),field('joint_layout','분할 구조'),field('obstacle','부착물·장애물')]:[]),
    ]),
    field('damage','시공 전 손상'),
    ...(!['정상 확인','확인 필요',undefined].includes(profile.damage) ? [field('damage_location','손상 위치'),field('damage_extent','손상 범위')] : []),
    field('coverage','금액에 포함된 시공 범위'),
  ];
  return steps[depth] || null;
}
// Find the next unanswered structural field. Custom folders never consume a step.
export function suggestedFolder(path) {
  if(!path.some(x=>x.key==='part'))return null;
  const profile=folderProfile(path),answered=new Set(path.map(x=>x.key));
  for(let index=1;index<80;index++){
    const step=nextFolder(profile,index);
    if(!step)return null;
    if(answered.has(step[0]))continue;
    if(step[0]==='kitchen_configuration'){
      const combinations=[];
      for(let mask=1;mask<(1<<KITCHEN_COMPONENTS.length);mask++)combinations.push(KITCHEN_COMPONENTS.filter((_,i)=>mask&(1<<i)).join(' + '));
      combinations.sort((a,b)=>a.split(' + ').length-b.split(' + ').length);
      return [step[0],step[1],[KITCHEN_ONLY,...combinations,'확인 필요']];
    }
    return step;
  }
  return null;
}
export function folderProfile(path) {
  const raw=Object.fromEntries(path.map(x=>[x.key,x.value]));
  if(raw.part==='싱크대' && PROFILE_FIELDS.shape.includes(raw.kitchen_layout))raw.shape=raw.kitchen_layout;
  return normalizeManualProfile(raw);
}
export function groupManualPhotos(photos) {
  const groups = new Map();
  photos.forEach(p=>{ if(!groups.has(p.caseId)) groups.set(p.caseId,[]); groups.get(p.caseId).push(p); });
  return [...groups].map(([id,photos])=>({id,photos,profile:folderProfile(photos[0].path)}));
}
const quote = value => "E'" + String(value).replaceAll('\\','\\\\').replaceAll("'","''") + "'";
export function manualCaseSql(groups, details, companyId, projectId) {
  if(!groups.length || groups.length>30) throw Error('1~30사례씩 생성해주세요.');
  const items=[],photos=[];
  for(const group of groups){
    const d=details[group.id] || {};
    if(!Number.isFinite(Number(d.price)) || Number(d.price)<=0 || !d.scope?.trim() || !['before','after'].includes(d.type)) throw Error('시공 범위·금액·전후를 입력해주세요.');
    const profile=normalizeManualProfile({...group.profile,...d.profile});
    profile.manual_classification_path=group.photos[0].path || [];
    profile.manual_classification_version=2;
    items.push({id:group.id,company_id:companyId,project_id:projectId,category:profile.part,sub_category:d.scope.trim(),actual_cost:Number(d.price),case_profile:profile,memo:'[수동 확인 분류] '+(d.note||'')});
    for(const p of group.photos){
      if(!p.storagePath) throw Error('사진 업로드가 필요합니다.');
      photos.push({id:p.id,company_id:companyId,project_id:projectId,work_item_id:group.id,photo_type:d.type,category:profile.part,sub_category:d.scope.trim(),storage_path:p.storagePath,image_hash:p.imageHash,ai_description:'관리자 확인: '+d.scope+' · '+profileText(profile)+' · '+(group.photos[0].path||[]).map(x=>x.value).join(' → ')});
    }
  }
  return `BEGIN;\nINSERT INTO public.work_items(id,company_id,project_id,category,sub_category,actual_cost,case_profile,memo)\nSELECT id,company_id,project_id,category,sub_category,actual_cost,case_profile,memo FROM jsonb_to_recordset(${quote(JSON.stringify(items))}::jsonb) AS x(id uuid,company_id uuid,project_id uuid,category text,sub_category text,actual_cost numeric,case_profile jsonb,memo text)\nON CONFLICT(id) DO NOTHING;\nINSERT INTO public.work_photos(id,company_id,project_id,work_item_id,photo_type,category,sub_category,storage_path,image_hash,ai_description)\nSELECT x.* FROM jsonb_to_recordset(${quote(JSON.stringify(photos))}::jsonb) AS x(id uuid,company_id uuid,project_id uuid,work_item_id uuid,photo_type text,category text,sub_category text,storage_path text,image_hash text,ai_description text)\nJOIN public.work_items w ON w.id=x.work_item_id AND w.company_id=x.company_id\nON CONFLICT(id) DO NOTHING;\nCOMMIT;\nSELECT id,sub_category,actual_cost FROM public.work_items WHERE company_id=${quote(companyId)}::uuid AND id IN (${items.map(i=>quote(i.id)+'::uuid').join(',')});`;
}
