'use client';
import {useCallback,useEffect,useState} from 'react';
import {supabase} from '../../../lib/supabase';
import styles from './sales.module.css';
import NaverSales from './NaverSales';
import NaverPlace from './NaverPlace';
const number=value=>Number(value||0).toLocaleString('ko-KR',{maximumFractionDigits:0});
const date=value=>value?new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'아직 조회하지 않았어요';
export default function OnlineSalesPage() {
  const [platform,setPlatform]=useState('naver');
  const [state,setState]=useState(null),[ready,setReady]=useState(false),[allowed,setAllowed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [advertiserId,setAdvertiserId]=useState(''),[apiKey,setApiKey]=useState(''),[settings,setSettings]=useState(false);
  const api=useCallback(async body=>{
    const {data}=await supabase.auth.getSession();
    if(!data?.session?.access_token)throw Error('필름장이 관리자 계정으로 로그인해주세요.');
    const response=await fetch('/api/admin/online-sales',{method:body?'POST':'GET',headers:{Authorization:`Bearer ${data.session.access_token}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store'});
    const result=await response.json();
    if(!response.ok)throw Error(result.error||'조회하지 못했습니다.');
    return result;
  },[]);
  useEffect(()=>{
    let live=true;
    setReady(false);setAllowed(false);setState(null);setApiKey('');
    api().then(result=>{if(live){setState(result);setAdvertiserId(result.advertiserId||'');setAllowed(true);}}).catch(e=>{if(live)setError(e.message);}).finally(()=>{if(live)setReady(true);});
    const {data:{subscription}}=supabase.auth.onAuthStateChange((event)=>{if(event==='SIGNED_OUT'){setAllowed(false);setState(null);setApiKey('');setError('로그인이 종료되었습니다.');}});
    return()=>{live=false;subscription.unsubscribe();};
  },[api]);
  async function act(body) {
    setBusy(true);setError('');setNotice('');
    try {
      const result=await api(body);setState(result);setApiKey('');setSettings(false);
      setNotice(body.action==='disconnect'?'앱의 연결을 해제했습니다. 당근 키 폐기는 당근에서 별도로 진행해주세요.':body.action==='connect'?'API 인증과 성과 조회를 확인하고 연결을 저장했습니다.':'최신 성과를 가져왔습니다.');
    } catch(e) {setApiKey('');setError(e.message);}
    finally {setBusy(false);}
  }
  const snapshot=state?.snapshot,totals=snapshot?.totals;
  return <main className={styles.page}>
    <a href='/admin' data-ui-link='action'>← 관리자 홈</a>
    <header className={styles.header}><p>필름장이 전용 · 기분좋은공간</p><h1>온라인 영업관리</h1><p>광고 현황을 확인하고 다음 영업을 준비하세요.</p></header>
    {!ready?<p role='status'>이용 권한을 확인하고 있어요…</p>:!allowed?<section className={styles.card}><h2>필름장이 관리자 전용입니다</h2><p role='alert'>{error}</p><a href='/admin' data-ui-link='action'>관리자 로그인으로 돌아가기</a></section>:<>
      <nav className={styles.platforms} aria-label='온라인 영업 채널 선택'><button type='button' aria-pressed={platform==='naver'} onClick={()=>setPlatform('naver')}>네이버 광고</button><button type='button' aria-pressed={platform==='daangn'} onClick={()=>setPlatform('daangn')}>당근 광고</button><button type='button' aria-pressed={platform==='place'} onClick={()=>setPlatform('place')}>네이버 플레이스</button></nav>
      {platform==='naver'?<NaverSales/>:platform==='place'?<NaverPlace/>:<>
      <section className={styles.card}>
        <div className={styles.row}><div><span className={styles.badge}>당근 광고</span><h2>{state.connected?'연결된 광고 현황':'당근 광고를 연결해보세요'}</h2></div><span>{state.connected?'API 연결됨':'연결 전'}</span></div>
        <p>{state.connected?`광고주 ID ${state.advertiserId}`:'당근에서 발급받은 API 키로 실제 광고 성과를 가져옵니다.'}</p>
        {state.connected&&<><p>마지막 성공 조회: {date(state.lastSyncedAt)}</p><p>매일 오전 9시 자동 조회 · 전일까지 최근 7일</p><div className={styles.actions}><button disabled={busy} onClick={()=>act({action:'sync'})}>{busy?'조회 중…':'지금 새로고침'}</button><button className={styles.secondary} disabled={busy} onClick={()=>setSettings(v=>!v)}>{settings?'설정 닫기':'연결 설정'}</button></div></>}
        {(!state.connected||settings)&&<form onSubmit={e=>{e.preventDefault();act({action:'connect',advertiserId,apiKey});}} className={styles.form}>
          <label>당근 광고주 ID<input inputMode='numeric' pattern='[1-9][0-9]*' maxLength={19} required value={advertiserId} onChange={e=>setAdvertiserId(e.target.value)} placeholder='당근에서 키를 발급받은 광고주 ID'/></label>
          <label>OpenAPI 키<input type='password' autoComplete='off' required minLength={8} maxLength={4096} value={apiKey} onChange={e=>setApiKey(e.target.value)} placeholder='발급받은 API 키를 여기에 입력하세요'/></label>
          <p className={styles.hint}>키는 서버에 암호화해 보관하며 다시 표시하지 않습니다. 연결 전 캠페인과 성과 조회를 검증합니다.</p>
          <button disabled={busy}>{busy?'연결 확인 중…':state.connected?'새 키로 연결 확인 및 저장':'연결 확인 및 저장'}</button>
          <details><summary>API 키 발급 방법</summary><ol><li>당근비즈니스 전문가모드에서 고객센터 → 온라인 문의를 엽니다.</li><li>문의하기 → 광고 도구 및 전환 → OpenAPI 키 발급을 선택합니다.</li><li>광고주 ID를 선택하고 발급 절차를 진행합니다.</li><li>확인한 광고주 ID와 키를 위 입력란에 넣습니다.</li></ol><p>재발급하면 기존 키가 폐기될 수 있으므로 이미 사용 중인 키가 있는지 먼저 확인하세요.</p><a href='https://business.daangn.com/notice/detail/420' target='_blank' rel='noopener noreferrer'>당근 공식 발급 안내 ↗</a></details>
          {state.connected&&<button type='button' className={styles.secondary} disabled={busy} onClick={()=>{if(window.confirm('앱에 저장된 당근 키와 조회 결과를 삭제하고 자동 조회를 중단할까요? 당근 광고는 계속 집행됩니다.'))act({action:'disconnect'});}}>앱 연결 해제</button>}
        </form>}
      </section>
      {error&&<p className={styles.error} role='alert'>{error}</p>}{notice&&<p role='status' className={styles.notice}>{notice}</p>}{state.lastError&&<p className={styles.error}>최근 조회 실패: {state.lastError} 이전 성공 조회 결과가 표시될 수 있습니다.</p>}
      {snapshot&&<>
        <h2>최근 7일 광고 성과</h2><p>{snapshot.period.start} ~ {snapshot.period.end} · 한국 시간 · API 조회 범위</p>
        <div className={styles.metrics}>{[['광고비',`${number(totals.cost)}원`],['노출',`${number(totals.impressions)}회`],['클릭',`${number(totals.clicks)}회`],['클릭률',`${totals.ctr.toFixed(2)}%`],['클릭당 비용',totals.cpc===null?'—':`${number(totals.cpc)}원`]].map(([label,value])=><article className={styles.metric} key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>
        <section className={styles.card}><h2>이번 점검</h2><ul>{snapshot.notes.map((note,i)=><li key={i}>{note}</li>)}</ul></section>
        <section className={styles.card}><h2>캠페인별 성과</h2>{!snapshot.campaigns.length?<p>현재 API에서 조회된 캠페인이 없습니다.</p>:snapshot.campaigns.map(c=><article className={styles.campaign} key={c.id}><div className={styles.row}><strong>{c.title}</strong><span>{c.liveStatus==='ON'?'설정 켜짐':c.liveStatus==='OFF'?'설정 꺼짐':c.liveStatus}</span></div><p>플랫폼 상태: {({NORMAL:'정상',UNAVAILABLE:'집행 불가',OFF:'꺼짐',DELETED:'삭제됨',BUDGET_EXCEEDED:'예산 초과'})[c.status]||c.status||'미제공'}</p><p>노출 {number(c.impressions)} · 클릭 {number(c.clicks)} · 클릭률 {c.ctr.toFixed(2)}%</p><strong>광고비 {number(c.cost)}원</strong></article>)}</section>
      </>}
      <section className={styles.card}><h2>연결 범위</h2><p>현재는 광고 성과 조회와 매일 점검을 지원합니다. 광고 예산·소재 변경, 소식 게시, 고객 채팅 발송은 실행하지 않습니다.</p><p>간편모드 등 일부 광고가 조회 대상에서 제외될 수 있습니다. 당근 화면과 첫 집계를 비교해주세요. 네이버 광고는 상단 네이버 탭에서 관리하세요. 숨고와 상담·계약 성과 연동은 다음 단계입니다.</p></section>
      </>}
    </>}
  </main>;
}
