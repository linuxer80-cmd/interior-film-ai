"use client";
import {useEffect,useRef,useState} from 'react';
import {supabase} from '../../lib/supabase';
export default function ActualMaterialPricePicker({siteId,value,onApply,onPending,disabled}){
 const [state,setState]=useState({key:'',loading:false,options:[],message:'',error:''});
 const [attempt,setAttempt]=useState(0),[chosen,setChosen]=useState('');
 const callbacks=useRef({onApply,onPending});callbacks.current={onApply,onPending};
 const key=[siteId,value.id||'',value.brand||'',value.product_code||'',value.unit||'',value.price_type||''].join('|');
 useEffect(()=>{
  setChosen('');setState({key,loading:false,options:[],message:'',error:''});
  if(!value.brand||String(value.product_code||'').trim().length<2||disabled)return;
  if(!['m','미터'].includes(String(value.unit||'').trim().toLowerCase())){setState({key,loading:false,options:[],message:'현재 단위의 단가를 직접 입력하세요. 자동 조회는 m 단위만 지원합니다.',error:''});return;}
  const controller=new AbortController();const expected=value.unit_price;
  callbacks.current.onPending?.(true);
  setState({key,loading:true,options:[],message:'',error:''});
  const timer=setTimeout(()=>{controller.abort();setState({key,loading:false,options:[],message:'',error:'단가 조회 시간이 초과됐습니다. 다시 조회해주세요.'});callbacks.current.onPending?.(false);},15000);
  (async()=>{try{
   const {data,error}=await supabase.auth.getSession();if(error||!data?.session)throw Error('관리자로 다시 로그인해주세요.');
   const q=new URLSearchParams({siteId,brand:value.brand,code:value.product_code,priceType:value.price_type||'',...(value.id?{materialId:value.id}:{})});
   const response=await fetch('/api/admin/material-price-options?'+q,{headers:{Authorization:`Bearer ${data.session.access_token}`},cache:'no-store',signal:controller.signal});
   const result=await response.json();if(!response.ok)throw Error(result.error||'단가 조회 실패');
   if(controller.signal.aborted)return;
   const options=Array.isArray(result.options)?result.options:[];
   const purchase=result.version&&result.materialId?{materialId:result.materialId,version:result.version,quantity:result.quantity}:null;
   setState({key,loading:false,options,purchase,message:result.message||'',error:''});
   if(options.length===1){setChosen(String(options[0].id));callbacks.current.onApply(options[0].unitPrice,{key,expected,automatic:true,purchase:purchase?{...purchase,optionId:options[0].id,unitPrice:options[0].unitPrice}:null});}
  }catch(error){if(!controller.signal.aborted)setState({key,loading:false,options:[],message:'',error:error.message});}
  finally{clearTimeout(timer);if(!controller.signal.aborted)callbacks.current.onPending?.(false);}})();
  return()=>{clearTimeout(timer);controller.abort();callbacks.current.onPending?.(false);};
 },[key,attempt,disabled]);
 const current=state.key===key?state:null;
 if(!current)return null;
 return <div style={{display:'grid',gap:8}} aria-label='자재 매입단가'>
  {current.loading&&<p role='status'>매입단가 확인 중…</p>}
  {current.error&&<div role='alert'>{current.error} <button type='button' disabled={disabled} onClick={()=>setAttempt(n=>n+1)}>다시 조회</button></div>}
  {current.message&&<p role='status'>{current.message}</p>}
  {current.options.length>1&&<label>적용할 매입단가<select style={{width:'100%',padding:12,fontSize:16}} disabled={disabled} value={chosen} onChange={e=>{setChosen(e.target.value);const option=current.options.find(p=>String(p.id)===e.target.value);if(option)callbacks.current.onApply(option.unitPrice,{key,automatic:false,purchase:current.purchase?{...current.purchase,optionId:option.id,unitPrice:option.unitPrice}:null});}}><option value=''>대리점·방염 구분 선택</option>{current.options.map(p=><option key={p.id} value={p.id}>{p.label} · {Number(p.unitPrice).toLocaleString('ko-KR')}원/m</option>)}</select></label>}
  {!current.loading&&current.options.length>0&&<button type='button' disabled={disabled} onClick={()=>setAttempt(n=>n+1)}>단가 다시 조회</button>}
  {current.options.length===1&&<p role='status'>단가 출처: {current.options[0].label} · {Number(current.options[0].unitPrice).toLocaleString('ko-KR')}원/m</p>}
 </div>;
}
