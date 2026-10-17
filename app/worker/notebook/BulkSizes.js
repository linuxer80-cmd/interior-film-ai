'use client';
import {useState} from 'react';
import {parseMeasurements} from '../../../lib/measurementBulk.mjs';
import s from './notebook.module.css';
export default function BulkSizes({remaining,onAdd,disabled}){
 const [text,setText]=useState(''),[error,setError]=useState(''),[status,setStatus]=useState('');
 const parsed=parseMeasurements(text);
 function add(){setError('');setStatus('');if(parsed.errors.length){setError(parsed.errors.join('\n'));return;}if(!parsed.rows.length){setError('등록할 치수를 입력해주세요.');return;}if(parsed.rows.length>remaining){setError(`이 부위에 ${remaining}개까지 더 등록할 수 있습니다.`);return;}onAdd(parsed.rows);setText('');setStatus(`${parsed.rows.length}개 치수를 추가했습니다.`);}
 return <details className={s.bulk}><summary>여러 치수 한 번에 입력</summary><p>한 줄에 가로 × 세로 × 수량을 입력하세요. 수량을 빼면 1장으로 기록합니다. 단위 mm · 여유 추가 없음</p><label>치수 목록<textarea rows={5} value={text} maxLength={18000} placeholder={'600 × 2400 × 2\n450 × 2100 × 4\n300 × 900'} onChange={e=>{setText(e.target.value);setError('');setStatus('');}} disabled={disabled}/></label><small>공백·쉼표·엑셀에서 복사한 탭 구분도 가능합니다. 같은 치수의 여러 장은 수량에 적어주세요.</small>{parsed.rows.length>0&&<p>{parsed.rows.length}개 치수 · 총 {parsed.rows.reduce((n,r)=>n+r.quantity,0)}장</p>}{error&&<p role="alert" style={{color:'#a33d2d',whiteSpace:'pre-line'}}>{error}</p>}<button type="button" disabled={disabled||!text.trim()} onClick={add}>치수 일괄 추가</button><p role="status">{status}</p></details>;
}
