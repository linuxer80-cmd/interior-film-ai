import { authenticateAdmin } from '../../../../lib/siteCallAuth';
import { configuration, bootpayRequest } from '../../../../lib/bootpayAlimtalk.mjs';
import { sendDelivery, settleDelivery } from '../../../../lib/alimtalkService';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const uuid=v=>typeof v==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const reply=(v,s=200)=>Response.json(v,{status:s,headers:{'Cache-Control':'no-store'}});
export async function GET(request) {
 const auth=await authenticateAdmin(request); if(!auth.success) return reply({error:auth.error},auth.status);
 const [a,d,c]=await Promise.all([
  auth.db.from('alimtalk_accounts').select('enabled,available_count').eq('company_id',auth.companyId).maybeSingle(),
  auth.db.from('alimtalk_deliveries').select('id,kind,recipient_mask,status,accounting,error_code,created_at').eq('company_id',auth.companyId).order('created_at',{ascending:false}).limit(50),
  auth.db.from('companies').select('phone').eq('id',auth.companyId).single(),
 ]);
 if(a.error || d.error || c.error) return reply({error:'알림톡 설정을 불러오지 못했습니다.'},500);
 return reply({configuration:configuration(),account:a.data || {enabled:false,available_count:0},deliveries:d.data,phone:c.data?.phone || ''});
}
export async function POST(request) {
 const auth=await authenticateAdmin(request); if(!auth.success) return reply({error:auth.error},auth.status);
 try {
  const b=await request.json();
  if(b.action==='settings' && typeof b.enabled==='boolean') {
   if(b.enabled && !configuration().ready) return reply({error:'서비스 관리자의 부트페이 연결 설정이 필요합니다.'},409);
   const initial=await auth.db.from('alimtalk_accounts').upsert({company_id:auth.companyId},{onConflict:'company_id',ignoreDuplicates:true});
   if(initial.error) throw Error('설정 생성 실패');
   const r=await auth.db.from('alimtalk_accounts').update({enabled:b.enabled,updated_at:new Date().toISOString()}).eq('company_id',auth.companyId);
   if(r.error) throw Error('설정 저장 실패');
   return reply({success:true});
  }
  if(b.action==='test' && uuid(b.requestId)) {
   const {data:c,error}=await auth.db.from('companies').select('phone,company_name,representative_name').eq('id',auth.companyId).single();
   if(error) throw Error('업체 연락처 조회 실패');
   const result=await sendDelivery(auth.db,{id:b.requestId,companyId:auth.companyId,kind:'TEST',phone:c.phone,variables:{company_name:c.company_name,user_name:c.representative_name || '관리자',site_name:'연결 확인',notification_title:'알림톡 연결 확인',notification_message:'필름장이 알림톡 연결 확인 메시지입니다.',detail_url:'https://interior-film-ai.vercel.app/admin'}});
   return reply(result);
  }
  if(b.action==='refresh' && uuid(b.id)) {
   const {data:d,error}=await auth.db.from('alimtalk_deliveries').select('id,receipt_id').eq('id',b.id).eq('company_id',auth.companyId).maybeSingle();
   if(error) throw Error('발송 기록 조회 실패');
   if(!d) return reply({error:'발송 기록이 없습니다.'},404);
   if(!d.receipt_id) return reply({error:'접수번호가 없어 부트페이 발송 내역에서 확인이 필요합니다. 다시 발송하지 마세요.'},409);
   const r=await bootpayRequest(`/alimtalk/messages/${encodeURIComponent(d.receipt_id)}`);
   if(r.ref_id!==d.id || r.receipt_id!==d.receipt_id) throw Error('발송 기록이 일치하지 않습니다.');
   await settleDelivery(auth.db,d.id,r.status,r.receipt_id,r.error_code);
   return reply({success:true});
  }
  return reply({error:'잘못된 요청입니다.'},400);
 } catch {return reply({error:'알림톡 요청을 처리하지 못했습니다. 잠시 후 발송 내역을 확인해주세요.'},500);}
}
