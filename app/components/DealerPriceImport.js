"use client";
import { useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { reportRequest } from '../utils/reportClient';
async function preparePhoto(file) {
  if (!file || file.size > 20000000) {
    throw new Error(
      "20MB 이하의 단가표 사진을 선택해주세요."
    );
  }

  const url = URL.createObjectURL(file);

  try {
    const image = new Image();

    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () =>
        reject(
          new Error(
            "사진을 열 수 없습니다. JPG나 PNG로 올려주세요."
          )
        );
      image.src = url;
    });

    const ratio = Math.min(
      1,
      2200 /
        Math.max(
          image.naturalWidth,
          image.naturalHeight
        )
    );

    const canvas = document.createElement("canvas");

    canvas.width = Math.max(
      1,
      Math.round(image.naturalWidth * ratio)
    );
    canvas.height = Math.max(
      1,
      Math.round(image.naturalHeight * ratio)
    );

    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("사진을 처리하지 못했습니다.");
    }

    context.fillStyle = "#fff";
    context.fillRect(
      0,
      0,
      canvas.width,
      canvas.height
    );
    context.drawImage(
      image,
      0,
      0,
      canvas.width,
      canvas.height
    );

    for (const quality of [0.9, 0.8, 0.7, 0.6]) {
      const blob = await new Promise(resolve =>
        canvas.toBlob(
          resolve,
          "image/jpeg",
          quality
        )
      );

      if (blob && blob.size <= 550000) {
        return new File([blob], "price-sheet.jpg", {
          type: "image/jpeg",
        });
      }
    }

    throw new Error(
      "사진 용량이 큽니다. 단가표 부분만 잘라 다시 올려주세요."
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

const amount=n=>n==null?'미등록':Number(n).toLocaleString('ko-KR',{maximumFractionDigits:4});
const typeNames={fire:'방염',non_fire:'비방염',unknown:'확인 필요'};
const empty={brand:'',prefixes:'',priceType:'unknown',unit:'m',supply:'',supplyVat:'unknown',interior:'',interiorVat:'unknown',consumer:'',consumerVat:'unknown',issues:[]};
export default function DealerPriceImport({dealerId,onSaved}) {
 const [files,setFiles]=useState([]),[rows,setRows]=useState([]),[info,setInfo]=useState(''),[warnings,setWarnings]=useState([]);
 const [preview,setPreview]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[reviewed,setReviewed]=useState(false);
 const gate=useRef(false),pending=useRef(null);
 function change(i,key,value){setRows(old=>old.map((r,j)=>i===j?{...r,[key]:value}:r));setPreview(null);setReviewed(false);pending.current=null;}
 async function run(fn){if(gate.current)return;gate.current=true;setBusy(true);setError('');setMessage('');try{await fn();}catch(e){setError(e.message);}finally{gate.current=false;setBusy(false);}}
 async function analyze(){await run(async()=>{
  if(!files.length||files.length>3)throw Error('단가표 사진을 1~3장 선택해주세요.');
  const form=new FormData();
  for(const f of files)form.append('images',await preparePhoto(f));
  const {data}=await supabase.auth.getSession();
  if(!data.session?.access_token)throw Error('다시 로그인해주세요.');
  const response=await fetch('/api/dealer-price-ocr',{method:'POST',headers:{Authorization:'Bearer '+data.session.access_token},body:form});
  const result=await response.json();if(!response.ok)throw Error(result.error||'분석 실패');
  setRows(result.rows.map(r=>({...r,supply:r.supply??'',interior:r.interior??'',consumer:r.consumer??''})));
  setInfo(result.date||'');setWarnings(result.warnings||[]);setPreview(null);setReviewed(false);pending.current=null;
 });}
 async function inspect(){await run(async()=>{
  const result=await reportRequest('/api/dealer-price-import',{action:'preview',dealerId,rules:rows});
  setPreview(result);setReviewed(false);pending.current=null;
 });}
 async function save(){await run(async()=>{
  if(!reviewed||!preview||preview.conflicts.length||!preview.rows.length)throw Error('적용 내역을 먼저 확인해주세요.');
  if(!pending.current)pending.current={action:'save',dealerId,requestId:crypto.randomUUID(),payload:preview.payload,signature:preview.signature};
  const result=await reportRequest('/api/dealer-price-import',pending.current);
  pending.current=null;setPreview(null);setReviewed(false);
  setMessage(result.saved+'개 제품·방염 구분의 단가를 저장했습니다. 기존 견적서는 다시 불러온 후 필름 단가 갱신으로 적용하세요.');
  await onSaved?.();
 });}
 return <details className="price-import">
 <summary>단가표 사진으로 공급가·판매가 일괄등록</summary>
 <p>시공점·시공자 → 매입 공급가 / 인테리어 → 업체 거래처 견적 단가 / 소비자 → 일반 판매 기준가</p>
 <p>사진 장수만큼 영수증·단가표 AI 한도에서 차감합니다. 미리보기·직접 수정·저장은 AI 횟수를 쓰지 않습니다.</p>
 <fieldset disabled={busy}>
 <label>단가표 사진 (최대 3장)<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e=>setFiles([...e.target.files])}/></label>
 <button type="button" onClick={analyze} disabled={!files.length}>AI로 단가표 읽기</button>
 <button type="button" onClick={()=>{setRows([...rows,{...empty}]);setPreview(null);setReviewed(false);}}>직접 행 추가</button>
 {info&&<p>표 시행일: {info} · 저장하면 현재 단가에 즉시 적용됩니다.</p>}
 {warnings.map((w,i)=><p key={i} className="warning">{w}</p>)}
 {rows.map((r,i)=><section key={i} className="rule">
 <strong>{i+1}. {r.brand} {r.prefixes}</strong>
 {r.raw&&<p>원문: {r.raw}</p>}
 {(r.issues||[]).map((x,j)=><p key={j} className="warning">{x}</p>)}
 <div className="grid">
 <label>브랜드<input value={r.brand} onChange={e=>change(i,'brand',e.target.value)}/></label>
 <label>적용 코드·접두어<input value={r.prefixes} placeholder="PW,PS,PX,IS" onChange={e=>change(i,'prefixes',e.target.value)}/></label>
 <label>방염 구분<select value={r.priceType} onChange={e=>change(i,'priceType',e.target.value)}>{Object.entries(typeNames).map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></label>
 <label>단위<select value={r.unit} onChange={e=>change(i,'unit',e.target.value)}><option value="m">1m당</option><option value="kg">kg (등록 제외 필요)</option><option value="roll">롤 (등록 제외 필요)</option><option value="unknown">확인 필요</option></select></label>
 </div>
 {Object.entries({supply:'공급가',interior:'인테리어',consumer:'소비자'}).map(([k,label])=><div className="grid" key={k}>
 <label>{label} (원)<input type="number" min="0" max="10000000" value={r[k]} placeholder="없으면 빈칸" onChange={e=>change(i,k,e.target.value)}/></label>
 <label>{label} VAT<select value={r[k+'Vat']} onChange={e=>change(i,k+'Vat',e.target.value)}><option value="unknown">확인 필요</option><option value="excluded">별도</option><option value="included">포함</option></select></label>
 </div>)}
 <button type="button" onClick={()=>{setRows(rows.filter((_,j)=>j!==i));setPreview(null);setReviewed(false);pending.current=null;}}>이 행 제외</button>
 </section>)}
 {!!rows.length&&<button type="button" onClick={inspect}>적용 제품·변경 금액 미리보기</button>}
 {preview&&<>
 <p>등록된 제품 {preview.rows.length}개·구분에 적용됩니다. 미등록 제품은 자동 생성하지 않습니다. 빈 가격은 기존 값을 유지합니다.</p>
 <p>아래 금액은 모두 VAT 제외 1m 단가입니다. 인테리어 가격은 업체 거래처 현장, 소비자 가격은 일반 고객 현장의 견적서 자동 단가로 적용됩니다.</p>
 {preview.counts.map((n,i)=><p key={i} className={!n?'warning':''}>{rows[i]?.brand} {rows[i]?.prefixes}: {n}개 매칭{!n?' — 적용 대상 없음, 코드 확인 필요':''}</p>)}
 {preview.conflicts.map((x,i)=><p key={i} role="alert">{x}</p>)}
 <div className="preview">{preview.rows.map(r=><p key={r.productId+r.priceType}><strong>{r.brand} {r.code} · {typeNames[r.priceType]}</strong><br/>
 공급가 {amount(r.oldSupply)} → {r.supply==null?'유지':amount(r.supply)}<br/>
 인테리어 {amount(r.oldInterior)} → {r.interior==null?'유지':amount(r.interior)}<br/>
 소비자 {amount(r.oldConsumer)} → {r.consumer==null?'유지':amount(r.consumer)}
 </p>)}</div>
 <label><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/>원본 표의 방염·VAT·시행일 및 적용/제외 제품을 확인했습니다.</label>
 <button type="button" disabled={!reviewed||!preview.rows.length||!!preview.conflicts.length} onClick={save}>확인한 단가 일괄 저장</button>
 </>}
 </fieldset>
 {busy&&<p role="status">처리 중입니다…</p>}{error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
 <style jsx>{`
 .price-import{margin:16px 0;padding:16px;background:#f2f7fc;border:1px solid #cbd5e1;border-radius:14px}
 summary{font-weight:700;cursor:pointer} p{font-size:13px;line-height:1.6} fieldset{border:0;padding:0;min-width:0}
 .rule{padding:14px;margin:12px 0;border:1px solid #cbd5e1;background:white;border-radius:12px}
 .grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}label{display:block;margin:8px 0;font-size:13px}
 input:not([type=checkbox]),select{box-sizing:border-box;width:100%;min-width:0;padding:10px;border:1px solid #cbd5e1;border-radius:8px;font-size:16px}
 button{padding:10px;margin:6px 4px 6px 0;border:1px solid #94a3b8;background:white;border-radius:8px;color:#243648;font-weight:700}
 button:disabled{opacity:.5}.warning,[role=alert]{color:#9a3412}.preview{max-height:360px;overflow:auto;background:white;padding:12px}
 `}</style>
 </details>;
}

