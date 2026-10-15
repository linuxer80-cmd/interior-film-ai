'use client';
import {useEffect,useState,useRef} from 'react';
import Link from 'next/link';
import {supabase} from '../../../lib/supabase';
import '../../components/laborMarket.css';
export default function AlimtalkAdmin(){
 const [data,setData]=useState(null),[companyId,setCompanyId]=useState(''),[quantity,setQuantity]=useState('10'),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const requestId=useRef(null);
 async function api(body){const {data:s}=await supabase.auth.getSession();if(!s.session)throw Error('슈퍼관리자로 로그인해주세요.');const r=await fetch('/api/super-admin/alimtalk',{method:body?'POST':'GET',cache:'no-store',headers:{Authorization:`Bearer ${s.session.access_token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const j=await r.json();if(!r.ok)throw Error(j.error);return j;}
 useEffect(()=>{api().then(setData).catch(e=>setMessage(e.message));},[]);
 async function grant(e){e.preventDefault();if(busy)return;setBusy(true);try{if(!requestId.current)requestId.current=crypto.randomUUID();await api({requestId:requestId.current,companyId,quantity:Number(quantity),reason});requestId.current=null;setData(await api());setMessage('발송 건수를 지급했습니다.');setReason('');}catch(e){setMessage(e.message);}finally{setBusy(false);}}
 return <main className="labor-shell"><nav><Link href="/super-admin">← 슈퍼관리자</Link></nav><h1>알림톡 운영</h1>{message&&<p role="status">{message}</p>}{data&&<>
 <p>부트페이 연결: {data.configuration.ready?'키·발신 채널 설정됨 (실제 발송 확인 필요)':'환경변수 설정 필요'}</p>
 <p>템플릿: {Object.entries(data.configuration.templates).map(([k,v])=>`${k} ${v?'설정됨':'미설정'}`).join(' / ')}</p>
 <form onSubmit={grant}><fieldset disabled={busy}><legend>업체 발송 건수 지급</legend><p>실제 결제를 처리하는 버튼이 아닙니다. 부트페이 충전 잔액은 별도로 필요합니다.</p>
 <label>업체<select required value={companyId} onChange={e=>{setCompanyId(e.target.value);requestId.current=null;}}><option value="">선택해주세요</option>{data.companies.map(c=><option key={c.id} value={c.id}>{c.company_name}</option>)}</select></label>
 <label>지급 건수<input required type="number" min="1" max="1000000" value={quantity} onChange={e=>{setQuantity(e.target.value);requestId.current=null;}}/></label>
 <label>지급 사유<input required minLength={3} maxLength={500} value={reason} onChange={e=>{setReason(e.target.value);requestId.current=null;}} placeholder="예: 초기 연결 확인용 10건 지원"/></label><button>건수 지급</button></fieldset></form>
 <h2>업체별 잔여 건수</h2>{data.accounts.map(a=><p key={a.company_id}>{data.companies.find(c=>c.id===a.company_id)?.company_name || a.company_id}: {a.available_count}건 · {a.enabled?'사용':'중지'}</p>)}
 <h2>최근 지급 내역</h2>{data.entries.map(e=><p key={e.id}>{data.companies.find(c=>c.id===e.company_id)?.company_name || e.company_id} · {e.quantity}건 · {e.reason}</p>)}
 </>}</main>;
}
