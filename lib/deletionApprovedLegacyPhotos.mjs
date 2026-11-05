// Server-only. No paths or company IDs come from the HTTP request body.
export async function deleteApprovedLegacyPhotos({db,requestId,lease,companyId,assertLease,assertFrozen}) {
 const guard=async()=>{if(await assertLease()!==true||await assertFrozen(companyId)!==true)throw new Error('Approved photo deletion guard failed');};
 const inspect=async()=>{
  await guard();
  const {data,error}=await db.rpc('inspect_approved_shared_photo_deletions',{p_request:requestId});
  if(error)throw error;
  if(data?.companyId!==companyId||data.policy!=='delete_original_and_all_references_on_either_company_deletion'||!Array.isArray(data.files)||data.files.length>1000)throw new Error('Invalid approved photo scope');
  const seen=new Set();
  for(const f of data.files){
   if(f.bucket!=='work-photos'||typeof f.path!=='string'||! /^(customer|leads)\//.test(f.path)||f.path.split('/').some(x=>!x||x==='.'||x==='..')||/[\\%\x00-\x1f]/.test(f.path)||typeof f.objectId!=='string'||!f.objectId||typeof f.present!=='boolean'||seen.has(f.path))throw new Error('Invalid approved photo');
   seen.add(f.path);
  }
  return data.files;
 };
 const files=await inspect();if(!files.length)return {verified:true,deleted:0};
 const paths=files.map(f=>f.path),identity=JSON.stringify(files.map(f=>[f.path,f.objectId]));
 const checkIdentity=next=>{if(JSON.stringify(next.map(f=>[f.path,f.objectId]))!==identity)throw new Error('Approved photo list changed');};
 const rpc=async name=>{
  await guard();const {data,error}=await db.rpc(name,{p_request:requestId,p_lease:lease,p_paths:paths});
  if(error)throw error;if(data!==true)throw new Error('Approved photo references not cleared');
 };
 await rpc('delete_approved_shared_photo_references');
 await rpc('verify_company_shared_photo_references');
 for(let i=0;i<paths.length;i+=100){
  checkIdentity(await inspect());
  const result=await db.storage.from('work-photos').remove(paths.slice(i,i+100));
  if(result.error)throw result.error;
 }
 const remaining=await inspect();checkIdentity(remaining);
 if(remaining.some(f=>f.present))throw new Error('Approved originals remain');
 await rpc('verify_company_shared_photo_references');
 return {verified:true,deleted:files.filter(f=>f.present).length};
}
