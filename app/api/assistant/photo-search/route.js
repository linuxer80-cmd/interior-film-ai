import { createClient } from '@supabase/supabase-js';
import { resolveWorkerSite } from '../../../../lib/workerSiteAccess.mjs';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store',Vary:'Authorization, X-Assistant-View, X-Assistant-Company'}});
const text=(value)=>String(value||'').trim();
const read=result=>{ if(result.error) throw result.error; return result.data||[]; };
const pages=async(query,max=10000)=>{
  const rows=[];
  for(let offset=0;offset<max;offset+=500){
    const batch=read(await query.range(offset,offset+499));rows.push(...batch);
    if(batch.length<500)return {rows,truncated:false};
  }
  return {rows,truncated:true};
};
const day=s=>/^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s+'T00:00:00Z')) && new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;

export async function GET(request) {
  try {
    const token=(request.headers.get('authorization')||'').match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
    if(!token)return json({error:'로그인이 필요합니다.'},401);
    const url=new URL(request.url),companyId=request.headers.get('X-Assistant-Company'),view=request.headers.get('X-Assistant-View');
    const site=text(url.searchParams.get('site')),part=text(url.searchParams.get('part')),code=text(url.searchParams.get('code'));
    const from=text(url.searchParams.get('from')),to=text(url.searchParams.get('to')),type=text(url.searchParams.get('type'))||'all';
    if(!uuid.test(companyId||'') || !['all','request','before','after'].includes(type) || !['owner','worker'].includes(view) || [site,part].some(x=>x.length>80) || (code && !/^[a-z0-9-]{2,30}$/i.test(code)) ||
       ((from||to) && (!day(from)||!day(to)||from>to)) || ![site,part,code,from].some(Boolean)) return json({error:'사진 검색 조건을 확인해 주세요.'},400);
    if(!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)return json({error:'사진 서버 설정을 확인해 주세요.'},503);
    const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
    const auth=await db.auth.getUser(token);
    if(auth.error || !auth.data?.user)return json({error:'로그인을 다시 확인해 주세요.'},401);
    const profile=await db.from('profiles').select('company_id,role,is_active').eq('id',auth.data.user.id).maybeSingle();
    if(profile.error)throw profile.error;
    if(!profile.data || profile.data.is_active===false || (view==='owner' && (profile.data.role!=='owner' || profile.data.company_id!==companyId))) return json({error:'사진을 볼 권한이 없습니다.'},403);
    const company=await db.from('companies').select('id,is_active').eq('id',companyId).maybeSingle();
    if(company.error)throw company.error;
    if(!company.data || company.data.is_active===false)return json({error:'사진을 볼 권한이 없습니다.'},403);
    // Bound the scan, and make incomplete searches explicit to the user.
    const scan=await pages(db.from('sites').select('id,company_id,site_name,address,work_type,work_description,status,work_dates,schedule_start,schedule_end')
      .eq('company_id',companyId).order('id'),5000);
    let truncated=scan.truncated;
    let sites=scan.rows.filter(s=>{
      const contains=(value,needle)=>text(value).toLocaleLowerCase().includes(needle.toLocaleLowerCase());
      if(site && ![s.site_name,s.address].some(x=>contains(x,site)))return false;
      if(part && ![s.work_type,s.work_description].some(x=>contains(x,part)))return false;
      if(from){
        const dates=Array.isArray(s.work_dates)?s.work_dates.filter(d=>typeof d==='string'):[];
        const start=text(s.schedule_start).slice(0,10),end=text(s.schedule_end).slice(0,10)||start;
        if(!dates.some(d=>d>=from && d<=to) && !(day(start) && start<=to && end>=from))return false;
      }
      return true;
    });
    if(view==='worker') {
      const allowed=[];
      for(const s of sites){ try {const access=await resolveWorkerSite(db,auth.data.user.id,s.id);if(access.site?.company_id===companyId)allowed.push(s)} catch(e){if(e?.status!==403)throw e} }
      sites=allowed;
    }
    if(code && sites.length){
      const matches=new Set();
      for(let i=0;i<sites.length;i+=40){
        const batch=sites.slice(i,i+40);
        const found=await pages(db.from('site_materials').select('site_id,product_code').eq('company_id',companyId)
          .in('site_id',batch.map(s=>s.id)).ilike('product_code',code).order('site_id'),5000);
        if(found.truncated)truncated=true;
        found.rows.forEach(x=>matches.add(x.site_id));
      }
      sites=sites.filter(s=>matches.has(s.id));
    }
    if(sites.length){
      const withPhotos=new Set();
      for(let i=0;i<sites.length;i+=40){
        const batch=sites.slice(i,i+40);
        const found=await pages(db.from('site_photos').select('site_id').eq('company_id',companyId)
          .in('site_id',batch.map(s=>s.id)).in('photo_type',type==='all'?['request','before','after']:[type]).order('id'));
        if(found.truncated)truncated=true;
        found.rows.forEach(p=>withPhotos.add(p.site_id));
      }
      sites=sites.filter(s=>withPhotos.has(s.id));
    }
    if(sites.length>30)truncated=true;
    const rows=sites.slice(0,30).map(s=>({id:s.id,name:s.site_name||'이름 없는 현장',status:s.status||'',address:s.address||'',date:text(s.schedule_start).slice(0,10)||(Array.isArray(s.work_dates)?text(s.work_dates[0]):'')}));
    return json({companyId,rows,truncated});
  }catch(error){console.error('assistant photo search',error?.code||'failed');return json({error:'사진 검색을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.'},500)}
}
