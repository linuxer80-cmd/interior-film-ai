import {createClient} from '@supabase/supabase-js';
import {configuration} from '../../../../lib/bootpayAlimtalk.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const reply=(x,s=200)=>Response.json(x,{status:s,headers:{'Cache-Control':'no-store'}});
async function authenticate(request){
 const token=(request.headers.get('authorization') || '').replace(/^Bearer /,'');
 if(!token) return null;
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:u,error}=await db.auth.getUser(token);
 if(error || !u?.user) return null;
 const {data:a}=await db.from('super_admins').select('user_id').eq('user_id',u.user.id).eq('is_active',true).maybeSingle();
 return a?{db,id:u.user.id}:null;
}
export async function GET(request){
 const a=await authenticate(request);if(!a)return reply({error:'슈퍼관리자 권한이 필요합니다.'},403);
 const results=await Promise.all([a.db.from('companies').select('id,company_name').eq('is_active',true).order('company_name'),a.db.from('alimtalk_accounts').select('*'),a.db.from('alimtalk_credit_entries').select('*').order('created_at',{ascending:false}).limit(50)]);
 if(results.some(r=>r.error))return reply({error:'조회 실패'},500);
 return reply({configuration:configuration(),companies:results[0].data,accounts:results[1].data,entries:results[2].data});
}
export async function POST(request){
 const a=await authenticate(request);if(!a)return reply({error:'슈퍼관리자 권한이 필요합니다.'},403);
 const b=await request.json().catch(()=>({}));
 const uuid=v=>typeof v==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
 if(!uuid(b.requestId)||!uuid(b.companyId)||!Number.isInteger(b.quantity)||b.quantity<1||b.quantity>1000000||typeof b.reason!=='string'||b.reason.trim().length<3)return reply({error:'업체·건수·지급 사유를 확인해주세요.'},400);
 const r=await a.db.rpc('grant_alimtalk_credits',{p_id:b.requestId,p_company:b.companyId,p_quantity:b.quantity,p_reason:b.reason,p_actor:a.id});
 if(r.error)return reply({error:'발송 건수 지급 실패'},500);
 return reply({success:true,...r.data});
}
