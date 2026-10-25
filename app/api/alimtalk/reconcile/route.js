import {createClient} from '@supabase/supabase-js';
import {timingSafeEqual} from 'node:crypto';
import {refreshDeliveries} from '../../../../lib/siteAlimtalk.mjs';
export const runtime='nodejs';
export const maxDuration=60;
export async function GET(request){
  const secret=process.env.CRON_SECRET,header=request.headers.get('authorization')||'';
  const expected='Bearer '+secret;
  if(!secret||Buffer.byteLength(header)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(header),Buffer.from(expected)))return Response.json({error:'Unauthorized'},{status:401});
  try{
    const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
    // Skip untraceable reservations rather than guessing or re-sending them.
    const rows=await db.from('alimtalk_deliveries').select('id,receipt_id,accounting').eq('accounting','reserved').not('receipt_id','is',null).order('updated_at').limit(100);
    if(rows.error)throw rows.error;
    await refreshDeliveries(db,rows.data);return Response.json({checked:rows.data.length});
  }catch(error){console.error('알림톡 정산 갱신 오류',error.code||'request_failed');return Response.json({error:'결과 갱신 실패'},{status:503});}
}
