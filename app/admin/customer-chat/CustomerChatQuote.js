'use client';
import {useEffect,useRef,useState} from 'react';
import {chatRequest} from '../../components/CustomerChat';
import useSites from '../../hooks/useSites';
import useAdminOverlayBack from '../../../lib/useAdminOverlayBack';
import ConsultationQuote from '../ConsultationQuote';
import SiteRegisterModal from '../SiteRegisterModal';
import styles from '../../components/CustomerChat.module.css';

export default function CustomerChatQuote({thread,onClose}){
 const [companyId,setCompanyId]=useState(null),[error,setError]=useState(''),[site,setSite]=useState(null),[search,setSearch]=useState(''),[register,setRegister]=useState(false);
 const dirty=useRef(false),created=useRef(null);
 const {sites,sitesLoading,sitesMessage,loadSites,createSite}=useSites({companyId});
 const canClose=()=>!dirty.current||window.confirm('저장하지 않은 견적 내용이 있거나 처리 중입니다. 닫을까요?');
 const close=useAdminOverlayBack(true,onClose,canClose,1000);
 useEffect(()=>{let active=true;chatRequest('/api/admin/customer-chat?thread='+encodeURIComponent(thread.id),null,true).then(data=>{if(active)setCompanyId(data.companyId);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[thread.id]);
 useEffect(()=>{if(companyId)loadSites();},[companyId,loadSites]);
 const query=search.trim().toLowerCase();
 const filtered=sites.filter(s=>[s.site_name,s.customer_name,s.address].some(v=>String(v||'').toLowerCase().includes(query)));
 return <div className={styles.quoteOverlay}><section className={styles.quotePanel} role="dialog" aria-modal="true" aria-label="고객 견적서 작성">
   <header className={styles.header}><div><h2>견적서 작성</h2><small>{thread.customer_name} 고객 채팅</small></div><button type="button" onClick={close}>채팅으로 돌아가기</button></header>
   <div className={styles.quoteContent}>
   {error&&<p role="alert" className={styles.error}>{error}</p>}
   {site?<><p><strong>{site.site_name||site.address}</strong></p><button type="button" onClick={()=>{if(canClose()){dirty.current=false;setSite(null);}}}>다른 현장 선택</button><ConsultationQuote siteId={site.id} onDirtyChange={value=>{dirty.current=value;}}/></>:<>
     <p>견적서를 저장할 현장을 선택해주세요. 고객 이름이 같더라도 현장을 직접 확인해주세요.</p>
     <input className={styles.siteSearch} aria-label="현장 검색" placeholder="현장명 · 고객명 · 주소 검색" value={search} onChange={e=>setSearch(e.target.value)}/>
     <button type="button" className={styles.newSite} disabled={!companyId} onClick={()=>setRegister(true)}>＋ 새 현장 등록 후 견적서 작성</button>
     {sitesMessage&&<p role="status">{sitesMessage}</p>}
     {!companyId&&!error||sitesLoading?<p>현장을 불러오는 중…</p>:<div className={styles.threads}>{filtered.map(s=><button type="button" key={s.id} className={styles.thread} onClick={()=>setSite(s)}><strong>{s.site_name||'현장명 없음'}</strong><span>{s.customer_name||'고객명 없음'} · {s.address||'주소 없음'}</span></button>)}{!filtered.length&&<p>선택할 현장이 없습니다. 새 현장을 등록해주세요.</p>}</div>}
   </>}
   </div>
 </section>
 <SiteRegisterModal open={register} loading={sitesLoading} createSite={async form=>{const result=await createSite({...form,status:'consulting'});if(result.success)created.current=result.site;return result;}} onClose={()=>{setRegister(false);if(created.current){setSite(created.current);created.current=null;}}}/>
 </div>;
}
