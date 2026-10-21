export function reportOverview(context, form, existingExpenses) {
  const materials = context?.operations?.materials || [];
  return {
    savedAfter: Number(context?.afterCount || 0),
    newAfter: (form?.photos || []).filter(photo => photo.type === 'after' && !photo.uploaded).length,
    uploadedPhotos: (form?.photos || []).filter(photo => photo.uploaded).length,
    materials,
    unchecked: materials.filter(material => material.returned == null),
    existingExpenses: Array.isArray(existingExpenses) ? existingExpenses : null,
    existingExpenseTotal: Array.isArray(existingExpenses) ? existingExpenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0) : null,
  };
}
export function firstReportStep(context, form) {
  if (!form?.work_summary?.trim() || (!(Number(context?.afterCount) > 0) && !(form?.photos || []).some(photo => photo.type === 'after'))) return 0;
  if ((context?.operations?.materials || []).some(material => material.returned == null)) return 1;
  return 2;
}
export function workerWorkActions({ site, operations, report, canSubmit, today }) {
  if (site.status === 'cancelled') return [];
  const action = (id, text, label, tab) => ({id,text,label,tab});
  if (report && report.review_status !== 'rejected') return [action('submitted', report.review_status === 'approved' ? '완료보고가 승인되었습니다.' : '완료보고를 제출했습니다. 관리자 검수를 기다리고 있습니다.', '제출 내용 보기', 'report')];
  if (report?.review_status === 'rejected') return [action('revision', report.review_memo || '관리자가 요청한 보완 내용을 확인해주세요.', canSubmit ? '보완해서 다시 제출' : '보완 내용 확인', 'report')];
  if (operations?.locked) return [action('refresh', '현장 상태가 변경되었습니다. 최신 완료보고 상태를 확인해주세요.', '최신 보고 상태 확인', 'report')];
  const result = [];
  const materials = operations?.materials || [];
  const past = site.status === 'completed' || (site.schedule_end && String(site.schedule_end).slice(0,10) < today);
  if (!operations?.locked && materials.some(material => Number(material.issued) <= 0 && material.returned == null)) result.push(action('issue','사용할 필름과 재고를 확인하고 반출해주세요.','자재 반출·반납','film'));
  if (!operations?.locked && materials.some(material => Number(material.issued) > 0 && material.returned == null)) result.push(action('return',operations.canReturn === false ? '남은 자재의 반납량을 책임 팀장에게 알려주세요. 반납 등록은 책임 팀장이 확인합니다.' : '작업을 마쳤다면 남은 자재의 반납량을 확인해주세요. 남은 자재가 없으면 0으로 등록합니다.', operations.canReturn === false ? '자재 상태 보기' : '남은 자재 확인','film'));
  const day = value => {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? value : new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Seoul'}).format(parsed);
  };
  const dates = site.assigned_dates?.map(row => row.work_date) || site.work_dates;
  const first = Array.isArray(dates) && dates.length ? [...dates].sort()[0] : day(site.schedule_start);
  if (first && first > today) {
    result.push(action('prepare', `${first} 시공 예정입니다. 요청사진과 준비사항을 먼저 확인하세요.`, '요청사진 보기', 'photos'));
    return result;
  }
  if (canSubmit) result.push(action('report', past ? '등록된 자재·사진을 불러와 완료보고를 마무리하세요.' : '작업을 마치면 사진과 경비를 확인하고 완료보고를 제출하세요.', '사진·완료보고 작성', 'report'));
  else result.push(action('expenses','본인 경비를 등록하면 기존 내역으로 유지됩니다. 완료보고는 책임 팀장 또는 지정 담당자가 제출합니다.','내 경비 등록','expenses'));
  return result;
}
