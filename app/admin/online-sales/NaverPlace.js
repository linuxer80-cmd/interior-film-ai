'use client';
import {useCallback,useEffect,useState} from 'react';
import {supabase} from '../../../lib/supabase';
import {PLACE_ID,PLACE_URL,PLACE_API_DOC} from '../../../lib/naverPlace.mjs';
import styles from './sales.module.css';
const date=value=>value?new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'미조회';
export default function NaverPlace(){
  const [state,setState]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [settings,setSettings]=useState(false),[clientId,setClientId]=useState(''),[clientSecret,setClientSecret]=useState(''),[autoSync,setAutoSync]=useState(false);
  const api=useCallback(async body=>{
    const {data}=await supabase.auth.getSession();
    if(!data?.session?.access_token)throw Error('필름장이 관리자 계정으로 로그인해주세요.');
    const response=await fetch('/api/admin/online-sales/place',{method:body?'POST':'GET',headers:{Authorization:`Bearer ${data.session.access_token}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store'});
    const result=await response.json();if(!response.ok)throw Error(result.error||'플레이스 연결을 확인하지 못했습니다.');return result;
  },[]);
  useEffect(()=>{let live=true;api().then(value=>{if(live){setState(value);setAutoSync(value.autoSync);}}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[api]);
  async function act(body){
    setBusy(true);setError('');setNotice('');
    try{const result=await api(body);setState(result);setAutoSync(result.autoSync);setSettings(false);setNotice(body.action==='disconnect'?'앱의 지역 검색 연결을 해제했습니다.':body.action==='connect'?'지역 검색 API 조회를 확인하고 연결을 저장했습니다.':'지역 검색 결과를 갱신했습니다.');}
    catch(e){setError(e.message);}
    finally{setClientId('');setClientSecret('');setBusy(false);}
  }
  return <>
    <section className={styles.card}>
      <div className={styles.row}><div><span className={styles.naverBadge}>네이버 플레이스</span><h2>기분좋은공간</h2></div><span>{state?.connected?'지역 검색 API 연결됨':'지역 검색 API 연결 전'}</span></div>
      <p>플레이스 ID {PLACE_ID} · 인천·부천·일산 시공 상담</p>
      <div className={styles.actions}><a href={PLACE_URL} target='_blank' rel='noopener noreferrer' data-ui-link='action'>고객이 보는 플레이스 ↗</a><a href='https://smartplace.naver.com/' target='_blank' rel='noopener noreferrer' data-ui-link='action'>스마트플레이스 관리·로그인 ↗</a><a href='https://m.blog.naver.com/intefilm' target='_blank' rel='noopener noreferrer' data-ui-link='action'>시공 블로그 ↗</a></div>
      <p className={styles.hint}>소식·사진·리뷰 답글은 스마트플레이스 관리화면에서 처리합니다. 앱의 지역 검색 연결은 해당 관리 권한이나 네이버 로그인을 대신하지 않습니다.</p>
    </section>
    {error&&<p role='alert' className={styles.error}>{error}</p>}{notice&&<p role='status' className={styles.notice}>{notice}</p>}
    {state?.lastError&&<p className={styles.error}>최근 조회 실패: {state.lastError} 아래 결과는 이전 성공 조회 기준일 수 있습니다.</p>}
    <section className={styles.card}>
      <div className={styles.row}><h2>지역 검색 결과</h2><div className={styles.actions}>{state?.connected&&<button disabled={busy} onClick={()=>act({action:'sync'})}>{busy?'조회 중…':'지금 조회'}</button>}<button className={styles.secondary} disabled={busy||!state} onClick={()=>setSettings(value=>!value)}>{settings?'설정 닫기':'API 연결 설정'}</button></div></div>
      <p>마지막 성공 조회: {date(state?.lastSyncedAt)}</p>
      <p className={styles.hint}>업체명·업종·주소·소개·링크를 최대 5개 조회합니다. 검색 결과 순서는 실제 네이버 지도 순위가 아니며, 결과에 없다고 플레이스 미등록으로 판단하지 않습니다. 동명 업체는 주소와 고객용 플레이스를 대조해주세요.</p>
      {state?.snapshot?<><p>검색어: {state.snapshot.query}</p>{state.snapshot.items.length?state.snapshot.items.map((item,index)=><article className={styles.campaign} key={index}><h3>{item.title}</h3><p>{item.category||'업종 미제공'}</p><p>{item.roadAddress||item.address||'주소 미제공'}</p>{item.description&&<p>{item.description}</p>}{item.link&&<a href={item.link} target='_blank' rel='noopener noreferrer'>검색 결과 제공 링크 ↗</a>}</article>):<p>이번 검색에서 반환된 결과가 없습니다. 고객용 플레이스에서 별도로 확인해주세요.</p>}</>:<p>연결 후 공식 API로 조회한 결과가 여기에 표시됩니다.</p>}
      <p className={styles.hint}>{state?.connected?(state.autoSync?'매일 오전 9시 검색 결과 자동 조회 사용 중':'자동 조회 꺼짐 · 지금 조회로 확인'):'자동 조회는 연결 설정에서 선택할 수 있습니다.'}</p>
      {settings&&<form className={styles.form} onSubmit={e=>{e.preventDefault();act({action:'connect',clientId,clientSecret,autoSync});}}>
        <h3>NAVER API HUB 연결</h3><p>네이버 클라우드의 NAVER API HUB에서 검색 API를 신청해 발급받으세요. 기존 파워링크 API 키는 사용할 수 없습니다.</p>
        <label>Client ID<input required autoComplete='off' maxLength={256} value={clientId} onChange={e=>setClientId(e.target.value)}/></label>
        <label>Client Secret<input required type='password' autoComplete='off' minLength={8} maxLength={4096} value={clientSecret} onChange={e=>setClientSecret(e.target.value)}/></label>
        <label className={styles.keywordChoice}><input type='checkbox' checked={autoSync} onChange={e=>setAutoSync(e.target.checked)}/>매일 오전 9시 검색 결과 자동 조회</label>
        <p className={styles.hint}>연결 시 1회 조회를 검증한 뒤 키를 서버에 암호화해 저장합니다. 네이버 클라우드의 이용요금·호출 한도를 확인하고 연결해주세요. 비밀키를 채팅으로 보내지 마세요.</p>
        <button disabled={busy}>{busy?'연결 확인 중…':'조회 확인 후 연결 저장'}</button><a href='https://api.ncloud-docs.com/docs/naver-api-hub-overview' target='_blank' rel='noopener noreferrer'>키 발급 공식 안내 ↗</a>
        {state?.connected&&<button type='button' disabled={busy} className={styles.secondary} onClick={()=>{if(window.confirm('앱에 저장된 지역 검색 키와 조회 결과를 지울까요? 플레이스와 네이버 클라우드 키는 유지됩니다.'))act({action:'disconnect'});}}>앱 API 연결 해제</button>}
      </form>}
    </section>
    <details className={styles.card}><summary>조회 범위와 관리할 항목</summary><p>지역 검색 API에는 대표사진·소식·리뷰 본문·조회 및 문의 통계가 제공되지 않습니다. 소식 게시, 사진 수정, 리뷰 답글의 공개 관리 API는 확인되지 않아 자동 등록 기능은 제공하지 않습니다.</p><ul><li>대표사진: 사람 없는 실제 시공 완료 사진, 같은 현장 전후 사진, 마감 사진</li><li>소개: 인테리어필름 시공 부위·실제 가능 지역·사진 상담 방법</li><li>연락처·영업시간·블로그: 관리화면의 현재 정보 확인</li></ul><a href={PLACE_API_DOC} target='_blank' rel='noopener noreferrer'>공식 지역 검색 API 제공 항목 ↗</a></details>
  </>;
}
