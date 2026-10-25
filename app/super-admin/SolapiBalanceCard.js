"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import {supabase} from '../../lib/supabase';
const money=value=>new Intl.NumberFormat('ko-KR',{maximumFractionDigits:2}).format(value);
export default function SolapiBalanceCard(){
 const [data,setData]=useState(null),[busy,setBusy]=useState(true),[error,setError]=useState('');
 const lock=useRef(false),lastRequest=useRef(0);
 const load=useCallback(async(force=false)=>{
  if(lock.current||(!force&&Date.now()-lastRequest.current<5000))return;
  lock.current=true;lastRequest.current=Date.now();setBusy(true);setError('');
  try{
   const session=await supabase.auth.getSession();if(!session.data?.session)throw Error('슈퍼관리자로 로그인해주세요.');
   const response=await fetch('/api/super-admin/solapi-balance',{headers:{Authorization:'Bearer '+session.data.session.access_token},cache:'no-store'});
   const result=await response.json();if(!response.ok||!result.available)throw Error(result.error||'잔액을 조회하지 못했습니다.');setData(result);
  }catch(e){setData(null);setError(e.message||'잔액을 조회하지 못했습니다.');}finally{lock.current=false;setBusy(false);}
 },[]);
 useEffect(()=>{load();const refresh=()=>{if(document.visibilityState==='visible')load();};window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);return()=>{window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);};},[load]);
 return <section className="solapi-card" aria-label="솔라피 발송 잔액" aria-busy={busy}>
  <div className="heading"><h2>솔라피 발송 잔액</h2><button type="button" disabled={busy} onClick={()=>load(true)}>{busy?'조회 중…':'잔액 새로고침'}</button></div>
  <div aria-live="polite">{data?<><p className="total">{money(data.total)}<span>원</span></p><p>잔액·예치금 {money(data.balance)}원 <span aria-hidden="true">＋</span> 포인트 {money(data.point)}P</p>{data.total<=0&&<p className="warning">발송에 사용할 금액이 없습니다. 솔라피에서 충전해주세요.</p>}<p className="muted">조회 {new Date(data.checkedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}</p></>:<p role="status">{busy?'솔라피 잔액을 확인하고 있습니다.':error||'잔액 조회 불가'}</p>}</div>
  <p className="muted">예치금은 부가세를 제외한 발송 가능 금액으로 표시됩니다. 업체별 앱 충전 횟수와 별개입니다.</p>
  <a className="charge" href="https://console.solapi.com/balance" target="_blank" rel="noopener noreferrer">솔라피 충전 페이지 열기 ↗</a>
  <style jsx>{`.solapi-card{box-sizing:border-box;padding:20px;margin:18px 0;background:#f3f8f4;border:1px solid #cbdccd;border-radius:16px;color:#263c31}.heading{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}h2{font-size:18px;margin:0}p{font-size:14px;line-height:1.6;margin:10px 0;overflow-wrap:anywhere}.total{font-size:32px;font-weight:800;margin:12px 0 4px}.total span{font-size:18px;margin-left:5px}.muted{font-size:12px;color:#596b60}.warning{color:#9c4319}button,.charge{box-sizing:border-box;min-height:44px;padding:10px 14px;border:1px solid #c1d1c5;border-radius:9px;font:inherit;font-size:14px}button{background:white;color:#285340;cursor:pointer}button:disabled{opacity:.6;cursor:wait}.charge{display:inline-flex;align-items:center;background:#285340;color:white;text-decoration:none;font-weight:700;margin-top:6px}button:focus-visible,.charge:focus-visible{outline:3px solid #6088b4;outline-offset:3px}@media(max-width:420px){.charge{display:flex;justify-content:center;width:100%}.total{font-size:28px}}`}</style>
 </section>;
}
