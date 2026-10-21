export function siteClosure({site,report,payment,stock}) {
  const approved=report?.hasReport&&(report.review?.status||report.report?.review_status)==='approved';
  if(!approved||site?.status==='cancelled')return null;
  return siteClosingChecks({site,report,payment,stock});
}

export function siteClosingChecks({site,report,payment,stock}) {
  const actions=[],unknown=[];
  const account=payment?.site;
  const amountValid=value=>value!=null&&value!==''&&Number.isFinite(Number(value));
  if(!account||typeof account.confirmed!=='boolean')unknown.push('입금 내역');
  else if(!account.confirmed||!amountValid(account.outstanding)||!amountValid(account.contract_amount))actions.push({id:'confirm-payment',message:'기준금액과 기존에 받은 금액을 확인해주세요.',label:'수금 내역 확인',menu:'settlement'});
  else if(Number(account.outstanding)>0)actions.push({id:'payment',message:`미수금 ${Number(account.outstanding).toLocaleString('ko-KR')}원이 남아 있습니다.`,label:'입금 등록',menu:'settlement'});
  if(!Array.isArray(stock?.trips))unknown.push('롤 반납');
  else {
    const outstanding=stock.trips.filter(trip=>trip.site_id===site.id&&trip.returned==null);
    if(outstanding.length)actions.push({id:'returns',message:`반납하지 않은 롤 ${outstanding.length}개가 있습니다.`,detail:outstanding.map(t=>[t.brand,t.product_code,t.label].filter(Boolean).join(' · ')).join('\n'),label:'남은 자재 반납 확인',menu:'materials'});
  }
  if(!Array.isArray(report.materials))unknown.push('실제 자재 단가');
  else {
    const missing=report.materials.filter(m=>Number(m.quantity)>0&&(!amountValid(m.unit_price)||Number(m.unit_price)<0));
    if(missing.length)actions.push({id:'price',message:`자재 단가 미입력 ${missing.length}건 · 실제 이익 미확정`,detail:missing.map(m=>[m.brand,m.product_code||m.product_name].filter(Boolean).join(' ')).join(' · '),label:'자재 단가 입력',menu:'materials'});
  }
  return {actions,unknown,complete:!actions.length&&!unknown.length};
}
