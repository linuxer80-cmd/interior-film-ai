import {createClient} from 'npm:@supabase/supabase-js@2.117.2';
const token='__PROBE_TOKEN__';let used=false;
Deno.serve(async req=>{
 if(token==='__PROBE_'+'TOKEN__'||req.headers.get('x-test-token')!==token)return new Response(null,{status:401});
 if(used)return new Response(null,{status:409});used=true;
 const url=Deno.env.get('SUPABASE_URL');
 if(url!=='https://vnpzrezwzkvwoqajbwvh.supabase.co')return new Response(null,{status:403});
 const db=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
 const company=crypto.randomUUID(),control=crypto.randomUUID();
 const original=`history/${company}/original.png`,late=`history/${company}/late.png`,signedPath=`history/${company}/signed.png`,controlPath=`history/${control}/control.png`;
 const paths=[original,late,signedPath,controlPath];
 const check=(r:any)=>{if(r.error)throw r.error;return r.data;};
 const png=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII='),c=>c.charCodeAt(0));
 let user:string|undefined,request:string|undefined,lease:string|undefined,stage='seed',result:any,cleanupOk=true;
 try{
  user=check(await db.auth.admin.createUser({email:`freeze-probe-${crypto.randomUUID()}@example.invalid`,password:crypto.randomUUID(),email_confirm:true})).user.id;
  check(await db.from('companies').insert([{id:company,company_name:'Synthetic storage freeze'},{id:control,company_name:'Synthetic storage control'}]));
  check(await db.from('profiles').insert({id:user,company_id:company,role:'owner',is_active:true}));
  check(await db.storage.from('work-photos').upload(original,png,{contentType:'image/png',upsert:false}));
  const signed=check(await db.storage.from('work-photos').createSignedUploadUrl(signedPath,{upsert:false}));
  request=check(await db.rpc('submit_account_deletion_request',{p_user:user}))[0].id;
  check(await db.from('account_deletion_requests').update({status:'processing'}).eq('id',request));
  lease=check(await db.rpc('claim_account_deletion_request',{p_request:request}))[0].lease_token;
  stage='freeze';
  const frozen=check(await db.rpc('freeze_company_storage_writes',{p_request:request,p_lease:lease}));
  if(frozen.knownStorageUploadsFrozen!==true)throw Error('Freeze not confirmed');
  stage='uploads';
  const regular=await db.storage.from('work-photos').upload(late,png,{contentType:'image/png',upsert:false});
  if(!regular.error)throw Error('Regular upload escaped freeze');
  const oldSigned=await db.storage.from('work-photos').uploadToSignedUrl(signedPath,signed.token,png,{contentType:'image/png'});
  if(!oldSigned.error)throw Error('Signed upload escaped freeze');
  check(await db.storage.from('work-photos').upload(controlPath,png,{contentType:'image/png',upsert:false}));
  check(await db.storage.from('work-photos').download(original));
  const listed=check(await db.storage.from('work-photos').list(`history/${company}`,{limit:100}));
  if(listed.length!==1||listed[0].name!=='original.png')throw Error('Blocked upload left visible object');
  stage='remove';check(await db.storage.from('work-photos').remove([original]));
  if(check(await db.storage.from('work-photos').list(`history/${company}`,{limit:100})).length)throw Error('Removal not verified');
  check(await db.storage.from('work-photos').download(controlPath));
  stage='finalize';
  if(check(await db.rpc('finalize_frozen_empty_company',{p_request:request,p_lease:lease}))!==true)throw Error('Finalization failed');
  result={ok:true,normalUploadBlocked:true,previouslySignedUploadBlocked:true,otherCompanyUploadPreserved:true,originalPreservedBeforeRemoval:true,removalVerified:true,companyFinalized:true};
 }catch(error){result={ok:false,stage,errorCode:(error as any)?.code??null};}
 finally{
  try{
   check(await db.storage.from('work-photos').remove(paths));
   if(request&&lease)check(await db.rpc('finalize_frozen_empty_company',{p_request:request,p_lease:lease}));
   if(user)check(await db.from('profiles').delete().eq('id',user));
   if(request)check(await db.from('account_deletion_requests').delete().eq('id',request));
   check(await db.from('companies').delete().eq('id',control));
   if(user)check(await db.auth.admin.deleteUser(user));
   for(const id of [company,control])if(check(await db.storage.from('work-photos').list(`history/${id}`,{limit:100})).length)cleanupOk=false;
  }catch{cleanupOk=false;}
 }
 return Response.json({...result,cleanupOk,fixtureCompany:company,fixtureControl:control});
});
