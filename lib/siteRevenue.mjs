const amount = value => {
  if(value == null || String(value).trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

// The caller supplies the latest report, not the latest approved historical report.
export function resolveRevenue(site, report) {
  const contract = amount(site?.contract_amount);
  if(contract !== null && contract > 0)
    return {revenue:contract,missingContract:false,revenueSource:'contract'};
  const approved = report?.review_status === 'approved' ? amount(report.approved_amount) : null;
  if(approved !== null)
    return {revenue:approved,missingContract:false,revenueSource:'approved_report'};
  return {revenue:0,missingContract:true,revenueSource:'missing'};
}
export function revenueSourceLabel(source) {
  return source === 'contract' ? '계약금액' : source === 'approved_report' ? '관리자 승인금액' : '금액 미확정';
}
