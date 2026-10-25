import {createClient} from '@supabase/supabase-js';
import {timingSafeEqual} from 'node:crypto';
import {runWorkerAlimtalkReminders} from '../../../../lib/workerAlimtalkReminders.mjs';
export const runtime='nodejs';
export const maxDuration=300;
export async function GET(request){
  const secret=process.env.CRON_SECRET,header=request.headers.get('authorization')||'';
  const expected='Bearer '+secret;
  if(!secret||Buffer.byteLength(header)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(header),Buffer.from(expected)))return Response.json({error:'Unauthorized'},{status:401});
  try{
    const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
    return Response.json(await runWorkerAlimtalkReminders(db));
  }catch(error){console.error('시공자 전날 알림톡 오류',error.code||'request_failed');return Response.json({error:'시공자 전날 안내 처리 실패'},{status:503});}
}
