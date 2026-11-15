import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

export const runtime = 'nodejs';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const formats = { 'image/jpeg':'jpg', 'image/jpg':'jpg', 'image/png':'png', 'image/webp':'webp', 'image/heic':'heic', 'image/heif':'heif' };
const reply = (data, status=200) => Response.json(data, { status, headers: { 'Cache-Control':'no-store' } });

export async function POST(request) {
  try {
    const token=(request.headers.get('authorization')||'').match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return reply({error:'로그인이 필요합니다.'},401);
    const length=Number(request.headers.get('content-length'));
    if (Number.isFinite(length) && length > 5*1024*1024) return reply({error:'사진은 4MB 이하만 등록할 수 있습니다.'},413);
    const companyId=request.headers.get('X-Assistant-Company');
    if (!uuid.test(companyId||'')) return reply({error:'업체를 확인해 주세요.'},400);
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return reply({error:'사진 서버 설정을 확인해 주세요.'},503);
    const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
    const auth=await db.auth.getUser(token);
    if (auth.error || !auth.data?.user) return reply({error:'로그인을 다시 확인해 주세요.'},401);
    const form=await request.formData(), siteId=form.get('siteId'), type=form.get('photoType'), photo=form.get('photos');
    if (typeof siteId!=='string' || !uuid.test(siteId) || !['request','before','after'].includes(type) || !(photo instanceof File) || !formats[photo.type] || photo.size<1 || photo.size>4*1024*1024) return reply({error:'사진과 현장 정보를 확인해 주세요.'},400);
    const [profile,company,site]=await Promise.all([
      db.from('profiles').select('company_id,role,is_active').eq('id',auth.data.user.id).maybeSingle(),
      db.from('companies').select('id,is_active').eq('id',companyId).maybeSingle(),
      db.from('sites').select('id').eq('id',siteId).eq('company_id',companyId).maybeSingle(),
    ]);
    if (profile.error || company.error || site.error) throw new Error('access lookup failed');
    if (profile.data?.role!=='owner' || profile.data.is_active===false || profile.data.company_id!==companyId || !company.data || company.data.is_active===false || !site.data) return reply({error:'현장 사진을 등록할 권한이 없습니다.'},403);
    const path=`sites/${companyId}/${siteId}/${type}/${randomUUID()}.${formats[photo.type]}`;
    const uploaded=await db.storage.from('work-photos').upload(path,Buffer.from(await photo.arrayBuffer()),{contentType:photo.type,upsert:false});
    if (uploaded.error) throw uploaded.error;
    const saved=await db.from('site_photos').insert({company_id:companyId,site_id:siteId,photo_type:type,storage_path:path,photo_url:null,description:'관리자가 등록한 현장 사진',uploaded_by:auth.data.user.id}).select('id').single();
    if (saved.error) { await db.storage.from('work-photos').remove([path]); throw saved.error; }
    return reply({success:true,site_id:siteId,count:1});
  } catch (error) {
    console.error('assistant site photo upload',error?.code || 'failed');
    return reply({error:'사진 등록 결과를 확인하지 못했습니다. 사진 목록을 확인해 주세요.'},500);
  }
}
