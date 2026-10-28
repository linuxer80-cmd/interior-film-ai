export const CUSTOMER_STAGES={before:'시공 전 안내',complete:'시공 완료·정산',care:'입금 완료·관리'};
// A projection is explicitly labeled as such; it never changes the ledger or
// treats an unconfirmed payment as a confirmed zero payment.
export function customerTradeAmounts(state,trade){
 const amount=value=>value===null||value===undefined||value===''||!Number.isFinite(Number(value))?null:Number(value);
 const estimate=(total,paid)=>{const t=amount(total),p=amount(paid);return t===null?null:Math.max(0,t-(p??0));};
 const current=state.outstanding===null?estimate(state.totalAmount,state.paid):amount(state.outstanding);
 const unknown=Array.isArray(trade.unknownItems)?trade.unknownItems:[];
 let previous=amount(trade.previousTotal);
 if(unknown.length!==Number(trade.unknownCount))previous=null;
 for(const item of unknown){const v=estimate(item.totalAmount,item.paid);if(previous===null||v===null)previous=null;else previous+=v;}
 return {current,previous,total:current===null||previous===null?null:current+previous,
   currentEstimated:state.outstanding===null,previousEstimated:Number(trade.unknownCount)>0,
   estimated:state.outstanding===null||Number(trade.unknownCount)>0};
}
export function customerStageState(site,reports,balance,today){
 const dates=Array.isArray(site.work_dates)?site.work_dates.filter(Boolean).sort():[site.schedule_date].filter(Boolean);
 const reviewed=reports.length>0&&reports.every(r=>r.review_status==='approved'&&r.reviewed_at);
 const complete=reviewed&&(!dates.at(-1)||dates.at(-1)<=today)&&!['consulting','cancelled','canceled'].includes(site.status);
 // Use the approved construction amount only when no customer contract was entered.
 // The receivables view supplies the latest approved report's amount, scoped to this site.
 const contract=site.contract_amount;
 const hasContract=contract!==null&&contract!==undefined&&contract!==''&&Number.isFinite(Number(contract))&&Number(contract)>0;
 const raw=hasContract?contract:complete&&balance?.amount_source==='approved_report'?balance.supply_amount:null;
 const amount=raw!==null&&raw!==undefined&&raw!==''&&Number.isFinite(Number(raw))&&Number(raw)>0?Number(raw):null;
 // Customer contract amounts are supply amounts; show the requested 10% VAT separately.
 const vatAmount=amount===null?null:Math.round(amount/10);
 const totalAmount=amount===null?null:amount+vatAmount;
 const paid=balance?.confirmed===true&&balance.paid!==null&&balance.paid!==undefined&&Number.isFinite(Number(balance.paid))?Number(balance.paid):null;
 const outstanding=totalAmount!==null&&paid!==null?Math.max(0,totalAmount-paid):null;
 const settled=complete&&outstanding===0;
 return {complete,settled,stage:settled?'care':complete?'complete':'before',amount,vatAmount,totalAmount,paid,outstanding};
}
export const CUSTOMER_NOTICE_STAGES={consultation:'상담 안내',...CUSTOMER_STAGES};
export const CUSTOMER_TEMPLATE_NAMES={consultation:'필름장이_고객상담안내',before:'필름장이_고객시공전안내_링크',complete:'필름장이_고객시공완료안내_링크',care:'필름장이_고객입금완료안내_링크'};
export function stageTemplate(stage){
 if(stage==='consultation')return '[#{업체명} 상담 안내]\n\n#{고객명}님, 요청하신 인테리어필름 상담을 안내드립니다.\n\n■ 현장명: #{현장명}\n\n아래 버튼에서 우리 집 사진으로 미리시공을 체험하고 필름 샘플과 시공 사례를 확인하실 수 있습니다. 시공 일정은 상담 후 확정하여 안내드립니다.\n\n■ 업체 연락처: #{업체전화번호}\n\n본 메시지는 고객님이 요청하신 상담 서비스에 대한 안내입니다.';
 const head='[#{업체명} '+(stage==='before'?'시공 일정 안내':stage==='complete'?'시공 완료 안내':'입금 확인 및 관리 안내')+']';
 const body=stage==='before'?'#{고객명}님, 요청하신 인테리어필름 시공 일정이 확정되었습니다.\n\n■ 현장명: #{현장명} ■ 시공일: #{시공일}\n\n아래 버튼에서 시공 일정과 준비 사항을 확인하고, 우리 집 사진으로 미리시공을 체험하실 수 있습니다.':stage==='complete'?'#{고객명}님, 요청하신 인테리어필름 시공이 완료되었습니다.\n\n■ 현장명: #{현장명}\n\n관리자 확인이 끝난 시공 전후 사진과 정산 안내를 아래 버튼에서 확인해주세요.':'#{고객명}님, 시공 대금 입금이 확인되었습니다.\n\n■ 현장명: #{현장명}\n\n아래 버튼에서 입금 확인 내용과 시공 후 관리 안내를 확인해주세요.';
 return head+'\n\n'+body+'\n\n■ 업체 연락처: #{업체전화번호}\n\n본 메시지는 고객님이 요청하신 시공 서비스에 대한 안내입니다.';
}
export function stageButton(stage,token='#{고객페이지토큰}'){
 if(stage==='consultation')return {...stageButton('before',token),buttonName:'내 상담 페이지 보기'};
 return {buttonType:'WL',buttonName:stage==='before'?'내 시공 안내 보기':stage==='complete'?'시공 결과·정산 보기':'입금 확인·관리 안내',linkMo:'https://interior-film-ai.vercel.app/customer/site/'+token+'?stage='+stage,linkPc:'https://interior-film-ai.vercel.app/customer/site/'+token+'?stage='+stage};
}
export function customerPhotoRows(rows,companyId,siteId,cutoff){
 const prefix='sites/'+companyId+'/'+siteId+'/';
 return rows.filter(p=>['before','after'].includes(p.photo_type)&&typeof p.storage_path==='string'&&p.storage_path.startsWith(prefix)&&!p.storage_path.split('/').some(x=>x==='..'||x==='.')&&p.created_at&&new Date(p.created_at)<=new Date(cutoff));
}
