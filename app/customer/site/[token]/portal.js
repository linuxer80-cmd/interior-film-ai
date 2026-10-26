'use client';
import {useEffect,useRef,useState} from 'react';
import VirtualInstallPanel from '../../../VirtualInstallPanel';
import FilmColorPicker from '../../../FilmColorPicker';
import ShowcasePhotos from '../../../components/ShowcasePhotos';
import styles from './portal.module.css';
function safeLink(value){try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.href:null;}catch{return null;}}
export default function CustomerPortal({token,site,company,profile,cases,remaining,expiresAt}){
 const [images,setImages]=useState([]),[film,setFilm]=useState(null),[message,setMessage]=useState('');
 const [left,setLeft]=useState(remaining);
 const urls=useRef([]);useEffect(()=>()=>urls.current.forEach(URL.revokeObjectURL),[]);
 const phone=profile?.public_phone||company.phone||'';
 const dates=[...new Set(site.work_dates?.length?site.work_dates:site.schedule_date?[site.schedule_date]:[])].sort();
 const states={consulting:'상담 중',scheduled:'예약 확정',in_progress:'시공 중',completed:'시공 완료'};
 async function updateRemaining(data){
 if(Number.isInteger(data.portalRemaining)){setLeft(data.portalRemaining);return;}
 try{const r=await fetch("/api/customer-portal/status",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token}),cache:"no-store"});const d=await r.json();if(r.ok)setLeft(d.remaining);}catch{}
 }
 function upload(e){const file=e.target.files?.[0];if(!file)return;if(!file.type.startsWith('image/')||file.size>10*1024*1024){setMessage('10MB 이하의 사진을 선택해주세요.');return;}urls.current.forEach(URL.revokeObjectURL);const preview=URL.createObjectURL(file);urls.current=[preview];setImages([{id:crypto.randomUUID(),file,preview}]);setMessage('');}
 return <main className={styles.page}>
  <header className={styles.header}><strong>{company.company_name}</strong><span>나의 시공 안내</span></header>
  <section className={styles.welcome}><small>CUSTOMER CARE</small><h1>{site.customer_name||site.site_name}님,<br/>공간의 변화를 함께 준비해요.</h1><p>일정을 확인하고 우리 집에 어울리는 필름을 먼저 만나보세요.</p></section>
  <section className={styles.card}><span className={styles.badge}>{states[site.status]||'일정 확인'}</span><h2>{site.site_name}</h2><p>시공 일정</p><strong>{dates.length?dates.map(d=>d.slice(0,10)).join(' · '):'일정을 상담하고 있어요'}</strong><p className={styles.muted}>일정 변경이나 궁금한 점은 담당 업체에 문의해주세요.</p></section>
  <section className={styles.feature}><span className={styles.badge}>고객 전용 체험 · 남은 {left}회</span><h2>우리 집, 미리 시공해 볼까요?</h2><p>사진과 원하는 필름을 선택하면 기존 미리시공 기능으로 변화를 확인할 수 있어요.</p><a className={styles.primary} href="#virtual">미리시공 시작하기 →</a><small>현장당 무료 3회 · 이미지 생성 요청 기준<br/>실제 색상·질감은 실물 샘플로 확인해주세요.</small></section>
  <section id="virtual" className={styles.card}><h2>우리 집 미리시공</h2><p>1. 시공할 공간의 사진을 선택해주세요.</p><p className={styles.muted}>얼굴이나 개인정보가 없는 사진을 이용해주세요. 선택한 사진은 미리시공을 위해 AI 서비스로 전송됩니다.</p><input aria-label="시공할 공간 사진" type="file" accept="image/*" onChange={upload}/>{message&&<p role="alert">{message}</p>}
  {images[0]&&<img className={styles.photo} src={images[0].preview} alt="선택한 우리 집 사진"/>}
  <p>2. 원하는 필름을 골라주세요.</p><FilmColorPicker onSelect={setFilm}/>
  {film&&<p>선택한 필름: {film.brand} {film.code||film.product_code} {film.name}</p>}
  {images.length>0&&film&&remaining>0&&<VirtualInstallPanel images={images} product={film} companySlug={company.slug} customerToken={token} onAttempt={updateRemaining}/>}
  {left===0&&<p>무료 체험을 모두 이용했습니다. 추가 상담은 업체에 문의해주세요.</p>}
  <p className={styles.muted}>다른 기기에서도 체험 횟수를 함께 사용합니다. 생성 결과는 페이지를 닫기 전에 저장해주세요. 통신 시간 초과 등 결과를 확인하지 못한 요청도 횟수에 포함될 수 있습니다.</p></section>
  <section className={styles.card}><h2>색상과 질감을 더 자세히</h2><p>다양한 필름 샘플을 둘러보고 마음에 드는 제품을 골라보세요.</p><a className={styles.secondary} href={'/samples?company='+encodeURIComponent(company.slug)} target="_blank" rel="noopener noreferrer">필름 샘플 전체 보기 ↗</a></section>
  <section className={styles.card}><h2>이렇게 달라졌어요</h2><p>우리 업체가 시공한 실제 전·후 사례예요.</p>{cases.length?cases.slice(0,4).map(c=><article key={c.id}><h3>{c.title}</h3><ShowcasePhotos before={c.before} after={c.after} title={c.title}/></article>):<p className={styles.muted}>공개된 시공 사례를 준비하고 있습니다.</p>}</section>
  <section className={styles.card}><h2>더 많은 시공 이야기</h2>{safeLink(profile?.blog_url)&&<a className={styles.secondary} href={safeLink(profile.blog_url)} target="_blank" rel="noopener noreferrer">시공 블로그 보기 ↗</a>}{safeLink(profile?.instagram_url)&&<a className={styles.secondary} href={safeLink(profile.instagram_url)} target="_blank" rel="noopener noreferrer">인스타그램 보기 ↗</a>}{!safeLink(profile?.blog_url)&&!safeLink(profile?.instagram_url)&&<p className={styles.muted}>업체 소식 링크를 준비하고 있습니다.</p>}</section>
  <footer><strong>{company.company_name}</strong><p>고객 전용 링크입니다. 다른 사람에게 공유하지 마세요.</p><small>링크 이용 기한: {new Date(expiresAt).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'})}</small></footer>
  {phone&&<a className={styles.contact} href={'tel:'+phone.replace(/[^+\d]/g,'')}>업체에 문의하기 · {phone}</a>}
 </main>;
}
