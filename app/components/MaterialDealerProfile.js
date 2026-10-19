"use client";
import { useState } from 'react';
import { dealerFields, normalizeDealerProfile } from '../../lib/materialDealerProfile.mjs';
export default function MaterialDealerProfile({dealer,busy,onSave,register=false}) {
 const [editing,setEditing]=useState(register),[values,setValues]=useState(null),[error,setError]=useState('');
 const current=values||{...dealer?.profile,name:dealer?.name||''};
 function begin(){setValues({...dealer?.profile,name:dealer?.name||''});setError('');setEditing(true);}
 function submit(event){
  event.preventDefault();
  try{const profile=normalizeDealerProfile(current,{test:dealer?.is_test});setError('');onSave(profile);}catch(e){setError(e.message);}
 }
 return <div style={{width:'100%'}}>
  {!editing?<><p>{dealer?.profile?.representative_name&&`대표 ${dealer.profile.representative_name} · `}{dealer?.profile?.phone||'연락처 미등록'}<br/>{dealer?.profile?.address||'사업장 주소 미등록'} {dealer?.profile?.address_detail}</p><button disabled={busy} onClick={begin}>대리점 상세정보 보기·수정</button></>:<form onSubmit={submit}>
   <p>{dealer?.is_test?'테스트 대리점입니다. 확인되지 않은 사업자·연락처는 비워두세요.':'대리점명·대표자·사업자등록번호·대표 전화·사업장 주소는 필수입니다.'}</p>
   {dealerFields.map(([key,label,max])=><label key={key}>{label}{!dealer?.is_test&&['name','representative_name','business_number','phone','address'].includes(key)?' *':''}
    <input disabled={busy} type={key==='email'?'email':key.includes('phone')?'tel':'text'} maxLength={max} value={current[key]||''} onChange={e=>setValues({...current,[key]:e.target.value})} inputMode={['business_number','postal_code'].includes(key)?'numeric':undefined}/>
   </label>)}
   <fieldset disabled={busy}><legend>취급 브랜드</legend>{['영림','현대보닥'].map(brand=><label key={brand}><input type="checkbox" style={{display:'inline',width:'auto',minHeight:0,marginRight:8}} checked={(current.handled_brands||[]).includes(brand)} onChange={e=>setValues({...current,handled_brands:e.target.checked?[...(current.handled_brands||[]),brand]:(current.handled_brands||[]).filter(b=>b!==brand)})}/>{brand==='현대보닥'?'현대보닥 (현대)':brand}</label>)}</fieldset>
   <p>등록 단가는 부가세 별도입니다. 주문금액에 부가세 10%를 더해 결제합니다.</p>
   {error&&<p role="alert">{error}</p>}
   <button disabled={busy} type="submit">{register?'대리점 이용 신청':'상세정보 저장'}</button>
   {!register&&<button disabled={busy} type="button" onClick={()=>setEditing(false)}>닫기</button>}
  </form>}
 </div>;
}
