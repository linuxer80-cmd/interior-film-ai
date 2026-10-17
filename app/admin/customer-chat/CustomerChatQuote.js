'use client';
import {useEffect,useRef,useState} from 'react';
import {chatRequest} from '../../components/CustomerChat';
import useSites from '../../hooks/useSites';
import useAdminOverlayBack from '../../../lib/useAdminOverlayBack';
import ConsultationQuote from '../ConsultationQuote';
import SiteRegisterModal from '../SiteRegisterModal';
import {quoteSeed} from '../../../lib/consultationQuote';
import styles from '../../components/CustomerChat.module.css';

export default function CustomerChatQuote({thread,onClose}){
 const [companyId,setCompanyId]=useState(null),[error,setError]=useState(''),[site,setSite]=useState(null),[search,setSearch]=useState(''),[register,setRegister]=useState(false);
 const [analysis,setAnalysis]=useState(null),[analyzing,setAnalyzing]=useState(false),[creating,setCreating]=useState(false),[activeDraft,setActiveDraft]=useState(null);
 const dirty=useRef(false),created=useRef(null),operation=useRef(false),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 async function analyze(){
   if(operation.current)return;
   if(analysis&&!window.confirm('수정한 초안을 새 분석 결과로 바꿀까요? AI 상담 분석 횟수가 사용됩니다.'))return;
   operation.current=true;setAnalyzing(true);setError('');
   try{const data=await chatRequest('/api/admin/customer-chat/quote?thread='+encodeURIComponent(thread.id),{},true,60000);if(alive.current){setAnalysis(data.draft);setSearch(data.draft.site_name||'');}}
   catch(e){if(alive.current)setError(e.name==='TimeoutError'?'분석이 지연됩니다. 잠시 후 다시 시도해주세요.':e.message);}
   finally{operation.current=false;if(alive.current)setAnalyzing(false);}
 }
 function reviewed(){
   if(!analysis)return null;
   if(!analysis.work_description.trim())throw Error('시공 내용을 입력해주세요.');
   if(!['included','separate','none'].includes(analysis.vat))throw Error('부가세 표시를 선택해주세요.');
   const value=String(analysis.contract_amount).trim();
   if(value!==''&&(!/^\d+$/.test(value)||Number(value)>1000000000))throw Error('견적 금액은 0~10억원의 정수로 입력해주세요.');
   return {...analysis,contract_amount:value===''?'':Number(value)};
 }
 function selectSite(value){
   try{setActiveDraft(reviewed());setSite(value);setError('');}catch(e){setError(e.message);}
 }
 async function createFromChat(){
   if(operation.current)return;
   let data;try{data=reviewed();if(!data?.site_name.trim()||!data.address.trim())throw Error('새 현장의 현장명과 주소를 확인해주세요.');}catch(e){setError(e.message);return;}
   operation.current=true;setCreating(true);setError('');
   try{
     const result=await createSite({site_name:data.site_name,address:data.address,customer_name:data.customer_name,customer_phone:data.customer_phone,
       work_description:data.work_description,source:'other',status:'consulting',work_dates:[],materials:[],request_photos:[],
       // A quoted price is not a confirmed contract: keep contract accounting untouched.
       consultation_quote_seed:quoteSeed({work_description:data.work_description}),memo:'고객 채팅을 바탕으로 등록한 상담 현장'});
     if(!result.success)throw Error(result.error||'현장 등록에 실패했습니다.');
     if(alive.current){setActiveDraft(data);setSite(result.site);}
   }catch(e){if(alive.current)setError(e.message);}
   finally{operation.current=false;if(alive.current)setCreating(false);}
 }
 const {sites,sitesLoading,sitesMessage,loadSites,createSite}=useSites({companyId});
 const canClose=()=>!operation.current&&(!(dirty.current||analysis)||window.confirm('저장하지 않은 견적 초안이 있을 수 있습니다. 닫을까요?'));
 const close=useAdminOverlayBack(true,onClose,canClose,1000);
 useEffect(()=>{let active=true;chatRequest('/api/admin/customer-chat?thread='+encodeURIComponent(thread.id),null,true).then(data=>{if(active)setCompanyId(data.companyId);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[thread.id]);
 useEffect(()=>{if(companyId)loadSites();},[companyId,loadSites]);
 const query=search.trim().toLowerCase();
 const filtered=sites.filter(s=>[s.site_name,s.customer_name,s.address].some(v=>String(v||'').toLowerCase().includes(query)));
 return <div className={styles.quoteOverlay}><section className={styles.quotePanel} role="dialog" aria-modal="true" aria-label="고객 견적서 작성">
   <header className={styles.header}><div><h2>견적서 작성</h2><small>{thread.customer_name} 고객 채팅</small></div><button type="button" onClick={close}>채팅으로 돌아가기</button></header>
   <div className={styles.quoteContent}>
   {error&&<p role="alert" className={styles.error}>{error}</p>}
   {site?<><p><strong>{site.site_name||site.address}</strong></p><button type="button" onClick={()=>{if(canClose()){dirty.current=false;setSite(null);}}}>다른 현장 선택</button><ConsultationQuote key={site.id} siteId={site.id} initialChatDraft={activeDraft} onDirtyChange={value=>{dirty.current=value;}}/></>:<>
     <button type="button" className={styles.newSite} disabled={!companyId||analyzing||creating} onClick={analyze}>{analyzing?'채팅 분석 중…':'채팅으로 견적서 자동 작성'}</button>
     <p className={styles.notice}>AI 상담 분석 1회 사용 · 채팅 글만 분석합니다. 사진 속 글과 시공부위는 자동 분석하지 않습니다.</p>
     {analysis&&<div className={styles.draftReview}>
       <h3>추출한 내용 확인</h3>
       {analysis.warnings&&<p role="status" style={{whiteSpace:'pre-wrap',color:'#92400e'}}>{analysis.warnings}</p>}
       {Object.entries({site_name:'현장명',address:'주소',customer_name:'고객명',customer_phone:'고객 연락처',work_description:'시공 내용',contract_amount:'총 견적 금액 (원)'}).map(([key,label])=><label key={key}>{label}{key==='work_description'?<textarea maxLength={500} value={analysis[key]} onChange={e=>setAnalysis(v=>({...v,[key]:e.target.value}))}/>:<input maxLength={500} inputMode={key==='contract_amount'?'numeric':undefined} value={analysis[key]} onChange={e=>setAnalysis(v=>({...v,[key]:e.target.value}))}/>}</label>)}
       {analysis.price_text&&<small>금액 추출 원문: {analysis.price_text}</small>}
       <label>부가세 표시<select value={analysis.vat} onChange={e=>setAnalysis(v=>({...v,vat:e.target.value}))}><option value="">확인 후 선택해주세요</option><option value="included">입력 금액에 부가세 포함</option><option value="separate">입력 금액에 부가세 10% 별도</option><option value="none">부가세 미표기</option></select></label>
       <p className={styles.notice}>총액은 시공 1식으로 작성합니다. 세부 단가를 임의로 나누지 않으며, 견적 금액은 현장의 계약금액에 자동 반영하지 않습니다.</p>
       <button type="button" className={styles.newSite} disabled={analyzing||creating||!companyId} onClick={createFromChat}>{creating?'현장 등록 중…':'확인한 내용으로 현장 등록 · 견적서 열기'}</button>
     </div>}
     <p>{analysis?'기존 현장이면 아래에서 선택해 초안을 적용하세요.':'견적서를 저장할 현장을 선택해주세요.'} 고객 이름이 같더라도 현장을 직접 확인해주세요.</p>
     <input className={styles.siteSearch} aria-label="현장 검색" placeholder="현장명 · 고객명 · 주소 검색" value={search} onChange={e=>setSearch(e.target.value)}/>
     <button type="button" className={styles.newSite} disabled={!companyId||analyzing||creating} onClick={()=>setRegister(true)}>＋ 새 현장 등록 후 견적서 작성</button>
     {sitesMessage&&<p role="status">{sitesMessage}</p>}
     {!companyId&&!error||sitesLoading?<p>현장을 불러오는 중…</p>:<div className={styles.threads}>{filtered.map(s=><button type="button" key={s.id} className={styles.thread} disabled={analyzing||creating} onClick={()=>selectSite(s)}><strong>{s.site_name||'현장명 없음'}</strong><span>{s.customer_name||'고객명 없음'} · {s.address||'주소 없음'}</span></button>)}{!filtered.length&&<p>선택할 현장이 없습니다. 새 현장을 등록해주세요.</p>}</div>}
   </>}
   </div>
 </section>
 <SiteRegisterModal open={register} loading={sitesLoading} createSite={async form=>{const result=await createSite({...form,status:'consulting'});if(result.success)created.current=result.site;return result;}} onClose={()=>{setRegister(false);if(created.current){setActiveDraft(null);setSite(created.current);created.current=null;}}}/>
 </div>;
}
