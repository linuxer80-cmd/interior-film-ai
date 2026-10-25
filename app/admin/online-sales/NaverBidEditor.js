'use client';
import {useEffect,useRef,useState} from 'react';
import styles from './sales.module.css';
export default function NaverBidEditor({keyword,busy,onCancel,onSave}){
 const input=useRef(null),[amount,setAmount]=useState(String(keyword.bidAmt));
 useEffect(()=>{input.current?.focus();},[]);
 const delta=Math.max(10,Math.floor(keyword.bidAmt*0.1/10)*10),min=Math.max(70,keyword.bidAmt-delta),max=Math.min(100000,keyword.bidAmt+delta),value=Number(amount);
 const valid=amount.trim()!==''&&Number.isSafeInteger(value)&&value%10===0&&value>=min&&value<=max&&(value!==keyword.bidAmt||keyword.useGroupBidAmt);
 return <form className={styles.bidEditor} aria-label={`${keyword.keyword} 입찰 수정`} onSubmit={event=>{event.preventDefault();if(valid&&!busy)onSave(value);}}>
  <h3>{keyword.keyword} 입찰 수정</h3>
  <p>현재 {keyword.bidAmt.toLocaleString('ko-KR')}원 · {keyword.useGroupBidAmt?'그룹 입찰가 사용':'개별 입찰가 사용'}</p>
  <label>변경할 개별 입찰가 (원 · 부가세 별도)<input ref={input} type='number' inputMode='numeric' required min={min} max={max} step={10} disabled={busy} value={amount} onChange={event=>setAmount(event.target.value)}/></label>
  <p className={styles.hint}>입력 범위 {min.toLocaleString('ko-KR')}~{max.toLocaleString('ko-KR')}원 · 10원 단위. 선택한 키워드만 수정하며 그룹 입찰가와 하루 예산은 유지합니다. 기기·타겟 가중치에 따라 실제 입찰이 달라질 수 있습니다.</p>
  {keyword.useGroupBidAmt&&<p>저장하면 이 키워드는 그룹 입찰가 대신 개별 입찰가를 사용합니다.</p>}
  <p aria-live='polite'>변경: {keyword.bidAmt.toLocaleString('ko-KR')}원 → {valid?value.toLocaleString('ko-KR')+'원':'입력값을 확인해주세요'}</p>
  <div className={styles.actions}><button disabled={busy||!valid}>{busy?'저장 및 재확인 중…':'입찰가 저장 및 확인'}</button><button type='button' className={styles.secondary} disabled={busy} onClick={onCancel}>취소</button></div>
 </form>;
}
