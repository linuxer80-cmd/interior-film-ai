import {randomUUID} from 'node:crypto';
import {authenticateAdmin} from '../../../../lib/siteCallAuth';
import {AUDIO_BUCKET,MAX_AUDIO_BYTES,audioMetadata,validAudioPath} from '../../../../lib/siteCallAudio.mjs';
export const runtime='nodejs';
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
async function handle(request){
 try {
  const auth=await authenticateAdmin(request);
  if(!auth.success)return json({error:auth.error},auth.status);
  const body=await request.json();
  const storage=auth.db.storage;
  if(request.method==='DELETE'){
   if(!validAudioPath(body.path,auth.companyId,auth.userId))return json({error:'접근할 수 없는 녹음입니다.'},403);
   const result=await storage.from(AUDIO_BUCKET).remove([body.path]);
   if(result.error)throw result.error;
   return json({ok:true});
  }
  let extension;
  try {extension=audioMetadata(body);}catch(e){return json({error:e.message},400);}
  let bucket=await storage.getBucket(AUDIO_BUCKET);
  if(bucket.error&&/not found/i.test(bucket.error.message||'')){
   const made=await storage.createBucket(AUDIO_BUCKET,{public:false,fileSizeLimit:MAX_AUDIO_BYTES});
   if(made.error&&!/already exists|duplicate/i.test(made.error.message||''))throw made.error;
   bucket=await storage.getBucket(AUDIO_BUCKET);
  }
  if(bucket.error||!bucket.data||bucket.data.public)throw new Error('private audio bucket unavailable');
  // Abandoned uploads expire on this owner's next upload. Never touch another user's files.
  const prefix=auth.companyId+'/'+auth.userId;
  const old=await storage.from(AUDIO_BUCKET).list(prefix,{limit:100,sortBy:{column:'created_at',order:'asc'}});
  const expired=(old.data||[]).filter(f=>f.id&&Date.parse(f.created_at)<Date.now()-3*60*60*1000).map(f=>prefix+'/'+f.name);
  if(expired.length)await storage.from(AUDIO_BUCKET).remove(expired);
  const path=prefix+'/'+randomUUID()+'.'+extension;
  const signed=await storage.from(AUDIO_BUCKET).createSignedUploadUrl(path,{upsert:false});
  if(signed.error)throw signed.error;
  return json({bucket:AUDIO_BUCKET,path,token:signed.data.token});
 }catch{ return json({error:'녹음 임시 업로드를 준비하지 못했습니다. 잠시 후 다시 시도해주세요.'},503); }
}
export const POST=handle;
export const DELETE=handle;
