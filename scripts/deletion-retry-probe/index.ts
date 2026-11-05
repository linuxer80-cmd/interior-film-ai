import {createClient} from 'npm:@supabase/supabase-js@2.117.2';
import {handleDeletionRequest} from './accountDeletionRequestHandler.mjs';
import {assessDeletionRequest} from './accountDeletionPreflight.mjs';
import {processAccountDeletionRequest,retryStoredAccountDeletionRequest} from './accountDeletionProcessor.mjs';
const token='__PROBE_TOKEN__';let used=false;
Deno.serve(async req=>{
 if(token==='__PROBE_'+'TOKEN__'||req.headers.get('x-test-token')!==token)return new Response(null,{status:401});
 if(used)return new Response(null,{status:409});used=true;
 const url=Deno.env.get('SUPABASE_URL');if(url!=='https://vnpzrezwzkvwoqajbwvh.supabase.co')return new Response(null,{status:403});
 const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const check=(r:any)=>{if(r.error)throw r.error;return r.data;};
 const users:string[]=[],paths:string[]=[];let requestId:string|undefined,stage='seed',result:any,cleanupOk=true;
 const credentials={email:`personal-delete-${crypto.randomUUID()}@example.invalid`,password:crypto.randomUUID()};
 try{
  users.push(check(await db.auth.admin.createUser({...credentials,email_confirm:true})).user.id);
  users.push(check(await db.auth.admin.createUser({email:`personal-control-${crypto.randomUUID()}@example.invalid`,password:crypto.randomUUID(),email_confirm:true})).user.id);
  check(await db.from('profiles').upsert({id:users[0],company_id:null,role:'worker',is_active:true}));
  const png=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII='),c=>c.charCodeAt(0));
  for(const id of users){const path=`${id}/${crypto.randomUUID()}.png`;paths.push(path);check(await db.storage.from('labor-avatars').upload(path,png,{contentType:'image/png'}));}
  const login=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const signed=check(await login.auth.signInWithPassword(credentials));
  const appReq=new Request(url+'/test',{method:'POST',headers:{authorization:'Bearer '+signed.session.access_token,'content-type':'application/json'},body:JSON.stringify({confirmation:'계정 삭제 요청',userId:users[1]})});
  const authenticate=async(r:Request)=>{const value=r.headers.get('authorization')?.replace(/^Bearer /,'');const auth=await db.auth.getUser(value);return auth.error?null:{db,userId:auth.data.user.id};};
  stage='failure_after_auth';
  const originalRpc=db.rpc.bind(db);
  let injected=false;
  db.rpc=(name:string,args:any)=>{
   if(name==='complete_account_deletion'&&!injected){injected=true;return Promise.resolve({data:null,error:{code:'synthetic_completion_outage'}}) as any;}
   return originalRpc(name,args);
  };
  const response=await handleDeletionRequest(appReq,true,{authenticate,assessDeletionRequest,processRequest:processAccountDeletionRequest});
  db.rpc=originalRpc;
  const failed=check(await db.from('account_deletion_requests').select('id,status,user_id,subject_id,lease_token').eq('subject_id',users[0]).single());
  requestId=failed.id;
  if(response.status!==503||!injected||failed.status!=='failed'||failed.user_id!==null||failed.lease_token!==null)throw Error('Failure fixture not reached');
  if((await db.auth.admin.getUserById(users[0])).error?.code!=='user_not_found')throw Error('Auth should already be absent');
  // Only this newly created synthetic request is aged for the cooldown test.
  check(await db.from('account_deletion_requests').update({updated_at:new Date(Date.now()-6*60*1000).toISOString()}).eq('id',requestId));
  stage='stored_subject_retry';
  const outcomes=await Promise.all([retryStoredAccountDeletionRequest({db,requestId:requestId!}),retryStoredAccountDeletionRequest({db,requestId:requestId!})]);
  if(outcomes.filter(x=>x.status==='completed').length!==1||outcomes.filter(x=>x.status==='busy').length!==1){result={ok:false,stage,outcomes};}
  else{
   stage='verify';
   if((await db.auth.admin.getUserById(users[0])).error?.code!=='user_not_found')throw Error('Subject Auth remains');
   if(check(await db.storage.from('labor-avatars').list(users[0])).length)throw Error('Subject files remain');
   if(check(await db.from('profiles').select('id').eq('id',users[0])).length)throw Error('Profile remains');
   check(await db.auth.admin.getUserById(users[1]));check(await db.storage.from('labor-avatars').download(paths[1]));
   const row=check(await db.from('account_deletion_requests').select('status,user_id').eq('id',requestId).single());if(row.status!=='completed'||row.user_id!==null)throw Error('No durable completion');
   result={ok:true,productionProcessorUsed:true,completionFailureInjected:true,storedSubjectRetryCompleted:true,concurrentRetrySerialized:true,noEligibilityOverride:true,authDeleted:true,avatarDeleted:true,profileDeleted:true,otherUserAndFilePreserved:true,completionPersisted:true};
  }
 }catch(e){result={ok:false,stage,errorCode:typeof e?.code==='string'?e.code:null};}
 finally{
  if(result?.ok){for(let i=0;i<users.length;i++){if((await db.storage.from('labor-avatars').remove([paths[i]])).error)cleanupOk=false;const r=await db.auth.admin.deleteUser(users[i]);if(r.error&&r.error.code!=='user_not_found')cleanupOk=false;}if(requestId&&(await db.from('account_deletion_requests').delete().eq('id',requestId)).error)cleanupOk=false;}
  else cleanupOk=false;
 }
 return Response.json({...result,cleanupOk,fixtureUsers:users,fixtureRequest:requestId});
});
