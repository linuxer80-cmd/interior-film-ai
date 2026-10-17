"use client";
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {supabase} from '../../lib/supabase';
import MaterialPilot from '../components/MaterialPilot';
import styles from '../components/MaterialPilot.module.css';
export default function DealerPage(){
 const [session,setSession]=useState(undefined),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{let alive=true;supabase.auth.getSession().then(({data})=>{if(alive)setSession(data.session)});const {data}=supabase.auth.onAuthStateChange((_,s)=>setSession(s));return()=>{alive=false;data.subscription.unsubscribe()};},[]);
 async function login(signup=false){if(busy)return;setBusy(true);setMessage('');try{const result=signup?await supabase.auth.signUp({email,password,options:{emailRedirectTo:window.location.origin+'/dealer'}}):await supabase.auth.signInWithPassword({email,password});if(result.error)throw result.error;if(signup)setMessage('이메일 인증 후 이 화면에서 로그인하고 대리점 이용을 신청해주세요.');}catch(e){setMessage(e.message)}finally{setBusy(false)}}
 return <main className={styles.root} style={{padding:20}}><nav aria-label="앱 로그인 선택" style={{display:'flex',flexWrap:'wrap',gap:8,marginBottom:20}}>
 <Link href="/login?role=owner" data-ui-link="action">업체 로그인</Link>
 <Link href="/login?role=worker" data-ui-link="action">시공자 로그인</Link>
 <Link href="/start" data-ui-link="action">앱 시작화면</Link>
 </nav><h1>필름장이 · 대리점</h1><p>배정받은 필름 발주의 준비와 출고를 관리합니다.</p>
 {session===undefined?<p>로그인 확인 중…</p>:session?<><div className={styles.heading}><small>{session.user.email}</small><Link href="/admin" data-ui-link="action">업체 관리자 홈</Link><button onClick={()=>supabase.auth.signOut()}>로그아웃</button></div><MaterialPilot key={session.user.id} mode="dealer"/></>:<form className={styles.card} onSubmit={e=>{e.preventDefault();login()}}><label>이메일<input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label>비밀번호<input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label><button disabled={busy}>로그인</button> <button type="button" disabled={busy||!email||password.length<8} onClick={()=>login(true)}>처음 이용 · 계정 만들기</button><p>대리점 전용 로그인입니다. 업체 업무를 보시려면 위의 ‘업체 로그인’을 눌러주세요. 대리점 권한은 슈퍼관리자 승인 후 부여됩니다.</p></form>}
 {message&&<p role="status">{message}</p>}</main>;
}
