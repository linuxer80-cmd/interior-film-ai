"use client";
import {useState} from 'react';
import dynamic from 'next/dynamic';
const WorkerSiteDetail=dynamic(()=>import('../worker/site/[siteId]/WorkerSiteDetail'),{ssr:false});
const Attendance=dynamic(()=>import('../components/AttendancePage'),{ssr:false});
const Cutting=dynamic(()=>import('../worker/cutting/CuttingWorkspace'),{ssr:false});
const button={padding:'11px 14px',minHeight:44,border:'1px solid #d5dfcd',borderRadius:12,background:'#edf3e8',color:'#355d46',fontWeight:750,cursor:'pointer'};
export default function AdminWorkerTools({siteId,initialDate=null,onClose,companyName}){
 const [tool,setTool]=useState('site');
 const [cuttingVisited,setCuttingVisited]=useState(false);
 return <section aria-label="관리자 내 시공 도구">
  <div style={{background:'#fffef9',border:'1px solid #dfe4d7',borderRadius:16,padding:14,marginBottom:12}}>
   <strong>{companyName?`${companyName} · `:''}내 시공</strong>
   <p>관리자 화면에서 본인 배정에 따른 시공 업무를 기록합니다.</p>
   <nav aria-label="내 시공 도구" style={{display:'flex',gap:8,flexWrap:'wrap'}}>{[['site','현장·자재·경비·보고·채팅'],['attendance','출퇴근'],['cutting','재단']].map(([id,label])=><button key={id} type="button" style={button} aria-pressed={tool===id} onClick={()=>{setTool(id);if(id==='cutting')setCuttingVisited(true);}}>{label}</button>)}<button type="button" style={button} onClick={onClose}>관리자 현장으로</button></nav>
  </div>
  <div hidden={tool!=='site'}><WorkerSiteDetail siteId={siteId} embedded initialDate={initialDate} onClose={onClose}/></div>
  {tool==='attendance'&&<Attendance embedded mode="worker"/>}
  {cuttingVisited&&<div hidden={tool!=='cutting'}><Cutting siteId={siteId} embedded onClose={()=>setTool("site")}/></div>}
 </section>;
}
