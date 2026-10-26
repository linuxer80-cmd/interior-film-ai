'use client';
import {useRef,useState} from 'react';
import {customerCompletionTemplate} from '../../lib/customerCompletionTemplate.mjs';
import {supabase} from '../../lib/supabase';
export default function CustomerCompletionAlimtalk({siteId,active,blocked}){
 const [data,setData]=useState(null),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);const lock=useRef(false);
 async function request(send=false){if(lock.current)return;lock.current=true;setBusy(true);setNotice('');try{
 const {data:s}=await supabase.auth.getSession();const r=await fetch('/api/admin/customer-completion'+(send?'':'?siteId='+siteId),{method:send?'POST':'GET',headers:{Authorization:'Bearer '+(s.session?.access_token||''),'Content-Type':'application/json'},...(send?{body:JSON.stringify({siteId,contentHash:data.contentHash})}:{})});
 const d=await r.json();if(!r.ok)throw Error(d.error||d.reason);if(send){setNotice(d.reason);setData(null);}else setData(d);
 }catch(e){setNotice(e.message);}finally{lock.current=false;setBusy(false);}}
 return <section hidden={!active} style={{padding:20,border:'1px solid #dce3db',borderRadius:18,margin:'20px 0'}}><h3>고객 시공 완료 안내</h3><p>완료보고서를 모두 검수 승인하면 1회 자동 발송합니다. 업체 기본 입금 계좌와 현장의 계약금액을 안내합니다. 계약금액이 없으면 금액을 생략합니다.</p><p>계좌는 ‘인건비·자재비 견적서 → 업체 기본 입금 계좌’에서 등록해주세요. 표시 금액은 잔금이 아닌 계약금액입니다.</p><button type="button" disabled={busy||blocked} onClick={()=>request()}>완료 안내·발송 결과 확인</button>{data&&<><pre style={{whiteSpace:'pre-wrap',font:'inherit',lineHeight:1.7}}>{data.text}</pre>{data.reasons.map((r,i)=><p key={i}>{r}</p>)}{data.latest&&<p>최근 발송 상태: {data.latest.status}</p>}<button type="button" disabled={busy||blocked||!data.ready} onClick={()=>request(true)}>완료 안내 발송 · 1회 사용</button></>}<details style={{marginTop:16}}><summary>솔라피 등록용 템플릿 2종</summary>{[true,false].map(amount=><div key={String(amount)}><h4>{amount?'계약금액 + 계좌 안내':'금액 없이 계좌 안내'}</h4><pre style={{whiteSpace:'pre-wrap',font:'inherit'}}>{customerCompletionTemplate(amount)}</pre><button type="button" onClick={async()=>{try{await navigator.clipboard.writeText(customerCompletionTemplate(amount));setNotice('템플릿 문구를 복사했습니다.');}catch{setNotice('위 문구를 선택해 복사해주세요.');}}}>템플릿 문구 복사</button></div>)}</details>{notice&&<p role="status">{notice}</p>}</section>;
}
