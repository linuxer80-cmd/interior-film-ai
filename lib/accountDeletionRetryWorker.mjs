import {timingSafeEqual} from 'node:crypto';
import {retryStoredAccountDeletionRequest} from './accountDeletionProcessor.mjs';

const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});

export async function handleDeletionRetry(request,{secret,enabled,createDb,processRequest=retryStoredAccountDeletionRequest}) {
  const header=request.headers.get('authorization')||'';
  const expected=`Bearer ${secret}`;
  if(!secret||Buffer.byteLength(header)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(header),Buffer.from(expected)))return reply({error:'Unauthorized'},401);
  if(enabled!==true)return reply({status:'disabled'});
  try {
    const db=createDb();
    // One job per invocation keeps total execution inside the existing lease.
    // The RPC repeats every condition using the database clock at claim time.
    const {data,error}=await db.from('account_deletion_requests').select('id')
      .eq('status','failed').eq('identity_verified',true).eq('scope','personal_account')
      .is('lease_token',null).gte('attempts',1).lt('attempts',5)
      .lte('updated_at',new Date(Date.now()-5*60*1000).toISOString())
      .order('updated_at').order('id').limit(1);
    if(error||!Array.isArray(data))throw new Error('Deletion retry inventory unavailable');
    if(!data.length)return reply({status:'idle'});
    // No target ID, scope or user identity is accepted from the HTTP request.
    const outcome=await processRequest({db,requestId:data[0].id});
    if(!['completed','busy','review_required'].includes(outcome?.status))throw new Error('Deletion retry outcome unavailable');
    return reply({status:outcome.status});
  } catch {
    console.error('account_deletion_retry_failed');
    return reply({error:'Deletion retry failed'},503);
  }
}
