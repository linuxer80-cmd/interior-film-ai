import {randomUUID} from 'node:crypto';
import {portalDb,signPortal} from '../../../../lib/customerPortal.mjs';
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
export async function POST(request){
 try{
 const token=request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];if(!token)return json({error:'로그인이 필요합니다.'},401);
 const db=portalDb();const {data:auth,error:ae}=await db.auth.getUser(token);if(ae||!auth?.user)return json({error:'다시 로그인해주세요.'},401);
 const {data:profile}=await db.from('profiles').select('company_id,role,is_active').eq('id',auth.user.id).maybeSingle();
 if(profile?.role!=='owner'||profile.is_active===false||!profile.company_id)return json({error:'관리자 권한이 필요합니다.'},403);
 const {siteId,renew=false}=await request.json();if(!/^[0-9a-f-]{36}$/i.test(siteId||''))return json({error:'현장을 확인해주세요.'},400);
 const {data:site,error:se}=await db.from('sites').select('id,status').eq('id',siteId).eq('company_id',profile.company_id).maybeSingle();
 if(se)throw se;if(!site||site.status==='cancelled')return json({error:'이 현장의 고객 페이지를 열 수 없습니다.'},404);
 const {data:company}=await db.from('companies').select('id,slug').eq('id',profile.company_id).eq('is_active',true).maybeSingle();if(!company)return json({error:'업체 이용 상태를 확인해주세요.'},403);
 if(!company.slug)return json({error:'고객페이지 설정에서 업체 주소를 먼저 등록해주세요.'},400);
 const {error}=await db.from('customer_site_portals').upsert({site_id:siteId,company_id:profile.company_id},{onConflict:'site_id',ignoreDuplicates:true});if(error)throw error;
 if(renew){const {error:e}=await db.from('customer_site_portals').update({token_id:randomUUID(),expires_at:new Date(Date.now()+30*86400000).toISOString()}).eq('site_id',siteId).eq('company_id',profile.company_id);if(e)throw e;}
 const {data:p,error:pe}=await db.from('customer_site_portals').select('token_id,expires_at,used').eq('site_id',siteId).eq('company_id',profile.company_id).single();if(pe)throw pe;
 return json({path:'/customer/site/'+signPortal(p.token_id),expiresAt:p.expires_at,remaining:3-p.used});
 }catch(e){console.error('customer portal',e.code||'failed');return json({error:'고객 페이지 링크를 준비하지 못했습니다.'},500);}
}
