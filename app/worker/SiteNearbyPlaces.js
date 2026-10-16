"use client";
import {useEffect,useRef,useState} from 'react';
import {supabase} from '../../lib/supabase';
import styles from './SiteNearbyPlaces.module.css';

const labels={film:'필름가게',materials:'필름·인테리어 자재점',food:'음식점'};
export default function SiteNearbyPlaces({siteId,address}){
 const [kind,setKind]=useState('film'),[radius,setRadius]=useState(3000),[data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const request=useRef(null),generation=useRef(0);
 useEffect(()=>{generation.current++;request.current?.abort();setData(null);setError('');setBusy(false);return()=>{generation.current++;request.current?.abort();};},[siteId,address]);
 async function search(nextKind=kind,nextRadius=radius){
  request.current?.abort();const controller=new AbortController();request.current=controller;
  const version=++generation.current;setKind(nextKind);setRadius(nextRadius);setBusy(true);setError('');setData(null);
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
 return <section className={styles.panel} aria-label='현장 주변 찾기'>
  <strong>현장 주변 찾기</strong>
  <p>현장 주소 기준 · 현재 내 위치는 사용하지 않습니다.</p>
  <div className={styles.controls}>{['film','food'].map(k=><button type='button' key={k} disabled={!siteId||!address||busy} aria-pressed={data?.kind===k} onClick={()=>search(k)}>{labels[k]} 찾기</button>)}
   <label>검색 반경 <select value={radius} disabled={busy} onChange={e=>{const r=Number(e.target.value);setRadius(r);setData(null);setError('');}}>{[1000,3000,5000,10000].map(r=><option key={r} value={r}>{r/1000}km</option>)}</select></label>
  </div>
  {!address&&<p>현장 주소를 등록하면 주변 장소를 찾을 수 있습니다.</p>}
  {busy&&<p role='status'>현장 주변을 검색하는 중…</p>}
  {error&&<p role='alert'>{error} <button type='button' disabled={busy} onClick={()=>search()}>다시 검색</button></p>}
  {data&&<><p><strong>{labels[data.kind]}</strong> · 반경 {data.radius/1000}km · 가까운 순 최대 15곳</p>
   {!data.places.length&&<p>검색 결과가 없습니다. 반경을 넓혀 다시 검색해주세요.</p>}
   {data.kind!=='food'&&<><p>시공업체가 함께 검색될 수 있으니 자재 판매·재고는 방문 전 전화로 확인해주세요.</p><button type='button' disabled={busy} onClick={()=>search(data.kind==='film'?'materials':'film')}>{data.kind==='film'?'인테리어 자재점으로 넓혀 찾기':'인테리어필름으로 찾기'}</button></>}
   <ul className={styles.list}>{data.places.map(p=><li key={p.id}><strong>{p.name}</strong>{p.distance!==null&&<span> · {p.distance>=1000?(p.distance/1000).toFixed(1)+'km':p.distance+'m'}</span>}<p>{p.category}</p><p>{p.address}</p><div className={styles.controls}><a href={p.mapUrl} target='_blank' rel='noopener noreferrer'>카카오맵 · 길찾기 ↗</a>{/^[0-9 +()-]+$/.test(p.phone)&&<a href={'tel:'+p.phone.replace(/[^0-9+]/g,'')}>전화 {p.phone}</a>}</div></li>)}</ul>
   <small>카카오맵 제공 · 거리는 현장에서의 직선거리입니다. {data.hasMore?'다른 결과는 반경이나 검색 종류를 바꿔 확인해주세요.':''}</small>
  </>}
 </section>;
}
