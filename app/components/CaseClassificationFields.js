"use client";
import { PROFILE_FIELDS, normalizeProfile, shapesFor, fieldApplies } from "../../lib/caseClassification.mjs";
const labels={cabinet_layout:"장 구성",cabinet_front:"수납 전면 구조",unit_count:"보이는 구성 수",drawer_count:"서랍 수",handle_style:"가구 손잡이",side_finish:"노출 측판",trim_profile:"몰딩 단면",trim_position:"몰딩 위치",ceiling_shape:"천장 형태",step_count:"단차 수",surface_geometry:"표면 입체 형태",joint_layout:"분할선",column_shape:"기둥 단면",window_structure:"창 구조",counter_shape:"카운터 배치",obstacle:"배관·설비 장애물",door_kind:"문 종류 · 방문/방화문 구분",leaf_count:"문짝 수 · 한 세트",opening_detail:"열림 방식 상세",panel_count:"알판 개수",panel_form:"알판 형태",glass_layout:"유리 배치",slat_layout:"간살 방향",frame_shape:"문틀 형태",frame_visibility:"문틀 확인 범위",hardware:"손잡이·도어락",damage_location:"손상 위치",damage_extent:"손상 범위",space:"공간",part:"시공 부위",shape:"구조",pattern:"표면 모양",groove_count:"홈 개수",glass:"유리",slats:"간살",damage:"시공 전 손상",coverage:"금액에 포함된 시공 범위"};
export default function CaseClassificationFields({ value, onChange, disabled=false }) {
  const profile=normalizeProfile(value);
  return <fieldset disabled={disabled} style={{border:"1px solid #d8dfd4",borderRadius:14,padding:14,margin:"12px 0"}}>
    <legend>세부 분류</legend>
    <p style={{fontSize:12,color:"#68746c",marginTop:0}}>보이지 않거나 확실하지 않은 항목은 ‘확인 필요’로 두세요. 같은 대상의 여러 사진은 한 묶음으로 등록하세요.</p>
    <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:10}}>
    {Object.entries(PROFILE_FIELDS).filter(([key])=>fieldApplies(key,profile.part)).map(([key,options])=><label key={key} style={{fontSize:13}}>{labels[key]}
      <select value={profile[key]} onChange={e=>onChange(key==="part"?{...normalizeProfile(),space:profile.space,part:e.target.value}:{...profile,[key]:e.target.value})}
        style={{display:"block",width:"100%",minHeight:44,marginTop:4,border:"1px solid #d8dfd4",borderRadius:9,background:"#fffefa",padding:6}}>
        {(key==="shape"?shapesFor(profile.part):options).map(option=><option key={option}>{option}</option>)}
      </select>
    </label>)}
    </div>
  </fieldset>;
}
