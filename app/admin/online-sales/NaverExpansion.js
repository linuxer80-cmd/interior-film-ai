'use client';
import {useState} from 'react';
import {expansionSuggestions} from '../../../lib/naverExpansionSuggestions.mjs';
import styles from './sales.module.css';
export default function NaverExpansion({groups,api}){
 const [groupId,setGroupId]=useState(''),[text,setText]=useState(''),[bidAmt,setBidAmt]=useState(200),[plan,setPlan]=useState(null),[result,setResult]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 function reset(){setPlan(null);setResult(null);setError('');}
 async function run(execute){
  setBusy(true);setError('');
  try{const body={action:execute?'addKeywords':'previewExpansion',groupId,bidAmt:Number(bidAmt),keywords:text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean),...(execute?{planId:plan.planId}:{})};const value=await api(body);if(execute){setResult(value);setPlan(null);}else{setPlan(value);setResult(null);}}
  catch(e){setError(e.message);setPlan(null);}finally{setBusy(false);}
 }
 return <section className={styles.card}><h2>키워드 확장</h2><p>선택한 그룹의 기존 키워드와 중복을 제외합니다. 신규 키워드는 심사 후 노출될 수 있으며 클릭 시 광고비가 발생합니다. 지역명 키워드 추가는 지역 타겟 설정 변경과 다릅니다.</p>
 <form className={styles.form} onSubmit={e=>{e.preventDefault();run(false);}}>
 <label>등록할 광고그룹<select required disabled={busy} value={groupId} onChange={e=>{setGroupId(e.target.value);reset();}}><option value=''>광고그룹 선택</option>{groups.filter(g=>!g.userLock&&g.status!=='DELETED').map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
 <label>신규 키워드 입찰가 (원)<input type='number' min='70' max='300' step='10' required disabled={busy} value={bidAmt} onChange={e=>{setBidAmt(e.target.value);reset();}}/></label>
 <button type='button' className={styles.secondary} disabled={busy} onClick={()=>{setText(expansionSuggestions().join('\n'));reset();}}>인천·부천·일산 시공 키워드 채우기</button>
 <label>추가할 키워드 (한 줄에 하나 · 최대 100개)<textarea rows={9} maxLength={3000} required disabled={busy} value={text} onChange={e=>{setText(e.target.value);reset();}}/></label>
 <button disabled={busy||!groupId}>{busy?'확인 중…':'중복·예산 확인하고 미리보기'}</button></form>
 {error&&<p role='alert' className={styles.error}>{error}</p>}
 {plan&&<div><h3>{plan.groupName} 등록 미리보기</h3><p>기존 {plan.existingCount}개 · 추가 {plan.keywords.length}개 · 중복 제외 {plan.duplicates.length}개 · 그룹 한도로 제외 {plan.overflow.length}개</p><p>개별 입찰가 {plan.bidAmt}원 · 예산 변경 없음</p><p>{plan.keywords.join(', ')||'추가 가능한 키워드가 없습니다.'}</p>{plan.overflow.length>0&&<p>다른 시공 관련 광고그룹을 선택해 나머지를 확인해주세요.</p>}<button disabled={busy||!plan.keywords.length} onClick={()=>run(true)}>위 {plan.keywords.length}개 실제 등록</button></div>}
 {result&&<div role='status'><h3>등록 결과</h3><p>등록 응답 확인 {result.created.length}개 · 실패 {result.failed.length}개 · 확인 필요 {result.uncertain.length}개</p><p>{result.created.map(r=>r.keyword).join(', ')}</p>{(result.failed.length>0||result.uncertain.length>0)&&<p>실패·확인 필요: {[...result.failed,...result.uncertain].join(', ')}. 재시도 전 미리보기로 확인해주세요.</p>}<p>실제 심사·노출 상태는 키워드 점검에서 다시 조회해주세요.</p></div>}
 </section>;
}
