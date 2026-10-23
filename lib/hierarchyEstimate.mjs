import {TARGETS, SPACES, DAMAGES} from './photoHierarchy.mjs';
const text=v=>String(v||'').normalize('NFKC').replace(/\s/g,'').replace(/도어/g,'문짝').replace(/평면형/g,'평판형').replace(/일자배치/g,'일자형').replace(/수직분할형|세로분할|분할도어/g,'수직분할');
const tags=v=>[...new Set((Array.isArray(v)?v:[]).map(text).filter(Boolean))];
const overlap=(a,b)=>{a=tags(a);b=tags(b);return a.length&&b.length?a.filter(x=>b.includes(x)).length/new Set([...a,...b]).size:0;};
export function cleanHierarchyTarget(t){
 if(!t||!SPACES.includes(t.space)||!TARGETS[t.part]?.includes(t.kind)||!DAMAGES.includes(t.damage))throw Error('계층 분류를 확인해주세요.');
 for(const key of ['shapes','components'])if(!Array.isArray(t[key])||t[key].length>30||t[key].some(x=>typeof x!=='string'||x.length>80))throw Error('분류 특징을 확인해주세요.');
 return {space:t.space,part:t.part,kind:t.kind,shapes:t.shapes,damage:t.damage,components:t.components};
}
export function hierarchyMatch(query,candidate){
 const q=cleanHierarchyTarget(query),c=cleanHierarchyTarget(candidate);
 if(q.part==='싱크대'){const unit=x=>new Set(tags(x.components).filter(t=>['상부장','하부장','냉장고장','아일랜드','키큰장'].includes(t)));const a=unit(q),b=unit(c);if(a.size&&b.size&&(a.size!==b.size||[...a].some(x=>!b.has(x))))return null;}
 if(q.part!==c.part||(q.space!=='확인 필요'&&c.space!==q.space))return null;
 const sameKind=q.kind!=='확인 필요'&&q.kind===c.kind;
 const shape=overlap(q.shapes,c.shapes),component=overlap(q.components,c.components);
 const damage=q.damage!=='확인 필요'&&c.damage!=='확인 필요'&&q.damage===c.damage;
 let level=2;if(sameKind){level=3;if(shape>=0.5){level=4;if(damage){level=5;if(component>=0.5)level=6;}}}
 const differences=[];
 if(!sameKind)differences.push(`세부 종류: ${q.kind} / 사례 ${c.kind}`);
 if(shape<1)differences.push(`모양·구조: 사례 ${c.shapes.join(', ')||'미입력'}`);
 if(!damage)differences.push(`파손 상태: ${q.damage} / 사례 ${c.damage}`);
 if(component<1)differences.push(`구성 부위: 사례 ${c.components.join(', ')||'미입력'}`);
 const score=Math.min(level===6?100:level===5?89:level===4?79:level===3?64:44,
 Math.round((q.space===c.space&&q.space!=='확인 필요'?20:0)+20+(sameKind?15:0)+20*shape+(damage?10:0)+15*component));
 return {level,score,differences};
}
export function rankHierarchyCases(query,rows){
 const ranked=rows.flatMap(row=>(row.targets||[]).flatMap(t=>{
 if(typeof t.price!=='number'||!Number.isSafeInteger(t.price)||t.price<=0)return [];
 try{const match=hierarchyMatch(query,t);return match?[{...match,photo:row,target:t}]:[];}catch{return [];}
 })).sort((a,b)=>b.level-a.level||b.score-a.score||String(a.photo.id).localeCompare(String(b.photo.id)));
 if(!ranked.length)return [];
 const level=ranked[0].level,seen=new Set();
 return ranked.filter(r=>{const key=`${r.photo.work_item_id||r.photo.id}:${r.target.part}:${r.target.kind}:${r.target.price}`;if(r.level!==level||seen.has(key))return false;seen.add(key);return true;}).slice(0,3);
}
export function hierarchyGroups(photos){
 const groups=new Map();
 for(const photo of photos)for(const [i,target] of (photo.analysis.hierarchy_targets||[]).entries()){
 const identity=target.object_confidence==='high'&&target.object_key?target.object_key:`${photo.id}:${i}`;
 const key=`hierarchy:${target.part}:${target.kind}:${identity}`;
 if(!groups.has(key))groups.set(key,{key,category:target.part,subCategory:target.kind,scope:'whole',hierarchyTarget:target,requiresConfirmation:target.kind==='확인 필요'||target.space==='확인 필요',confirmationReasons:target.kind==='확인 필요'?['시공 대상 종류를 확인해주세요.']:[],subjectSource:'auto',photos:[],photoNumbers:[]});
 const group=groups.get(key);group.photos.push({...photo,analysis:{...photo.analysis,category:target.part,sub_category:target.kind}});group.photoNumbers.push(photo.analysisIndex+1);
 }
 return [...groups.values()];
}
