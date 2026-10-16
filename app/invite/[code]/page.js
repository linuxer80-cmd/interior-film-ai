'use client';
import {use, useState} from 'react';
export default function InviteLanding({params}) {
 const {code}=use(params);const [error,setError]=useState('');
 function start(path) {
  try { localStorage.setItem('film-referral',code);window.location.assign(path); }
  catch { setError('초대 정보를 저장하지 못했습니다. 브라우저 저장 허용 후 다시 시도해주세요.'); }
 }
 if(!/^[a-f0-9]{64}$/.test(code||''))return <main><p>올바르지 않은 초대 링크입니다.</p></main>;
 return <main style={{maxWidth:480,margin:'40px auto',padding:24}}><h1>필름장이에 초대받았어요</h1>
 <p>현장 관리부터 AI 견적까지 함께 시작해보세요.</p><p>신규 가입과 이메일 인증을 완료하면 초대한 분의 친구 가입 배지에 반영됩니다. 초대를 수락해도 업체 소속으로 자동 연결되지는 않습니다.</p>
 <button onClick={()=>start('/signup')}>업체 관리자로 가입하기</button><p><button onClick={()=>start('/worker/account')}>시공자로 가입하기</button></p>
 <button onClick={()=>start('/login')}>가입·인증을 마쳤어요 · 로그인</button>
 <p>한 명만 사용 가능한 30일 유효 링크입니다. 인증 후 같은 브라우저에서 로그인해주세요. 다른 기기에서는 이 링크를 다시 열어주세요.</p>{error&&<p role='alert'>{error}</p>}<style jsx>{`
 button{width:100%;min-height:48px;padding:12px;border:1px solid #cbd5e1;border-radius:12px;background:#163153;color:white;font-size:15px;cursor:pointer;}p{line-height:1.7;color:#475569;}
 `}</style></main>;
}
