"use client";
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {supabase} from '../../lib/supabase';
import KakaoLoginButton from '../components/KakaoLoginButton';
import GoogleLoginButton from '../components/GoogleLoginButton';
import MaterialPilot from '../components/MaterialPilot';
import styles from '../components/MaterialPilot.module.css';
export default function DealerPage(){
 const [session,setSession]=useState(undefined),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{let alive=true;supabase.auth.getSession().then(({data})=>{if(alive)setSession(data.session)});const {data}=supabase.auth.onAuthStateChange((_,s)=>setSession(s));return()=>{alive=false;data.subscription.unsubscribe()};},[]);
 async function login(signup=false){if(busy)return;
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())){setMessage('인증 메일을 받을 수 있는 이메일 주소를 입력해주세요.');document.getElementById('dealer-email')?.focus();return;}
 if(!password || (signup && password.length<8)){setMessage(signup?'새 계정의 비밀번호를 8자 이상 입력해주세요.':'비밀번호를 입력해주세요.');document.getElementById('dealer-password')?.focus();return;}
 setBusy(true);setMessage('');try{const result=signup?await supabase.auth.signUp({email:email.trim(),password,options:{emailRedirectTo:window.location.origin+'/dealer'}}):await supabase.auth.signInWithPassword({email:email.trim(),password});if(result.error)throw result.error;if(signup)setMessage('이메일 인증 후 이 화면에서 로그인하고 대리점 이용을 신청해주세요.');}catch(e){setMessage(e.message)}finally{setBusy(false)}}
 return <main className={styles.root} style={{padding:20}}><h1>필름장이 · 대리점</h1><p>배정받은 필름 발주의 준비와 출고를 관리합니다.</p>
 {session===undefined?<p>로그인 확인 중…</p>:session?<><div className={styles.heading}><small>{session.user.email || "카카오 로그인 계정"}</small><Link href="/account/google?role=dealer" data-ui-link="action">구글 계정 연결 · 상태 확인</Link><Link href="/account/kakao?role=dealer" data-ui-link="action">카카오 계정 연결 · 상태 확인</Link><button onClick={()=>supabase.auth.signOut()}>로그아웃</button></div><MaterialPilot key={session.user.id} mode="dealer"/></>:<form className={styles.card} onSubmit={e=>{e.preventDefault();login()}}><GoogleLoginButton role="dealer" disabled={busy}/><KakaoLoginButton role="dealer" disabled={busy}/><p>또는 이메일로 로그인</p><label>이메일<input id="dealer-email" type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label>비밀번호<input id="dealer-password" aria-describedby="dealer-password-help" type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label><p id="dealer-password-help">처음 가입하시면 사용할 비밀번호를 8자 이상 입력해주세요. 이메일 인증이 필요합니다.</p>{message&&<p role="alert">{message}</p>}<button disabled={busy}>로그인</button> <button type="button" disabled={busy} onClick={()=>login(true)}>처음 이용 · 계정 만들기</button><p>기존 이메일 계정이 있다면 이메일로 로그인한 뒤 ‘카카오 계정 연결’을 이용해주세요. 대리점 전용 로그인입니다. 대리점 권한은 슈퍼관리자 승인 후 부여됩니다.</p></form>}
 {session&&message&&<p role="status">{message}</p>}</main>;
}
