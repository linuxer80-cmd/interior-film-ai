'use client';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {supabase} from '../../../lib/supabase';
import styles from './sales.module.css';
const fmt=(v,suffix='')=>v==null?'미제공':`${Number(v).toLocaleString('ko-KR',{maximumFractionDigits:0})}${suffix}`;
const percent=v=>v==null?'미제공':`${Number(v).toFixed(2)}%`;
const when=v=>v?new Date(v).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'아직 조회하지 않았어요';
const status=row=>row.userLock?'직접 중지':({ELIGIBLE:'운영 가능',PAUSED:'중지',DELETED:'삭제',PENDING:'대기',BUDGET_LACK:'예산 부족'})[row.status]||row.status||'상태 미제공';
export default function NaverSales(){
  const [state,setState]=useState(null),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[settings,setSettings]=useState(false);
  const [apiKey,setApiKey]=useState(''),[secretKey,setSecretKey]=useState(''),[replaceKeys,setReplaceKeys]=useState(false);
  const [groupId,setGroupId]=useState(''),[keywords,setKeywords]=useState(null),[query,setQuery]=useState(''),[filter,setFilter]=useState('all'),[sort,setSort]=useState('clicks'),[page,setPage]=useState(0);
  const api=useCallback(async body=>{
    const {data}=await supabase.auth.getSession();
    if(!data?.session?.access_token)throw Error('필름장이 관리자 계정으로 로그인해주세요.');
    const response=await fetch('/api/admin/online-sales/naver',{method:body?'POST':'GET',headers:{Authorization:`Bearer ${data.session.access_token}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store'});
    const result=await response.json();if(!response.ok)throw Error(result.error||'네이버 광고를 조회하지 못했습니다.');return result;
  },[]);
  useEffect(()=>{let live=true;api().then(value=>{if(live)setState(value);}).catch(e=>{if(live)setError(e.message);}).finally(()=>{if(live)setReady(true);});return()=>{live=false;};},[api]);
  async function act(body){
    setBusy(true);setError('');setNotice('');
    try{
      const result=await api(body);
      if(body.action==='keywords'){setKeywords(result);setQuery('');setFilter('all');setPage(0);setNotice('선택한 광고그룹의 키워드를 가져왔습니다.');}
      else{setState(result);setKeywords(null);setSettings(false);setReplaceKeys(false);setGroupId('');setNotice(body.action==='disconnect'?'앱 연결을 해제하고 자동 조회를 중단했습니다. 네이버 광고 집행은 계속됩니다.':body.action==='connect'?'네이버 인증과 성과 조회를 확인하고 연결을 저장했습니다.':'최근 성과를 가져왔습니다.');}
    }catch(e){setError(e.message);if(body.action==='keywords')setKeywords(null);}
    finally{setApiKey('');setSecretKey('');setBusy(false);}
  }
  const rows=useMemo(()=>{
    const list=(keywords?.keywords||[]).filter(k=>(!query||k.keyword?.includes(query.trim()))&&(filter==='all'||filter==='noClicks'&&k.impressions>0&&k.clicks===0||filter==='paused'&&k.userLock));
    return list.sort((a,b)=>{const x=a[sort],y=b[sort];return (y??-1)-(x??-1)||String(a.keyword).localeCompare(String(b.keyword),'ko');});
  },[keywords,query,filter,sort]);
  if(!ready)return <p role='status'>네이버 연결을 확인하고 있어요…</p>;
  if(!state)return <section className={styles.card}><p role='alert'>{error}</p><button onClick={()=>location.reload()}>다시 확인</button></section>;
  const snapshot=state.snapshot,totals=snapshot?.totals;
  return <section aria-label='네이버 광고 관리'>
    <section className={styles.card}>
      <div className={styles.row}><div><span className={styles.naverBadge}>네이버 검색광고</span><h2>{state.connected?'기분좋은공간 파워링크':'네이버 광고계정 연결'}</h2></div><span>{state.connected?'API 연결됨':'연결 전'}</span></div>
      <p>광고 화면 계정 2149941 · API 고객번호 1051808 · 운영 기준 일예산 30,000원</p>
      <p>연결된 계정의 파워링크 성과와 등록 키워드를 확인합니다.</p>
      {state.connected&&<><p>마지막 성공 조회: {when(state.lastSyncedAt)}</p><p>매일 오전 9시 자동 조회 · 전일까지 최근 7일 · 한국 시간</p><div className={styles.actions}><button disabled={busy} onClick={()=>act({action:'sync'})}>{busy?'처리 중…':'지금 새로고침'}</button><button className={styles.secondary} disabled={busy} onClick={()=>{setSettings(v=>!v);setReplaceKeys(false);setApiKey('');setSecretKey('');}}>{settings?'설정 닫기':'연결 설정'}</button></div></>}
      {state.connected&&settings&&<div className={styles.form}><p className={styles.notice}>기존 API 키가 암호화되어 저장돼 있고 연결 중입니다. 다시 입력할 필요가 없습니다.</p><div className={styles.actions}><button className={styles.secondary} type='button' disabled={busy} onClick={()=>{setReplaceKeys(v=>!v);setApiKey('');setSecretKey('');}}>{replaceKeys?'키 변경 취소':'새 키로 변경'}</button><button type='button' className={styles.secondary} disabled={busy} onClick={()=>{if(window.confirm('네이버 API 키와 앱의 조회 결과를 삭제하고 자동 조회를 중단할까요? 실제 광고는 중지되지 않습니다.'))act({action:'disconnect'});}}>앱 연결 해제</button></div></div>}
      {(!state.connected||(settings&&replaceKeys))&&<form className={styles.form} onSubmit={e=>{e.preventDefault();act({action:'connect',customerId:'1051808',apiKey,secretKey});}}>
        <label>API Customer ID<input value='1051808' readOnly/></label>
        <label>액세스라이선스<input type='password' autoComplete='off' minLength={8} maxLength={4096} required disabled={busy} value={apiKey} onChange={e=>setApiKey(e.target.value)} placeholder='API 사용 관리에서 발급받은 액세스라이선스'/></label>
        <label>비밀키<input type='password' autoComplete='off' minLength={8} maxLength={4096} required disabled={busy} value={secretKey} onChange={e=>setSecretKey(e.target.value)} placeholder='API 사용 관리에서 발급받은 비밀키'/></label>
        <p className={styles.hint}>인증정보는 서버에 암호화해 보관하고 다시 표시하지 않습니다. 실제 조회가 성공한 뒤 연결을 저장합니다. 키를 채팅으로 보내지 마세요.</p>
        <button disabled={busy}>{busy?'인증 및 성과 조회 중…':state.connected?'새 키로 확인 및 저장':'연결 확인 및 저장'}</button>
        <details><summary>API 발급·확인 방법</summary><ol><li>네이버 광고주센터에 계정 책임자로 로그인합니다.</li><li>검색광고 → 도구 → SA API 사용 관리를 엽니다.</li><li>서비스 신청과 약관 확인 후 발급된 액세스라이선스·비밀키를 입력합니다.</li><li>기존 키가 있다면 재발급하지 않고 해당 키를 사용하세요.</li></ol><a href='https://ads.naver.com/help/faq/991' target='_blank' rel='noopener noreferrer'>네이버 공식 API 안내 ↗</a></details>
      </form>}
    </section>
    {error&&<p role='alert' className={styles.error}>{error}</p>}{notice&&<p role='status' className={styles.notice}>{notice}</p>}{state.lastError&&<p className={styles.error}>최근 조회 실패: {state.lastError} 이전 성공 결과가 표시될 수 있습니다.</p>}
    {snapshot&&<>
      <h2>최근 7일 파워링크 성과{!snapshot.complete?' · 확인된 합계':''}</h2><p>{snapshot.period.start} ~ {snapshot.period.end} · 광고비 부가세 포함</p>{!snapshot.complete&&<p className={styles.notice}>성과가 확인된 {snapshot.coverage.reported}개 캠페인의 합계입니다. 미제공 {snapshot.coverage.missing}개는 제외했습니다.</p>}
      <div className={styles.metrics}>{[['광고비',fmt(totals.cost,'원')],['노출',fmt(totals.impressions,'회')],['클릭',fmt(totals.clicks,'회')],['클릭률',percent(totals.ctr)],['클릭당 비용',fmt(totals.cpc,'원')]].map(([label,value])=><article className={styles.metric} key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>
      <section className={styles.card}><h2>점검 안내</h2><ul>{snapshot.notes.map((note,i)=><li key={i}>{note}</li>)}</ul></section>
      <section className={styles.card}><h2>캠페인 · 광고그룹</h2>{!snapshot.campaigns.length?<p>조회된 파워링크 캠페인이 없습니다.</p>:snapshot.campaigns.map(c=><article className={styles.campaign} key={c.id}><div className={styles.row}><strong>{c.name}</strong><span>{status(c)}</span></div><p>하루 예산 {c.useDailyBudget?fmt(c.dailyBudget,'원'):'설정 안 됨'} · 광고비 {fmt(c.cost,'원')}</p><p>노출 {fmt(c.impressions)} · 클릭 {fmt(c.clicks)} · 클릭률 {percent(c.ctr)}</p>{snapshot.groups.filter(g=>g.campaignId===c.id).map(g=><div className={styles.group} key={g.id}><div className={styles.row}><strong>{g.name}</strong><span>{status(g)}</span></div><p>기본 입찰가 {fmt(g.bidAmt,'원')} · 광고비 {fmt(g.cost,'원')} · 노출 {fmt(g.impressions)} · 클릭 {fmt(g.clicks)}</p></div>)}</article>)}</section>
      <section className={styles.card}><h2>키워드 점검</h2><p>광고그룹을 선택하면 같은 기간의 키워드와 성과를 조회합니다. 조회 후 다음 요청까지 약 1분의 대기 시간이 있습니다.</p>
        <form className={styles.actions} onSubmit={e=>{e.preventDefault();act({action:'keywords',groupId});}}><label className={styles.grow}>광고그룹<select value={groupId} disabled={busy} required onChange={e=>{setGroupId(e.target.value);setKeywords(null);}}><option value=''>광고그룹 선택</option>{snapshot.groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label><button disabled={busy||!groupId}>{busy?'처리 중…':'키워드 불러오기'}</button></form>
        {keywords&&<><p>{keywords.groupName} · 총 {keywords.keywords.length.toLocaleString('ko-KR')}개 · 조회 {when(keywords.fetchedAt)}</p><div className={styles.filters}>
          <label>키워드 검색<input value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}} placeholder='예: 인천 인테리어필름'/></label>
          <label>표시 대상<select value={filter} onChange={e=>{setFilter(e.target.value);setPage(0);}}><option value='all'>전체 키워드</option><option value='noClicks'>노출 있지만 클릭 없음</option><option value='paused'>직접 중지한 키워드</option></select></label>
          <label>높은 순 정렬<select value={sort} onChange={e=>{setSort(e.target.value);setPage(0);}}><option value='clicks'>클릭수</option><option value='impressions'>노출수</option><option value='cost'>광고비</option><option value='cpc'>클릭당 비용</option><option value='averageRank'>평균 노출순위 숫자</option></select></label>
        </div><p>검색 결과 {rows.length}개 · 평균 노출순위는 집계 기간의 제공 지면 기준이며 현재 실시간 순위가 아닙니다.</p>
        <div className={styles.tableWrap}><table className={styles.table}><caption>키워드별 최근 7일 성과 · {keywords.period.start} ~ {keywords.period.end}</caption><thead><tr>{['키워드','상태','기본 입찰가','노출','클릭','광고비','클릭률','평균 노출순위'].map(h=><th key={h} scope='col'>{h}</th>)}</tr></thead><tbody>{rows.slice(page*50,(page+1)*50).map(k=><tr key={k.id}><th scope='row'>{k.keyword}</th><td>{status(k)}<small>심사: {({APPROVED:'승인',ELIGIBLE:'적격',DENIED:'반려',UNDER_REVIEW:'심사 중',PENDING:'대기'})[k.inspectStatus]||k.inspectStatus||'미제공'}</small></td><td>{fmt(k.bidAmt,'원')}<small>{k.useGroupBidAmt?'그룹 입찰가':'개별 입찰가'}</small></td><td>{fmt(k.impressions)}</td><td>{fmt(k.clicks)}</td><td>{fmt(k.cost,'원')}</td><td>{percent(k.ctr)}</td><td>{k.averageRank==null?'미제공':`${k.averageRank.toFixed(1)}위`}</td></tr>)}</tbody></table></div>
        {!rows.length&&<p>조건에 맞는 키워드가 없습니다.</p>}<div className={styles.actions}><button className={styles.secondary} disabled={page===0} onClick={()=>setPage(p=>p-1)}>이전</button><span>{page+1} / {Math.max(1,Math.ceil(rows.length/50))}</span><button className={styles.secondary} disabled={(page+1)*50>=rows.length} onClick={()=>setPage(p=>p+1)}>다음</button></div></>}
      </section>
    </>}
    <section className={styles.card}><h2>관리 범위</h2><p>현재는 계정 연결, 성과 조회, 키워드 점검을 지원합니다. 입찰가·예산·광고 상태를 자동으로 변경하지 않습니다. 기본 입찰가에는 기기·타겟 가중치가 반영되지 않을 수 있습니다.</p><p>API 키의 권한과 실제 데이터를 확인한 뒤 광고 수정 기능을 추가할 수 있습니다.</p></section>
  </section>;
}
