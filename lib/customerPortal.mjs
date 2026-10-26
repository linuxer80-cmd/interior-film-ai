import {createHmac,timingSafeEqual} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
export function portalDb(){return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});}
export function signPortal(id,key=process.env.SUPABASE_SERVICE_ROLE_KEY){if(!key)throw Error('서버 설정을 확인해주세요.');return id+'.'+createHmac('sha256',key).update('customer-portal-v1:'+id).digest('base64url');}
export function verifyPortal(token,key=process.env.SUPABASE_SERVICE_ROLE_KEY){if(!key||typeof token!=='string'||token.length>150)return null;const [id,mac,...extra]=token.split('.');if(extra.length||!/^[0-9a-f-]{36}$/i.test(id||'')||!mac)return null;const expected=signPortal(id,key).split('.')[1];return mac.length===expected.length&&timingSafeEqual(Buffer.from(mac),Buffer.from(expected))?id:null;}
export async function resolvePortal(token,db=portalDb()){
 const id=verifyPortal(token);if(!id)return null;
 const {data:p,error}=await db.from('customer_site_portals').select('site_id,company_id,expires_at,used,token_id').eq('token_id',id).maybeSingle();
 if(error)throw error;if(!p||new Date(p.expires_at)<=new Date())return null;
 const [{data:site,error:se},{data:company,error:ce}]=await Promise.all([
 db.from('sites').select('id,site_name,customer_name,status,work_dates,schedule_date').eq('id',p.site_id).eq('company_id',p.company_id).maybeSingle(),
 db.from('companies').select('id,company_name,slug,phone').eq('id',p.company_id).eq('is_active',true).maybeSingle()]);
 if(se||ce)throw se||ce;if(!site||site.status==='cancelled'||!company)return null;return {...p,site,company};
}
