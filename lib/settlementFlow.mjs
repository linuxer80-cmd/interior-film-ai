const value = n => n != null && String(n).trim() !== '' && Number.isFinite(Number(n));

export function paymentState(site, today) {
  if (site?.status === 'cancelled') return {label:'취소 현장',text:'기존 수금 내역을 확인하세요.'};
  if (!value(site?.contract_amount)) return {label:'금액 확인 필요',text:'계약금액 또는 관리자 승인금액을 먼저 확인해주세요.'};
  if (!site.confirmed) return {label:'기존 입금 확인 필요',text:'지금까지 받은 총액을 확인해주세요. 받은 금액이 없으면 0원을 입력하세요.'};
  if (!value(site.outstanding)) return {label:'수금 확인 필요',text:'입금 내역을 다시 확인해주세요.'};
  if (Number(site.outstanding) < 0) return {label:'초과 입금 확인',text:'기준금액보다 많이 입금되었습니다. 입금 기록과 환불 여부를 확인해주세요.'};
  if (Number(site.outstanding) === 0) return {label:'수금 완료',text:'수금이 완료되었습니다. 아래에서 실제 비용과 수익을 확인하세요.'};
  if (site.due_date && site.due_date < today) return {label:'입금 예정일 지남',text:'입금 예정일이 지났습니다. 남은 금액의 입금 여부를 확인하세요.'};
  return {label:'미수금 있음',text:'남은 금액의 입금을 확인하고 실제 받은 금액을 기록하세요.'};
}

export function actualMaterialUnpriced(row) {
  const price = n => value(n) && Number(n) >= 0;
  return Number(row.quantity) > 0 && !price(row.total_price) && !price(row.unit_price);
}

export function profitState(site) {
  const reasons=[];
  if (!site || site.missingContract || !value(site.revenue)) reasons.push('매출 금액 확인');
  if (site?.laborPending) reasons.push('시공자 일당·수당 확인');
  if (site?.materialPending) reasons.push('자재 사용량·매입원가 확인');
  if (site?.materialProvisional) reasons.push('자재 실제 비용 확정');
  if (site?.profitIsEstimated && !reasons.length) reasons.push('미확정 비용 확인');
  if (site && ['labor','material','expense','profit'].some(key=>!value(site[key]))) reasons.push('비용 내역 확인');
  return {pending:reasons.length>0,reasons};
}
