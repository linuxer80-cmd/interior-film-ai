"use client";
import { useEffect, useRef, useState } from "react";
import { PARTS } from "../../../lib/caseClassification.mjs";
import { classificationSql, classificationBatches } from "../../../lib/classificationSql.mjs";
import { doorCaseType } from "../../../lib/doorCaseType.mjs";
import { supabase } from "../../../lib/supabase";
import CaseClassificationFields from "../../components/CaseClassificationFields";
export default function DoorReclassification({companyId}) {
  const [items,setItems]=useState([]),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[drafts,setDrafts]=useState({});
  const [stats,setStats]=useState(null),[sqlPage,setSqlPage]=useState(0),[copied,setCopied]=useState({});
  const [kind,setKind]=useState("전체 부위");
  const matchesKind=item=>kind==="전체 부위" || (/문|도어|door/i.test(`${item.category} ${item.sub_category}`) && doorCaseType(item)===kind) || item.case_profile?.part===kind || item.category===kind;
  const visibleItems=items.filter(item=>matchesKind(item));
  const stop = useRef(false), running = useRef(false);
  const [failures,setFailures]=useState({}),[progress,setProgress]=useState({done:0,total:0});
  useEffect(()=>()=>{stop.current=true;},[]);
  async function call(body) {
    const {data}=await supabase.auth.getSession();
    const response=await fetch("/api/super-admin/reclassify-doors",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${data.session?.access_token||""}`},body:JSON.stringify({company_id:companyId,...body})});
    const result=await response.json();if(!response.ok)throw Object.assign(Error(result.error),{stopBatch:result.stopBatch || result.code==="AI_QUOTA_UNAVAILABLE" || response.status===429 || response.status===503 || response.status===401 || response.status===403});return result;
  }
  async function load(){setBusy(true);try{const result=await call({});setItems(result.items);setStats(result.stats);setMessage(`목록 조회 완료 · 종류별로 나누어 표시합니다.`);}catch(e){setMessage(e.message);}finally{setBusy(false);}}
  async function runBatch(targets) {
    if(running.current)return;
    running.current=true;stop.current=false;setBusy(true);
    let done=0,failed=0;
    try {
      if(!targets){const result=await call({});setItems(result.items);setStats(result.stats);targets=result.items.filter(item=>matchesKind(item) && item.photo_count>0 && !drafts[item.id]);}
      targets=targets.slice(0,50);
      setProgress({done:0,total:targets.length});
      for(const item of targets) {
        if(stop.current)break;
        setMessage(`전체 ${targets.length}건 중 ${done+1}번째 분석 중 · 이 화면을 열어두세요.`);
        try {
          const result=await call({work_id:item.id});
          setDrafts(old=>({...old,[item.id]:{profile:result.profile,reviewed:true}}));
          setFailures(old=>{const next={...old};delete next[item.id];return next;});
        } catch(e) {
          failed++;setFailures(old=>({...old,[item.id]:e.message}));
          if(e.stopBatch){stop.current=true;setMessage(e.message+" 전체 분석을 중지했습니다.");}
        }
        done++;setProgress({done,total:targets.length});
      }
      if(!stop.current)setMessage(`분석 종료 · 성공 ${done-failed}건 / 실패 ${failed}건. 아래에서 50건씩 SQL을 복사해주세요. 다음 50건 분석으로 이어갈 수 있습니다.`);
    } catch(e){setMessage(e.message);}
    finally{running.current=false;setBusy(false);}
  }
  async function analyze(item){await runBatch([item]);}
  const readyCount=items.filter(item=>drafts[item.id]?.profile).length;
  const batches=classificationBatches(items,drafts);
  const currentPage=Math.min(sqlPage,Math.max(0,batches.length-1));
  const sql=classificationSql(batches[currentPage]||[],drafts,companyId);
  return <section style={{background:"#fffefa",padding:20,border:"1px solid #ddd",borderRadius:18,marginTop:20}}>
    <h2>전체 시공 사례 · 세부 분류</h2>
    <label>분석할 부위 <select value={kind} disabled={busy} onChange={e=>{setKind(e.target.value);setMessage("");setProgress({done:0,total:0});}} style={{minHeight:44}}>
      {["전체 부위",...PARTS.filter(part=>part!=="확인 필요"),"가구문","종류 확인 필요"].map(value=><option key={value}>{value}</option>)}
    </select></label>
    <p>{kind} {visibleItems.length}건 · 종류가 불명확한 문·문틀은 ‘종류 확인 필요’에서 확인하세요.</p>
    {stats&&<p>등록 사진 {stats.totalPhotos.toLocaleString()}장 · 시공 사례 {stats.totalCases}건 · 사진 있는 사례 {stats.casesWithPhotos}건<br/>사례 미연결 사진 {stats.unlinkedPhotos}장 · 사진 없는 사례 {stats.totalCases-stats.casesWithPhotos}건</p>}
    <p>분류 단위는 사진 한 장이 아니라 시공 사례 한 건입니다. 현재 사례당 시공 전 사진 우선 최대 3장을 분석합니다. 미연결 사진은 사례에 연결해야 분석할 수 있습니다.</p>
    <p>기존 사진·가격·임베딩 유지. 분석에 성공한 모든 사례의 SQL을 자동 생성합니다. 개별 확인 체크는 필요 없습니다. 색상은 분류하지 않습니다. AI 비용이 발생하며 DB에는 자동 저장하지 않습니다.</p>
    <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
      <button disabled={busy} onClick={()=>runBatch()}>다음 50건 분석 · 이어서</button>
      <button disabled={busy} onClick={load}>목록 새로고침</button>
      {Object.keys(failures).length>0&&<button disabled={busy} onClick={()=>runBatch(visibleItems.filter(item=>failures[item.id]))}>실패한 사례만 재시도</button>}
      {busy&&<button onClick={()=>{stop.current=true;setMessage("현재 사례가 끝나면 중지합니다.");}}>중지</button>}
    </div>
    {progress.total>0&&<p>진행 {progress.done} / {progress.total}건</p>}
    <p role="status">{message}</p>
    {visibleItems.map(item=><details key={item.id} style={{padding:"12px 0",borderBottom:"1px solid #ddd"}}><summary>{item.category} · {item.sub_category || "세부 분류 없음"} · {item.id.slice(0,8)} · 사진 {item.photo_count ?? "-"}장 {drafts[item.id]?"분석 완료":failures[item.id]?"분석 실패":"대기"}</summary>
      {failures[item.id]&&<p role="alert">{failures[item.id]}</p>}
      <button disabled={busy} onClick={()=>analyze(item)}>이 사례 새 기준 분석</button>
      {drafts[item.id]&&<><CaseClassificationFields value={drafts[item.id].profile} disabled={busy} onChange={profile=>setDrafts(old=>({...old,[item.id]:{profile,reviewed:true}}))}/>
      </>}
    </details>)}
    {sql&&<><h3>분석 완료 {readyCount}건 적용 SQL</h3><div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{batches.map((batch,index)=><button key={index} disabled={busy} onClick={()=>setSqlPage(index)} aria-pressed={currentPage===index}>{index+1}묶음 · {batch.length}건{copied[index]?" · 복사함":""}</button>)}</div><p>현재 {currentPage+1}/{batches.length}묶음 · {batches[currentPage]?.length}건. 복사 후 실제 앱 DB에서 실행하세요. 복사 표시는 DB 적용 완료를 뜻하지 않습니다. 페이지를 닫으면 저장하지 않은 초안은 사라집니다.</p><textarea readOnly value={sql} style={{width:"100%",minHeight:180}}/><button onClick={async()=>{try{await navigator.clipboard.writeText(sql);setCopied(old=>({...old,[currentPage]:true}));setMessage(`${currentPage+1}묶음 SQL을 복사했습니다.`);}catch{setMessage("SQL 입력칸을 길게 눌러 복사해주세요.");}}}>현재 묶음 SQL 복사</button></>}
  </section>;
}
