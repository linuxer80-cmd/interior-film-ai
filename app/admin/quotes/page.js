"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabase";
import useSites from "../../hooks/useSites";
import ConsultationQuote from "../ConsultationQuote";
import SiteRegisterModal from "../SiteRegisterModal";
import ToolIllustration from "../../components/ui/ToolIllustration";

const button={minHeight:44,padding:"10px 14px",border:"1px solid #d9ddd5",borderRadius:12,background:"#fffefa",color:"#294e40",fontWeight:700,cursor:"pointer"};
async function api(id,body){
 const {data,error}=await supabase.auth.getSession();
 if(error||!data.session)throw Error("관리자로 다시 로그인해주세요.");
 const response=await fetch(`/api/admin/standalone-quotes${id?`?id=${encodeURIComponent(id)}`:""}`,{method:body?"POST":"GET",cache:"no-store",headers:{Authorization:`Bearer ${data.session.access_token}`,"Content-Type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});
 const result=await response.json().catch(()=>({}));if(!response.ok)throw Error(result.error||"견적서를 불러오지 못했습니다.");return result;
}
function quoteName(q){return q.area_document?.customer_name||q.cost_document?.header?.customer_name||q.cost_document?.header?.site_name||"이름 없는 견적서";}
export default function StandaloneQuotes(){
 const [quotes,setQuotes]=useState([]),[companyId,setCompanyId]=useState(null),[selected,setSelected]=useState(null),[linkOpen,setLinkOpen]=useState(false),[register,setRegister]=useState(false),[query,setQuery]=useState(""),[error,setError]=useState(""),[message,setMessage]=useState(""),[busy,setBusy]=useState(false),[createdSite,setCreatedSite]=useState(null);
 const lock=useRef(false),dirty=useRef(false);
 const {sites,sitesLoading,sitesMessage,loadSites,createSite}=useSites({companyId});
 const refresh=useCallback(async()=>{const data=await api();setQuotes(data.quotes||[]);setCompanyId(data.companyId);return data.quotes||[];},[]);
 useEffect(()=>{let active=true;setBusy(true);api().then(data=>{if(active){setQuotes(data.quotes||[]);setCompanyId(data.companyId)}}).catch(e=>{if(active)setError(e.message)}).finally(()=>{if(active)setBusy(false)});return()=>{active=false}},[]);
 useEffect(()=>{if(linkOpen&&companyId)loadSites()},[linkOpen,companyId,loadSites]);
 async function create(){if(lock.current)return;lock.current=true;setBusy(true);setError("");try{const data=await api(null,{action:"create"});setSelected({id:data.id,linked_site_id:null});setMessage("");}catch(e){setError(e.message)}finally{setBusy(false);lock.current=false}}
 async function back(){if(dirty.current&&!window.confirm("저장하지 않은 내용이 있습니다. 목록으로 돌아갈까요?"))return;dirty.current=false;setSelected(null);setLinkOpen(false);setCreatedSite(null);setError("");setBusy(true);try{await refresh()}catch(e){setError(e.message)}finally{setBusy(false)}}
 async function startLink(){if(dirty.current){setError("작성 중인 견적을 먼저 저장한 뒤 현장에 연결해주세요.");return}setError("");setBusy(true);try{const data=await api(selected.id);setSelected(data.quote);setLinkOpen(true)}catch(e){setError(e.message)}finally{setBusy(false)}}
 async function link(site){if(lock.current)return;if(!window.confirm(`${site.site_name||site.address||"선택한 현장"}에 견적서를 연결할까요? 기존 견적서가 있으면 덮어쓰지 않습니다.`))return;lock.current=true;setBusy(true);setError("");try{await api(selected.id,{action:"link",siteId:site.id});setSelected({...selected,linked_site_id:site.id});setLinkOpen(false);setMessage("현장에 연결했습니다. 연결된 견적서는 해당 현장에서 수정해주세요.");await refresh()}catch(e){setError(e.message)}finally{setBusy(false);lock.current=false}}
 const filtered=sites.filter(s=>s.status!=="cancelled"&&[s.site_name,s.customer_name,s.address].some(v=>String(v||"").toLowerCase().includes(query.trim().toLowerCase())));
 return <main style={{maxWidth:1000,margin:"0 auto",padding:"20px 16px 60px"}}>
  <Link href="/admin" data-ui-link="action" onClick={e=>{if(dirty.current&&!window.confirm("저장하지 않은 내용이 있습니다. 관리자 홈으로 이동할까요?"))e.preventDefault();}}>← 관리자 홈</Link>
  <h1 style={{margin:"24px 0 8px",fontSize:28}}>견적서 작성</h1>
  <p style={{color:"#64748b",fontSize:14,lineHeight:1.6}}>현장 등록 없이 견적서를 작성하고 필요할 때 현장에 연결할 수 있습니다.</p>
  {error&&<p role="alert" style={{color:"#b91c1c"}}>{error}</p>}{message&&<p role="status">{message}</p>}
  {selected?<>
   <div style={{display:"flex",gap:8,flexWrap:"wrap",margin:"14px 0"}}><button type="button" style={button} onClick={back}>← 견적서 목록</button>{selected.linked_site_id?<Link href={`/admin?tab=sites&site=${encodeURIComponent(selected.linked_site_id)}&section=quote`} data-ui-link="action">연결된 현장 열기 →</Link>:<button type="button" style={button} disabled={busy} onClick={startLink}>현장에 연결하기</button>}</div>
   {selected.linked_site_id?<p>현장 연결이 완료되었습니다. 연결된 현장에서 견적서를 확인하고 수정하세요.</p>:<ConsultationQuote key={selected.id} standaloneId={selected.id} onDirtyChange={v=>{dirty.current=v}}/>}
   {linkOpen&&!selected.linked_site_id&&<section style={{marginTop:20,padding:16,border:"1px solid #d9ddd5",borderRadius:16,background:"#fffefa"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><h2 style={{fontSize:18}}>현장에 연결</h2><button type="button" style={button} onClick={()=>setLinkOpen(false)}>닫기</button></div><p style={{fontSize:13}}>저장한 견적서만 연결됩니다. 같은 종류의 견적이 이미 있으면 덮어쓰지 않습니다. 현장 상태와 계약금액은 변경하지 않습니다.</p>
    <input aria-label="현장 검색" value={query} onChange={e=>setQuery(e.target.value)} placeholder="현장명 · 고객명 · 주소" style={{width:"100%",boxSizing:"border-box",padding:12,border:"1px solid #d9ddd5",borderRadius:10}}/>
    <button type="button" style={{...button,marginTop:10}} onClick={()=>setRegister(true)}>＋ 새 현장 등록</button>
    {createdSite&&<p role="status">새 현장이 등록되었습니다. 아래 목록에서 해당 현장을 확인하고 선택해주세요.</p>}{sitesMessage&&<p role="status">{sitesMessage}</p>}{sitesLoading?<p>현장을 불러오는 중…</p>:<div style={{display:"grid",gap:8,marginTop:12}}>{filtered.map(site=><button type="button" key={site.id} style={{...button,textAlign:"left"}} disabled={busy} onClick={()=>link(site)}><strong>{site.site_name||"현장명 없음"}</strong><br/><small>{site.customer_name||"고객명 없음"} · {site.address||"주소 없음"}</small></button>)}{!filtered.length&&<p>선택할 현장이 없습니다.</p>}</div>}
   </section>}
  </>:<><button type="button" style={{...button,background:"#285340",color:"#fffefa",display:"flex",alignItems:"center",gap:12}} onClick={create} disabled={busy}><ToolIllustration kind="standaloneQuote" size={52}/>＋ 새 견적서 작성</button><h2 style={{fontSize:18,marginTop:26}}>작성한 견적서</h2>{busy?<p>불러오는 중…</p>:!quotes.length?<p>작성한 견적서가 없습니다. 새 견적서를 작성해보세요.</p>:<div style={{display:"grid",gap:10}}>{quotes.map(q=><button type="button" key={q.id} style={{...button,textAlign:"left"}} onClick={()=>{setSelected(q);setMessage("");setError("")}}><strong>{quoteName(q)}</strong><br/><small>{q.linked_site_id?"현장 연결됨":"현장 미연결"} · {q.area_revision?"부위별 견적서 ":""}{q.cost_revision?"인건비·자재비 견적서":""}{!q.area_revision&&!q.cost_revision?"작성 전":""}</small></button>)}</div>}</>}
  <SiteRegisterModal companyId={companyId} open={register} loading={sitesLoading} initialQuote={{customer_name:selected?.area_document?.customer_name||selected?.cost_document?.header?.customer_name||"",customer_phone:selected?.area_document?.customer_phone||"",site_name:selected?.cost_document?.header?.site_name||"",address:selected?.area_document?.address||selected?.cost_document?.header?.address||"",work_description:(selected?.area_document?.items||[]).map(x=>x.name).filter(Boolean).join(", ")}} createSite={async form=>{const result=await createSite(form);if(result.success)setCreatedSite(result.site);return result;}} onClose={()=>{setRegister(false);if(companyId)loadSites();}} />
 </main>;
}
