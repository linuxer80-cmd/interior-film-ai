'use client';
import {useEffect,useRef,useState} from 'react';
import VirtualInstallPanel from '../../../VirtualInstallPanel';
import FilmColorPicker from '../../../FilmColorPicker';
import styles from './portal.module.css';
export default function CustomerVirtualInstall({token,company,remaining}){
 const [images,setImages]=useState([]),[film,setFilm]=useState(null),[message,setMessage]=useState('');
 const [left,setLeft]=useState(remaining);
 const cameraInput=useRef(null),fileInput=useRef(null);
 const urls=useRef([]);useEffect(()=>()=>urls.current.forEach(URL.revokeObjectURL),[]);
 async function updateRemaining(data){
 if(Number.isInteger(data.portalRemaining)){setLeft(data.portalRemaining);return;}
 try{const r=await fetch("/api/customer-portal/status",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token}),cache:"no-store"});const d=await r.json();if(r.ok)setLeft(d.remaining);}catch{}
 }
 function upload(e){const file=e.target.files?.[0];e.target.value='';if(!file)return;if(!file.type.startsWith('image/')||file.size>10*1024*1024){setMessage('10MB 이하의 사진을 선택해주세요.');return;}urls.current.forEach(URL.revokeObjectURL);const preview=URL.createObjectURL(file);urls.current=[preview];setImages([{id:crypto.randomUUID(),file,preview}]);setMessage('');}
 return <main className={styles.page}>
 <header className={styles.header}><strong>{company.company_name}</strong><a href={'/customer/site/'+encodeURIComponent(token)}>시공 안내로 돌아가기</a></header>
 <section className={styles.welcome}><span className={styles.badge}>고객 전용 체험 · 남은 {left}회</span><h1>우리 집 미리시공</h1><p>사진을 넣고 원하는 필름으로 바꿔보세요.</p></section>
  <section id="virtual" className={styles.card}><h2>우리 집 미리시공</h2><p>1. 시공할 공간의 사진을 선택해주세요.</p><p className={styles.muted}>얼굴이나 개인정보가 없는 사진을 이용해주세요. 선택한 사진은 미리시공을 위해 AI 서비스로 전송됩니다.</p><div className={styles.photoActions}>
    <button type="button" className={styles.secondary} onClick={()=>cameraInput.current?.click()}>사진 찍기</button>
    <button type="button" className={styles.secondary} onClick={()=>fileInput.current?.click()}>사진·파일 선택</button>
  </div>
  <input ref={cameraInput} aria-label="카메라로 사진 찍기" type="file" accept="image/*" capture="environment" hidden onChange={upload}/>
  <input ref={fileInput} aria-label="저장된 사진 파일 선택" type="file" accept="image/*" hidden onChange={upload}/>
  {images[0]&&<p className={styles.muted}>선택한 사진: {images[0].file.name}</p>}{message&&<p role="alert">{message}</p>}
  {images[0]&&<img className={styles.photo} src={images[0].preview} alt="선택한 우리 집 사진"/>}
  <p>2. 원하는 필름을 골라주세요.</p><FilmColorPicker onSelect={setFilm}/>
  {film&&<p>선택한 필름: {film.brand} {film.code||film.product_code} {film.name}</p>}
  {images.length>0&&film&&remaining>0&&<VirtualInstallPanel images={images} product={film} companySlug={company.slug} customerToken={token} onAttempt={updateRemaining}/>}
  {left===0&&<p>무료 체험을 모두 이용했습니다. 추가 상담은 업체에 문의해주세요.</p>}
  <p className={styles.muted}>다른 기기에서도 체험 횟수를 함께 사용합니다. 생성 결과는 페이지를 닫기 전에 저장해주세요. 통신 시간 초과 등 결과를 확인하지 못한 요청도 횟수에 포함될 수 있습니다.</p></section>
 </main>;
}
