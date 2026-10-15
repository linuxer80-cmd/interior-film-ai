import { createClient } from '@supabase/supabase-js';
export const priceReply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store',Vary:'Authorization'}});
export const priceFault=(message,status=400)=>Object.assign(Error(message),{status});
export async function priceOwner(request) {
  const token=request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if(!token) throw priceFault('관리자 로그인이 필요합니다.',401);
  const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const auth=await db.auth.getUser(token);
  if(auth.error || !auth.data?.user) throw priceFault('다시 로그인해주세요.',401);
  const p=await db.from('profiles').select('company_id,role,is_active').eq('id',auth.data.user.id).maybeSingle();
  if(p.error) throw p.error;
  if(!p.data?.company_id || p.data.role!=='owner' || p.data.is_active===false) throw priceFault('업체 관리자만 이용할 수 있습니다.',403);
  const c=await db.from('companies').select('is_active').eq('id',p.data.company_id).maybeSingle();
  if(c.error) throw c.error;
  if(!c.data?.is_active) throw priceFault('활성 업체를 확인해주세요.',403);
  return {db,companyId:p.data.company_id,userId:auth.data.user.id};
}
export async function allPriceRows(makeQuery) {
  const rows=[];
  for(let start=0;start<20000;start+=500) {
    const r=await makeQuery().range(start,start+499);
    if(r.error) throw r.error;
    rows.push(...(r.data||[]));
    if((r.data||[]).length<500) return rows;
  }
  throw priceFault('조회 대상이 너무 많습니다. 관리자에게 문의해주세요.');
}
