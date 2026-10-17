import { createClient } from '@supabase/supabase-js';
export function pilotDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw Error('서버 설정을 확인해주세요.');
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
export async function pilotIdentity(request) {
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw Object.assign(Error('로그인해주세요.'),{status:401});
  const db = pilotDb();
  const {data,error} = await db.auth.getUser(token);
  if (error || !data?.user || (!data.user.email_confirmed_at && !data.user.identities?.some(identity => identity.provider === "kakao"))) throw Object.assign(Error('이메일 인증 또는 카카오 로그인이 필요합니다.'),{status:401});
  return {db,user:data.user};
}
export async function pilotBuyer(db, userId) {
  const {data:p,error:e} = await db.from('profiles').select('company_id,role,is_active').eq('id',userId).maybeSingle();
  if(e) throw e;
  if(!p?.company_id || p.role !== 'owner' || p.is_active === false) return null;
  const [{data:c,error:ce},{data:allowed,error:ae}] = await Promise.all([
    db.from('companies').select('id,is_active').eq('id',p.company_id).maybeSingle(),
    db.from('material_pilot_companies').select('company_id').eq('company_id',p.company_id).eq('enabled',true).maybeSingle()
  ]);
  if(ce || ae) throw ce || ae;
  return c?.is_active === true && allowed ? p.company_id : null;
}
export async function pilotRole(db,user,mode) {
  if(mode === 'super') {
    const {data,error} = await db.from('super_admins').select('user_id').eq('user_id',user.id).eq('is_active',true).maybeSingle();
    if(error) throw error;
    if(data) return {role:'super'};
  } else if(mode === 'dealer') {
    const {data,error} = await db.from('material_pilot_dealers').select('id,name,status').eq('user_id',user.id).maybeSingle();
    if(error) throw error;
    if(data?.status === 'active') return {role:'dealer',dealerId:data.id};
  } else if(mode === 'buyer') {
    const companyId = await pilotBuyer(db,user.id);
    if(companyId) return {role:'buyer',companyId};
  }
  throw Object.assign(Error('테스트 이용 권한이 없습니다. 필름장이 업체 또는 승인된 대리점만 이용할 수 있습니다.'),{status:403});
}
export const pilotJson = (body,status=200) => Response.json(body,{status,headers:{'Cache-Control':'private, no-store',Vary:'Authorization'}});
