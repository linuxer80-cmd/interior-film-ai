'use client';
import {useState} from 'react';
import {CUSTOMER_STAGES} from '../../../../lib/customerStages.mjs';
import ShowcasePhotos from '../../../components/ShowcasePhotos';
import styles from './portal.module.css';
import RequestPhotos from './RequestPhotos';
function safeLink(value){try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.href:null;}catch{return null;}}
export default function CustomerPortal({token,site,company,profile,cases,remaining,expiresAt,stageData,requestedStage}){
 const [copyMessage,setCopyMessage]=useState('');
 const trade=stageData.tradeReceivables;
 const needsPayment=!stageData.settled||Number(trade?.previousTotal)>0||Number(trade?.unknownCount)>0;
 const stage=Object.hasOwn(CUSTOMER_STAGES,requestedStage)?requestedStage:stageData.stage;
 const money=value=>value===null?'정산 확인 중':Number(value).toLocaleString('ko-KR')+'원';
 const copyAccount=async()=>{try{await navigator.clipboard.writeText(stageData.bankAccount);setCopyMessage('계좌를 복사했습니다.');}catch{setCopyMessage('계좌번호를 선택해 복사해주세요.');}};
 const phone=profile?.public_phone||company.phone||'';
 const dates=[...new Set(site.work_dates?.length?site.work_dates:site.schedule_date?[site.schedule_date]:[])].sort();
 const states={consulting:'상담 중',scheduled:'예약 확정',in_progress:'시공 중',completed:'시공 완료'};
 return <main className={styles.page}>
  <header className={styles.header}><strong>{company.company_name}</strong><span>나의 시공 안내</span></header>
  {stage==='before'&&<>
  <section className={styles.welcome}><small>CUSTOMER CARE</small><h1>{site.customer_name||site.site_name}님,<br/>공간의 변화를 함께 준비해요.</h1><p>일정을 확인하고 우리 집에 어울리는 필름을 먼저 만나보세요.</p></section>
  <section className={styles.card}><span className={styles.badge}>{states[site.status]||'일정 확인'}</span><h2>{site.site_name}</h2><p>시공 일정</p><strong>{dates.length?dates.map(d=>d.slice(0,10)).join(' · '):'일정 협의중'}</strong><p className={styles.muted}>일정 변경이나 궁금한 점은 담당 업체에 문의해주세요.</p></section>
  {['consulting','scheduled'].includes(site.status)&&<RequestPhotos key={token} token={token}/>}
  <section className={styles.feature}><span className={styles.badge}>고객 전용 체험 · 남은 {remaining}회</span><h2>우리 집, 미리 시공해 볼까요?</h2><p>사진과 원하는 필름을 선택하고 우리 집의 변화를 미리 확인해보세요.</p><a className={styles.primary} href={'/customer/site/'+encodeURIComponent(token)+'/preview'} target="_blank" rel="noopener noreferrer">미리시공 시작하기 →</a><small>현장당 무료 3회 · 이미지 생성 요청 기준<br/>실제 색상·질감은 실물 샘플로 확인해주세요.</small></section>
  <section className={styles.card}><h2>색상과 질감을 더 자세히</h2><p>다양한 필름 샘플을 둘러보고 마음에 드는 제품을 골라보세요.</p><a className={styles.secondary} href={'/samples?company='+encodeURIComponent(company.slug)} target="_blank" rel="noopener noreferrer">필름 샘플 전체 보기 ↗</a></section>
  <section className={styles.card}><h2>이렇게 달라졌어요</h2><p>우리 업체가 시공한 실제 전·후 사례예요.</p>{cases.length?cases.slice(0,4).map(c=><article key={c.id}><h3>{c.title}</h3><ShowcasePhotos before={c.before} after={c.after} title={c.title}/></article>):<p className={styles.muted}>공개된 시공 사례를 준비하고 있습니다.</p>}</section>
  </>}
  {stage!=='before'&&<>
    <section className={styles.welcome}><small>{stage==='care'?'AFTER CARE':'COMPLETION'}</small><h1>{site.site_name}<br/>{stage==='care'?'입금 확인·관리 안내':'시공 완료·정산 안내'}</h1></section>
    {!stageData.complete?<section className={styles.card}><h2>시공 결과를 준비하고 있습니다</h2><p>관리자 검수 승인이 끝나면 시공 사진과 정산 안내가 표시됩니다.</p></section>:<>
      <section className={styles.card}><h2>우리 집, 이렇게 달라졌어요</h2>{stageData.before.length||stageData.after.length?<ShowcasePhotos before={stageData.before} after={stageData.after} title={site.site_name}/>:<p>공개할 시공 사진을 준비하고 있습니다. 업체에 문의해주세요.</p>}</section>
      <section className={styles.card}><span className={styles.badge}>{stageData.settled?(trade?'이번 현장 입금 완료':'입금 완료'):'정산 안내'}</span><h2>{stageData.settled?(trade?'이번 현장 입금이 확인되었습니다':'입금이 확인되었습니다'):'계약금액과 입금 안내'}</h2>
        <dl className={styles.paymentRows}>
          {!stageData.legacyPaymentComplete&&<><dt>공급가액</dt><dd>{money(stageData.amount)}</dd>
          <dt>부가세 (10%)</dt><dd>{money(stageData.vatAmount)}</dd></>}
          <dt className={styles.paymentTotal}>{stageData.legacyPaymentComplete?'기존 전액입금 확정금액':'합계 (부가세 포함)'}</dt><dd className={styles.paymentTotal}>{money(stageData.totalAmount)}</dd>
          <dt>확인된 입금액</dt><dd>{money(stageData.paid)}</dd>
          <dt>{trade&&trade.amounts.currentEstimated?'이번 현장 예상 미수금':trade?'이번 현장 남은 금액':'남은 금액'}</dt><dd>{money(trade?trade.amounts.current:stageData.outstanding)}</dd>
        </dl>
        {trade&&<section aria-label="거래처 기존 미수금">
          <h3>{trade.clientName} · 미수금 안내</h3>
          <dl className={styles.paymentRows}>
            <dt>{trade.amounts.previousEstimated?'기존 현장 예상 미수금':'기존 현장 미수금'} ({trade.count+trade.unknownCount}건)</dt><dd>{money(trade.amounts.previous)}</dd>
            <dt className={styles.paymentTotal}>{trade.amounts.estimated?'예상 총 미수금':'총 입금할 금액'}</dt><dd className={styles.paymentTotal}>{money(trade.amounts.total)}</dd>
          </dl>
          <p className={styles.muted}>{trade.amounts.estimated?'부가세 포함 예상 금액입니다. 입금 내역이 확인되지 않은 현장은 입금이 없는 것으로 계산했으며, 실제 미수금은 입금 확인 후 달라질 수 있습니다.':stageData.legacyPaymentComplete?'이번 현장의 기존 전액입금 확정금액과 기존 현장 미수금을 반영했습니다.':'부가세 포함 금액입니다. 이번 현장과 기존 현장 미수금을 합산했습니다.'}</p>
          {trade.unknownCount>0&&<><p className={styles.muted}>기존 현장 {trade.unknownCount}건의 입금 또는 청구금액을 확인하고 있습니다.</p>
            {(trade.unknownItems||[]).map((item,index)=><article key={index}>
              <h4>{item.siteName}{item.scheduleDate?` · ${item.scheduleDate}`:''} <small>정산 확인 중</small></h4>
              <dl className={styles.paymentRows}>
                <dt>공급가액</dt><dd>{money(item.supplyAmount)}</dd>
                <dt>부가세 (10%)</dt><dd>{money(item.vatAmount)}</dd>
                <dt>합계 (부가세 포함)</dt><dd>{money(item.totalAmount)}</dd>
                <dt>확인된 입금액</dt><dd>{money(item.paid)}</dd>
                <dt>예상 미수금</dt><dd>{money(item.totalAmount==null?null:Math.max(0,Number(item.totalAmount)-Number(item.paid??0)))}</dd>
              </dl>
            </article>)}
          </>}
          {trade.items.length>0&&<details><summary>기존 미수금 내역 보기</summary>{trade.items.map((item,index)=><article key={index}>
            <h4>{item.siteName}</h4><dl className={styles.paymentRows}>
              <dt>공급가액</dt><dd>{money(item.supplyAmount)}</dd>
              <dt>부가세 (10%)</dt><dd>{money(item.vatAmount)}</dd>
              <dt>합계 (부가세 포함)</dt><dd>{money(item.totalAmount)}</dd>
              <dt>확인된 입금액</dt><dd>{money(item.paid)}</dd>
              <dt>미수금</dt><dd>{money(item.outstanding)}</dd>
            </dl>
          </article>)}</details>}
        </section>}
        {stageData.outstanding===null&&<p className={styles.muted}>정산 내용을 확인하고 있습니다. 정확한 입금 금액은 업체에 문의해주세요.</p>}
        {needsPayment&&!stageData.bankAccount&&<p>입금 계좌는 담당 업체에 문의해주세요.</p>}
        {needsPayment&&stageData.bankAccount&&<><h3>업체 입금 계좌</h3><p style={{overflowWrap:'anywhere'}}>{stageData.bankAccount}</p><button className={styles.secondary} type="button" onClick={copyAccount}>계좌 복사</button>{copyMessage&&<p role="status">{copyMessage}</p>}</>}
      </section>
      {stage==='care'&&!stageData.settled?<section className={styles.card}><p>입금 확인이 완료되면 입금 완료 상태로 표시됩니다. 이미 입금하셨다면 업체에 확인을 요청해주세요.</p></section>:null}
      <section className={styles.card}><h2>시공 후 관리·A/S 안내</h2><p>제품별 접착·양생 시간과 청소 방법은 담당 업체의 안내를 확인해주세요.</p><p>들뜸이나 손상 등 확인이 필요한 부분이 있다면 사진을 준비해 아래 업체 연락처로 문의해주세요.</p>{phone&&<a className={styles.secondary} href={'tel:'+phone.replace(/[^+\d]/g,'')}>관리·A/S 문의하기</a>}</section>
    </>}
  </>}
  <section className={styles.card}><h2>더 많은 시공 이야기</h2>{safeLink(profile?.blog_url)&&<a className={styles.secondary} href={safeLink(profile.blog_url)} target="_blank" rel="noopener noreferrer">시공 블로그 보기 ↗</a>}{safeLink(profile?.instagram_url)&&<a className={styles.secondary} href={safeLink(profile.instagram_url)} target="_blank" rel="noopener noreferrer">인스타그램 보기 ↗</a>}{!safeLink(profile?.blog_url)&&!safeLink(profile?.instagram_url)&&<p className={styles.muted}>업체 소식 링크를 준비하고 있습니다.</p>}</section>
  <footer><strong>{company.company_name}</strong><p>고객 전용 링크입니다. 다른 사람에게 공유하지 마세요.</p><small>링크 이용 기한: {new Date(expiresAt).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'})}</small></footer>
  {phone&&<a className={styles.contact} href={'tel:'+phone.replace(/[^+\d]/g,'')}>업체에 문의하기 · {phone}</a>}
 </main>;
}
