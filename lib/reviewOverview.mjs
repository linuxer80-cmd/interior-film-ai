export const reviewReasons = [
  ['photos', '사진 부족', '완료사진을 추가하거나 작업 부위가 잘 보이도록 보완해주세요.'],
  ['content', '작업 내용', '실제 시공한 부위와 작업 내용을 구체적으로 작성해주세요.'],
  ['materials', '자재 사용량', '자재 반출·반납량과 실제 사용량을 확인해주세요.'],
  ['expenses', '경비 내역', '경비의 금액·사용일·내역을 확인해주세요.'],
];
export function reviewMemoText(selected, memo) {
  return [...reviewReasons.filter(([id]) => selected.includes(id)).map(([,label,text]) => `${label}: ${text}`), memo.trim()].filter(Boolean).join('\n');
}
export function reviewOverview(data, operations) {
  const materials = data.materials || [];
  const laborRows = (data.expenses || []).filter(row => ['완료보고/인건비:', '수익관리/인건비:'].some(prefix => row.description?.startsWith(prefix)));
  const expenses = (data.expenses || []).filter(row => !laborRows.includes(row));
  const extraMaterials = expenses.filter(row => row.expense_type === 'material' || row.description?.startsWith('수익관리/자재비:'));
  const expenseItems = expenses.filter(row => !extraMaterials.includes(row));
  const sum = rows => rows.reduce((total,row) => total + (Number.isFinite(Number(row.amount)) ? Number(row.amount) : 0), 0);
  const checks = [];
  if (!(data.afterPhotos?.length > 0)) checks.push({id:'photos',text:'등록된 완료사진이 없습니다.',view:'photos'});
  if (!data.report?.work_summary?.trim()) checks.push({id:'content',text:'실제 시공 내용이 비어 있습니다.',view:'content'});
  const unsettled = operations?.materials?.filter(material => material.returned == null) || [];
  if (unsettled.length) checks.push({id:'usage',text:`자재 ${unsettled.length}종의 반출·반납량을 확인해주세요.`,view:'cost'});
  const unpriced = materials.filter(material => Number(material.quantity) > 0 && (material.unit_price == null || material.unit_price === '' || !Number.isFinite(Number(material.unit_price))));
  return {checks,unpriced,unsettled,expenseItems,extraMaterials,laborRows,laborTotal:sum(laborRows),expenseTotal:sum(expenseItems),extraMaterialTotal:sum(extraMaterials)};
}
export function reviewPaymentAction(payment) {
  const site = payment?.site;
  if (!site || typeof site.confirmed !== 'boolean') return {kind:'unknown',text:'입금 내역을 확인해주세요.',label:'입금 내역 확인'};
  if (!site.confirmed || site.outstanding == null || !Number.isFinite(Number(site.outstanding))) return {kind:'confirm',text:'수금 기준 금액과 기존 입금을 확인해주세요.',label:'수금 내역 확인'};
  if (Number(site.outstanding) > 0) return {kind:'outstanding',text:`미수금 ${Number(site.outstanding).toLocaleString('ko-KR')}원이 남아 있습니다.`,label:'입금 확인'};
  return {kind:'settled',text:'현재 수금 내역상 미수금이 없습니다.',label:'수금 내역 보기'};
}
