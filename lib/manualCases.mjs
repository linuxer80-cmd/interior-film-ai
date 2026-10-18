import { PARTS, PROFILE_FIELDS, shapesFor, normalizeProfile, profileText } from './caseClassification.mjs';
export function nextFolder(profile, depth) {
  const door = /문/.test(profile.part || '');
  const cabinet = /장|싱크대|화장대|가구/.test(profile.part || '');
  const steps = [
    ['part','시공 부위',PARTS.filter(x=>x!=='확인 필요')],
    ...(profile.part === '문·문틀' || profile.part === '문틀' ? [['door_kind','문 종류',PROFILE_FIELDS.door_kind]] : []),
    ['shape','구조',shapesFor(profile.part)],
    ['pattern','표면 모양',PROFILE_FIELDS.pattern],
    ...(/홈/.test(profile.pattern || '') ? [['groove_count','홈 개수',PROFILE_FIELDS.groove_count]] : []),
    ...(profile.pattern === '알판' ? [['panel_form','알판 형태',PROFILE_FIELDS.panel_form],['panel_count','알판 개수',PROFILE_FIELDS.panel_count]] : []),
    ...(cabinet ? [['cabinet_layout','장 구성',PROFILE_FIELDS.cabinet_layout]] : []),
    ...(door ? [['glass','유리',PROFILE_FIELDS.glass],['slats','간살',PROFILE_FIELDS.slats]] : []),
    ['damage','시공 전 손상',PROFILE_FIELDS.damage],
    ...(!['정상 확인','확인 필요',undefined].includes(profile.damage) ? [['damage_location','손상 위치',PROFILE_FIELDS.damage_location]] : []),
    ['coverage','시공 범위',PROFILE_FIELDS.coverage],
  ];
  return steps[depth] || null;
}
export function folderProfile(path) { return normalizeProfile(Object.fromEntries(path.map(x=>[x.key,x.value]))); }
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
    const profile=normalizeProfile(d.profile || group.profile);
    items.push({id:group.id,company_id:companyId,project_id:projectId,category:profile.part,sub_category:d.scope.trim(),actual_cost:Number(d.price),case_profile:profile,memo:'[수동 확인 분류] '+(d.note||'')});
    for(const p of group.photos){
      if(!p.storagePath) throw Error('사진 업로드가 필요합니다.');
      photos.push({id:p.id,company_id:companyId,project_id:projectId,work_item_id:group.id,photo_type:d.type,category:profile.part,sub_category:d.scope.trim(),storage_path:p.storagePath,image_hash:p.imageHash,ai_description:'관리자 확인: '+d.scope+' · '+profileText(profile)});
    }
  }
  return `BEGIN;\nINSERT INTO public.work_items(id,company_id,project_id,category,sub_category,actual_cost,case_profile,memo)\nSELECT id,company_id,project_id,category,sub_category,actual_cost,case_profile,memo FROM jsonb_to_recordset(${quote(JSON.stringify(items))}::jsonb) AS x(id uuid,company_id uuid,project_id uuid,category text,sub_category text,actual_cost numeric,case_profile jsonb,memo text)\nON CONFLICT(id) DO NOTHING;\nINSERT INTO public.work_photos(id,company_id,project_id,work_item_id,photo_type,category,sub_category,storage_path,image_hash,ai_description)\nSELECT x.* FROM jsonb_to_recordset(${quote(JSON.stringify(photos))}::jsonb) AS x(id uuid,company_id uuid,project_id uuid,work_item_id uuid,photo_type text,category text,sub_category text,storage_path text,image_hash text,ai_description text)\nJOIN public.work_items w ON w.id=x.work_item_id AND w.company_id=x.company_id\nON CONFLICT(id) DO NOTHING;\nCOMMIT;\nSELECT id,sub_category,actual_cost FROM public.work_items WHERE company_id=${quote(companyId)}::uuid AND id IN (${items.map(i=>quote(i.id)+'::uuid').join(',')});`;
}
