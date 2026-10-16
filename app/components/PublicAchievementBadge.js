"use client";
import {BadgeArt} from './AchievementBadges';

export default function PublicAchievementBadge({badge,company=false}){
 if(!badge)return null;
 return <div aria-label={company?'업체 대표 배지':'시공자 대표 배지'} style={{display:'flex',alignItems:'center',gap:10,margin:'12px 0',padding:10,border:'1px solid #e3dccb',borderRadius:12,background:'#fffcf3'}}>
  <BadgeArt badge={badge} size={60}/>
  <span style={{minWidth:0,overflowWrap:'anywhere'}}>
   <small style={{display:'block',color:'#695b3a'}}>{company?'업체':'시공자'} 대표 배지</small>
   <strong style={{display:'block'}}>{badge.title}</strong>
   <small style={{display:'block',color:'#667085'}}>앱 활동 기록 · 시공 자격 인증 아님</small>
  </span>
 </div>;
}
