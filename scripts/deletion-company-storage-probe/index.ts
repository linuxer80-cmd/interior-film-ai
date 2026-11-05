import {createClient} from 'npm:@supabase/supabase-js@2.117.2';
import {deleteCompanyFiles} from './deletionCompanyStorage.mjs';
import {createCompanyPhotoReferenceCleanup} from './deletionCompanyPhotoReferences.mjs';
const token='__PROBE_TOKEN__';let used=false;
Deno.serve(async req=>{
 if(token==='__PROBE_'+'TOKEN__'||req.headers.get('x-test-token')!==token)return new Response(null,{status:401});
 if(used)return new Response(null,{status:409});used=true;
 const url=Deno.env.get('SUPABASE_URL');
 if(url!=='https://vnpzrezwzkvwoqajbwvh.supabase.co')return new Response(null,{status:403});
 const db=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
 const company=crypto.randomUUID(),control=crypto.randomUUID();
 const leadId=crypto.randomUUID(),usageId=crypto.randomUUID();
 const paths=[`history/${company}/probe-a.png`,`history/${company}/probe-b.png`,`history/${control}/probe-control.png`];
 const check=(r:any)=>{if(r.error)throw r.error;return r.data;};
 let user:string|undefined,request:string|undefined,lease:string|undefined,result:any,cleanupOk=true;let stage='seed';
 try{
  user=check(await db.auth.admin.createUser({email:`shared-photo-probe-${crypto.randomUUID()}@example.invalid`,password:crypto.randomUUID(),email_confirm:true})).user.id;
  check(await db.from('companies').insert([{id:company,company_name:'Synthetic photo owner'},{id:control,company_name:'Synthetic photo reference'}]));
  check(await db.from('profiles').insert({id:user,company_id:company,role:'owner',is_active:true}));
  request=check(await db.rpc('submit_account_deletion_request',{p_user:user}))[0].id;
  check(await db.from('account_deletion_requests').update({status:'processing'}).eq('id',request));
  lease=check(await db.rpc('claim_account_deletion_request',{p_request:request}))[0].lease_token;
  const png=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII='),c=>c.charCodeAt(0));
  for(const path of paths)check(await db.storage.from('work-photos').upload(path,png,{contentType:'image/png',upsert:false}));
  check(await db.from('work_photos').insert([{company_id:company,storage_path:paths[0]},{company_id:control,storage_path:paths[0]},{company_id:control,storage_path:paths[2]}]));
  check(await db.from('customer_leads').insert({id:leadId,company_id:control,customer_name:'Synthetic',phone:'00000000000',customer_photo_path:paths[0],customer_photo_paths:[paths[0],paths[2]],memo:'preserve memo',final_price:123456}));
  check(await db.from('estimate_usage').insert({id:usageId,company_id:control,photo_paths:[paths[0],paths[2]],photo_count:2,estimate_average:300000}));
  stage='delete';
  const inventory=async(id:string)=>{
   if(id!==company)throw Error('Fixture scope mismatch');
   const m=check(await db.rpc('inspect_company_deletion_files',{p_request:request}));
   if(m.companyId!==company||m.files.some((f:any)=>f.bucket!=='work-photos'||!paths.slice(0,2).includes(f.path)))throw Error('Unexpected fixture inventory');
   // Only this fresh fixture's exact whitelist is complete. General RPC stays incomplete.
   return {...m,complete:true};
  };
  const assertLease=async()=>check(await db.rpc('assert_account_deletion_lease',{p_request:request,p_lease:lease,p_subject:user}))===true;
  const cleanup=createCompanyPhotoReferenceCleanup(db,request,lease);
  // Fresh random fixture has no business writers. Not a test of company-wide freezing.
  const args={storage:db.storage,companyId:company,inventory,assertLease,assertFrozen:async(id:string)=>id===company,...cleanup};
  const deleted=await deleteCompanyFiles(args);
  check(await db.storage.from('work-photos').download(paths[2]));
  const refs=check(await db.from('work_photos').select('storage_path').in('company_id',[company,control]));
  if(refs.length!==1||refs[0].storage_path!==paths[2])throw Error('Reference cleanup mismatch');
  const lead=check(await db.from('customer_leads').select('customer_photo_path,customer_photo_paths,memo,final_price').eq('id',leadId).single());
  const usage=check(await db.from('estimate_usage').select('photo_paths,photo_count,estimate_average').eq('id',usageId).single());
  if(lead.customer_photo_path!==null||JSON.stringify(lead.customer_photo_paths)!==JSON.stringify([paths[2]])||lead.memo!=='preserve memo'||lead.final_price!==123456||JSON.stringify(usage.photo_paths)!==JSON.stringify([paths[2]])||usage.photo_count!==1||usage.estimate_average!==300000)throw Error('Embedded cleanup mismatch');
  const retry=await deleteCompanyFiles(args);
  stage='finalize';
  if(check(await db.rpc('delete_empty_company_record',{p_request:request,p_lease:lease}))!==true)throw Error('Company finalization failed');
  if(check(await db.rpc('delete_empty_company_record',{p_request:request,p_lease:lease}))!==true)throw Error('Company finalization retry failed');
  const companies=check(await db.from('companies').select('id').in('id',[company,control]));
  if(companies.length!==1||companies[0].id!==control)throw Error('Company deletion mismatch');
  const profile=check(await db.from('profiles').select('company_id').eq('id',user).single());
  if(profile.company_id!==null||!check(await db.auth.admin.getUserById(user)).user)throw Error('Personal account preservation failed');
  result={companyRecordDeleted:true,personalAccountPreserved:true,ok:deleted.deleted===2&&deleted.verified&&retry.deleted===0,deleted:deleted.deleted,sharedReferencesDeleted:true,embeddedPhotosRemoved:true,customerAndEstimateValuesPreserved:true,otherCompanyFileAndRecordPreserved:true,retryVerified:retry.verified};
 }catch{result={ok:false,stage};}
 finally{
  try{
   check(await db.storage.from('work-photos').remove(paths));
   check(await db.from('work_photos').delete().in('company_id',[company,control]));
   check(await db.from('customer_leads').delete().eq('id',leadId));
   check(await db.from('estimate_usage').delete().eq('id',usageId));
   if(user)check(await db.from('profiles').delete().eq('id',user));
   if(request)check(await db.from('account_deletion_requests').delete().eq('id',request));
   check(await db.from('companies').delete().in('id',[company,control]));
   if(user)check(await db.auth.admin.deleteUser(user));
   for(const id of [company,control])if(check(await db.storage.from('work-photos').list(`history/${id}`,{limit:100})).length)cleanupOk=false;
  }catch{cleanupOk=false;}
 }
 // Tombstones intentionally remain until the operator removes these exact synthetic prefixes.
 return Response.json({...result,cleanupOk,fixtureCompanyIds:[company,control],...(!cleanupOk?{fixtureUser:user,fixtureRequest:request}:{})});
});
