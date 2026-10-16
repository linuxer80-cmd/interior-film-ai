"use client";
import {useEffect,useRef,useState} from 'react';
import {supabase} from '../../lib/supabase';
import styles from './SiteNearbyPlaces.module.css';

const labels={film:'필름가게',materials:'필름·인테리어 자재점',food:'음식점'};
export default function SiteNearbyPlaces({siteId,address}){
 const [kind,setKind]=useState('film'),[radius,setRadius]=useState(3000),[data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [page,setPage]=useState(0);
 const request=useRef(null),generation=useRef(0);
 useEffect(()=>{generation.current++;request.current?.abort();setData(null);setError('');setBusy(false);return()=>{generation.current++;request.current?.abort();};},[siteId,address]);
 async function search(nextKind=kind,nextRadius=radius){
  request.current?.abort();const controller=new AbortController();request.current=controller;
  const version=++generation.current;setKind(nextKind);setRadius(nextRadius);setBusy(true);setError('');setData(null);setPage(0);
  try{
   const {data:auth}=await supabase.auth.getSession();
   if(!auth.session)throw Error('로그인 후 이용해주세요.');
   const actor=auth.session.user.id;
   const query=new URLSearchParams({siteId,kind:nextKind,radius:String(nextRadius)});
   const response=await fetch('/api/worker/nearby?'+query,{headers:{Authorization:`Bearer ${auth.session.access_token}`},cache:'no-store',signal:controller.signal});
   const result=await response.json();
   if(!response.ok)throw Error(result.error||'주변 장소를 찾지 못했습니다.');
   const {data:current}=await supabase.auth.getSession();
   if(current.session?.user?.id!==actor)throw Error('계정이 변경되었습니다. 다시 조회해주세요.');
   if(version===generation.current)setData(result);
  }catch(e){if(!controller.signal.aborted&&version===generation.current)setError(e.message);}
  finally{if(version===generation.current)setBusy(false);}
 }
 return <details className={styles.panel}>
  <summary className={styles.heading}><strong>현장 주변 찾기</strong><small>필름가게 · 음식점</small><span aria-hidden='true'>⌄</span></summary>
  <div className={styles.body}>
  <div className={styles.controls}>{['film','materials','food'].map(k=><button type='button' key={k} disabled={!siteId||!address||busy} aria-pressed={data?.kind===k} onClick={()=>search(k)}>{k==='materials'?'자재점':labels[k]}</button>)}
   <label>반경 <select value={radius} disabled={busy} onChange={e=>{const r=Number(e.target.value);setRadius(r);setData(null);setError('');}}>{[1000,3000,5000,10000].map(r=><option key={r} value={r}>{r/1000}km</option>)}</select></label>
  </div>
  <small>새 검색은 업체 지도 조회 1회를 사용합니다. 저장된 결과·페이지 이동·외부 지도 열기는 추가 차감하지 않습니다.</small>
  {!address&&<p>현장 주소를 등록하면 주변 장소를 찾을 수 있습니다.</p>}
  {busy&&<p role='status'>현장 주변을 검색하는 중…</p>}
  {error&&<p role='alert'>{error} <button type='button' disabled={busy} onClick={()=>search()}>다시 검색</button></p>}
  {data&&<><p><strong>{labels[data.kind]}</strong> · {data.places.length}곳 · 가까운 순</p>
   {!data.places.length&&<p>검색 결과가 없습니다. 반경을 넓혀 다시 검색해주세요.</p>}
   <ul className={styles.list}>{data.places.slice(page*3,page*3+3).map(p=><li key={p.id}><strong>{p.name}</strong>{p.distance!==null&&<span> · {p.distance>=1000?(p.distance/1000).toFixed(1)+'km':p.distance+'m'}</span>}<details className={styles.info}><summary>주소·정보 보기</summary><p>{p.address}</p><p>{p.category}</p></details><div className={styles.controls}><a href={p.mapUrl} target='_blank' rel='noopener noreferrer'>길찾기 ↗</a>{/^[0-9 +()-]+$/.test(p.phone)&&<a href={'tel:'+p.phone.replace(/[^0-9+]/g,'')}>전화</a>}</div></li>)}</ul>
   {data.places.length>3&&<nav className={styles.pages} aria-label='주변 검색 결과 페이지'><button type='button' disabled={page===0} onClick={()=>setPage(p=>p-1)}>이전</button><span aria-live='polite'>{page+1} / {Math.ceil(data.places.length/3)}</span><button type='button' disabled={(page+1)*3>=data.places.length} onClick={()=>setPage(p=>p+1)}>다음</button></nav>}
   <small>카카오맵 제공 · 거리는 현장에서의 직선거리입니다. {data.kind!=='food'?'자재 판매·재고는 전화로 확인해주세요.':''}</small>
  </>}
  </div>
 </details>;
}
