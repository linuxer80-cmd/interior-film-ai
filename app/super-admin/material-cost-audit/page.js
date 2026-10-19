"use client";
import {useState} from 'react';
import {supabase} from '../../../lib/supabase';
export default function CostAudit() {
 const [company,setCompany]=useState(''),[site,setSite]=useState(''),[data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function inspect(e){
  e.preventDefault();setBusy(true);setError('');setData(null);
  try{
   const {data:auth}=await supabase.auth.getSession();
   const response=await fetch('/api/super-admin/material-cost-audit?'+new URLSearchParams({company,site}),{headers:{Authorization:'Bearer '+(auth.session?.access_token||'')}});
   const result=await response.json();if(!response.ok)throw Error(result.error);setData(result);
  }catch(e){setError(e.message)}finally{setBusy(false)}
 }
 return <main><a href="/super-admin">슈퍼관리자 홈</a><h1>현장 원가 단가 진단</h1><p>저장된 자재와 업체 매입단가를 조회합니다.</p>
 <form onSubmit={inspect}><label>업체 ID<input aria-label="업체 ID" required value={company} onChange={e=>setCompany(e.target.value)} style={{display:'block',width:'100%',padding:12}}/></label>
 <label>현장명<input aria-label="현장명" required value={site} onChange={e=>setSite(e.target.value)} style={{display:'block',width:'100%',padding:12}}/></label>
 <button disabled={busy} style={{padding:14,marginTop:12}}>{busy?'조회 중…':'단가 진단 조회'}</button></form>
 {error&&<p role="alert">{error}</p>}{data&&<section><h2>{data.site.site_name}</h2>{data.materials.map(m=><article key={m.id} style={{padding:16,margin:'12px 0',background:'#fff'}}><h3>{m.name}</h3><p>{m.reasonText}</p><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(m,null,2)}</pre></article>)}</section>}</main>;
}
