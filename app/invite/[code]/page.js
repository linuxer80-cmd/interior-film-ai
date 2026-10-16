'use client';
import {use, useState} from 'react';
export default function InviteLanding({params}) {
 const {code}=use(params);const [error,setError]=useState('');
 function start(path) {
  try { localStorage.setItem('film-referral',code);window.location.assign(path); }
  catch { setError('초대 정보를 저장하지 못했습니다. 브라우저 저장 허용 후 다시 시도해주세요.'); }
 }
 if(!/^[a-f0-9]{64}$/.test(code||''))return <main><p>올바르지 않은 초대 링크입니다.</p></main>;
 return <main className='invite-welcome'>
 <a className='brand' href='/'>필름장이</a>
 <section className='welcome-card'>
  <span className='welcome-mark' aria-hidden='true'>＋</span>
  <small className='kicker'>함께 일하는 즐거움</small>
  <h1>필름장이에<br/>초대받았어요</h1>
  <p className='intro'>현장 관리부터 AI 견적까지,<br/>함께 더 편하게 시작해보세요.</p>
  <div className='choices'>
   <button onClick={()=>start('/signup')}><span><strong>업체 관리자로 시작</strong><small>현장 · 자재 · 시공자 관리</small></span><span aria-hidden='true'>→</span></button>
   <button onClick={()=>start('/worker/account')}><span><strong>시공자로 시작</strong><small>내 일정 · 구직 · 스마트 재단</small></span><span aria-hidden='true'>→</span></button>
  </div>
  <button className='login' onClick={()=>start('/login')}>이미 회원이라면 로그인·초대 확인 →</button>
  {error&&<p role='alert'>{error}</p>}
  <details><summary>초대 가입 안내</summary><p>로그인·이메일 인증 후 초대를 확인하면 초대한 분의 초대 배지에 반영됩니다. 신규 가입자는 친구 가입 배지에도 반영됩니다. 같은 계정은 한 번만 인정됩니다. 업체 소속으로 자동 연결되지는 않습니다.</p><p>한 명만 사용하는 30일 유효 링크입니다. 인증 후 같은 브라우저에서 로그인해주세요. 다른 기기에서는 이 링크를 다시 열어주세요.</p></details>
 </section>
 <style jsx>{`
  .invite-welcome {max-width:480px;margin:0 auto;padding:28px 18px 60px;color:#203c48;box-sizing:border-box;}
  .brand {display:inline-block;color:#203c48;text-decoration:none;font-size:17px;font-weight:800;margin-bottom:24px;min-height:44px;line-height:44px;}
  .welcome-card {background:#fffdf8;border:1px solid #ded7c9;border-radius:24px;padding:24px;box-shadow:0 8px 24px #34483806;}
  .welcome-mark {display:flex;align-items:center;justify-content:center;width:52px;height:52px;border-radius:16px;background:#f6edda;color:#8c6928;font-size:32px;margin-bottom:20px;}
  .kicker {color:#8c6928;font-size:12px;}
  h1 {font-size:30px;line-height:1.35;margin:8px 0 12px;letter-spacing:-.04em;}
  .intro {font-size:14px;line-height:1.7;color:#6b7877;margin:0 0 24px;}
  .choices {display:grid;gap:10px;}
  button {font:inherit;cursor:pointer;}
  .choices button {display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;text-align:left;padding:16px;border:1px solid #c9d5d8;border-radius:14px;background:#edf5f1;color:#203c48;min-height:76px;}
  .choices button:first-child {background:#203f4b;color:#fff;border-color:#203f4b;}
  .choices strong {display:block;font-size:15px;}
  .choices small {display:block;margin-top:5px;font-size:12px;opacity:.8;}
  .login {width:100%;min-height:48px;border:0;background:transparent;color:#526763;font-size:13px;margin:10px 0;}
  details {border-top:1px solid #e2e5dd;margin-top:6px;}
  summary {cursor:pointer;font-size:13px;padding:14px 0;color:#526763;}
  details p {font-size:12px;line-height:1.7;color:#6b7877;}
  [role=alert] {font-size:13px;color:#b91c1c;}
  button:focus-visible,a:focus-visible,summary:focus-visible {outline:3px solid #297d92;outline-offset:3px;}
 `}</style></main>;
}
