'use client';
import {useEffect,useState,useRef} from 'react';
import Link from 'next/link';
import {supabase} from '../../../lib/supabase';
import '../../components/laborMarket.css';
const statuses={reserved:'접수 확인 중',requested:'발송 중',unknown:'결과 확인 필요',success:'전달 완료',failed:'실패 · 건수 복구',canceled:'취소 · 건수 복구',rejected:'접수 거절 · 건수 복구'};
const reasons={not_configured:'부트페이 키·채널·템플릿 설정이 필요합니다.',invalid_phone:'업체 정보에 올바른 휴대폰 번호를 등록해주세요.',disabled:'알림톡 사용 설정을 켜주세요.',insufficient:'발송 가능 건수가 없습니다. 서비스 관리자에게 문의해주세요.',duplicate:'이미 요청한 발송입니다. 아래 내역을 확인해주세요.'};
export default function Alimtalk(){
 const [data,setData]=useState(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const testId=useRef(null);
 async function api(body){
  const {data:s}=await supabase.auth.getSession();if(!s.session)throw Error('업체 관리자로 로그인해주세요.');
  const r=await fetch('/api/admin/alimtalk',{method:body?'POST':'GET',cache:'no-store',headers:{Authorization:`Bearer ${s.session.access_token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  const j=await r.json();if(!r.ok)throw Error(j.error || '요청 실패');return j;
 }
 async function load(){setData(await api());}
 useEffect(()=>{load().catch(e=>setMessage(e.message));},[]);
 async function action(body){if(busy)return;setBusy(true);setMessage('');try{const r=body.action==='reload'?{}:await api(body);await load();setMessage(r.reason?reasons[r.reason] || '발송 조건을 확인해주세요.':body.action==='test'?statuses[r.status] || '발송 요청을 접수했습니다.':'반영했습니다.');}catch(e){setMessage(e.message);}finally{setBusy(false);}}
 function test(){if(!testId.current)testId.current=crypto.randomUUID();action({action:'test',requestId:testId.current});}
 return <main className="labor-shell">
  <nav><Link href="/admin">← 관리자 홈</Link></nav><h1>카카오 알림톡</h1>
  <p>현장 배정·일정 변경·취소·시공 전 안내를 시공자의 카카오톡으로 보냅니다.</p>
  {message && <p role="status">{message}</p>}
  {data && <>
   {!data.configuration.ready && <p role="status">서비스 연결 준비 중입니다. 설정이 완료되면 알림톡을 사용할 수 있습니다.</p>}
   <section><h2>발송 가능 {data.account.available_count.toLocaleString()}건</h2><p>요청 시 1건을 확보하고, 실패가 확인되면 돌려드립니다. 결과 확인 중인 건은 중복 발송하지 않습니다.</p>
    <label className="check"><input type="checkbox" checked={data.account.enabled} disabled={busy || !data.configuration.ready} onChange={e=>action({action:'settings',enabled:e.target.checked})}/>우리 업체 알림톡 사용</label>
    <p>충전 판매는 준비 중입니다. 현재는 서비스 관리자가 지급한 발송 건수로 이용합니다. 앱 푸시 알림은 기존대로 이용할 수 있습니다.</p>
   </section>
   <section><h2>연결 확인</h2><p>업체 등록 연락처: {data.phone || '미등록'}</p><p>아래 버튼을 누르면 실제 알림톡 1건을 보내며 발송 가능 건수 1건을 사용합니다.</p>
    <button disabled={busy || !data.configuration.ready || !data.configuration.templates.TEST || !data.account.enabled || data.account.available_count<1} onClick={test}>업체 연락처로 연결 확인 보내기</button>
   </section>
   <section><h2>최근 발송 내역</h2><button disabled={busy} onClick={()=>action({action:'reload'})}>새로고침</button>
    {!data.deliveries.length && <p>아직 발송 내역이 없습니다.</p>}
    {data.deliveries.map(d=><article key={d.id} style={{padding:'16px 0',borderBottom:'1px solid #ddd'}}><strong>{statuses[d.status]}</strong><p>{d.recipient_mask} · {new Date(d.created_at).toLocaleString('ko-KR')}</p>{d.error_code && <p>오류 코드: {d.error_code}</p>}{['reserved','requested','unknown'].includes(d.status)&&<button disabled={busy} onClick={()=>action({action:'refresh',id:d.id})}>결과 확인</button>}</article>)}
   </section>
  </>}
 </main>;
}
