'use client';
import ShowcasePhotos from '../../../components/ShowcasePhotos';
import styles from './portal.module.css';
function safeLink(value){try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.href:null;}catch{return null;}}
export default function CustomerPortal({token,site,company,profile,cases,remaining,expiresAt}){
 const phone=profile?.public_phone||company.phone||'';
 const dates=[...new Set(site.work_dates?.length?site.work_dates:site.schedule_date?[site.schedule_date]:[])].sort();
 const states={consulting:'상담 중',scheduled:'예약 확정',in_progress:'시공 중',completed:'시공 완료'};
 return <main className={styles.page}>
  <header className={styles.header}><strong>{company.company_name}</strong><span>나의 시공 안내</span></header>
  <section className={styles.welcome}><small>CUSTOMER CARE</small><h1>{site.customer_name||site.site_name}님,<br/>공간의 변화를 함께 준비해요.</h1><p>일정을 확인하고 우리 집에 어울리는 필름을 먼저 만나보세요.</p></section>
  <section className={styles.card}><span className={styles.badge}>{states[site.status]||'일정 확인'}</span><h2>{site.site_name}</h2><p>시공 일정</p><strong>{dates.length?dates.map(d=>d.slice(0,10)).join(' · '):'일정을 상담하고 있어요'}</strong><p className={styles.muted}>일정 변경이나 궁금한 점은 담당 업체에 문의해주세요.</p></section>
  <section className={styles.feature}><span className={styles.badge}>고객 전용 체험 · 남은 {remaining}회</span><h2>우리 집, 미리 시공해 볼까요?</h2><p>사진과 원하는 필름을 선택하고 우리 집의 변화를 미리 확인해보세요.</p><a className={styles.primary} href={'/customer/site/'+encodeURIComponent(token)+'/preview'} target="_blank" rel="noopener noreferrer">미리시공 시작하기 →</a><small>현장당 무료 3회 · 이미지 생성 요청 기준<br/>실제 색상·질감은 실물 샘플로 확인해주세요.</small></section>
  <section className={styles.card}><h2>색상과 질감을 더 자세히</h2><p>다양한 필름 샘플을 둘러보고 마음에 드는 제품을 골라보세요.</p><a className={styles.secondary} href={'/samples?company='+encodeURIComponent(company.slug)} target="_blank" rel="noopener noreferrer">필름 샘플 전체 보기 ↗</a></section>
  <section className={styles.card}><h2>이렇게 달라졌어요</h2><p>우리 업체가 시공한 실제 전·후 사례예요.</p>{cases.length?cases.slice(0,4).map(c=><article key={c.id}><h3>{c.title}</h3><ShowcasePhotos before={c.before} after={c.after} title={c.title}/></article>):<p className={styles.muted}>공개된 시공 사례를 준비하고 있습니다.</p>}</section>
  <section className={styles.card}><h2>더 많은 시공 이야기</h2>{safeLink(profile?.blog_url)&&<a className={styles.secondary} href={safeLink(profile.blog_url)} target="_blank" rel="noopener noreferrer">시공 블로그 보기 ↗</a>}{safeLink(profile?.instagram_url)&&<a className={styles.secondary} href={safeLink(profile.instagram_url)} target="_blank" rel="noopener noreferrer">인스타그램 보기 ↗</a>}{!safeLink(profile?.blog_url)&&!safeLink(profile?.instagram_url)&&<p className={styles.muted}>업체 소식 링크를 준비하고 있습니다.</p>}</section>
  <footer><strong>{company.company_name}</strong><p>고객 전용 링크입니다. 다른 사람에게 공유하지 마세요.</p><small>링크 이용 기한: {new Date(expiresAt).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'})}</small></footer>
  {phone&&<a className={styles.contact} href={'tel:'+phone.replace(/[^+\d]/g,'')}>업체에 문의하기 · {phone}</a>}
 </main>;
}
