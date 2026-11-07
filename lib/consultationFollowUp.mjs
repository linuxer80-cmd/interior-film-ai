export const stages={draft:'견적 준비',sent:'견적 전달',waiting:'고객 답변 대기',closed:'상담 종료'};
export const actions={photos:'사진 받기',estimate:'견적 작성',send:'견적 보내기',contact:'다시 연락',wait:'답변 기다리기'};
export function validDate(value) {
  return typeof value==='string' && /^20\d{2}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value;
}
export function cleanFollowUp(body) {
  if(!body || typeof body.title!=='string' || !body.title.trim() || body.title.length>200 || !Object.hasOwn(stages,body.stage) || !Object.hasOwn(actions,body.action) || (body.date!=='' && !validDate(body.date))) throw Error('상담 이름·단계·연락 날짜를 확인해주세요.');
  if(!Number.isInteger(body.revision) || body.revision<0) throw Error('상담을 새로 불러온 뒤 저장해주세요.');
  return {title:body.title.trim(),stage:body.stage,action:body.action,due_date:body.date||null};
}
