import {badgeImageUrl} from './achievementServer';

// Only enrich subjects already authorized by the parent endpoint.
// Display fields never include progress, addresses or private metrics.
async function selectedBadges(db,selections,audience){
 const valid=selections.filter(p=>p.subject_key&&p.featured_badge);
 if(!valid.length)return new Map();
 const ids=[...new Set(valid.map(p=>p.featured_badge))];
 const unique=[...new Map(valid.map(p=>[p.subject_key+'/'+p.featured_badge,p])).values()];
 const batches=[];
 // At most 30 x 30 award rows per query, below the Data API row limit.
 for(let i=0;i<unique.length;i+=30)batches.push(unique.slice(i,i+30));
 const [awardPages,definitions]=await Promise.all([
  Promise.all(batches.map(batch=>db.from('achievement_awards').select('subject_key,badge_id')
   .in('subject_key',[...new Set(batch.map(p=>p.subject_key))])
   .in('badge_id',[...new Set(batch.map(p=>p.featured_badge))]))),
  db.from('achievement_definitions').select('id,title,art_key,image_path,tier').eq('audience',audience).in('id',ids)
 ]);
 if(awardPages.some(page=>page.error)||definitions.error)return new Map();
 const earned=new Set(awardPages.flatMap(page=>page.data||[]).map(a=>a.subject_key+'/'+a.badge_id));
 const defs=new Map((definitions.data||[]).map(b=>[b.id,{
  id:b.id,title:b.title,art_key:b.art_key,tier:b.tier,image_url:badgeImageUrl(db,b.image_path)
 }]));
 const result=new Map();
 for(const p of valid){
  if(!result.has(p.subject_key)&&earned.has(p.subject_key+'/'+p.featured_badge)&&defs.has(p.featured_badge)){
   result.set(p.subject_key,defs.get(p.featured_badge));
  }
 }
 return result;
}

// Directory consent, published job-seeking profiles, or authorized applicants.
export async function directoryBadges(db,profiles){
 const rows=profiles.map(p=>({...p,featured_badge:null}));
 const ids=[...new Set(rows.map(p=>p.user_id).filter(Boolean))];
 if(!ids.length)return rows;
 try{
  const preferences=await db.from('achievement_preferences').select('user_id,subject_key,featured_badge')
   .in('user_id',ids).in('subject_key',ids.map(id=>'user:'+id));
  if(preferences.error)return rows;
  const valid=(preferences.data||[]).filter(p=>p.subject_key==='user:'+p.user_id);
  const badges=await selectedBadges(db,valid,'worker');
  return rows.map(p=>({...p,featured_badge:badges.get('user:'+p.user_id)||null}));
 }catch{return rows;}
}

// Jobs are already filtered by the labor endpoint. Former owners cannot
// choose the badge shown for their previous company.
export async function companyJobBadges(db,jobs){
 const rows=jobs.map(j=>({...j,company_badge:null}));
 const ids=[...new Set(rows.map(j=>j.company_id).filter(Boolean))];
 if(!ids.length)return rows;
 try{
  const owners=await db.from('profiles').select('id,company_id')
   .in('company_id',ids).eq('role','owner').eq('is_active',true);
  if(owners.error||!owners.data?.length)return rows;
  const ownerIds=[...new Set(owners.data.map(p=>p.id))];
  const preferences=await db.from('achievement_preferences').select('user_id,subject_key,featured_badge')
   .in('user_id',ownerIds).in('subject_key',ids.map(id=>'company:'+id));
  if(preferences.error)return rows;
  const memberships=new Set(owners.data.map(p=>p.id+'/company:'+p.company_id));
  const valid=(preferences.data||[])
   .filter(p=>memberships.has(p.user_id+'/'+p.subject_key))
   .sort((a,b)=>a.user_id.localeCompare(b.user_id));
  const badges=await selectedBadges(db,valid,'owner');
  return rows.map(j=>({...j,company_badge:badges.get('company:'+j.company_id)||null}));
 }catch{return rows;}
}

