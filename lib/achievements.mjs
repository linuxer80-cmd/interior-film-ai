// New counts for an existing metric need only a catalog row, never a UI change.
export const achievementMetrics = {
 registered_sites:{audience:'owner',label:'취소되지 않은 등록 현장'},
 approved_sites:{audience:'owner',label:'완료보고 승인 현장'},
 settled_sites:{audience:'owner',label:'롤 전체 반입·보고 승인 현장'},
 connected_workers:{audience:'owner',label:'연결 수락한 활성 시공자 (본인 제외)'},
 complete_profile:{audience:'worker',label:'기본 프로필 완성 (목표 1)'},
 approved_reports:{audience:'worker',label:'직접 제출한 보고서 승인 현장'},
 returned_sites:{audience:'worker',label:'직접 반입·전체 롤 정산·보고 승인 현장'},
};
export function cleanBadge(input){
 const out={};
 for(const [key,max] of [['id',64],['title',60],['description',500],['image_path',300]]) {
  if(typeof input[key]!=='string'||input[key].trim().length>max) throw Error('배지 이름·설명·이미지를 확인해주세요.');
  out[key]=input[key].trim();
 }
 if(!/^[a-z][a-z0-9_]{2,63}$/.test(out.id)||!out.title||!out.description)throw Error('ID는 영문 소문자로 시작하는 3~64자의 영문·숫자·밑줄로 입력해주세요. 이름과 설명도 필요합니다.');
 out.audience=input.audience;out.metric=input.metric;out.tier=input.tier;
 if(!achievementMetrics[out.metric]||achievementMetrics[out.metric].audience!==out.audience)throw Error('대상과 달성 조건을 확인해주세요.');
 if(!['bronze','silver','gold','teal'].includes(out.tier))throw Error('배지 색상을 확인해주세요.');
 for(const [key,min,max] of [['target',1,100000],['art_key',0,7],['sort_order',0,100000],['revision',0,2147483646]]){
  if(!Number.isInteger(input[key])||input[key]<min||input[key]>max)throw Error('목표 횟수·순서·버전을 확인해주세요.');out[key]=input[key];
 }
 if(out.metric==='complete_profile'&&out.target!==1)throw Error('프로필 완성 목표는 1로 설정해주세요.');
 if(out.image_path&&!/^custom\/[a-f0-9-]+\.(png|jpg|webp)$/.test(out.image_path))throw Error('직접 업로드한 배지 이미지를 선택해주세요.');
 if(typeof input.active!=='boolean')throw Error('노출 여부를 확인해주세요.');out.active=input.active;return out;
}
export function badgeProgress(badge){return badge.earned_at?100:Math.max(0,Math.min(100,Number(badge.progress||0)/Math.max(1,Number(badge.target))*100));}
export function nextBadge(badges){return badges.filter(b=>b.active&&!b.earned_at).sort((a,b)=>badgeProgress(b)-badgeProgress(a)||a.sort_order-b.sort_order)[0]||null;}
