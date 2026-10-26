// Use the same structured photo classification as the estimate/virtual-install flow.
// Never derive available categories from free-form notes (which may describe exclusions).
export function virtualPhotoScope(analysis){
 if(!Array.isArray(analysis?.hierarchy_targets))return null;
 const zones=new Map();
 const add=(key,areaKey,label)=>{if(!zones.has(key))zones.set(key,new Map());zones.get(key).set(areaKey,{key:areaKey,label});};
 for(const t of analysis.hierarchy_targets){
  if(t.kind==='확인 필요')continue;
  const components=Array.isArray(t.components)?t.components:[];
  if(['싱크대','주방가구'].includes(t.part)){
   for(const [word,key,label] of [['상부장','kitchen_upper','상부장·프레임·측판'],['하부장','kitchen_lower','하부장·프레임·측판'],['냉장고장','fridge_cabinet','냉장고장·측판·프레임'],['키큰장','tall_cabinet','키큰장'],['팬트리','pantry_cabinet','팬트리장'],['아일랜드','island_cabinet','아일랜드장']]){
    if(components.some(x=>x.includes(word))||(word==='아일랜드'&&t.kind==='아일랜드'))add('kitchen',key,label);
   }
  }else if(t.part==='냉장고장')add('fridge_cabinet','fridge_cabinet','냉장고장·좌우 측판·프레임');
  else if(t.part==='문')add('door','door_all','문·문틀');
  else if(t.part==='붙박이장')add('built_in','built_in','붙박이장·노출 측판');
  else if(t.part==='신발장')add('shoe_cabinet','shoe_cabinet','신발장·노출 측판');
  else if(t.part==='벽체')add('artwall','artwall_surface','아트월·벽면');
  else if(t.part==='엘리베이터'){
   if(t.kind==='내부')add('elevator_interior','elevator_wall','엘리베이터 내부 벽면');
   else if(['내부 출입구','외부 출입구'].includes(t.kind))add('elevator_door','elevator_door','엘리베이터 출입문·문틀');
  }else if(['팬트리장','기타 수납장','화장대','수납·진열장'].includes(t.part))add('cabinet','cabinet',t.part+'·노출 측판');
 }
 return [...zones].map(([key,areas])=>({key,areas:[...areas.values()]}));
}
