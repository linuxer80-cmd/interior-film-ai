import { createClient } from '@supabase/supabase-js';
import { verifyWebhook } from '../../../../lib/bootpayAlimtalk.mjs';
import { settleDelivery } from '../../../../lib/alimtalkService';
export const runtime='nodejs';
export async function POST(request) {
 if(Number(request.headers.get('content-length') || 0)>65536) return new Response('',{status:413});
 const raw=await request.text();
 if(raw.length>65536) return new Response('',{status:413});
 if(!verifyWebhook(raw,request.headers,process.env.BOOTPAY_ALIMTALK_WEBHOOK_SECRET)) return new Response('',{status:401});
 try {
  const b=JSON.parse(raw), expected={'alimtalk.send.succeeded':'success','alimtalk.send.failed':'failed','alimtalk.send.canceled':'canceled'}[b.event];
  if(!expected) return Response.json({received:true});
  const d=b.data;
  if(!d || d.status!==expected || !/^[0-9a-f-]{36}$/i.test(d.ref_id || '') || !d.receipt_id) return new Response('',{status:400});
  const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const result=await settleDelivery(db,d.ref_id,expected,d.receipt_id,d.error_code);
  return Response.json({received:true,matched:result.found});
 }catch{return new Response('',{status:500});}
}
