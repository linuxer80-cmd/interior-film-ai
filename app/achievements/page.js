"use client";
import {useEffect,useState} from 'react';
import AchievementBadges from '../components/AchievementBadges';
export default function AchievementsPage(){
 const [scope,setScope]=useState(null);
 useEffect(()=>setScope(new URLSearchParams(window.location.search).get('scope')==='owner'?'owner':'worker'),[]);
 return <main style={{maxWidth:960,margin:'auto',padding:'24px 18px 110px'}}><a href={scope==='owner'?'/admin':'/worker'}>‹ 홈으로</a>{scope?<AchievementBadges scope={scope}/>:<p>업적을 준비하는 중…</p>}</main>;
}
