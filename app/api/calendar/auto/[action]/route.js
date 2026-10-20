import { createClient } from '@supabase/supabase-js';
import { privateAuth, privateJson } from '../../../../../lib/workerPrivate';
import { APP_ORIGIN, CALLBACK_URI, randomSecret, hashState, seal, unseal, authorizationUrl, googleToken, cookieState, stateCookie, validState, equalSecret, oauthConfig } from '../../../../../lib/calendarAutoCrypto.mjs';
import { CALENDAR_SCOPE } from '../../../../../lib/googleCalendar.mjs';
import { checked, runAutoSync } from '../../../../../lib/calendarAutoSync.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=300;
function serverDb() {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw Error('Server configuration missing');
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
function redirect(result) {
  return new Response(null,{status:303,headers:{Location:APP_ORIGIN+'/account/calendar?auto='+result,'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer',...(result==='error'?{'Set-Cookie':stateCookie('',0)}:{})}});
}
function errorResponse(error) {
  return privateJson({error:['42P01','PGRST205','PGRST202'].includes(error?.code)?'캘린더 자동 연결용 SQL을 먼저 실행해주세요.':'캘린더 자동 연결을 처리하지 못했습니다. 서버 설정과 연결 상태를 확인해주세요.'},503);
}
export async function GET(request,{params}) {
  const {action}=await params;
  if(action==='cron')return cron(request);
  if(action==='callback') {
    try {
      const q=new URL(request.url).searchParams,state=q.get('state'),cookie=cookieState(request);
      if(!validState(state)||!equalSecret(state,cookie)||q.has('error')||!q.get('code')||q.get('code').length>4096)return redirect('error');
      const db=serverDb(),hash=hashState(state);
      const pending=await checked(db.from('calendar_auto_pending').select('user_id').eq('state_hash',hash).is('code_cipher',null).gt('expires_at',new Date().toISOString()).maybeSingle());
      if(!pending)return redirect('error');
      const saved=await checked(db.from('calendar_auto_pending').update({code_cipher:seal(q.get('code'),'code:'+pending.user_id+':'+hash)}).eq('state_hash',hash).is('code_cipher',null).gt('expires_at',new Date().toISOString()).select('state_hash').maybeSingle());
      return redirect(saved?'finish':'error');
    } catch {return redirect('error');}
  }
  if(action!=='status')return privateJson({error:'지원하지 않는 요청입니다.'},404);
  try {
    const auth=await privateAuth(request,false);if(auth.error)return privateJson({error:auth.error},auth.status);
    const row=await checked(auth.db.from('calendar_auto_connections').select('enabled,needs_reconnect,last_sync_at,last_error,next_run_at').eq('user_id',auth.user.id).maybeSingle());
    let configured=true;try {oauthConfig();}catch {configured=false;}
    return privateJson({configured,connection:row});
  }catch(error){return errorResponse(error);}
}
async function cron(request) {
  if(!process.env.CALENDAR_CRON_SECRET||!equalSecret(request.headers.get('authorization')||'','Bearer '+process.env.CALENDAR_CRON_SECRET))return privateJson({error:'Unauthorized'},401);
  try {
    const db=serverDb(),deadline=Date.now()+220000;let processed=0,failed=0;
    await checked(db.from('calendar_auto_pending').delete().lt('expires_at',new Date().toISOString()));
    // A bounded fair queue. Each user's next_run_at advances; another invocation
    // picks up users left over. Leases prevent overlapping invocations duplicating work.
    while(processed<10&&Date.now()<deadline-20000) {
      const result=await runAutoSync(db,null,{deadline});if(result.queued)break;
      processed++;if(result.failed)failed++;
    }
    return privateJson({processed,failed});
  }catch(error){return errorResponse(error);}
}
export async function POST(request,{params}) {
  const {action}=await params;
  if(action==='cron')return cron(request);
  if(request.headers.get('origin')!==APP_ORIGIN)return privateJson({error:'앱에서 다시 요청해주세요.'},403);
  if(!['start','finish','disconnect','sync'].includes(action))return privateJson({error:'지원하지 않는 요청입니다.'},404);
  try {
    const auth=await privateAuth(request,false);if(auth.error)return privateJson({error:auth.error},auth.status);
    const {db,user}=auth;
    if(action==='start') {
      oauthConfig();
      const profile=await checked(db.from('profiles').select('is_active').eq('id',user.id).maybeSingle());
      if(profile?.is_active===false)return privateJson({error:'비활성 계정은 연결할 수 없습니다.'},403);
      const state=randomSecret(),verifier=randomSecret(),hash=hashState(state);
      await checked(db.from('calendar_auto_pending').upsert({state_hash:hash,user_id:user.id,verifier_cipher:seal(verifier,'verifier:'+user.id+':'+hash),code_cipher:null,expires_at:new Date(Date.now()+600000).toISOString()},{onConflict:'user_id'}));
      const response=privateJson({url:authorizationUrl(state,verifier)});response.headers.set('Set-Cookie',stateCookie(state));return response;
    }
    if(action==='finish') {
      const state=cookieState(request);
      if(!validState(state))return privateJson({error:'인증 시간이 만료됐습니다. 다시 연결해주세요.'},400);
      const hash=hashState(state);
      // One-time consume requires BOTH the original app identity and browser.
      const pending=await checked(db.from('calendar_auto_pending').delete().eq('state_hash',hash).eq('user_id',user.id).gt('expires_at',new Date().toISOString()).not('code_cipher','is',null).select('*').maybeSingle());
      if(!pending)return privateJson({error:'연결을 시작한 앱 계정으로 다시 연결해주세요.'},400);
      const tokens=await googleToken({grant_type:'authorization_code',code:unseal(pending.code_cipher,'code:'+user.id+':'+hash),code_verifier:unseal(pending.verifier_cipher,'verifier:'+user.id+':'+hash),redirect_uri:CALLBACK_URI});
      if(!tokens.refresh_token||!String(tokens.scope||'').split(' ').includes(CALENDAR_SCOPE))return privateJson({error:'지속적인 캘린더 접근에 동의한 뒤 다시 연결해주세요.'},400);
      await checked(db.from('calendar_auto_connections').upsert({user_id:user.id,generation:crypto.randomUUID(),refresh_cipher:seal(tokens.refresh_token,'refresh:'+user.id),enabled:true,needs_reconnect:false,last_error:null,last_sync_at:null,next_run_at:new Date().toISOString(),lease_id:null,lease_until:null}));
      const response=privateJson({connected:true});response.headers.set('Set-Cookie',stateCookie('',0));return response;
    }
    if(action==='disconnect') {
      await checked(db.from('calendar_auto_connections').delete().eq('user_id',user.id));
      await checked(db.from('calendar_auto_pending').delete().eq('user_id',user.id));
      const response=privateJson({disconnected:true});response.headers.set('Set-Cookie',stateCookie('',0));return response;
    }
    // Status/last-run is server controlled: repeated clicks cannot bypass the
    // five-minute retry interval or an active per-user lease.
    return privateJson(await runAutoSync(db,user.id));
  }catch(error){return errorResponse(error);}
}
