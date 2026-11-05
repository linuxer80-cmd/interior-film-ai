import {createClient} from 'npm:@supabase/supabase-js@2.117.2';
import {createDeletionDatabaseAdapter} from './accountDeletionDatabaseAdapter.mjs';
import {executeAccountDeletion} from './accountDeletionExecutor.mjs';
import {handleDeletionRequest} from './accountDeletionRequestHandler.mjs';
import {assessDeletionRequest} from './accountDeletionPreflight.mjs';
const token='__PROBE_TOKEN__';let used=false;
Deno.serve(async req=>{
 if(token==='__PROBE_'+'TOKEN__'||req.headers.get('x-test-token')!==token)return new Response(null,{status:401});
 if(used)return new Response(null,{status:409});used=true;
 const url=Deno.env.get('SUPABASE_URL');if(url!=='https://vnpzrezwzkvwoqajbwvh.supabase.co')return new Response(null,{status:403});
 const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const check=(r:any)=>{if(r.error)throw r.error;return r.data;};
 const company=crypto.randomUUID(),users:string[]=[],avatars:string[]=[];
 const photo=`history/${company}/original.png`;
 const png=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII='),c=>c.charCodeAt(0));
 let requestId:string|undefined,lease:string|undefined,stage='seed',result:any,cleanupOk=true;
 const credentials={email:`last-owner-probe-${crypto.randomUUID()}@example.invalid`,password:crypto.randomUUID()};
 try{
  users.push(check(await db.auth.admin.createUser({...credentials,email_confirm:true})).user.id);
  users.push(check(await db.auth.admin.createUser({email:`member-probe-${crypto.randomUUID()}@example.invalid`,password:crypto.randomUUID(),email_confirm:true})).user.id);
  const subject=users[0],member=users[1];
  check(await db.from('companies').insert({id:company,company_name:'Synthetic empty last-owner company'}));
  check(await db.from('profiles').insert([{id:subject,company_id:company,role:'owner',is_active:true},{id:member,company_id:company,role:'worker',is_active:true}]));
  for(const id of users){const path=`${id}/${crypto.randomUUID()}.png`;avatars.push(path);check(await db.storage.from('labor-avatars').upload(path,png,{contentType:'image/png'}));}
  check(await db.storage.from('work-photos').upload(photo,png,{contentType:'image/png'}));
  const login=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const signed=check(await login.auth.signInWithPassword(credentials));
  const appRequest=()=>new Request(url+'/test',{method:'POST',headers:{authorization:'Bearer '+signed.session.access_token,'content-type':'application/json'},body:JSON.stringify({confirmation:'계정 삭제 요청',userId:member})});
  const authenticate=async(r:Request)=>{const t=r.headers.get('authorization')?.replace(/^Bearer /,'');if(!t)return null;const a=await db.auth.getUser(t);return a.error?null:{db,userId:a.data.user.id};};
  stage='submit';const submitted=await handleDeletionRequest(appRequest(),true,{authenticate,assessDeletionRequest});
  const receipt=await submitted.json();if(submitted.status!==202)throw Error('Submission failed');requestId=receipt.request.id;
  const rpc=async(name:string)=>{if(!requestId||!lease)throw Error('Missing fixture lease');return check(await db.rpc(name,{p_request:requestId,p_lease:lease}));};
  const verify=async(user:string)=>{
   if(user!==subject)throw Error('Fixture subject mismatch');
   const refs=check(await db.rpc('inspect_account_deletion_references',{p_user:user}));
   if(!Array.isArray(refs)||refs.some((x:any)=>!['account_deletion_requests','account_deletion_blocks'].includes(x.table)))throw Error('Personal references remain');
   if(check(await db.storage.from('labor-avatars').list(user)).length)throw Error('Avatar remains');
   if(check(await db.from('companies').select('id').eq('id',company)).length)throw Error('Company remains');
   return true;
  };
  const adapter=createDeletionDatabaseAdapter(db,{
   deletePrivateFiles:async(user:string)=>{if(user!==subject)throw Error('Wrong subject');},
   scrubPersonalData:async(user:string)=>{if(user!==subject)throw Error('Wrong subject');stage='release_calendar';if(await rpc('release_company_calendar_jobs')!==true)throw Error('Calendar release failed');},
   verifyBeforeAuthDeletion:verify,verifyComplete:verify,
  });
  const claim=adapter.claim;adapter.claim=async(id:string)=>{if(id!==requestId)throw Error('Wrong request');const job=await claim(id);lease=job?.lease;return job;};
  // Fixture-only eligibility: fresh empty company, two profiles, three known
  // files, no business sites/workers/calendar connections. Never generalize this
  // to restored or production companies or override their incomplete inventory.
  adapter.preflight=async(user:string)=>{
   if(user!==subject)throw Error('Wrong subject');
   for(const table of ['sites','workers'])if(check(await db.from(table).select('id').eq('company_id',company)).length)throw Error('Unexpected company records');
   for(const id of users)if(check(await db.from('calendar_auto_connections').select('user_id').eq('user_id',id)).length)throw Error('Unexpected calendar connection');
   stage='freeze';const frozen=await rpc('freeze_company_calendar_jobs');if(frozen.companyId!==company)throw Error('Unexpected freeze scope');
   stage='remove_company_file';check(await db.storage.from('work-photos').remove([photo]));
   if(check(await db.storage.from('work-photos').list(`history/${company}`)).length)throw Error('Company file remains');
   stage='finalize_company';if(await rpc('finalize_frozen_empty_company')!==true)throw Error('Company not finalized');
   return {complete:true,blockers:[]};
  };
  stage='execute';const response=await handleDeletionRequest(appRequest(),true,{authenticate,assessDeletionRequest,processRequest:async({userId,requestId:id}:any)=>{
   if(userId!==subject||id!==requestId)throw Error('Wrong app scope');
   check(await db.from('account_deletion_requests').update({status:'processing'}).eq('id',id).eq('user_id',subject).eq('status','review_required'));
   return executeAccountDeletion(adapter,id);
  }});
  const completed=await response.json();if(response.status!==200||completed.request?.status!=='completed')throw Error('No completion receipt');
  stage='verify';await verify(subject);
  if((await db.auth.admin.getUserById(subject)).error?.code!=='user_not_found')throw Error('Subject Auth remains');
  check(await db.auth.admin.getUserById(member));check(await db.storage.from('labor-avatars').download(avatars[1]));
  const profile=check(await db.from('profiles').select('company_id,role,is_active').eq('id',member).single());
  if(profile.company_id!==null||profile.role!=='worker'||profile.is_active!==true)throw Error('Member account altered');
  const persisted=check(await db.from('account_deletion_requests').select('status,company_record_deleted_at,user_id').eq('id',requestId).single());
  if(persisted.status!=='completed'||!persisted.company_record_deleted_at||persisted.user_id!==null)throw Error('Completion not durable');
  result={ok:true,appCompletionReceipt:true,lastOwnerAuthDeleted:true,emptyCompanyDeleted:true,companyFileDeleted:true,ownerAvatarDeleted:true,memberAuthAndAvatarPreserved:true,memberProfileDetached:true,completionPersisted:true};
 }catch(e){result={ok:false,stage,errorCode:typeof e?.code==='string'?e.code:null};}
 finally{
  for(const [bucket,paths] of [['work-photos',[photo]],['labor-avatars',avatars]] as const){if(paths.length&&(await db.storage.from(bucket).remove([...paths])).error)cleanupOk=false;}
  // On failure preserve scoped DB state for diagnosis; do not force-delete a
  // frozen company or bypass its guards in teardown.
  if(result?.ok){
   for(const id of users){if((await db.from('profiles').delete().eq('id',id)).error)cleanupOk=false;const r=await db.auth.admin.deleteUser(id);if(r.error&&r.error.code!=='user_not_found')cleanupOk=false;}
   if(requestId&&(await db.from('account_deletion_requests').delete().eq('id',requestId)).error)cleanupOk=false;
  }else cleanupOk=false;
 }
 return Response.json({...result,cleanupOk,fixtureCompany:company,fixtureUsers:users,fixtureRequest:requestId});
});
