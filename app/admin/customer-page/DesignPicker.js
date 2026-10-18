'use client';
import {useState} from 'react';
import {CUSTOMER_DESIGNS,DESIGN_GROUPS,getCustomerDesign,designVars} from '../../../lib/customerPageDesigns.mjs';
import CustomerDesignHero from '../../components/CustomerDesignHero';
import styles from './DesignPicker.module.css';
export default function DesignPicker({value,onChange,profile,companyName,busy,onSave,saved}) {
 const [group,setGroup]=useState(getCustomerDesign(value).group);
 return <section className={styles.panel}>
  <h2>우리 업체 디자인</h2><p>스타일을 고르고 미리 확인한 후 적용해주세요.</p>
  <nav className={styles.groups} aria-label="디자인 스타일">{DESIGN_GROUPS.map(g=><button type="button" key={g} aria-pressed={group===g} onClick={()=>setGroup(g)}>{g}</button>)}</nav>
  <div className={styles.grid}>{CUSTOMER_DESIGNS.filter(d=>d.group===group).map(d=><button className={styles.option} type="button" key={d.id} aria-pressed={value===d.id} disabled={busy} onClick={()=>onChange(d.id)}>
    <div className={styles.thumbnail} style={designVars(d.id)}><CustomerDesignHero designId={d.id} name={companyName || '우리 업체'} introduction="공간에 새로운 표정을 더합니다." image="/images/menu/customer-page.png" /></div>
    <strong>{d.name}{value===d.id?' ✓':''}</strong><small>{d.description}</small>
  </button>)}</div>
  <h3>{getCustomerDesign(value).name} 미리보기</h3>
  <p>업체명·소개를 반영한 상단 미리보기입니다. 아래 사진은 예시이며, 공개페이지에서는 등록한 시공 사례 사진이 표시됩니다.</p>
  <div className={styles.preview} style={designVars(value)}><CustomerDesignHero designId={value} name={profile.business_name || companyName} introduction={profile.introduction} region={profile.regions} image="/images/menu/customer-page.png" /><div className={styles.actions}><span>사진 견적 시작 →</span><span>전화 상담</span></div></div>
  <button className={styles.save} type="button" disabled={busy || value===saved} onClick={onSave}>{busy?'저장 중…':value===saved?'현재 적용된 디자인':'이 디자인 적용'}</button>
 </section>;
}
