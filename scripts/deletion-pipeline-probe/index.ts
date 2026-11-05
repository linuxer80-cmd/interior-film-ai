import {createClient} from 'npm:@supabase/supabase-js@2.117.2';
import {createDeletionDatabaseAdapter} from './accountDeletionDatabaseAdapter.mjs';
import {handleDeletionRequest} from './accountDeletionRequestHandler.mjs';
import {assessDeletionRequest} from './accountDeletionPreflight.mjs';
import {executeAccountDeletion} from './accountDeletionExecutor.mjs';
const token='__PROBE_TOKEN__';
let used=false;
Deno.serve(async req=>{
 if(token==='__PROBE_'+'TOKEN__'||req.headers.get('x-test-token')!==token)return new Response(null,{status:401});
 if(used)return new Response(null,{status:409});used=true;
 const url=Deno.env.get('SUPABASE_URL');
 if(url!=='https://vnpzrezwzkvwoqajbwvh.supabase.co')return new Response(null,{status:403});
 const db=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
 const check=(r:any)=>{if(r.error)throw r.error;return r.data;};
 const credentials:{email:string,password:string}[]=[];const users:string[]=[];const paths:string[]=[];let companyId:string|undefined;let workerId:string|undefined;let siteId:string|undefined;let requestId:string|undefined;let stage='create';let result:any;let cleanupOk=true;
 try{
  for(let i=0;i<2;i++){const c={email:`deletion-pipeline-${crypto.randomUUID()}@example.invalid`,password:crypto.randomUUID()};credentials.push(c);users.push(check(await db.auth.admin.createUser({...c,email_confirm:true})).user.id);}
  const subject=users[0];
  companyId=check(await db.from('companies').insert({company_name:'Synthetic deletion pipeline company'}).select('id').single()).id;
  check(await db.from('profiles').insert(users.map(id=>({id,company_id:companyId,role:'owner',is_active:true}))));
  const png=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII='),c=>c.charCodeAt(0));
  for(const u of users){const p=`${u}/${crypto.randomUUID()}.png`;paths.push(p);check(await db.storage.from('labor-avatars').upload(p,png,{contentType:'image/png'}));}
  stage='seed_work_history';
  workerId=check(await db.from('workers').insert({company_id:companyId,user_id:subject,name:'Synthetic worker',phone:'00000000000',memo:'Synthetic personal memo'}).select('id').single()).id;
  siteId=check(await db.from('sites').insert({company_id:companyId,site_name:'Synthetic deletion site'}).select('id').single()).id;
  check(await db.from('site_workers').insert({company_id:companyId,site_id:siteId,worker_id:workerId,role:'member'}));
  stage='seed_records';
  const badge=check(await db.from('achievement_definitions').select('id').order('id').limit(1).single()).id;
  for(const u of users){
   check(await db.from('notifications').insert({recipient_type:'worker',recipient_user_id:u,type:'synthetic_deletion_probe',title:'Synthetic',message:'Synthetic'}));
   check(await db.from('achievement_awards').insert({subject_key:'user:'+u,badge_id:badge,progress_at_award:1}));
   check(await db.from('achievement_receipts').insert({user_id:u,subject_key:'user:'+u,badge_id:badge}));
   check(await db.from('achievement_preferences').insert({user_id:u,subject_key:'user:'+u,featured_badge:badge}));
   check(await db.from('badge_ai_credits').insert({subject_key:'user:'+u,badge_id:badge,feature:'synthetic_probe',granted:10,used:2}));
  }
  const controlBefore={};
  for(const table of ['achievement_awards','badge_ai_credits'])controlBefore[table]=check(await db.from(table).select('*').eq('subject_key','user:'+users[1]).order('badge_id'));
  stage='submit';
  const loginClient=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
  const loggedIn=check(await loginClient.auth.signInWithPassword(credentials[0]));
  const appRequest=()=>new Request(url+'/functions/v1/deletion-integration-probe',{method:'POST',headers:{authorization:'Bearer '+loggedIn.session.access_token,'content-type':'application/json'},body:JSON.stringify({confirmation:'계정 삭제 요청',userId:users[1]})});
  const authenticate=async(request:Request)=>{const bearer=request.headers.get('authorization')?.replace(/^Bearer /,'');if(!bearer)return null;const auth=await db.auth.getUser(bearer);return auth.error?null:{db,userId:auth.data.user.id};};
  const submitted=await handleDeletionRequest(appRequest(),true,{authenticate,assessDeletionRequest});
  if(submitted.status!==202)throw Error('App submission failed');
  const receipt=await submitted.json();requestId=receipt.request.id;
  if(check(await db.from('account_deletion_requests').select('id').eq('user_id',users[1])).length)throw Error('Client forged subject accepted');
  const verify=async(user:string)=>{
   if(user!==subject)throw Error('Unexpected fixture subject');
   const refs=check(await db.rpc('inspect_account_deletion_references',{p_user:user}));
   if(!Array.isArray(refs))throw Error('Invalid inventory');
   if(refs.some((x:any)=>!['account_deletion_requests','account_deletion_blocks'].includes(x.table)))throw Error('Unexpected fixture data');
   const files=check(await db.storage.from('labor-avatars').list(user));return files.length===0;
  };
  // This test-only contract is valid solely for users created above, with exactly
  // fixture avatar, notices, personal awards and deletion request only. Not production eligibility.
  const adapter=createDeletionDatabaseAdapter(db,{
   deletePrivateFiles:async(user:string)=>{if(user!==subject)throw Error('Unexpected fixture subject');if(check(await db.storage.from('labor-avatars').list(user)).length)throw Error('Avatar remains');},
   scrubPersonalData:async(user:string)=>{
    if(user!==subject)throw Error('Unexpected fixture subject');
    const refs=check(await db.rpc('inspect_account_deletion_references',{p_user:user}));
    if(refs.some((x:any)=>!['account_deletion_requests','account_deletion_blocks','profiles','workers'].includes(x.table)))throw Error('Fixture data remains');
    const p=check(await db.from('profiles').select('company_id,role,is_active').eq('id',user).single());
    if(p.company_id!==companyId||p.role!=='owner'||p.is_active!==false)throw Error('Fixture profile not blocked');
    const w=check(await db.from('workers').select('name,phone,memo,is_active').eq('id',workerId).single());
    if(w.name!=='탈퇴한 시공자'||w.phone!==null||w.memo!==null||w.is_active!==false)throw Error('Worker details not scrubbed');
   },
   verifyBeforeAuthDeletion:verify,verifyComplete:verify,
  });
  adapter.preflight=async(user:string)=>{
   if(user!==subject)throw Error('Unexpected fixture subject');
   const auth=check(await db.auth.admin.getUserById(user));
   if(!auth.user.email?.startsWith('deletion-pipeline-'))throw Error('Not a fresh fixture');
   const refs=check(await db.rpc('inspect_account_deletion_references',{p_user:user}));
   if(refs.some((x:any)=>!['workers','profiles','account_deletion_requests','notifications','achievement_awards','achievement_receipts','achievement_preferences','badge_ai_credits'].includes(x.table)))throw Error('Unexpected initial fixture data');
   return {complete:true,blockers:[]};
  };
  stage='execute';const response=await handleDeletionRequest(appRequest(),true,{authenticate,assessDeletionRequest,processRequest:async({userId,requestId:id}:any)=>{
   if(userId!==subject||id!==requestId)throw Error('Unexpected app request scope');
   check(await db.from('account_deletion_requests').update({status:'processing'}).eq('id',id).eq('user_id',subject).eq('status','review_required'));
   return executeAccountDeletion(adapter,id);
  }});
  const appReceipt=await response.json();
  if(response.status!==200||appReceipt.request?.id!==requestId)throw Error('App completion receipt missing');
  const outcome={status:appReceipt.request.status};
  stage='verify';
  if(outcome.status!=='completed')throw Error('Pipeline incomplete');
  const saved=check(await db.from('account_deletion_requests').select('status,user_id,lease_token').eq('id',requestId).single());
  if(saved.status!=='completed'||saved.user_id!==null||saved.lease_token!==null)throw Error('Completion not durable');
  const removed=await db.auth.admin.getUserById(subject);if(removed.error?.code!=='user_not_found')throw Error('Auth remains');
  check(await db.auth.admin.getUserById(users[1]));const control=check(await db.storage.from('labor-avatars').download(paths[1]));
  if(control.size!==png.length)throw Error('Control changed');
  for(const table of ['achievement_awards','badge_ai_credits']){
   const after=check(await db.from(table).select('*').eq('subject_key','user:'+users[1]).order('badge_id'));
   if(JSON.stringify(after)!==JSON.stringify(controlBefore[table]))throw Error('Control rewards changed');
   if(check(await db.from(table).select('subject_key').eq('subject_key','user:'+subject)).length)throw Error('Personal rewards remain');
  }
  for(const table of ['achievement_preferences','achievement_receipts']){
   if(check(await db.from(table).select('user_id').eq('user_id',subject)).length)throw Error('Personal receipt remains');
   if(check(await db.from(table).select('user_id').eq('user_id',users[1])).length!==1)throw Error('Control receipt changed');
  }
  if(check(await db.from('notifications').select('id').eq('recipient_user_id',subject)).length)throw Error('Personal notices remain');
  if(check(await db.from('notifications').select('id').eq('recipient_user_id',users[1])).length!==1)throw Error('Control notice changed');
  const owner=check(await db.from('profiles').select('company_id,role,is_active').eq('id',users[1]).single());
  if(owner.company_id!==companyId||owner.role!=='owner'||owner.is_active!==true)throw Error('Remaining owner changed');
  check(await db.from('companies').select('id').eq('id',companyId).single());
  const retainedWorker=check(await db.from('workers').select('name,user_id,is_active,phone,memo').eq('id',workerId).single());
  if(retainedWorker.name!=='탈퇴한 시공자'||retainedWorker.user_id!==null||retainedWorker.is_active!==false||retainedWorker.phone!==null||retainedWorker.memo!==null)throw Error('Worker not anonymized');
  check(await db.from('site_workers').select('id').eq('site_id',siteId).eq('worker_id',workerId).single());
  check(await db.from('sites').select('id').eq('id',siteId).single());
  stage='retry';const retry=await executeAccountDeletion(createDeletionDatabaseAdapter(db,{deletePrivateFiles:verify,scrubPersonalData:verify,verifyBeforeAuthDeletion:verify,verifyComplete:verify}),requestId);
  if(retry.status!=='busy')throw Error('Completed request reclaimed');
  result={ok:true,appRequestAuthenticated:true,forgedSubjectIgnored:true,appCompletionReceipt:true,executed:true,avatarDeleted:true,authDeleted:true,completedPersisted:true,otherAccountAndFilePreserved:true,personalRecordsDeleted:true,remainingCompanyOwnerPreserved:true,workHistoryPreserved:true,workerAnonymized:true,otherRewardsAndNotificationsPreserved:true,completedNotReclaimed:true};
 }catch(e){result={ok:false,stage,errorCode:typeof e?.code==='string'?e.code:undefined};}
 finally{
  if(paths.length){const r=await db.storage.from('labor-avatars').remove(paths);if(r.error)cleanupOk=false;}
  if(requestId){const r=await db.from('account_deletion_requests').delete().eq('id',requestId);if(r.error)cleanupOk=false;}
  for(const u of users){
   for(const table of ['achievement_receipts','achievement_preferences']){const r=await db.from(table).delete().eq('user_id',u);if(r.error)cleanupOk=false;}
   for(const table of ['badge_ai_credits','achievement_awards']){const r=await db.from(table).delete().eq('subject_key','user:'+u);if(r.error)cleanupOk=false;}
   const notice=await db.from('notifications').delete().eq('recipient_user_id',u);if(notice.error)cleanupOk=false;
  }
  for(const u of users){const r=await db.auth.admin.deleteUser(u,false);if(r.error&&r.error.code!=='user_not_found')cleanupOk=false;}
  if(siteId){
   const a=await db.from('site_workers').delete().eq('site_id',siteId);if(a.error)cleanupOk=false;
   const b=await db.from('sites').delete().eq('id',siteId);if(b.error)cleanupOk=false;
  }
  if(workerId){const r=await db.from('workers').delete().eq('id',workerId);if(r.error)cleanupOk=false;}
  if(companyId){const r=await db.from('companies').delete().eq('id',companyId);if(r.error)cleanupOk=false;}
 }
 return Response.json({...result,cleanupOk,...(!cleanupOk?{cleanupIds:{companyId,siteId,workerId}}:{})},{status:result.ok&&cleanupOk?200:500});
});
