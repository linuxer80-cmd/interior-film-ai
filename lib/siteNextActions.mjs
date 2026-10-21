// Data already authorized by each existing endpoint; never infer absence from an error.
export function siteNextActions({ site, schedule, material, report, payment, today, myWorkerIds = [] }) {
  if (!site || site.status === 'cancelled' || !report) return [];
  const action = (id, message, label, menu) => ({ id, message, label, menu });
  if (report.hasReport) {
    const status = report.review?.status || report.report?.review_status || 'pending';
    if (status === 'pending') return [action('review', '제출된 완료보고를 검수해주세요.', '완료보고 검수', 'report')];
    if (status === 'rejected') return [action('revision', '보완 요청한 보고서의 진행 상황을 확인해주세요.', '보완 내용 확인', 'report')];
    if (status !== 'approved' || !payment?.site) return [];
    const account = payment.site;
    if (!account.confirmed || account.outstanding == null) return [action('confirm-payment', '수금 기준 금액을 확인해주세요.', '수금 내역 확인', 'settlement')];
    if (account.outstanding != null && Number.isFinite(Number(account.outstanding)) && Number(account.outstanding) > 0) {
      const overdue = account.due_date && account.due_date < today;
      return [action('payment', `${overdue ? '입금 예정일이 지났습니다. ' : ''}미수금 ${Number(account.outstanding).toLocaleString('ko-KR')}원을 확인해주세요.`, '입금 내역 확인', 'settlement')];
    }
    return [];
  }
  if (site.status === 'completed') return [action('report', '시공은 완료되었지만 완료보고가 없습니다.', '완료보고 확인', 'report')];
  if (!schedule) return [];
  const dates = schedule.dates || [];
  if (!dates.length) return [action('date', '시공 날짜가 정해지지 않았습니다.', '시공일 설정', 'schedule')];
  const remaining = dates.filter(date => date >= today);
  if (!remaining.length) return [action('report', '예정된 시공일이 지났습니다. 완료 여부와 보고서를 확인해주세요.', '완료보고 확인', 'report')];
  const actions = [];
  const crewFor = date => schedule.hasDailySchedule
    ? schedule.assignments.filter(row => row.work_date === date)
    : schedule.assignments;
  const missing = remaining.find(date => !crewFor(date).some(row => row.role === 'leader'));
  if (missing) actions.push(action('assignment', `${missing.slice(5).replace('-', '/')} 시공일의 책임 팀장을 배정해주세요.`, '시공자 배정', 'schedule'));
  if (material && ['unregistered', 'none', 'partial'].includes(material.status)) {
    actions.push(action('material', material.status === 'unregistered' ? '사용할 필름이 등록되지 않았습니다.' : material.status === 'partial' ? '아직 반출 기록이 없는 필름이 있습니다.' : '자재 반출 기록이 없습니다. 준비 여부를 확인해주세요.', '자재 확인', 'materials'));
  }
  if (dates.includes(today)) {
    const mine = crewFor(today).some(row => myWorkerIds.includes(row.worker_id));
    actions.push(action('today', mine ? '오늘 이 현장에 배정되어 있습니다.' : '오늘 시공 현장입니다. 팀원과 진행 상황을 확인하세요.', mine ? '내 시공 열기' : '현장 팀 채팅', mine ? 'work' : 'chat'));
  }
  return actions;
}
