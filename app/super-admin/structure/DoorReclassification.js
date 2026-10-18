"use client";
import { useEffect, useRef, useState } from "react";
import { doorCaseType } from "../../../lib/doorCaseType.mjs";
import { supabase } from "../../../lib/supabase";
import CaseClassificationFields from "../../components/CaseClassificationFields";
const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
export default function DoorReclassification({companyId}) {
  const [items,setItems]=useState([]),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[drafts,setDrafts]=useState({});
  const [kind,setKind]=useState("방문");
  const visibleItems=items.filter(item=>doorCaseType(item)===kind);
  const stop = useRef(false), running = useRef(false);
  const [failures,setFailures]=useState({}),[progress,setProgress]=useState({done:0,total:0});
  useEffect(()=>()=>{stop.current=true;},[]);
  async function call(body) {
    const {data}=await supabase.auth.getSession();
    const response=await fetch("/api/super-admin/reclassify-doors",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${data.session?.access_token||""}`},body:JSON.stringify({company_id:companyId,...body})});
    const result=await response.json();if(!response.ok)throw Object.assign(Error(result.error),{stopBatch:result.stopBatch || result.code==="AI_QUOTA_UNAVAILABLE" || response.status===429 || response.status===503 || response.status===401 || response.status===403});return result;
  }
  async function load(){setBusy(true);try{const result=await call({});setItems(result.items);setMessage(`목록 조회 완료 · 종류별로 나누어 표시합니다.`);}catch(e){setMessage(e.message);}finally{setBusy(false);}}
  async function runBatch(targets) {
    if(running.current)return;
    running.current=true;stop.current=false;setBusy(true);
    let done=0,failed=0;
    try {
      if(!targets){const result=await call({});setItems(result.items);targets=result.items.filter(item=>doorCaseType(item)===kind && !drafts[item.id]);}
      setProgress({done:0,total:targets.length});
      for(const item of targets) {
        if(stop.current)break;
        setMessage(`전체 ${targets.length}건 중 ${done+1}번째 분석 중 · 이 화면을 열어두세요.`);
        try {
          const result=await call({work_id:item.id});
          setDrafts(old=>({...old,[item.id]:{profile:result.profile,reviewed:false}}));
          setFailures(old=>{const next={...old};delete next[item.id];return next;});
        } catch(e) {
          failed++;setFailures(old=>({...old,[item.id]:e.message}));
          if(e.stopBatch){stop.current=true;setMessage(e.message+" 전체 분석을 중지했습니다.");}
        }
        done++;setProgress({done,total:targets.length});
      }
      if(!stop.current)setMessage(`분석 종료 · 성공 ${done-failed}건 / 실패 ${failed}건. 결과 확인 후 SQL을 복사해주세요.`);
    } catch(e){setMessage(e.message);}
    finally{running.current=false;setBusy(false);}
  }
  async function analyze(item){await runBatch([item]);}
  const statements=items.filter(item=>drafts[item.id]?.reviewed).map(item=>`UPDATE public.work_items SET case_profile = ${quote(JSON.stringify(drafts[item.id].profile))}::jsonb WHERE id = ${quote(item.id)}::uuid AND company_id = ${quote(companyId)}::uuid AND case_profile IS NOT DISTINCT FROM ${item.case_profile==null?"NULL":quote(JSON.stringify(item.case_profile))+"::jsonb"} RETURNING id, case_profile;`);
  const sql=statements.length?["BEGIN;","SET LOCAL standard_conforming_strings = on;",...statements,"COMMIT;"].join("\n\n"):"";
  return <section style={{background:"#fffefa",padding:20,border:"1px solid #ddd",borderRadius:18,marginTop:20}}>
    <h2>문 사례 · 새 기준 재분석</h2>
    <label>분석할 문 종류 <select value={kind} disabled={busy} onChange={e=>{setKind(e.target.value);setMessage("");setProgress({done:0,total:0});}} style={{minHeight:44}}>
      {["방문","방화문","중문","현관문","드레스룸문","가구문","종류 확인 필요"].map(value=><option key={value}>{value}</option>)}
    </select></label>
    <p>{kind} {visibleItems.length}건 · 종류가 불명확한 문·문틀은 ‘종류 확인 필요’에서 확인하세요.</p>
    <p>기존 사진·가격·임베딩 유지. 분석 후 확인한 사례의 SQL만 생성합니다. AI 비용이 발생하며 DB에는 자동 저장하지 않습니다.</p>
    <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
      <button disabled={busy} onClick={()=>runBatch()}>{kind} 전체 분석 · 이어서</button>
      <button disabled={busy} onClick={load}>목록 새로고침</button>
      {Object.keys(failures).length>0&&<button disabled={busy} onClick={()=>runBatch(visibleItems.filter(item=>failures[item.id]))}>실패한 사례만 재시도</button>}
      {busy&&<button onClick={()=>{stop.current=true;setMessage("현재 사례가 끝나면 중지합니다.");}}>중지</button>}
    </div>
    {progress.total>0&&<p>진행 {progress.done} / {progress.total}건</p>}
    <p role="status">{message}</p>
    {visibleItems.map(item=><details key={item.id} style={{padding:"12px 0",borderBottom:"1px solid #ddd"}}><summary>{item.category} · {item.sub_category || "세부 분류 없음"} · {item.id.slice(0,8)} {drafts[item.id]?.reviewed?"✓ 확인":drafts[item.id]?"분석 완료":failures[item.id]?"분석 실패":"대기"}</summary>
      {failures[item.id]&&<p role="alert">{failures[item.id]}</p>}
      <button disabled={busy} onClick={()=>analyze(item)}>이 사례 새 기준 분석</button>
      {drafts[item.id]&&<><CaseClassificationFields value={drafts[item.id].profile} disabled={busy} onChange={profile=>setDrafts(old=>({...old,[item.id]:{profile,reviewed:false}}))}/>
      <label><input type="checkbox" checked={drafts[item.id].reviewed} onChange={e=>setDrafts(old=>({...old,[item.id]:{...old[item.id],reviewed:e.target.checked}}))}/>분류 확인 완료</label></>}
    </details>)}
    {sql&&<><h3>확인한 {statements.length}건 적용 SQL</h3><p>복사 후 실제 앱 DB에서 실행하세요. 페이지를 닫으면 저장하지 않은 초안은 사라집니다.</p><textarea readOnly value={sql} style={{width:"100%",minHeight:180}}/><button onClick={async()=>{try{await navigator.clipboard.writeText(sql);setMessage("SQL을 복사했습니다.");}catch{setMessage("SQL 입력칸을 길게 눌러 복사해주세요.");}}}>SQL 복사</button></>}
  </section>;
}
