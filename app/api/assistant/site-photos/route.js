import { createClient } from '@supabase/supabase-js';
import { resolveWorkerSite } from '../../../../lib/workerSiteAccess.mjs';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const types=new Set(['all','request','before','after']);
const pageSize=12;
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store',Vary:'Authorization, X-Assistant-View, X-Assistant-Company'}});

// Never sign a row that points at another site's or tenant's storage objects.
function scopedPath(path,company,site) {
  if(typeof path!=='string' || path.length>1500 || /[\\?#]/.test(path) || /%(?:2e|2f|5c|00)/i.test(path)) return '';
  const prefix=`sites/${company}/${site}/`;
  if(!path.startsWith(prefix)) return '';
  const parts=path.slice(prefix.length).split('/');
  return parts.length>=2 && parts.every(p=>p && p!=='.' && p!=='..') ? path : '';
}

export async function GET(request) {
  try {
    const token=(request.headers.get('authorization')||'').match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
    if(!token)return json({error:'로그인이 필요합니다.'},401);
    const url=new URL(request.url),siteId=url.searchParams.get('siteId'),type=url.searchParams.get('type')||'all';
    const pageText=url.searchParams.get('page')||'0',companyId=request.headers.get('X-Assistant-Company');
    const view=request.headers.get('X-Assistant-View');
    if(!uuid.test(siteId||'') || !uuid.test(companyId||'') || !types.has(type) || !/^(?:0|[1-9]\d{0,2})$/.test(pageText) || !['owner','worker'].includes(view))
      return json({error:'현장과 사진 조회 조건을 확인해 주세요.'},400);
    if(!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)return json({error:'사진 서버 설정을 확인해 주세요.'},503);
    const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
    const auth=await db.auth.getUser(token);
    if(auth.error || !auth.data?.user)return json({error:'로그인을 다시 확인해 주세요.'},401);
    if(view==='owner') {
      const profile=await db.from('profiles').select('company_id,role,is_active').eq('id',auth.data.user.id).maybeSingle();
      if(profile.error)throw profile.error;
      if(profile.data?.role!=='owner' || profile.data?.is_active===false || profile.data?.company_id!==companyId)return json({error:'현장 사진을 볼 권한이 없습니다.'},403);
      const [company,site]=await Promise.all([
        db.from('companies').select('id,is_active').eq('id',companyId).maybeSingle(),
        db.from('sites').select('id').eq('id',siteId).eq('company_id',companyId).maybeSingle(),
      ]);
      if(company.error || site.error)throw company.error || site.error;
      if(!company.data || company.data.is_active===false || !site.data)return json({error:'현장 사진을 볼 권한이 없습니다.'},403);
    } else {
      const access=await resolveWorkerSite(db,auth.data.user.id,siteId);
      if(access.site?.company_id!==companyId)return json({error:'현장 사진을 볼 권한이 없습니다.'},403);
    }
    let query=db.from('site_photos').select('id,photo_type,storage_path,description,created_at')
      .eq('company_id',companyId).eq('site_id',siteId).in('photo_type',['request','before','after']);
    if(type!=='all')query=query.eq('photo_type',type);
    const page=Number(pageText),result=await query.order('created_at',{ascending:false}).order('id',{ascending:false})
      .range(page*pageSize,page*pageSize+pageSize);
    if(result.error)throw result.error;
    const rows=result.data||[],visible=rows.slice(0,pageSize);
    const paths=[...new Set(visible.map(p=>scopedPath(p.storage_path,companyId,siteId)).filter(Boolean))];
    const signed=new Map();
    if(paths.length){
      const r=await db.storage.from('work-photos').createSignedUrls(paths,300);
      if(r.error)throw r.error;
      for(const item of r.data||[])if(item.path && item.signedUrl && !item.error)signed.set(item.path,item.signedUrl);
    }
    const photos=visible.map(p=>({id:p.id,type:p.photo_type,description:typeof p.description==='string'?p.description.slice(0,300):'',
      created_at:p.created_at,url:signed.get(scopedPath(p.storage_path,companyId,siteId))||null}));
    return json({siteId,companyId,type,page,hasMore:rows.length>pageSize,photos});
  } catch(error) {
    if(error?.status===403)return json({error:'현장 사진을 볼 권한이 없습니다.'},403);
    console.error('assistant site photos',error?.code || 'failed');
    return json({error:'현장 사진을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'},500);
  }
}
