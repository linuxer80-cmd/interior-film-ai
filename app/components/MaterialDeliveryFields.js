"use client";
import {deliveryMethods} from '../../lib/materialPilot.mjs';
export default function MaterialDeliveryFields({value,onChange,disabled=false}) {
 const set=(key,val)=>onChange({...value,[key]:val});
 return <fieldset disabled={disabled}><legend>받는 방법</legend>
 <label>수령 방법<select value={value.method||'parcel'} onChange={e=>set('method',e.target.value)}>{Object.entries(deliveryMethods).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
 <label>받는 사람<input value={value.recipient_name||''} maxLength={80} onChange={e=>set('recipient_name',e.target.value)}/></label>
 <label>연락처<input type="tel" value={value.recipient_phone||''} maxLength={25} onChange={e=>set('recipient_phone',e.target.value)}/></label>
 {value.method!=='pickup' && <><label>{value.method==='nearby'?'희망 수령 지역·주소':'받을 주소 / 화물 도착 영업소'}<input value={value.address_line1||''} maxLength={300} onChange={e=>set('address_line1',e.target.value)}/></label><label>상세 주소<input value={value.address_line2||''} maxLength={200} onChange={e=>set('address_line2',e.target.value)}/></label></>}
 {value.method==='nearby'&&<p>희망 지역을 입력해주세요. 공급 대리점이 물건 준비를 확인한 뒤 실제 수령처를 안내합니다.</p>}
 {['quick','freight'].includes(value.method)&&<label><input style={{width:20,display:'inline',minHeight:20}} type="checkbox" checked={!!value.feeAccepted} onChange={e=>set('feeAccepted',e.target.checked)}/> 퀵·화물 운임은 자재대금과 별도로 본인이 부담합니다.</label>}
 </fieldset>;
}
