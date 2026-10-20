"use client";
import {useEffect,useRef} from 'react';
import useAdminOverlayBack from '../../lib/useAdminOverlayBack';
import AdminWorkerTools from './AdminWorkerTools';
export default function AdminPersonalSiteModal({site,day,onClose}){
 const close=useAdminOverlayBack(Boolean(site),onClose,()=>true,950);
 const dialog=useRef(null);
 useEffect(()=>{const previous=document.activeElement;const root=dialog.current;root?.focus();
  const key=e=>{if(e.key==='Escape'){e.preventDefault();close();}if(e.key==='Tab'&&root){const controls=[...root.querySelectorAll('button,a[href],input,select,textarea,[tabindex="0"]')].filter(n=>!n.disabled&&n.getClientRects().length);const first=controls[0],last=controls.at(-1);if(!first){e.preventDefault();root.focus();}else if(e.shiftKey&&(document.activeElement===first||document.activeElement===root)){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}};root?.addEventListener('keydown',key);return()=>{root?.removeEventListener('keydown',key);previous?.focus?.();};},[]);
 if(!site)return null;
 return <div style={{position:'fixed',inset:0,zIndex:950,background:'#182c4780',padding:12,display:'flex',justifyContent:'center',alignItems:'center'}}>
  <section ref={dialog} role="dialog" aria-modal="true" aria-label={`${site.company_name} 내 시공 현장`} tabIndex={-1} style={{width:'100%',maxWidth:850,maxHeight:'94dvh',overflowY:'auto',background:'#fffdf6',borderRadius:20,padding:14,boxSizing:'border-box'}}>
   <div style={{display:'flex',justifyContent:'space-between',gap:8,alignItems:'center',marginBottom:10}}><strong>협력 업체 · {site.company_name}</strong><button type="button" onClick={close} style={{padding:12,minHeight:44,border:'1px solid #dce3d6',borderRadius:10,background:'#fff'}}>닫기 ×</button></div>
   <AdminWorkerTools key={site.id} siteId={site.id} companyName={site.company_name} initialDate={day} onClose={close}/>
  </section>
 </div>;
}
