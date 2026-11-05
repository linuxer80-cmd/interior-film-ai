import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { deleteUserCallAudio } from './deletionAudioStorage.mjs';
import { AUDIO_BUCKET } from './siteCallAudio.mjs';
const token = '__PROBE_TOKEN__';
let running = false;
Deno.serve(async req => {
  if (token === '__PROBE_' + 'TOKEN__' || req.headers.get('x-test-token') !== token) return new Response(null,{status:401});
  if (running) return new Response(null,{status:409});
  running = true;
  const url = Deno.env.get('SUPABASE_URL');
  if (url !== 'https://vnpzrezwzkvwoqajbwvh.supabase.co') return new Response(null,{status:403});
  const db = createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
  const check = (r:any) => { if(r.error)throw r.error; return r.data; };
  const users:string[]=[]; const paths:string[]=[]; let requestId:string|undefined;
  const lease=crypto.randomUUID(); const company=crypto.randomUUID(); const former=crypto.randomUUID();
  let stage='setup'; let result:any; let cleanupOk=true;
  try {
    for(let i=0;i<2;i++){
      const data=check(await db.auth.admin.createUser({email:`deletion-audio-test-${crypto.randomUUID()}@example.invalid`,password:crypto.randomUUID(),email_confirm:true}));
      users.push(data.user.id);
    }
    const bucket=await db.storage.getBucket(AUDIO_BUCKET);
    if(bucket.error){
      if(String(bucket.error.status)!=='404' && bucket.error.message!=='Bucket not found')throw bucket.error;
      check(await db.storage.createBucket(AUDIO_BUCKET,{public:false}));
    }else if(bucket.data.public)throw Error('Expected private bucket');
    // Silent WAV fixture; never upload a customer's recording.
    const bytes=new Uint8Array(46);const view=new DataView(bytes.buffer);
    const write=(offset:number,text:string)=>{for(let i=0;i<text.length;i++)bytes[offset+i]=text.charCodeAt(i);};
    write(0,'RIFF');view.setUint32(4,38,true);write(8,'WAVEfmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,8000,true);view.setUint32(28,16000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);write(36,'data');view.setUint32(40,2,true);
    for(const [co,user] of [[company,users[0]],[former,users[0]],[company,users[1]]]){
      const path=`${co}/${user}/${crypto.randomUUID()}.wav`;paths.push(path);
      check(await db.storage.from(AUDIO_BUCKET).upload(path,bytes,{contentType:'audio/wav',upsert:false}));
    }
    const latePaths=[`${company}/${users[0]}/${crypto.randomUUID()}.wav`,`${company}/${users[0]}/${crypto.randomUUID()}.wav`];
    const signed=[];
    for(const path of latePaths){paths.push(path);signed.push(check(await db.storage.from(AUDIO_BUCKET).createSignedUploadUrl(path)));}
    requestId=check(await db.from('account_deletion_requests').insert({user_id:users[0],status:'processing',identity_verified:true,scope:'personal_account',lease_token:lease,lease_until:new Date(Date.now()+300000).toISOString()}).select('id').single()).id;
    check(await db.from('account_deletion_blocks').insert({user_id:users[0]}));
    const inventory=async()=>check(await db.rpc('inspect_account_deletion_audio',{p_request:requestId,p_lease:lease}));
    const assertLease=async()=>{
      const row=check(await db.from('account_deletion_requests').select('lease_until').eq('id',requestId!).eq('lease_token',lease).single());
      if(!(Date.parse(row.lease_until)>Date.now()))throw Error('Expired lease');
    };
    stage='blocked_signed_upload';
    const blocked=await db.storage.from(AUDIO_BUCKET).uploadToSignedUrl(latePaths[0],signed[0].token,bytes,{contentType:'audio/wav'});
    if(!blocked.error)throw Error('Blocked user uploaded');
    stage='inventory';
    const before=await inventory();
    if(before.length!==2 || !paths.slice(0,2).every(p=>before.includes(p)))throw Error('Incorrect inventory');
    stage='delete';
    const removed=await deleteUserCallAudio(db.storage,users[0],inventory,assertLease);
    if(removed.deleted!==2 || !removed.verified)throw Error('Deletion not verified');
    stage='isolation';
    const untouched=check(await db.storage.from(AUDIO_BUCKET).download(paths[2]));
    if(untouched.size!==bytes.length)throw Error('Other user file changed');
    stage='retry';
    const retry=await deleteUserCallAudio(db.storage,users[0],inventory,assertLease);
    if(retry.deleted!==0 || !retry.verified)throw Error('Retry failed');
    stage='deleted_auth_signed_upload';
    check(await db.auth.admin.deleteUser(users[0],false));
    const late=await db.storage.from(AUDIO_BUCKET).uploadToSignedUrl(latePaths[1],signed[1].token,bytes,{contentType:'audio/wav'});
    if(!late.error)throw Error('Deleted user uploaded');
    const leftovers=check(await db.storage.from(AUDIO_BUCKET).list(`${company}/${users[0]}`));
    if(leftovers.length)throw Error('Late upload metadata remains');
    result={ok:true,deleted:removed.deleted,otherUserPreserved:true,emptyRetry:true,blockedSignedUpload:true,deletedAuthSignedUploadBlocked:true};
  }catch{result={ok:false,stage};}
  finally {
    if(paths.length){const r=await db.storage.from(AUDIO_BUCKET).remove(paths);if(r.error)cleanupOk=false;}
    if(requestId){const r=await db.from('account_deletion_requests').delete().eq('id',requestId);if(r.error)cleanupOk=false;}
    for(const user of users){const r=await db.auth.admin.deleteUser(user,false);if(r.error && r.error.code!=='user_not_found')cleanupOk=false;}
  }
  return Response.json({...result,cleanupOk},{status:result.ok&&cleanupOk?200:500});
});
