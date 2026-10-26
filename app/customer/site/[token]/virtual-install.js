'use client';
import {useEffect,useRef,useState} from 'react';
import VirtualInstallPanel from '../../../VirtualInstallPanel';
import FilmColorPicker from '../../../FilmColorPicker';
import {prepareImage} from '../../../utils/imageUtils';
import {virtualPhotoScope} from '../../../../lib/virtualPhotoScope.mjs';
import styles from './portal.module.css';
export default function CustomerVirtualInstall({token,company,remaining}){
 const [images,setImages]=useState([]),[film,setFilm]=useState(null),[message,setMessage]=useState('');
 const [left,setLeft]=useState(remaining);
 const [analyzing,setAnalyzing]=useState(false);
 const analysisRun=useRef(0),analysisRequest=useRef(null);
 useEffect(()=>()=>{analysisRun.current++;analysisRequest.current?.abort();},[]);
 const cameraInput=useRef(null),fileInput=useRef(null);
 const urls=useRef([]);useEffect(()=>()=>urls.current.forEach(URL.revokeObjectURL),[]);
 async function updateRemaining(data){
 if(Number.isInteger(data.portalRemaining)){setLeft(data.portalRemaining);return;}
 try{const r=await fetch("/api/customer-portal/status",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token}),cache:"no-store"});const d=await r.json();if(r.ok)setLeft(d.remaining);}catch{}
 }
 async function upload(e){
 const file=e.target.files?.[0];e.target.value='';if(!file)return;
 if(!file.type.startsWith('image/')||file.size>25*1024*1024){setMessage('25MB 이하의 사진을 선택해주세요.');return;}
 const run=++analysisRun.current;analysisRequest.current?.abort();setImages([]);setMessage('사진을 준비하고 있습니다.');setAnalyzing(true);
 try{const prepared=await prepareImage(file);if(run!==analysisRun.current){URL.revokeObjectURL(prepared.preview);return;}
 urls.current.forEach(URL.revokeObjectURL);urls.current=[prepared.preview];
 setImages([{id:crypto.randomUUID(),file:prepared.file,preview:prepared.preview}]);setMessage('');
 }catch{if(run===analysisRun.current)setMessage('사진을 열지 못했습니다. JPG 또는 PNG 사진으로 다시 선택해주세요.');}
 finally{if(run===analysisRun.current)setAnalyzing(false);}
 }
 async function analyze(){
 if(analyzing||!images[0])return;
 const run=++analysisRun.current;const controller=new AbortController();analysisRequest.current=controller;setAnalyzing(true);setMessage('사진을 분석하고 있습니다');
 const form=new FormData();form.append('images',images[0].file);form.append('company_slug',company.slug);form.append('customer_token',token);
 try{const r=await fetch('/api/estimate-analyze',{method:'POST',body:form,signal:controller.signal});const data=await r.json();if(run!==analysisRun.current)return;
 if(!r.ok)throw Error(data.error||'사진을 분석하지 못했습니다.');
 const analysis=data.photos?.[0]?.analysis;const scope=virtualPhotoScope(analysis);
 if(!scope?.length)throw Error('시공 부위를 확인하지 못했습니다. 대상이 잘 보이는 사진으로 다시 촬영해주세요.');
 setImages(current=>current.map(image=>({...image,analysis})));setMessage('사진에 보이는 시공 부위를 확인해주세요.');
 }catch(error){if(run===analysisRun.current&&!controller.signal.aborted)setMessage(error.message);}
 finally{if(run===analysisRun.current)setAnalyzing(false);}
 }
 return <main className={styles.page}>
 <header className={styles.header}><strong>{company.company_name}</strong><a href={'/customer/site/'+encodeURIComponent(token)}>시공 안내로 돌아가기</a></header>
 <section className={styles.welcome}><span className={styles.badge}>고객 전용 체험 · 남은 {left}회</span><h1>우리 집 미리시공</h1><p>사진을 넣고 원하는 필름으로 바꿔보세요.</p></section>
  <section id="virtual" className={styles.card}><h2>우리 집 미리시공</h2><p>1. 시공할 공간의 사진을 선택해주세요.</p><p className={styles.muted}>얼굴이나 개인정보가 없는 사진을 이용해주세요. 선택한 사진은 미리시공을 위해 AI 서비스로 전송됩니다.</p><div className={styles.photoActions}>
    <button type="button" className={styles.secondary} disabled={analyzing} onClick={()=>cameraInput.current?.click()}>사진 찍기</button>
    <button type="button" className={styles.secondary} disabled={analyzing} onClick={()=>fileInput.current?.click()}>사진·파일 선택</button>
  </div>
  <input ref={cameraInput} aria-label="카메라로 사진 찍기" type="file" accept="image/*" capture="environment" hidden onChange={upload}/>
  <input ref={fileInput} aria-label="저장된 사진 파일 선택" type="file" accept="image/*" hidden onChange={upload}/>
  {images[0]&&<p className={styles.muted}>선택한 사진: {images[0].file.name}</p>}{message&&<p role="status">{message}</p>}
  {images[0]&&<img className={styles.photo} src={images[0].preview} alt="선택한 우리 집 사진"/>}
  {images.length>0&&!images[0].analysis&&<button type="button" className={styles.primary} disabled={analyzing} onClick={analyze}>{analyzing?'사진을 분석하고 있습니다':'사진 속 시공 부위 확인하기'}</button>}
  {images[0]?.analysis&&<><p>2. 원하는 필름을 골라주세요.</p><FilmColorPicker onSelect={setFilm}/></>}
  {film&&<p>선택한 필름: {film.brand} {film.code||film.product_code} {film.name}</p>}
  {images[0]?.analysis&&film&&remaining>0&&<VirtualInstallPanel images={images} product={film} companySlug={company.slug} customerToken={token} onAttempt={updateRemaining}/>}
  {left===0&&<p>무료 체험을 모두 이용했습니다. 추가 상담은 업체에 문의해주세요.</p>}
  <p className={styles.muted}>다른 기기에서도 체험 횟수를 함께 사용합니다. 생성 결과는 페이지를 닫기 전에 저장해주세요. 통신 시간 초과 등 결과를 확인하지 못한 요청도 횟수에 포함될 수 있습니다.</p></section>
 </main>;
}
