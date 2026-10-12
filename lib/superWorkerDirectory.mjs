// Auth data stays on the server; expose only the directory fields below.
export function workerDirectory({users,profiles,labor,workers,companies,relationships,personal=[],superAdmins=[]}) {
 const ps=new Map(profiles.map(p=>[p.id,p])), ls=new Map(labor.map(p=>[p.user_id,p]));
 const cs=new Map(companies.map(c=>[c.id,c])), rs=new Map(relationships.map(r=>[r.worker_id,r]));
 const memberships=new Map();
 for(const w of workers){if(w.user_id){const group=memberships.get(w.user_id)||[];group.push(w);memberships.set(w.user_id,group);}}
 const contacts=new Map(personal.map(p=>[p.user_id,p.phone]));
 const companyInfo=w=>{const r=rs.get(w.id);return {workerId:w.id,companyId:w.company_id,companyName:cs.get(w.company_id)?.company_name||'업체명 확인 필요',companyActive:cs.get(w.company_id)?.is_active!==false,active:w.is_active!==false,relationship:r&&r.user_id===w.user_id&&!r.ended_at?r.relationship_type:'unspecified'};};
 // registration_type is only a directory label; never an authorization claim.
 const accounts=users.filter(u=>ls.has(u.id)||memberships.has(u.id)||ps.get(u.id)?.role==='worker'||(u.user_metadata?.registration_type==='worker'&&!ps.get(u.id)?.company_id)).map(u=>{
  const p=ps.get(u.id), l=ls.get(u.id), ws=memberships.get(u.id)||[];
  return {id:u.id,kind:'account',name:l?.name||p?.name||ws[0]?.name||'프로필 미등록',email:u.email||'',createdAt:u.created_at,lastSignIn:u.last_sign_in_at,emailConfirmed:!!u.email_confirmed_at,active:p?.is_active!==false,
   hasProfile:!!l,dailyWage:l?.daily_wage??null,region:l?.region||'',skills:l?.skills||[],experience:l?.experience_years??null,introduction:l?.introduction||'',published:!!l?.published,seeking:!!l?.seeking,profileRevision:l?.updated_at||null,
   phones:[...new Set([contacts.get(u.id),...ws.map(w=>w.phone)].filter(Boolean))],memberships:ws.map(companyInfo)};
 });
 const unlinked=workers.filter(w=>!w.user_id).map(w=>({id:w.id,kind:'unlinked',name:w.name||'이름 미등록',phones:w.phone?[w.phone]:[],active:w.is_active!==false,createdAt:w.created_at,memberships:[companyInfo(w)]}));
 const known=new Set(accounts.map(a=>a.id));
 const protectedIds=new Set(superAdmins.map(a=>a.user_id));
 const pending=users.filter(u=>!known.has(u.id)&&!protectedIds.has(u.id)&&!ps.get(u.id)?.company_id&&ps.get(u.id)?.role!=='owner').map(u=>({id:u.id,kind:'pending',name:ps.get(u.id)?.name||'가입 경로 미확인',email:u.email||'',createdAt:u.created_at,emailConfirmed:!!u.email_confirmed_at,hasProfile:false,active:ps.get(u.id)?.is_active!==false,phones:[],memberships:[]}));
 return {accounts,unlinked,pending};
}
export function filterDirectory(directory,{kind='account',query='',status='all',company=''}) {
 const q=query.trim().toLowerCase(), phone=q.replace(/\D/g,'');
 return (kind==='unlinked'?directory.unlinked:kind==='pending'?directory.pending:directory.accounts).filter(r=>
  (!q||[r.name,r.email,r.region,...r.phones,...r.memberships.map(m=>m.companyName)].join(' ').toLowerCase().includes(q)||(phone.length>=4&&r.phones.some(p=>p.replace(/\D/g,'').includes(phone))))&&
  (!company||r.memberships.some(m=>m.companyId===company))&&
  (status==='all'||status==='seeking'&&r.seeking||status==='published'&&r.published||status==='private'&&r.hasProfile&&!r.published||status==='incomplete'&&r.kind==='account'&&(!r.hasProfile||!r.emailConfirmed)||status==='inactive'&&!r.active)
 ).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))||a.id.localeCompare(b.id));
}
