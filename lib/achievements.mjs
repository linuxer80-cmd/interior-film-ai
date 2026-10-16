// New counts for an existing metric need only a catalog row, never a UI change.
export const achievementMetrics = {
 member_days:{audience:'worker',label:'계정 가입 후 경과일 (한국시간)'},
 company_days:{audience:'owner',label:'업체 등록 후 경과일 (한국시간)'},
 cutting_days:{audience:'worker',label:'재단 계산 완료 사용일'},
 nearby_food_days:{audience:'worker',label:'현장 음식점 검색 사용일'},
 nearby_film_days:{audience:'worker',label:'현장 필름·자재점 검색 사용일'},
 departure_registered:{audience:'worker',label:'출발지 주소 등록 (목표 1)'},
 commute_trips:{audience:'worker',label:'출근 확인·거리 계산 완료 현장일'},
 commute_km:{audience:'worker',label:'누적 출근 왕복거리 (km)'},
 attendance_days:{audience:'worker',label:'출근 확인 일수'},
 attendance_sites:{audience:'worker',label:'출근 확인 현장 수'},
 ai_photo:{audience:'owner',label:'AI 사진 분석 성공 응답 요청 (업체 합산)'},
 ai_search:{audience:'owner',label:'AI 유사 견적 검색 성공 응답 요청 (업체 합산)'},
 ai_virtual:{audience:'owner',label:'AI 가상시공 성공 응답 요청 (업체 합산)'},
 ai_cutting:{audience:'owner',label:'AI 재단 메모 인식 성공 응답 요청 (업체 합산)'},
 ai_receipt:{audience:'owner',label:'AI 영수증·단가표 인식 성공 응답 요청 (업체 합산)'},
 ai_consult:{audience:'owner',label:'AI 상담 캡처 인식 성공 응답 요청 (업체 합산)'},
 ai_voice:{audience:'owner',label:'AI 음성 변환 성공 응답 요청 (업체 합산)'},
 ai_quick:{audience:'owner',label:'AI 사진 간편등록 성공 응답 요청 (업체 합산)'},
 ai_variety:{audience:'owner',label:'성공 응답이 있는 AI 기능 종류 (8종 중)'},
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

export function badgeUnit(metric){return ({member_days:'일',company_days:'일',cutting_days:'일',nearby_food_days:'일',nearby_film_days:'일',commute_km:'km',attendance_days:'일',attendance_sites:'곳',commute_trips:'건',departure_registered:'단계',complete_profile:'단계',connected_workers:'명',ai_variety:'종'})[metric]||'건';}
