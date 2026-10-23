'use client';
import {SPACES,TARGETS,DAMAGES,SHAPES,COMPONENTS} from '../../lib/photoHierarchy.mjs';
import styles from '../super-admin/photo-data/page.module.css';
const won=n=>n==null?'미입력':`${Number(n).toLocaleString('ko-KR')}원`;
export default function TargetEditor({target:t,onChange,onRemove,index,legacyPrice}){
 const patch=p=>onChange({...t,...p});
 const choices=(key,options)=><div className={styles.chips}>{options.map(x=><button type="button" key={x} aria-pressed={(t[`${key}Input`]??t[key].join(',')).split(',').map(v=>v.trim()).includes(x)} onClick={()=>{
  const old=(t[`${key}Input`]??t[key].join(', ')).split(',').map(v=>v.trim()).filter(Boolean);
  let next=old.includes(x)?old.filter(v=>v!==x):[...old,x];
  if(key==='components'&&x==='문·문틀 세트'&&next.includes(x))next=next.filter(v=>!['문짝','문틀'].includes(v));
  if(key==='components'&&['문짝','문틀'].includes(x)&&next.includes(x))next=next.filter(v=>v!=='문·문틀 세트');
  patch({[key]:next,[`${key}Input`]:next.join(', ')});
 }}>{x}</button>)}</div>;
 return <article className={styles.target}><div className={styles.row}><h3>대상 {index+1} · {t.part}</h3><button type="button" onClick={onRemove}>대상 제거</button></div>
  <div className={styles.fields}>
   <label>1단계 · 공간<select value={t.space} onChange={e=>patch({space:e.target.value})}>{SPACES.map(x=><option key={x}>{x}</option>)}</select></label>
   <label>2단계 · 시공 대상<select value={t.part} onChange={e=>patch({part:e.target.value,kind:'확인 필요',shapes:[],components:[],shapesInput:'',componentsInput:''})}>{Object.keys(TARGETS).map(x=><option key={x}>{x}</option>)}</select></label>
   <label>3단계 · 세부 종류<select value={t.kind} onChange={e=>patch({kind:e.target.value})}>{TARGETS[t.part].map(x=><option key={x}>{x}</option>)}</select></label>
  </div>
  <label>4단계 · 모양·구조<input value={t.shapesInput??t.shapes.join(', ')} onChange={e=>patch({shapesInput:e.target.value})} placeholder="평판형, 여닫이, 일자형 — 쉼표로 구분" /></label>{choices('shapes',SHAPES[t.part]||['평판형','장식형','일자형','ㄱ자형','매입형','곡면형'])}
   <label>5단계 · 파손 정도<select value={t.damage} onChange={e=>patch({damage:e.target.value})}>{DAMAGES.map(x=><option key={x}>{x}</option>)}</select></label>

  <label>6단계 · 구성 부위<input value={t.componentsInput??t.components.join(', ')} onChange={e=>patch({componentsInput:e.target.value})} placeholder="상부장, 하부장, 측판 — 쉼표로 구분" /></label>{choices('components',COMPONENTS[t.part]||['문짝','서랍 전면','상판','측판','주변 프레임','마감판'])}
  <div className={styles.price}><label>이 대상의 시공가격 · 원<input type="number" min="0" step="1" max="1000000000000" value={t.price??''} onChange={e=>patch({price:e.target.value===''?null:Number(e.target.value)})} placeholder="직접 입력 · 미입력 상태로 저장 가능" /></label>
   {legacyPrice!=null&&<button type="button" onClick={()=>patch({price:Number(legacyPrice),priceNote:t.priceNote||'기존 사례 가격 · 이 대상에 적용 확인'})}>기존 사례 가격 {won(legacyPrice)}을 이 대상에 적용</button>}
   <label>가격 기준 · 포함 구성·부가세 등<input value={t.priceNote} maxLength={300} onChange={e=>patch({priceNote:e.target.value})} placeholder="예: 상·하부장 포함 / 부가세 별도" /></label></div>
  <label>판단 근거·미확인 사항<textarea rows={2} value={t.notes} maxLength={1000} onChange={e=>patch({notes:e.target.value})} /></label>
 </article>;
}
