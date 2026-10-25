'use client';
import styles from './sales.module.css';
const rank=value=>value==null?'미제공':`${Number(value).toFixed(1)}위`;
export function bidReference(positions,bid){
 if(positions.length!==5||positions.some(p=>p.bid==null)||positions.some((p,i)=>i>0&&positions[i-1].bid<p.bid))return '참고표 확인';
 const match=positions.find(p=>bid>=p.bid);return match?`${match.position}위 기준금액 충족`:'5위 기준금액 미만';
}
export function RecentRank({recent}){
 if(!recent)return <span>미제공</span>;
 const devices=recent.devices||{};
 const deviceRank=d=>d?.recentAverageRank!=null?rank(d.recentAverageRank):d?.todayAverageRank!=null?'오늘 평균 '+rank(d.todayAverageRank):'미제공';
 return <><span>모바일 {deviceRank(devices.MOBILE)}</span><small>PC {deviceRank(devices.PC)}</small>{recent.recentAverageRank!=null&&<small>통합 {rank(recent.recentAverageRank)}</small>}</>;
}
export default function NaverRankPanel({details,proposedBid,previousBid}){
 if(!details)return null;
 const amount=Number.isFinite(proposedBid)?proposedBid:details.bidAmt;
 return <section className={styles.rankPanel} aria-label={`${details.keyword} 순위와 입찰가 비교`}>
  <h3>{details.keyword} 순위·입찰가 비교</h3>
  <p>조회 {new Date(details.fetchedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})} · 저장된 기본 입찰가 {Number(details.bidAmt).toLocaleString('ko-KR')}원</p>
  <p><strong>최근 통합검색 평균순위</strong> · <RecentRank recent={details.recent}/></p>
  {details.recentError&&<p role='status'>{details.recentError}</p>}
  <p className={styles.hint}>최근 순위는 네이버가 제공한 평균이며 실시간 검색순위가 아닙니다. 금액 변경 직후에는 이전 입찰의 노출이 포함될 수 있습니다.</p>
  {details.estimates.map(item=><div key={item.device}>
   <h4>{item.device==='MOBILE'?'모바일':'PC'} · 금액 기준 참고 순위</h4>
   {item.error?<p>{item.error}</p>:<><p>{previousBid!=null&&<>변경 전 {previousBid.toLocaleString('ko-KR')}원: {bidReference(item.positions,previousBid)} → </>}{amount.toLocaleString('ko-KR')}원: <strong>{bidReference(item.positions,amount)}</strong></p><div className={styles.tableWrap}><table className={styles.table}><caption>네이버 순위별 평균 입찰가 · 부가세 별도</caption><thead><tr>{item.positions.map(p=><th scope='col' key={p.position}>{p.position}위</th>)}</tr></thead><tbody><tr>{item.positions.map(p=><td key={p.position}>{p.bid==null?'미제공':`${p.bid.toLocaleString('ko-KR')}원`}</td>)}</tr></tbody></table></div></>}
  </div>)}
  <p className={styles.hint}>참고 순위는 최근 4주 순위별 평균 입찰가와 입력 금액을 비교한 결과입니다. 광고 품질·경쟁·가중치는 반영하지 않으며 실제 노출순위를 예측하거나 보장하지 않습니다. 변경 후 실제 순위는 노출 데이터가 쌓인 뒤 다시 확인해주세요.</p>
 </section>;
}
