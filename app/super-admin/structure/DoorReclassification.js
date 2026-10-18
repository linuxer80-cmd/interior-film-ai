"use client";
import { useState } from "react";
import { supabase } from "../../../lib/supabase";
import CaseClassificationFields from "../../components/CaseClassificationFields";
const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
export default function DoorReclassification({companyId}) {
  const [items,setItems]=useState([]),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[drafts,setDrafts]=useState({});
  async function call(body) {
    const {data}=await supabase.auth.getSession();
    const response=await fetch("/api/super-admin/reclassify-doors",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${data.session?.access_token||""}`},body:JSON.stringify({company_id:companyId,...body})});
    const result=await response.json();if(!response.ok)throw Error(result.error);return result;
  }
  async function load(){setBusy(true);try{const result=await call({});setItems(result.items);setMessage(`문 사례 ${result.items.length}건 · 사례별로 분석하고 결과를 확인해주세요.`);}catch(e){setMessage(e.message);}finally{setBusy(false);}}
  async function analyze(item){setBusy(true);setMessage("문 사진을 새 기준으로 분석 중입니다.");try{const result=await call({work_id:item.id});setDrafts(old=>({...old,[item.id]:{profile:result.profile,reviewed:false}}));setMessage(`${result.photoCount}장 분석 완료. 분류를 확인하고 확인 완료에 체크해주세요.`);}catch(e){setMessage(e.message);}finally{setBusy(false);}}
  const statements=items.filter(item=>drafts[item.id]?.reviewed).map(item=>`UPDATE public.work_items SET case_profile = ${quote(JSON.stringify(drafts[item.id].profile))}::jsonb WHERE id = ${quote(item.id)}::uuid AND company_id = ${quote(companyId)}::uuid AND case_profile IS NOT DISTINCT FROM ${item.case_profile==null?"NULL":quote(JSON.stringify(item.case_profile))+"::jsonb"} RETURNING id, case_profile;`);
  const sql=statements.length?["BEGIN;","SET LOCAL standard_conforming_strings = on;",...statements,"COMMIT;"].join("\n\n"):"";
  return <section style={{background:"#fffefa",padding:20,border:"1px solid #ddd",borderRadius:18,marginTop:20}}>
    <h2>문 사례 · 새 기준 재분석</h2>
    <p>기존 사진·가격·임베딩 유지. 분석 후 확인한 사례의 SQL만 생성합니다. AI 비용이 발생하며 DB에는 자동 저장하지 않습니다.</p>
    <button disabled={busy} onClick={load}>문 사례 조회</button>
    <p role="status">{message}</p>
    {items.map(item=><details key={item.id} style={{padding:"12px 0",borderBottom:"1px solid #ddd"}}><summary>{item.category} · {item.sub_category || "세부 분류 없음"} · {item.id.slice(0,8)} {drafts[item.id]?.reviewed?"✓":""}</summary>
      <button disabled={busy} onClick={()=>analyze(item)}>이 사례 새 기준 분석</button>
      {drafts[item.id]&&<><CaseClassificationFields value={drafts[item.id].profile} disabled={busy} onChange={profile=>setDrafts(old=>({...old,[item.id]:{profile,reviewed:false}}))}/>
      <label><input type="checkbox" checked={drafts[item.id].reviewed} onChange={e=>setDrafts(old=>({...old,[item.id]:{...old[item.id],reviewed:e.target.checked}}))}/>분류 확인 완료</label></>}
    </details>)}
    {sql&&<><h3>확인한 {statements.length}건 적용 SQL</h3><p>복사 후 실제 앱 DB에서 실행하세요. 페이지를 닫으면 저장하지 않은 초안은 사라집니다.</p><textarea readOnly value={sql} style={{width:"100%",minHeight:180}}/><button onClick={async()=>{try{await navigator.clipboard.writeText(sql);setMessage("SQL을 복사했습니다.");}catch{setMessage("SQL 입력칸을 길게 눌러 복사해주세요.");}}}>SQL 복사</button></>}
  </section>;
}
