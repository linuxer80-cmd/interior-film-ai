'use client';
import {createContext, useContext, useRef, useState} from 'react';
const Flow = createContext(null);
export function InputStep({index, children}) {
  const flow = useContext(Flow);
  return <div data-input-step={index} hidden={flow.step !== index} style={{display:flow.step === index ? undefined : 'none'}}>{children}</div>;
}
export function InputFinal({children}) {
  const flow = useContext(Flow);
  return <div hidden={flow.step !== flow.count} style={{display:flow.step === flow.count ? undefined : 'none'}}>{children}</div>;
}
function caption(input) {
  if (input.getAttribute('aria-label')) return input.getAttribute('aria-label');
  const label = input.labels?.[0];
  if (label) {
    const copy=label.cloneNode(true);
    copy.querySelectorAll('input,select,textarea,button,small').forEach(el=>el.remove());
    return copy.textContent.trim();
  }
  let node=input;
  for(let level=0;node && level<3;level++,node=node.parentElement){
    let sibling=node.previousElementSibling;
    while(sibling){if(sibling.tagName==='LABEL')return sibling.textContent.trim();sibling=sibling.previousElementSibling;}
  }
  return input.placeholder || '입력값';
}
export default function GuidedForm({titles, children, onSubmit, busy=false, validateStep, review, validateNative=true, initialStep=0, ...props}) {
  const [step,setStep]=useState(initialStep),[snapshot,setSnapshot]=useState([]),[error,setError]=useState('');
  const root=useRef(null), heading=useRef(null);
  function go(index){setError('');setStep(index);requestAnimationFrame(()=>{heading.current?.scrollIntoView({block:'start',behavior:'smooth'});heading.current?.focus({preventScroll:true});});}
  function check(index){
    const message=validateStep?.(index);
    if(message){go(index);setError(message);return false;}
    if(!validateNative)return true;
    const controls=[...(root.current?.querySelectorAll(`[data-input-step="${index}"] input,[data-input-step="${index}"] select,[data-input-step="${index}"] textarea`)||[])];
    const invalid=controls.find(el=>el.willValidate&&!el.checkValidity());
    if(invalid){
      go(index);
      requestAnimationFrame(()=>{let el=invalid.parentElement;while(el&&el!==root.current){if(el.tagName==='DETAILS')el.open=true;el=el.parentElement;}invalid.reportValidity();invalid.focus();});
      return false;
    }
    return true;
  }
  function next(){
    if(busy||!check(step))return;
    if(step===titles.length-1){
      setSnapshot(titles.map((title,index)=>({title,index,fields:[...(root.current?.querySelectorAll(`[data-input-step="${index}"] input,[data-input-step="${index}"] select,[data-input-step="${index}"] textarea`)||[])].filter(el=>!['hidden','password','search','submit','button'].includes(el.type) && !el.disabled).map(el=>({label:caption(el),value:el.type==='file'?[...el.files].map(f=>f.name).join(', '):el.type==='checkbox'?(el.checked?'동의 / 선택':'선택 안 함'):el.type==='radio'?(el.checked?el.value:''):el.tagName==='SELECT'?[...el.selectedOptions].map(o=>o.textContent).join(', '):el.value})).filter(field=>field.value!=='' )})));
    }
    go(Math.min(step+1,titles.length));
  }
  function submit(event){
    if(busy){event.preventDefault();return;}
    if(step<titles.length){event.preventDefault();next();return;}
    for(let i=0;i<titles.length;i++)if(!check(i)){event.preventDefault();return;}
    onSubmit?.(event);
  }
  return <Flow.Provider value={{step,count:titles.length}}><form {...props} ref={root} noValidate onSubmit={submit}>
    <div ref={heading} tabIndex={-1} style={{scrollMarginTop:100,outline:'none',margin:'16px 0'}}>
      <small>단계 {step+1} / {titles.length+1}</small>
      <h3 style={{margin:'8px 0'}}>{step===titles.length?'입력 내용 확인':titles[step]}</h3>
      <progress aria-label='입력 진행 상태' value={step+1} max={titles.length+1} style={{width:'100%',accentColor:'#2563eb'}}/>
    </div>
    {step===titles.length&&<section aria-label='저장 전 확인' style={{background:'#f0f6ff',padding:16,borderRadius:16,marginBottom:16}}>
      <strong>입력한 내용이 맞습니까?</strong>
      {review}
      {snapshot.map(group=><div key={group.index} style={{borderBottom:'1px solid #dbe5ef',padding:'12px 0'}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><b>{group.title}</b><button type='button' disabled={busy} onClick={()=>go(group.index)}>수정</button></div>{group.fields.length?group.fields.map((f,i)=><p key={i} style={{margin:'8px 0',overflowWrap:'anywhere',whiteSpace:'pre-wrap'}}><small>{f.label}</small><br/>{f.value}</p>):<p>추가 입력 없음</p>}</div>)}
      <p>수정할 내용이 있으면 해당 단계의 ‘수정’을 누르세요.</p>
    </section>}
    {children}
    {error&&<p role='alert' style={{color:'#b91c1c'}}>{error}</p>}
    <div style={{display:'flex',gap:12,marginTop:20,padding:'12px 0'}}>
      {step>0&&<button type='button' disabled={busy} onClick={()=>go(step-1)} style={{minHeight:48,flex:1}}>이전</button>}
      {step<titles.length&&<button type='button' disabled={busy} onClick={next} style={{minHeight:48,flex:2,background:'#2563eb',color:'white',border:0,borderRadius:12}}>{step===titles.length-1?'입력 내용 확인':'다음'}</button>}
    </div>
  </form></Flow.Provider>;
}
